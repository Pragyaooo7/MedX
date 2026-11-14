"""The seller's lots, the drug catalog they pick from, and their alerts.

Every price a lot holds is written to `price_history` as it is set. The demand
rollup reads that table to know what a lot cost on each past day, so a price
change that skips it corrupts the model's training data.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..audit import record
from ..auth import CurrentSeller
from ..db import get_db
from ..models import Alert, Drug, Listing

router = APIRouter(tags=["listings"])


class LotSummary(BaseModel):
    listing_id: uuid.UUID
    brand_name: str
    composition: str
    form: str
    schedule_class: str
    batch_number: str
    expiry_date: date
    days_to_expiry: int
    quantity_total: int
    quantity_available: int
    mrp: float
    current_price: float
    price_floor: float
    # Score fields are None until the lot's first scoring run.
    p_sellout: float | None
    expected_units_p10: float | None
    expected_units_p50: float | None
    expected_units_p90: float | None
    recommended_price: float | None
    tier: str | None
    model_version: str | None
    scored_at: datetime | None


_LOTS_SQL = """
            WITH latest AS (
                SELECT DISTINCT ON (listing_id) *
                FROM lot_risk_scores
                ORDER BY listing_id, scored_at DESC
            )
            SELECT
                l.id AS listing_id, d.brand_name, d.composition, d.form::text AS form,
                d.schedule_class::text AS schedule_class, l.batch_number,
                l.expiry_date, GREATEST(l.expiry_date - CURRENT_DATE, 0) AS days_to_expiry,
                l.quantity_total, l.quantity_available, l.mrp, l.current_price,
                l.price_floor, s.p_sellout, s.expected_units_p10, s.expected_units_p50,
                s.expected_units_p90, s.recommended_price, s.tier::text AS tier,
                s.model_version, s.scored_at
            FROM listings l
            JOIN drugs d ON d.id = l.drug_id
            LEFT JOIN latest s ON s.listing_id = l.id
            WHERE l.seller_id = :sid AND l.status = 'active' {extra}
            ORDER BY s.p_sellout ASC NULLS LAST, l.expiry_date ASC
"""


def _lots(db: Session, seller_id: uuid.UUID, listing_id: uuid.UUID | None = None):
    extra = "AND l.id = :lid" if listing_id else ""
    rows = db.execute(
        text(_LOTS_SQL.format(extra=extra)), {"sid": seller_id, "lid": listing_id}
    ).mappings()
    return [LotSummary(**row) for row in rows]


@router.get("/listings", response_model=list[LotSummary])
def list_lots(seller: CurrentSeller, db: Annotated[Session, Depends(get_db)]):
    """Active lots, riskiest first. Unscored lots sort last."""
    return _lots(db, seller.id)


@router.get("/listings/{listing_id}", response_model=LotSummary)
def get_lot(
    listing_id: uuid.UUID, seller: CurrentSeller, db: Annotated[Session, Depends(get_db)]
):
    found = _lots(db, seller.id, listing_id)
    if not found:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lot not found")
    return found[0]


class NewLot(BaseModel):
    drug_id: uuid.UUID
    batch_number: str = Field(min_length=1, max_length=40)
    expiry_date: date
    quantity: int = Field(gt=0)
    mrp: float = Field(gt=0)
    current_price: float = Field(gt=0)
    price_floor: float = Field(gt=0)

    @model_validator(mode="after")
    def _coherent(self) -> NewLot:
        # The database enforces all of these too; checking here gives the seller
        # a readable message instead of a constraint name.
        if self.expiry_date <= date.today():
            raise ValueError("this batch has already expired and cannot be listed")
        if self.current_price > self.mrp:
            raise ValueError("price cannot be above MRP")
        if self.price_floor > self.current_price:
            raise ValueError("price floor cannot be above the current price")
        return self


@router.post("/listings", response_model=LotSummary, status_code=status.HTTP_201_CREATED)
def create_lot(
    body: NewLot, seller: CurrentSeller, db: Annotated[Session, Depends(get_db)]
):
    if db.get(Drug, body.drug_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Drug not found")

    lot = Listing(
        seller_id=seller.id,
        drug_id=body.drug_id,
        batch_number=body.batch_number.strip().upper(),
        expiry_date=body.expiry_date,
        quantity_total=body.quantity,
        quantity_available=body.quantity,
        mrp=body.mrp,
        current_price=body.current_price,
        price_floor=body.price_floor,
    )
    db.add(lot)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, "You have already listed this batch of this drug"
        )
    _write_price(db, lot.id, body.current_price, "seller", "listed")
    record(db, seller.user_id, "listing.created", "listing", lot.id,
           after=body.model_dump(mode="json"))
    db.commit()
    return _lots(db, seller.id, lot.id)[0]


class PriceChange(BaseModel):
    price: float = Field(gt=0)
    # 'model' when the seller accepted the recommended price, so the A/B
    # comparison against the rules baseline can tell the two apart.
    source: Literal["seller", "model"] = "seller"


@router.patch("/listings/{listing_id}/price", response_model=LotSummary)
def change_price(
    listing_id: uuid.UUID,
    body: PriceChange,
    seller: CurrentSeller,
    db: Annotated[Session, Depends(get_db)],
):
    lot = db.get(Listing, listing_id)
    if lot is None or lot.seller_id != seller.id or lot.status != "active":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lot not found")
    if body.price > float(lot.mrp):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Price cannot be above MRP")
    if body.price < float(lot.price_floor):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "Price cannot be below your price floor"
        )

    before = float(lot.current_price)
    lot.current_price = body.price
    lot.updated_at = datetime.now(timezone.utc)
    _write_price(db, lot.id, body.price, body.source, None)
    record(db, seller.user_id, "listing.price_changed", "listing", lot.id,
           before={"price": before}, after={"price": body.price, "source": body.source})
    db.commit()
    return _lots(db, seller.id, lot.id)[0]


def _write_price(
    db: Session, listing_id: uuid.UUID, price: float, source: str, reason: str | None
) -> None:
    db.execute(
        text(
            "INSERT INTO price_history (listing_id, price, source, reason) "
            "VALUES (:lid, :price, CAST(:source AS price_source), :reason)"
        ),
        {"lid": listing_id, "price": price, "source": source, "reason": reason},
    )


# ------------------------------------------------------------------ catalog

class DrugOut(BaseModel):
    id: uuid.UUID
    brand_name: str
    composition: str
    strength: str
    form: str
    manufacturer: str
    mrp: float
    schedule_class: str

    model_config = {"from_attributes": True}


@router.get("/drugs", response_model=list[DrugOut])
def search_drugs(
    _: CurrentSeller,
    db: Annotated[Session, Depends(get_db)],
    q: Annotated[str, Query(min_length=2)],
):
    """Fuzzy search by brand or composition, best match first."""
    like = f"%{q}%"
    score = func.greatest(
        func.similarity(Drug.brand_name, q), func.similarity(Drug.composition, q)
    )
    return (
        db.query(Drug)
        .filter(
            Drug.brand_name.ilike(like)
            | Drug.composition.ilike(like)
            | (func.similarity(Drug.brand_name, q) > 0.3)
        )
        .order_by(score.desc(), Drug.brand_name)
        .limit(15)
        .all()
    )


Form = Literal[
    "tablet", "capsule", "syrup", "injection", "ointment", "drops", "inhaler", "powder", "other"
]


class NewDrug(BaseModel):
    brand_name: str = Field(min_length=1)
    composition: str = Field(min_length=1)
    strength: str = Field(min_length=1)
    form: Form
    manufacturer: str = Field(min_length=1)
    mrp: float = Field(gt=0)
    schedule_class: Literal["OTC", "H", "H1", "X"] = "OTC"
    atc_code: str | None = None
    pack_size: int = Field(default=1, gt=0)


def composition_key(composition: str) -> str:
    """'Paracetamol 500mg + Caffeine 30mg' -> 'caffeine30mg+paracetamol500mg'.

    Two brands of the same molecules at the same strengths share this key, which
    is what substitute search joins on.
    """
    parts = (p.strip().lower().replace(" ", "") for p in composition.split("+"))
    return "+".join(sorted(p for p in parts if p))


@router.post("/drugs", response_model=DrugOut, status_code=status.HTTP_201_CREATED)
def create_drug(
    body: NewDrug, seller: CurrentSeller, db: Annotated[Session, Depends(get_db)]
):
    """Add a drug missing from the catalog. Sellers can add; admins curate later."""
    drug = Drug(**body.model_dump(), composition_key=composition_key(body.composition))
    db.add(drug)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This drug is already in the catalog — search for it instead",
        )
    record(db, seller.user_id, "drug.created", "drug", drug.id,
           after=body.model_dump(mode="json"))
    db.commit()
    return drug


class AlertResponse(BaseModel):
    id: uuid.UUID
    listing_id: uuid.UUID
    tier: str
    message: str
    payload: dict[str, Any]
    created_at: datetime
    acknowledged_at: datetime | None


@router.get("/alerts", response_model=list[AlertResponse])
def list_alerts(
    seller: CurrentSeller,
    db: Annotated[Session, Depends(get_db)],
    include_acknowledged: bool = False,
):
    q = db.query(Alert).filter(Alert.seller_id == seller.id)
    if not include_acknowledged:
        q = q.filter(Alert.acknowledged_at.is_(None))
    return q.order_by(Alert.created_at.desc()).limit(200).all()


@router.post("/alerts/{alert_id}/ack", response_model=AlertResponse)
def acknowledge_alert(
    alert_id: uuid.UUID,
    seller: CurrentSeller,
    db: Annotated[Session, Depends(get_db)],
):
    alert = db.get(Alert, alert_id)
    if alert is None or alert.seller_id != seller.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Alert not found")
    if alert.acknowledged_at is None:
        alert.acknowledged_at = datetime.now().astimezone()
        db.commit()
    return alert
