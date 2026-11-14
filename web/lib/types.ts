// Mirrors the response models in api/app/routers/*.py.

export type ForecastTier = "drug" | "atc_class" | "form_prior" | "rules_baseline";

export interface Lot {
  listing_id: string;
  brand_name: string;
  composition: string;
  form: string;
  schedule_class: "OTC" | "H" | "H1" | "X";
  batch_number: string;
  expiry_date: string;
  days_to_expiry: number;
  quantity_total: number;
  quantity_available: number;
  mrp: number;
  current_price: number;
  price_floor: number;
  p_sellout: number | null;
  expected_units_p10: number | null;
  expected_units_p50: number | null;
  expected_units_p90: number | null;
  recommended_price: number | null;
  tier: ForecastTier | null;
  model_version: string | null;
  scored_at: string | null;
}

export interface Dashboard {
  total_active_lots: number;
  at_risk_lots: number;
  units_at_risk: number;
  value_at_risk: number;
}

export type AlertTier = "watch" | "warning" | "critical";

export interface Alert {
  id: string;
  listing_id: string;
  tier: AlertTier;
  message: string;
  payload: Record<string, unknown>;
  created_at: string;
  acknowledged_at: string | null;
}

export interface Me {
  email: string;
  full_name: string;
  role: string;
  business_name: string | null;
  region_code: string | null;
  seller_status: "pending" | "verified" | "suspended" | null;
  can_list: boolean;
}

export type DrugForm =
  | "tablet" | "capsule" | "syrup" | "injection" | "ointment"
  | "drops" | "inhaler" | "powder" | "other";

export interface Drug {
  id: string;
  brand_name: string;
  composition: string;
  strength: string;
  form: DrugForm;
  manufacturer: string;
  mrp: number;
  schedule_class: "OTC" | "H" | "H1" | "X";
}

export type NewDrug = Omit<Drug, "id">;

export interface NewLot {
  drug_id: string;
  batch_number: string;
  expiry_date: string;
  quantity: number;
  mrp: number;
  current_price: number;
  price_floor: number;
}

export interface SellerSignup {
  email: string;
  password: string;
  full_name: string;
  phone?: string;
  business_name: string;
  license_number: string;
  license_expiry: string;
  gstin?: string;
  address_line: string;
  city: string;
  state: string;
  pincode: string;
}
