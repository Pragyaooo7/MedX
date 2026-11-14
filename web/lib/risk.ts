import type { ForecastTier, Lot } from "./types";

// Same thresholds as ai/alerts/rules.py::classify, so the badge a seller sees
// matches the alert they were sent.
export type Risk = "critical" | "warning" | "watch" | "ok" | "unscored";

export function classify(p: number | null, days: number): Risk {
  if (p === null) return "unscored";
  if (days <= 0) return "critical";
  if (p < 0.3 && days < 30) return "critical";
  if (p < 0.6 && days < 90) return "warning";
  if (p < 0.8) return "watch";
  return "ok";
}

export const lotRisk = (lot: Lot) => classify(lot.p_sellout, lot.days_to_expiry);

export const RISK_META: Record<Risk, { label: string; icon: string; color: string }> = {
  critical: { label: "Critical", icon: "▲", color: "var(--crit)" },
  warning: { label: "Warning", icon: "◆", color: "var(--warn)" },
  watch: { label: "Watch", icon: "●", color: "var(--watch)" },
  ok: { label: "On track", icon: "✓", color: "var(--good)" },
  unscored: { label: "Not scored", icon: "○", color: "var(--ink3)" },
};

export const RISK_ORDER: Risk[] = ["critical", "warning", "watch", "ok", "unscored"];

// The UI must say where a number came from rather than imply precision the
// model does not have (see ai/forecasting/baseline.py).
export const TIER_NOTE: Record<ForecastTier, string> = {
  drug: "From this drug's own sales in your region",
  atc_class: "Estimated from similar drugs (same therapeutic class)",
  form_prior: "Estimated from category data (same form and schedule)",
  rules_baseline: "Rule of thumb only — not enough sales data yet",
};
