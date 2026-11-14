const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});
const inrCompact = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  notation: "compact",
  maximumFractionDigits: 1,
});
const num = new Intl.NumberFormat("en-IN");

export const money = (v: number) => inr.format(v);
export const moneyCompact = (v: number) => inrCompact.format(v);
export const count = (v: number) => num.format(Math.round(v));
export const pct = (v: number) => `${Math.round(v * 100)}%`;

export const discountPct = (price: number, mrp: number) =>
  Math.round((1 - price / mrp) * 100);

export function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function relativeTime(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return `${Math.round(hrs / 24)} d ago`;
}

export function daysLabel(days: number) {
  if (days <= 0) return "Expired";
  if (days === 1) return "1 day";
  return `${days} days`;
}
