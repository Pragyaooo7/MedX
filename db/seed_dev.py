"""Seed a development database: an admin, a verified pharmacy, stock, and sales.

    DATABASE_URL=... JWT_SECRET=... python -m db.seed_dev

Logins it creates:
    admin@medx.local   / admin-pass-123
    seller@medx.local  / seller-pass-123   (verified, can list)

Sales are synthetic: each lot sells at a rate that rises as its price falls, so
the demand rollup and scorer have a real price signal to work with. It then runs
the nightly rollup, trains a model bundle into MODEL_DIR from that history, and
scores every lot with it. Refuses to run twice.
"""

from __future__ import annotations

import random
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import text

from api.app.auth import hash_password
from api.app.db import SessionLocal
from api.app.routers.auth import region_for_pincode
from api.app.routers.listings import composition_key

HISTORY_DAYS = 150  # training needs >= 112 days (4 folds x 28)
BLOCK = 15
TEST_DISCOUNTS = [0.0, 0.0, 0.1, 0.2, 0.3, 0.4]

# brand, composition, strength, form, schedule, atc, mrp, base daily demand
DRUGS = [
    ("Dolo 650", "Paracetamol 650mg", "650mg", "tablet", "OTC", "N02BE01", 33.6, 4.0),
    ("Pan 40", "Pantoprazole 40mg", "40mg", "tablet", "H", "A02BC02", 155.0, 2.0),
    ("Augmentin 625 Duo", "Amoxicillin 500mg + Clavulanic Acid 125mg", "625mg", "tablet", "H", "J01CR02", 223.5, 1.0),
    ("Azithral 500", "Azithromycin 500mg", "500mg", "tablet", "H", "J01FA10", 119.5, 0.8),
    ("Montair LC", "Montelukast 10mg + Levocetirizine 5mg", "10mg/5mg", "tablet", "H", "R03DC53", 252.0, 1.2),
    ("Telma 40", "Telmisartan 40mg", "40mg", "tablet", "H", "C09CA07", 228.0, 0.9),
    ("Otrivin Adult Drops", "Xylometazoline 0.1%", "0.1%", "drops", "OTC", "R01AA07", 112.0, 0.5),
    ("Becosules", "Vitamin B-complex + Vitamin C", "—", "capsule", "OTC", "A11EB", 51.0, 1.0),
]

# drug index, days to expiry, quantity at listing, current discount off MRP.
# Quantities are set so lots end up in every risk band.
LOTS = [
    (0, 70, 900, 0.00), (1, 40, 420, 0.10), (2, 22, 190, 0.00), (3, 55, 200, 0.05),
    (4, 30, 300, 0.00), (5, 150, 300, 0.00), (6, 65, 110, 0.00), (7, 95, 260, 0.05),
]


def main() -> None:
    rng = random.Random(42)
    today = date.today()
    db = SessionLocal()
    q = lambda sql, **p: db.execute(text(sql), p)  # noqa: E731

    if q("SELECT 1 FROM users WHERE email = 'seller@medx.local'").first():
        raise SystemExit("already seeded — reset with `docker compose down -v` first")

    q("INSERT INTO users (email, password_hash, role, full_name, email_verified) "
      "VALUES ('admin@medx.local', :h, 'admin', 'MedX Admin', true)",
      h=hash_password("admin-pass-123"))
    uid = q("INSERT INTO users (email, password_hash, role, full_name, email_verified) "
            "VALUES ('seller@medx.local', :h, 'seller', 'Ravi Sharma', true) RETURNING id",
            h=hash_password("seller-pass-123")).scalar()
    sid = q("INSERT INTO sellers (user_id, business_name, license_number, license_expiry, "
            "address_line, city, state, pincode, region_code, status, verified_at, rating) "
            "VALUES (:u, 'Sharma Medical Store', 'DL-20B-12345', :exp, '12 Main Bazaar', "
            "'New Delhi', 'Delhi', '110017', :region, 'verified', now(), 4.4) RETURNING id",
            u=uid, exp=today + timedelta(days=700),
            region=region_for_pincode("110017")).scalar()
    buyer = q("INSERT INTO users (email, password_hash, full_name) "
              "VALUES ('buyer@medx.local', 'x', 'Seed Buyer') RETURNING id").scalar()

    drug_ids = [
        q("INSERT INTO drugs (brand_name, composition, composition_key, strength, form, "
          "manufacturer, mrp, schedule_class, atc_code) VALUES (:b, :c, :k, :s, "
          "CAST(:f AS drug_form), 'Seed Pharma', :m, CAST(:sch AS drug_schedule), :atc) "
          "RETURNING id",
          b=b, c=c, k=composition_key(c), s=s, f=f, sch=sch, atc=atc, m=m).scalar()
        for b, c, s, f, sch, atc, m, _ in DRUGS
    ]

    def at(day: date, hour: int = 11) -> datetime:
        return datetime.combine(day, time(hour), tzinfo=timezone.utc)

    for n, (di, days_left, qty, cut) in enumerate(LOTS):
        _, _, _, _, _, _, mrp, base = DRUGS[di]
        listed = today - timedelta(days=HISTORY_DAYS)
        # Price changes every BLOCK days: a markdown test across the history,
        # ending at the lot's current discount. Without varied prices in the
        # history, no model can learn how demand responds to price, and the
        # price recommendation has nothing to stand on.
        blocks = HISTORY_DAYS // BLOCK
        discounts = [rng.choice(TEST_DISCOUNTS) for _ in range(blocks - 1)] + [cut]
        price_now = round(mrp * (1 - cut), 2)
        lot = q("INSERT INTO listings (seller_id, drug_id, batch_number, expiry_date, "
                "quantity_total, quantity_available, mrp, current_price, price_floor, "
                "listed_at, updated_at) VALUES (:s, :d, :b, :exp, :q, :q, :m, :p, :f, :l, :l) "
                "RETURNING id",
                s=sid, d=drug_ids[di], b=f"SD{24100 + n}", exp=today + timedelta(days=days_left),
                q=qty, m=mrp, p=price_now, f=round(mrp * 0.45, 2), l=at(listed, 9)).scalar()
        for b, disc in enumerate(discounts):
            q("INSERT INTO price_history (listing_id, price, source, reason, effective_from) "
              "VALUES (:l, :p, 'seller', :r, :t)",
              l=lot, p=round(mrp * (1 - disc), 2), r="listed" if b == 0 else "markdown test",
              t=at(listed + timedelta(days=b * BLOCK), 9))

        sold = 0
        for back in range(HISTORY_DAYS, 0, -1):
            day = today - timedelta(days=back)
            ratio = 1 - discounts[min((HISTORY_DAYS - back) // BLOCK, blocks - 1)]
            # Demand rises as price falls: ~2.5x between full MRP and half price.
            rate = base * (1 + 3 * (1 - ratio)) * (0.8 if day.weekday() == 6 else 1.0)
            units = min(_poisson(rng, rate), qty - sold)
            if units <= 0:
                continue
            oid = q("INSERT INTO orders (buyer_id, status, subtotal, total, shipping_pincode, "
                    "placed_at) VALUES (:b, 'delivered', :t, :t, '110017', :at) RETURNING id",
                    b=buyer, t=round(units * mrp * ratio, 2), at=at(day, 15)).scalar()
            q("INSERT INTO order_items (order_id, listing_id, quantity, unit_price, unit_mrp) "
              "VALUES (:o, :l, :q, :p, :m)",
              o=oid, l=lot, q=units, p=round(mrp * ratio, 2), m=mrp)
            sold += units
        q("UPDATE listings SET quantity_available = :a, "
          "status = CASE WHEN :a = 0 THEN 'sold_out'::listing_status ELSE status END "
          "WHERE id = :l", a=qty - sold, l=lot)

    db.commit()
    db.close()

    # Same steps the nightly job runs, with training in between.
    import pandas as pd

    from ai.forecasting.train import save_bundle, train_demand_models
    from workers import tasks

    print("demand_daily rows:", tasks.rebuild_demand_daily(lookback_days=HISTORY_DAYS + 5))

    with tasks.engine.connect() as conn:
        demand = pd.read_sql(
            text("SELECT drug_id::text, region_code, day, units_sold, avg_price_ratio, "
                 "active_listings, total_available FROM demand_daily"),
            conn,
        )
    models, metrics = train_demand_models(demand)
    save_bundle(tasks.MODEL_DIR, models, None, metrics, version="seed-dev")
    print("trained model into", tasks.MODEL_DIR)
    print("scoring:", tasks.score_all_lots())
    print("\nSign in as seller@medx.local / seller-pass-123")


def _poisson(rng: random.Random, lam: float) -> int:
    # Knuth; fine for the small rates used here and avoids a numpy dependency.
    import math

    limit, k, p = math.exp(-lam), 0, 1.0
    while True:
        p *= rng.random()
        if p <= limit:
            return k
        k += 1


if __name__ == "__main__":
    main()
