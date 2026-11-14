"""Login, seller sign-up, and licence verification.

A new seller starts as `pending`. They can sign in and see their status, but
`get_current_seller` refuses every seller endpoint until an admin has checked
the drug licence and verified them.
"""

from __future__ import annotations

import re
import uuid
from datetime import date, datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from ..audit import record
from ..auth import (
    CurrentUser, create_access_token, hash_password, require_admin, verify_password,
)
from ..db import get_db
from ..models import Seller, User

router = APIRouter(prefix="/auth", tags=["auth"])

_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_PINCODE = re.compile(r"^[1-9][0-9]{5}$")


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class MeResponse(BaseModel):
    email: str
    full_name: str
    role: str
    business_name: str | None
    region_code: str | None
    # None for non-sellers; otherwise 'pending', 'verified' or 'suspended'.
    seller_status: str | None
    can_list: bool


class SellerSignup(BaseModel):
    email: str
    password: str = Field(min_length=8)
    full_name: str = Field(min_length=1)
    phone: str | None = None
    business_name: str = Field(min_length=1)
    license_number: str = Field(min_length=3)
    license_expiry: date
    gstin: str | None = None
    address_line: str = Field(min_length=1)
    city: str = Field(min_length=1)
    state: str = Field(min_length=1)
    pincode: str

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        v = v.strip()
        if not _EMAIL.match(v):
            raise ValueError("not a valid email address")
        return v

    @field_validator("pincode")
    @classmethod
    def _pincode(cls, v: str) -> str:
        v = v.strip()
        if not _PINCODE.match(v):
            raise ValueError("must be a 6-digit Indian PIN code")
        return v

    @field_validator("license_expiry")
    @classmethod
    def _licence_current(cls, v: date) -> date:
        if v <= date.today():
            raise ValueError("drug licence has expired")
        return v


def region_for_pincode(pincode: str) -> str:
    """Forecasting region: the 3-digit PIN sorting district.

    Fine enough that demand in one city isn't averaged with another, coarse
    enough that a new region accumulates history quickly.
    """
    return f"PIN-{pincode[:3]}"


def _me(user: User) -> MeResponse:
    seller = user.seller
    return MeResponse(
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        business_name=seller.business_name if seller else None,
        region_code=seller.region_code if seller else None,
        seller_status=seller.status if seller else None,
        can_list=bool(seller and seller.can_list),
    )


@router.post("/login", response_model=TokenResponse)
def login(
    form: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: Annotated[Session, Depends(get_db)],
):
    user = db.query(User).filter(User.email == form.username).one_or_none()
    # Same error for unknown email and wrong password, so the endpoint does not
    # reveal which emails are registered.
    if user is None or not user.is_active or not verify_password(
        form.password, user.password_hash
    ):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password")
    return TokenResponse(access_token=create_access_token(user.id, user.role))


@router.post(
    "/register/seller", response_model=TokenResponse, status_code=status.HTTP_201_CREATED
)
def register_seller(body: SellerSignup, db: Annotated[Session, Depends(get_db)]):
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email exists")

    user = User(
        email=body.email,
        phone=body.phone or None,
        password_hash=hash_password(body.password),
        role="seller",
        full_name=body.full_name,
    )
    db.add(user)
    db.flush()
    seller = Seller(
        user_id=user.id,
        business_name=body.business_name,
        license_number=body.license_number,
        license_expiry=body.license_expiry,
        gstin=body.gstin or None,
        address_line=body.address_line,
        city=body.city,
        state=body.state,
        pincode=body.pincode,
        region_code=region_for_pincode(body.pincode),
        status="pending",
    )
    db.add(seller)
    db.flush()
    record(db, user.id, "seller.registered", "seller", seller.id,
           after={"license_number": body.license_number})
    db.commit()
    return TokenResponse(access_token=create_access_token(user.id, user.role))


@router.get("/me", response_model=MeResponse)
def me(user: CurrentUser):
    return _me(user)


admin = APIRouter(prefix="/admin", tags=["admin"])


class PendingSeller(BaseModel):
    id: uuid.UUID
    business_name: str
    license_number: str
    license_expiry: date
    city: str
    email: str


@admin.get("/sellers/pending", response_model=list[PendingSeller])
def pending_sellers(
    _: Annotated[User, Depends(require_admin)], db: Annotated[Session, Depends(get_db)]
):
    sellers = db.query(Seller).filter(Seller.status == "pending").all()
    return [
        PendingSeller(
            id=s.id, business_name=s.business_name, license_number=s.license_number,
            license_expiry=s.license_expiry, city=s.city, email=s.user.email,
        )
        for s in sellers
    ]


@admin.post("/sellers/{seller_id}/verify", status_code=status.HTTP_204_NO_CONTENT)
def verify_seller(
    seller_id: uuid.UUID,
    admin_user: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    """Mark a seller verified after their drug licence has been checked by hand."""
    seller = db.get(Seller, seller_id)
    if seller is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Seller not found")
    before = seller.status
    seller.status = "verified"
    seller.verified_at = datetime.now(timezone.utc)
    record(db, admin_user.id, "seller.verified", "seller", seller.id,
           before={"status": before}, after={"status": "verified"})
    db.commit()
