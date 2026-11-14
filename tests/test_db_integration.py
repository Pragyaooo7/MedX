"""Integration tests against a real Postgres.

Everything else in the suite runs without a database. These cover what only a
database can prove: that the demand rollup counts sales correctly, and that the
seller flow — sign up, verification, catalog, listing, repricing, scoring — works
end to end through the API.

Skipped unless TEST_DATABASE_URL points at a Postgres server (with pgvector) on
which the user may create databases. Each run gets a fresh database.
"""

from __future__ import annotations

import os
import uuid
from datetime import date, timedelta
from pathlib import Path

import pytest

ADMIN_URL = os.environ.get("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not ADMIN_URL, reason="TEST_DATABASE_URL not set")

SCHEMA = Path(__file__).resolve().parents[1] / "db" / "schema.sql"


def _schema_for(available: set[str]) -> str:
    """The schema, adapted only if the test server lacks pg_trgm or citext.

    Some lightweight local Postgres builds ship without contrib extensions.
    Production must have them; here the tests degrade rather than skip: citext
    becomes text, the trigram index is dropped, and similarity() becomes a stub
    that scores nothing, leaving drug search to its ILIKE branch.
    """
    sql = SCHEMA.read_text()
    if "citext" not in available:
        sql = sql.replace("CREATE EXTENSION IF NOT EXISTS citext;", "")
        sql = sql.replace("CITEXT", "TEXT")
    if "pg_trgm" not in available:
        sql = sql.replace("CREATE EXTENSION IF NOT EXISTS pg_trgm;", "")
        sql = "\n".join(l for l in sql.splitlines() if "gin_trgm_ops" not in l)
        sql += (
            "\nCREATE FUNCTION similarity(text, text) RETURNS real "
            "LANGUAGE sql IMMUTABLE AS 'SELECT 0::real';\n"
        )
    return sql


@pytest.fixture(scope="module")
def db_url():
    import sqlalchemy as sa

    name = f"medx_test_{uuid.uuid4().hex[:8]}"
    admin = sa.create_engine(ADMIN_URL, isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        conn.execute(sa.text(f'CREATE DATABASE "{name}"'))

    url = sa.engine.make_url(ADMIN_URL).set(database=name)
    url_str = url.render_as_string(hide_password=False)
    engine = sa.create_engine(url_str)
    # Straight to the driver: with no parameters psycopg runs the multi-statement
    # file as-is, rather than reading the '%' in its comments as placeholders.
    raw = engine.raw_connection()
    try:
        available = {
            r[0] for r in raw.driver_connection.execute(
                "SELECT name FROM pg_available_extensions"
            )
        }
        raw.driver_connection.execute(_schema_for(available))
        raw.commit()
    finally:
        raw.close()
    engine.dispose()

    # The app and workers read configuration at import, so set it before either
    # is imported anywhere in this process.
    os.environ["DATABASE_URL"] = url_str
    os.environ.setdefault("JWT_SECRET", "test-secret-" + uuid.uuid4().hex)
    yield url_str

    with admin.connect() as conn:
        conn.execute(sa.text(f'DROP DATABASE "{name}" WITH (FORCE)'))
    admin.dispose()


@pytest.fixture(scope="module")
def client(db_url):
    from fastapi.testclient import TestClient

    from api.app.main import app

    return TestClient(app)


@pytest.fixture(scope="module")
def engine(db_url):
    import sqlalchemy as sa

    eng = sa.create_engine(db_url)
    yield eng
    eng.dispose()


# ------------------------------------------------------------------ helpers

def _make_admin(engine, email="admin@medx.test", password="admin-pass-123"):
    import sqlalchemy as sa

    from api.app.auth import hash_password

    with engine.begin() as conn:
        conn.execute(
            sa.text(
                "INSERT INTO users (email, password_hash, role, full_name) "
                "VALUES (:e, :h, 'admin', 'Admin') ON CONFLICT (email) DO NOTHING"
            ),
            {"e": email, "h": hash_password(password)},
        )
    return email, password


def _login(client, email, password) -> dict[str, str]:
    r = client.post("/auth/login", data={"username": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


SIGNUP = {
    "email": "owner@sharma.test",
    "password": "correct-horse",
    "full_name": "Ravi Sharma",
    "business_name": "Sharma Medical Store",
    "license_number": "DL-20B-12345",
    "license_expiry": (date.today() + timedelta(days=700)).isoformat(),
    "address_line": "12 Main Bazaar",
    "city": "New Delhi",
    "state": "Delhi",
    "pincode": "110017",
}


# -------------------------------------------------------------- seller flow

def test_seller_flow_end_to_end(client, engine):
    import sqlalchemy as sa

    r = client.post("/auth/register/seller", json=SIGNUP)
    assert r.status_code == 201, r.text
    seller = {"Authorization": f"Bearer {r.json()['access_token']}"}

    # Duplicate email is refused.
    assert client.post("/auth/register/seller", json=SIGNUP).status_code == 409

    me = client.get("/auth/me", headers=seller).json()
    assert me["seller_status"] == "pending"
    assert me["can_list"] is False
    assert me["region_code"] == "PIN-110"

    # Unverified sellers are refused by every seller endpoint.
    assert client.get("/listings", headers=seller).status_code == 403

    admin = _login(client, *_make_admin(engine))
    pending = client.get("/admin/sellers/pending", headers=admin).json()
    assert [p["business_name"] for p in pending] == ["Sharma Medical Store"]
    # A seller cannot verify themselves.
    assert client.post(
        f"/admin/sellers/{pending[0]['id']}/verify", headers=seller
    ).status_code == 403
    assert client.post(
        f"/admin/sellers/{pending[0]['id']}/verify", headers=admin
    ).status_code == 204
    assert client.get("/auth/me", headers=seller).json()["can_list"] is True

    drug = client.post(
        "/drugs",
        headers=seller,
        json={
            "brand_name": "Dolo 650",
            "composition": "Paracetamol 650mg",
            "strength": "650mg",
            "form": "tablet",
            "manufacturer": "Micro Labs",
            "mrp": 33.6,
        },
    )
    assert drug.status_code == 201, drug.text
    drug_id = drug.json()["id"]

    found = client.get("/drugs", params={"q": "dolo"}, headers=seller).json()
    assert [d["id"] for d in found] == [drug_id]
    found = client.get("/drugs", params={"q": "paracetamol"}, headers=seller).json()
    assert [d["id"] for d in found] == [drug_id]

    lot_body = {
        "drug_id": drug_id,
        "batch_number": "dl24a",
        "expiry_date": (date.today() + timedelta(days=45)).isoformat(),
        "quantity": 200,
        "mrp": 33.6,
        "current_price": 33.6,
        "price_floor": 15.0,
    }
    r = client.post("/listings", headers=seller, json=lot_body)
    assert r.status_code == 201, r.text
    lot = r.json()
    assert lot["batch_number"] == "DL24A"
    assert lot["p_sellout"] is None  # unscored until the first run

    # Same batch twice is a conflict; an expired batch and a price above MRP are
    # refused with readable messages.
    assert client.post("/listings", headers=seller, json=lot_body).status_code == 409
    expired = {**lot_body, "batch_number": "X1", "expiry_date": date.today().isoformat()}
    r = client.post("/listings", headers=seller, json=expired)
    assert r.status_code == 422 and "expired" in r.text
    above = {**lot_body, "batch_number": "X2", "current_price": 40}
    assert client.post("/listings", headers=seller, json=above).status_code == 422

    lid = lot["listing_id"]
    r = client.patch(f"/listings/{lid}/price", headers=seller, json={"price": 25.0})
    assert r.status_code == 200 and r.json()["current_price"] == 25.0
    # Below the seller's own floor is refused.
    r = client.patch(f"/listings/{lid}/price", headers=seller, json={"price": 10.0})
    assert r.status_code == 422

    with engine.connect() as conn:
        prices = conn.execute(
            sa.text(
                "SELECT price, source::text FROM price_history "
                "WHERE listing_id = :l ORDER BY effective_from"
            ),
            {"l": lid},
        ).all()
        actions = conn.execute(
            sa.text("SELECT action FROM audit_log ORDER BY id")
        ).scalars().all()
    assert [(float(p), s) for p, s in prices] == [(33.6, "seller"), (25.0, "seller")]
    assert actions == [
        "seller.registered", "seller.verified", "drug.created",
        "listing.created", "listing.price_changed",
    ]

    # No history and no model bundle: scoring falls back to the rules ladder and
    # must not recommend a price.
    r = client.post(f"/forecast/score/{lid}", headers=seller)
    assert r.status_code == 200, r.text
    assert r.json()["tier"] == "rules_baseline"
    assert r.json()["recommended_price"] is None

    lots = client.get("/listings", headers=seller).json()
    assert len(lots) == 1 and lots[0]["tier"] == "rules_baseline"
    assert client.get(f"/listings/{lid}", headers=seller).json()["listing_id"] == lid

    dash = client.get("/forecast/dashboard", headers=seller).json()
    assert dash["total_active_lots"] == 1

    # Another seller cannot see or touch this lot.
    other = {**SIGNUP, "email": "other@pharmacy.test"}
    other_h = {
        "Authorization": "Bearer "
        + client.post("/auth/register/seller", json=other).json()["access_token"]
    }
    other_id = client.get("/admin/sellers/pending", headers=admin).json()[0]["id"]
    client.post(f"/admin/sellers/{other_id}/verify", headers=admin)
    assert client.get(f"/listings/{lid}", headers=other_h).status_code == 404
    assert client.patch(
        f"/listings/{lid}/price", headers=other_h, json={"price": 20.0}
    ).status_code == 404


def test_login_does_not_reveal_which_emails_exist(client):
    unknown = client.post("/auth/login", data={"username": "nobody@x.test", "password": "x"})
    wrong = client.post(
        "/auth/login", data={"username": SIGNUP["email"], "password": "wrong-password"}
    )
    assert unknown.status_code == wrong.status_code == 401
    assert unknown.json() == wrong.json()


# ------------------------------------------------------------- demand rollup

def test_rollup_counts_each_days_sales_once_at_that_days_price(engine):
    """The regression this file exists for.

    The old rollup credited every day with all of a lot's sales (the date filter
    sat on the orders join, not on what was summed), counted cancelled orders,
    and used today's price and stock for every past day.
    """
    import sqlalchemy as sa

    from workers.tasks import rebuild_demand_daily

    today = date.today()
    d = lambda n: today - timedelta(days=n)  # noqa: E731

    with engine.begin() as conn:
        q = lambda sql, **p: conn.execute(sa.text(sql), p)  # noqa: E731
        uid = q(
            "INSERT INTO users (email, password_hash, role, full_name) "
            "VALUES ('rollup@x.test', 'x', 'seller', 'R') RETURNING id"
        ).scalar()
        sid = q(
            "INSERT INTO sellers (user_id, business_name, license_number, license_expiry, "
            "address_line, city, state, pincode, region_code, status) VALUES "
            "(:u, 'R', 'L', :exp, 'a', 'c', 's', '560001', 'PIN-560', 'verified') RETURNING id",
            u=uid, exp=today + timedelta(days=365),
        ).scalar()
        drug = q(
            "INSERT INTO drugs (brand_name, composition, composition_key, strength, form, "
            "manufacturer, mrp) VALUES ('Rollup', 'X 1mg', 'x1mg', '1mg', 'tablet', 'M', 100) "
            "RETURNING id"
        ).scalar()
        lot = q(
            "INSERT INTO listings (seller_id, drug_id, batch_number, expiry_date, "
            "quantity_total, quantity_available, mrp, current_price, price_floor, listed_at) "
            "VALUES (:s, :d, 'B1', :exp, 50, 38, 100, 60, 40, :listed) RETURNING id",
            s=sid, d=drug, exp=today + timedelta(days=60), listed=d(10),
        ).scalar()
        # Listed at 100, cut to 60 five days ago.
        q("INSERT INTO price_history (listing_id, price, source, effective_from) "
          "VALUES (:l, 100, 'seller', :t), (:l, 60, 'seller', :t2)",
          l=lot, t=d(10), t2=d(5))
        buyer = q(
            "INSERT INTO users (email, password_hash, full_name) "
            "VALUES ('buyer@x.test', 'x', 'B') RETURNING id"
        ).scalar()

        def order(days_ago: int, qty: int, status: str = "delivered"):
            oid = q(
                "INSERT INTO orders (buyer_id, status, subtotal, total, shipping_pincode, "
                "placed_at) VALUES (:b, CAST(:st AS order_status), 0, 0, '560001', :t) "
                "RETURNING id",
                b=buyer, st=status, t=d(days_ago),
            ).scalar()
            q("INSERT INTO order_items (order_id, listing_id, quantity, unit_price, unit_mrp) "
              "VALUES (:o, :l, :q, 1, 1)", o=oid, l=lot, q=qty)

        order(8, 2)              # at 100
        order(3, 5)              # at 60
        order(3, 3)              # same day, second order
        order(2, 2)              # at 60
        order(2, 7, "cancelled") # must not count

    rebuild_demand_daily(lookback_days=12)

    with engine.connect() as conn:
        rows = {
            r.day: r
            for r in conn.execute(
                sa.text(
                    "SELECT day, units_sold, avg_price_ratio, active_listings, "
                    "total_available FROM demand_daily WHERE drug_id = :d"
                ),
                {"d": drug},
            )
        }

    # One row per day the lot was listed (listed 10 days ago, through yesterday),
    # zero-sale days included.
    assert sorted(rows) == [d(n) for n in range(10, 0, -1)]
    units = {n: rows[d(n)].units_sold for n in range(10, 0, -1)}
    assert units == {10: 0, 9: 0, 8: 2, 7: 0, 6: 0, 5: 0, 4: 0, 3: 8, 2: 2, 1: 0}

    # Historical price, not today's.
    assert float(rows[d(8)].avg_price_ratio) == pytest.approx(1.0)
    assert float(rows[d(3)].avg_price_ratio) == pytest.approx(0.6)

    # Stock on hand that morning: 50 at listing, falling as it sold.
    assert rows[d(8)].total_available == 50
    assert rows[d(3)].total_available == 48
    assert rows[d(2)].total_available == 40
    assert rows[d(1)].total_available == 38
    assert all(r.active_listings == 1 for r in rows.values())

    # Rebuilding is idempotent.
    rebuild_demand_daily(lookback_days=12)
    with engine.connect() as conn:
        again = conn.execute(
            sa.text("SELECT SUM(units_sold) FROM demand_daily WHERE drug_id = :d"),
            {"d": drug},
        ).scalar()
    assert again == 12
