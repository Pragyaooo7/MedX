"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Card, ErrorNote, RiskBadge, SelloutBar, Skeleton, StatTile } from "@/components/ui";
import { api } from "@/lib/api";
import { count, daysLabel, discountPct, money, moneyCompact, relativeTime } from "@/lib/format";
import { lotRisk, RISK_META, RISK_ORDER, type Risk } from "@/lib/risk";
import type { Dashboard, Lot } from "@/lib/types";

type Filter = "all" | Risk;

export default function LotsPage() {
  const router = useRouter();
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [lots, setLots] = useState<Lot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    Promise.all([api.dashboard(), api.lots()])
      .then(([d, l]) => {
        setDash(d);
        setLots(l);
      })
      .catch((e) => setError(e.message));
  }, []);

  const counts = useMemo(() => {
    const c = Object.fromEntries(RISK_ORDER.map((r) => [r, 0])) as Record<Risk, number>;
    lots?.forEach((l) => c[lotRisk(l)]++);
    return c;
  }, [lots]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (lots ?? [])
      .filter((l) => filter === "all" || lotRisk(l) === filter)
      .filter(
        (l) =>
          !q ||
          l.brand_name.toLowerCase().includes(q) ||
          l.composition.toLowerCase().includes(q) ||
          l.batch_number.toLowerCase().includes(q),
      )
      .sort(
        (a, b) =>
          RISK_ORDER.indexOf(lotRisk(a)) - RISK_ORDER.indexOf(lotRisk(b)) ||
          a.days_to_expiry - b.days_to_expiry,
      );
  }, [lots, filter, query]);

  const lastScored = lots
    ?.map((l) => l.scored_at)
    .filter((s): s is string => !!s)
    .sort()
    .at(-1);

  if (error) return <ErrorNote message={`Couldn't load your lots: ${error}`} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-[22px] font-semibold">Lots at risk</h1>
          <p className="mt-0.5 text-ink2">
            Stock projected not to sell before it expires, and the price that would clear it.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastScored && (
            <p className="text-[12px] text-ink3">Scores updated {relativeTime(lastScored)}</p>
          )}
          <Link
            href="/lots/new"
            className="rounded-lg bg-accent px-3.5 py-2 text-[14px] font-medium text-accent-ink hover:opacity-90"
          >
            Add lot
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {dash ? (
          <>
            <StatTile
              label="Value at risk"
              value={moneyCompact(dash.value_at_risk)}
              hint="At current price, not MRP"
            />
            <StatTile
              label="Lots at risk"
              value={`${dash.at_risk_lots} of ${dash.total_active_lots}`}
              hint="Under 60% chance to sell out"
            />
            <StatTile label="Units at risk" value={count(dash.units_at_risk)} />
            <StatTile
              label="Need action now"
              value={String(counts.critical)}
              hint="Critical: under 30 days left"
            />
          </>
        ) : (
          Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[100px]" />)
        )}
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Filter by risk">
            {(["all", ...RISK_ORDER] as Filter[]).map((f) => {
              const n = f === "all" ? lots?.length ?? 0 : counts[f];
              if (f !== "all" && n === 0) return null;
              return (
                <button
                  key={f}
                  role="tab"
                  aria-selected={filter === f}
                  onClick={() => setFilter(f)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[13px] font-medium ${
                    filter === f ? "bg-sunken text-ink" : "text-ink2 hover:text-ink"
                  }`}
                >
                  {f !== "all" && (
                    <span aria-hidden className="text-[9px]" style={{ color: RISK_META[f].color }}>
                      {RISK_META[f].icon}
                    </span>
                  )}
                  {f === "all" ? "All" : RISK_META[f].label}
                  <span className="tabular text-ink3">{n}</span>
                </button>
              );
            })}
          </div>
          <input
            type="search"
            placeholder="Search drug or batch"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="ml-auto w-full rounded-lg border border-line bg-page px-3 py-1.5 text-[13px] outline-none focus:border-accent sm:w-56"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead className="text-[12px] text-ink3">
              <tr className="border-b border-line">
                <th className="px-4 py-2 font-medium">Drug</th>
                <th className="px-4 py-2 font-medium">Expires in</th>
                <th className="px-4 py-2 text-right font-medium">In stock</th>
                <th className="px-4 py-2 text-right font-medium">Price</th>
                <th className="px-4 py-2 font-medium">Chance to sell out</th>
                <th className="px-4 py-2 font-medium">Risk</th>
                <th className="px-4 py-2 font-medium">Suggested price</th>
              </tr>
            </thead>
            <tbody>
              {!lots &&
                Array.from({ length: 6 }, (_, i) => (
                  <tr key={i} className="border-b border-line">
                    <td colSpan={7} className="px-4 py-3">
                      <Skeleton className="h-5" />
                    </td>
                  </tr>
                ))}
              {shown.map((l) => (
                <tr
                  key={l.listing_id}
                  onClick={() => router.push(`/lots/${l.listing_id}`)}
                  className="cursor-pointer border-b border-line last:border-0 hover:bg-sunken"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/lots/${l.listing_id}`}
                      className="font-medium text-ink hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {l.brand_name}
                    </Link>
                    <div className="text-[12px] text-ink3">
                      Batch {l.batch_number}
                      {l.schedule_class !== "OTC" && ` · Sch. ${l.schedule_class}`}
                    </div>
                  </td>
                  <td className="tabular px-4 py-3">{daysLabel(l.days_to_expiry)}</td>
                  <td className="tabular px-4 py-3 text-right">{count(l.quantity_available)}</td>
                  <td className="tabular px-4 py-3 text-right">
                    {money(l.current_price)}
                    {l.current_price < l.mrp && (
                      <div className="text-[12px] text-ink3">
                        {discountPct(l.current_price, l.mrp)}% off MRP
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <SelloutBar p={l.p_sellout} />
                  </td>
                  <td className="px-4 py-3">
                    <RiskBadge risk={lotRisk(l)} />
                  </td>
                  <td className="tabular px-4 py-3">
                    {l.recommended_price !== null ? (
                      <span className="font-medium">
                        {money(l.recommended_price)}{" "}
                        <span className="font-normal text-ink3">
                          ({discountPct(l.recommended_price, l.mrp)}% off)
                        </span>
                      </span>
                    ) : (
                      <span className="text-ink3">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {lots && shown.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-ink2">
                    No lots match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
