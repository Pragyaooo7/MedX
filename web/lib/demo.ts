// Built-in sample data so the console runs without Postgres or a trained model.
// Numbers are illustrative, not real sales. Dates are relative to today so the
// demo never goes stale.

import { classify } from "./risk";
import type {
  Alert, Dashboard, Drug, ForecastTier, Lot, Me, NewDrug, NewLot, SellerSignup,
} from "./types";

type Seed = [
  brand: string,
  composition: string,
  form: string,
  schedule: Lot["schedule_class"],
  days: number,
  qtyTotal: number,
  qtyAvail: number,
  mrp: number,
  discount: number,
  pSellout: number | null,
  dailyP50: number,
  tier: ForecastTier,
  recommendedDiscount: number | null,
];

const SEEDS: Seed[] = [
  ["Augmentin 625 Duo", "Amoxicillin 500mg + Clavulanic Acid 125mg", "tablet", "H", 19, 120, 84, 223.5, 0.1, 0.22, 2.1, "drug", null],
  ["Montair LC", "Montelukast 10mg + Levocetirizine 5mg", "tablet", "H", 27, 200, 150, 252.0, 0.05, 0.28, 3.4, "drug", 0.4],
  ["Azithral 500", "Azithromycin 500mg", "tablet", "H", 41, 90, 70, 119.5, 0.05, 0.41, 1.2, "drug", 0.25],
  ["Pan 40", "Pantoprazole 40mg", "tablet", "H", 58, 300, 210, 155.0, 0.0, 0.52, 3.1, "drug", 0.2],
  ["Otrivin Adult Drops", "Xylometazoline 0.1%", "drops", "OTC", 63, 80, 66, 112.0, 0.0, 0.47, 0.8, "atc_class", 0.3],
  ["Asthalin Inhaler", "Salbutamol 100mcg", "inhaler", "H", 34, 40, 31, 162.0, 0.0, null, 0, "rules_baseline", null],
  ["Volini Gel 30g", "Diclofenac + Methyl Salicylate + Menthol", "ointment", "OTC", 75, 60, 38, 145.0, 0.1, 0.66, 0.6, "form_prior", 0.15],
  ["Telma 40", "Telmisartan 40mg", "tablet", "H", 112, 150, 120, 228.0, 0.0, 0.71, 1.0, "drug", 0.1],
  ["Allegra 120", "Fexofenadine 120mg", "tablet", "H", 140, 100, 45, 199.0, 0.0, 0.88, 0.5, "drug", null],
  ["Dolo 650", "Paracetamol 650mg", "tablet", "OTC", 96, 500, 220, 33.6, 0.0, 0.94, 4.8, "drug", null],
  ["Shelcal 500", "Calcium Carbonate 1250mg + Vitamin D3 250IU", "tablet", "OTC", 170, 120, 90, 132.0, 0.0, 0.83, 0.7, "atc_class", null],
  ["Glycomet 500", "Metformin 500mg", "tablet", "H", 205, 400, 260, 32.5, 0.0, 0.97, 2.2, "drug", null],
  ["Becosules", "Vitamin B-complex + Vitamin C", "capsule", "OTC", 88, 150, 110, 51.0, 0.05, 0.58, 0.9, "drug", 0.2],
  ["Cetzine", "Cetirizine 10mg", "tablet", "OTC", 230, 250, 140, 21.4, 0.0, 0.91, 1.1, "drug", null],
];

function isoDaysFromNow(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function hoursAgo(h: number) {
  return new Date(Date.now() - h * 3600_000).toISOString();
}

const round2 = (v: number) => Math.round(v * 100) / 100;

function buildLots(): Lot[] {
  return SEEDS.map((s, i) => {
    const [brand, composition, form, schedule, days, total, avail, mrp, disc, p, rate, tier, rec] = s;
    const price = round2(mrp * (1 - disc));
    const scored = p !== null;
    const p50 = rate * days;
    return {
      listing_id: `demo-${String(i + 1).padStart(2, "0")}`,
      brand_name: brand,
      composition,
      form,
      schedule_class: schedule,
      batch_number: `B${(24000 + i * 137).toString(36).toUpperCase()}${i}`,
      expiry_date: isoDaysFromNow(days),
      days_to_expiry: days,
      quantity_total: total,
      quantity_available: avail,
      mrp,
      current_price: price,
      price_floor: round2(mrp * 0.45),
      p_sellout: p,
      expected_units_p10: scored ? round2(p50 * 0.45) : null,
      expected_units_p50: scored ? round2(p50) : null,
      expected_units_p90: scored ? round2(p50 * 1.7) : null,
      recommended_price: rec === null ? null : round2(mrp * (1 - rec)),
      tier: scored ? tier : null,
      model_version: scored ? (tier === "rules_baseline" ? "rules-baseline" : "demo-20261113") : null,
      scored_at: scored ? hoursAgo(7 + (i % 3)) : null,
    };
  });
}

let lots = buildLots();

let me: Me = {
  email: "demo@medx.in",
  full_name: "Demo Seller",
  role: "seller",
  business_name: "Sharma Medical Store",
  region_code: "PIN-110",
  seller_status: "verified",
  can_list: true,
};

export const demoMe = () => me;

// Demo sign-up skips licence review so the rest of the demo stays usable.
export function demoRegister(body: SellerSignup) {
  me = {
    ...me,
    email: body.email,
    full_name: body.full_name,
    business_name: body.business_name,
    region_code: `PIN-${body.pincode.slice(0, 3)}`,
  };
}

export function demoLots(): Lot[] {
  return lots;
}

export function demoLot(id: string): Lot {
  const lot = lots.find((l) => l.listing_id === id);
  if (!lot) throw new Error("Lot not found");
  return lot;
}

let drugs: Drug[] = [
  ...new Map(
    SEEDS.map(([brand, composition, form, schedule, , , , mrp], i) => [
      brand,
      {
        id: `drug-${i}`,
        brand_name: brand,
        composition,
        strength: composition.match(/[\d.]+\s?(mg|mcg|g|%|IU)/)?.[0] ?? "—",
        form: form as Drug["form"],
        manufacturer: "—",
        mrp,
        schedule_class: schedule,
      },
    ]),
  ).values(),
];

export function demoSearchDrugs(q: string): Drug[] {
  const s = q.trim().toLowerCase();
  return drugs
    .filter((d) => d.brand_name.toLowerCase().includes(s) || d.composition.toLowerCase().includes(s))
    .slice(0, 15);
}

export function demoCreateDrug(body: NewDrug): Drug {
  if (drugs.some((d) => d.brand_name.toLowerCase() === body.brand_name.toLowerCase() && d.strength === body.strength)) {
    throw new Error("This drug is already in the catalog — search for it instead");
  }
  const drug = { ...body, id: `drug-${drugs.length}` };
  drugs = [...drugs, drug];
  return drug;
}

export function demoCreateLot(body: NewLot): Lot {
  const drug = drugs.find((d) => d.id === body.drug_id);
  if (!drug) throw new Error("Drug not found");
  const days = Math.round((new Date(body.expiry_date).getTime() - Date.now()) / 86400_000);
  if (days <= 0) throw new Error("This batch has already expired and cannot be listed");
  if (body.current_price > body.mrp) throw new Error("Price cannot be above MRP");
  if (body.price_floor > body.current_price) throw new Error("Price floor cannot be above the current price");
  const batch = body.batch_number.trim().toUpperCase();
  if (lots.some((l) => l.brand_name === drug.brand_name && l.batch_number === batch)) {
    throw new Error("You have already listed this batch of this drug");
  }
  // New lots are unscored until the nightly run, exactly as with the real API.
  const lot: Lot = {
    listing_id: `demo-${String(lots.length + 1).padStart(2, "0")}`,
    brand_name: drug.brand_name,
    composition: drug.composition,
    form: drug.form,
    schedule_class: drug.schedule_class,
    batch_number: batch,
    expiry_date: body.expiry_date,
    days_to_expiry: days,
    quantity_total: body.quantity,
    quantity_available: body.quantity,
    mrp: body.mrp,
    current_price: body.current_price,
    price_floor: body.price_floor,
    p_sellout: null,
    expected_units_p10: null,
    expected_units_p50: null,
    expected_units_p90: null,
    recommended_price: null,
    tier: null,
    model_version: null,
    scored_at: null,
  };
  lots = [...lots, lot];
  return lot;
}

export function demoChangePrice(id: string, price: number): Lot {
  const lot = demoLot(id);
  if (price > lot.mrp) throw new Error("Price cannot be above MRP");
  if (price < lot.price_floor) throw new Error("Price cannot be below your price floor");
  // Taking the suggested price is what the suggestion was for: in the demo the
  // lot moves to a comfortable sell-out chance and the suggestion clears.
  const tookSuggestion = lot.recommended_price !== null && price <= lot.recommended_price;
  const updated: Lot = {
    ...lot,
    current_price: price,
    ...(tookSuggestion && {
      p_sellout: 0.86,
      expected_units_p10: round2(lot.quantity_available * 0.8),
      expected_units_p50: round2(lot.quantity_available * 1.15),
      expected_units_p90: round2(lot.quantity_available * 1.6),
      recommended_price: null,
      scored_at: new Date().toISOString(),
    }),
  };
  lots = lots.map((l) => (l.listing_id === id ? updated : l));
  return updated;
}

export function demoDashboard(): Dashboard {
  const risky = lots.filter((l) => l.p_sellout !== null && l.p_sellout < 0.6);
  return {
    total_active_lots: lots.length,
    at_risk_lots: risky.length,
    units_at_risk: risky.reduce((s, l) => s + l.quantity_available, 0),
    value_at_risk: round2(risky.reduce((s, l) => s + l.quantity_available * l.current_price, 0)),
  };
}

export function demoRescore(id: string): Lot {
  lots = lots.map((l) => {
    if (l.listing_id !== id) return l;
    if (l.p_sellout !== null) return { ...l, scored_at: new Date().toISOString() };
    // A new lot has no history, so the backend would use its rules ladder
    // (ai/forecasting/baseline.py). Mirror that rather than inventing a model.
    const d = l.days_to_expiry;
    const p = d < 30 ? 0.35 : d < 60 ? 0.5 : d < 90 ? 0.65 : d < 180 ? 0.75 : 0.85;
    const p50 = l.quantity_available * p;
    return {
      ...l,
      p_sellout: p,
      expected_units_p10: round2(p50 * 0.3),
      expected_units_p50: round2(p50),
      expected_units_p90: round2(p50 * 2.5),
      tier: "rules_baseline" as const,
      model_version: "rules-baseline",
      scored_at: new Date().toISOString(),
    };
  });
  return demoLot(id);
}

// Built the way ai/alerts/rules.py::build_alert words them.
function buildAlerts(): Alert[] {
  const out: Alert[] = [];
  lots.forEach((l, i) => {
    const tier = classify(l.p_sellout, l.days_to_expiry);
    if (tier === "ok" || tier === "unscored" || l.p_sellout === null) return;
    let message = `${l.brand_name}: ${Math.round(l.p_sellout * 100)}% likely to sell out before expiry in ${l.days_to_expiry} days.`;
    if (l.recommended_price !== null) {
      const d = Math.round((1 - l.recommended_price / l.mrp) * 100);
      message += ` Pricing at ₹${l.recommended_price.toFixed(2)} (${d}% off) should clear it.`;
    } else if (l.tier === "rules_baseline") {
      message += " Not enough sales history for a price recommendation yet.";
    } else {
      message += " No price above your floor is projected to clear this lot.";
    }
    out.push({
      id: `alert-${i}`,
      listing_id: l.listing_id,
      tier,
      message,
      payload: { forecast_tier: l.tier },
      created_at: hoursAgo(6 + i),
      acknowledged_at: null,
    });
  });
  return out;
}

let alerts = buildAlerts();

export function demoAlerts(includeAcknowledged: boolean): Alert[] {
  return includeAcknowledged ? alerts : alerts.filter((a) => !a.acknowledged_at);
}

export function demoAck(id: string): Alert {
  alerts = alerts.map((a) =>
    a.id === id ? { ...a, acknowledged_at: new Date().toISOString() } : a,
  );
  const alert = alerts.find((a) => a.id === id);
  if (!alert) throw new Error("Alert not found");
  return alert;
}
