"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ForecastRange } from "@/components/ForecastRange";
import { Button, Card, ErrorNote, Field, RiskBadge, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import {
  count, daysLabel, discountPct, money, pct, relativeTime, shortDate,
} from "@/lib/format";
import { lotRisk, TIER_NOTE } from "@/lib/risk";
import type { Lot } from "@/lib/types";

// Matches DEFAULT_TARGET_SELLOUT in ai/forecasting/types.py.
const TARGET_SELLOUT = 0.85;

export default function LotPage() {
  const { id } = useParams<{ id: string }>();
  const [lot, setLot] = useState<Lot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rescoring, setRescoring] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    api.lot(id).then(setLot, (e) => setError(e.message));
  }, [id]);

  async function rescore() {
    setRescoring(true);
    try {
      setLot(await api.rescore(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rescoring failed");
    } finally {
      setRescoring(false);
    }
  }

  async function applyPrice(price: number, source: "seller" | "model") {
    setActionError(null);
    try {
      setLot(await api.changePrice(id, price, source));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Couldn't change the price");
      throw e;
    }
  }

  if (error) {
    return (
      <div className="space-y-4">
        <BackLink />
        <ErrorNote message={error} />
      </div>
    );
  }

  if (!lot) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Skeleton className="h-16" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  const scored = lot.p_sellout !== null && lot.expected_units_p50 !== null;

  return (
    <div className="space-y-5">
      <BackLink />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[22px] font-semibold">{lot.brand_name}</h1>
            <RiskBadge risk={lotRisk(lot)} />
          </div>
          <p className="mt-0.5 text-ink2">{lot.composition}</p>
        </div>
        <Button variant="secondary" onClick={rescore} disabled={rescoring}>
          {rescoring ? "Rescoring…" : "Rescore now"}
        </Button>
      </div>

      {actionError && <ErrorNote message={actionError} />}

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <Recommendation lot={lot} onApply={(p) => applyPrice(p, "model")} />

          <Card className="p-5">
            <h2 className="font-semibold">Expected sales before expiry</h2>
            <p className="mb-6 mt-0.5 text-[13px] text-ink2">
              At today&apos;s price of {money(lot.current_price)}, over the{" "}
              {daysLabel(lot.days_to_expiry).toLowerCase()} left
            </p>
            {scored ? (
              <ForecastRange
                p10={lot.expected_units_p10!}
                p50={lot.expected_units_p50!}
                p90={lot.expected_units_p90!}
                stock={lot.quantity_available}
              />
            ) : (
              <p className="rounded-lg bg-sunken p-4 text-ink2">
                This lot hasn&apos;t been scored yet. Lots are scored every night, or use
                “Rescore now”.
              </p>
            )}
            {lot.tier && (
              <p className="mt-5 border-t border-line pt-3 text-[12px] text-ink3">
                {TIER_NOTE[lot.tier]}
                {lot.scored_at && ` · Scored ${relativeTime(lot.scored_at)}`}
                {lot.model_version && ` · Model ${lot.model_version}`}
              </p>
            )}
          </Card>
        </div>

        <Card className="h-fit p-5">
          <h2 className="mb-3 font-semibold">Lot details</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
            <Detail label="Batch" value={lot.batch_number} />
            <Detail label="Form" value={lot.form[0].toUpperCase() + lot.form.slice(1)} />
            <Detail
              label="Expiry"
              value={`${shortDate(lot.expiry_date)} (${daysLabel(lot.days_to_expiry)})`}
            />
            <Detail
              label="Schedule"
              value={lot.schedule_class === "OTC" ? "OTC" : `${lot.schedule_class} — Rx needed`}
            />
            <Detail
              label="In stock"
              value={`${count(lot.quantity_available)} of ${count(lot.quantity_total)}`}
            />
            <Detail
              label="Chance to sell out"
              value={lot.p_sellout === null ? "—" : pct(lot.p_sellout)}
            />
            <Detail label="MRP" value={money(lot.mrp)} />
            <Detail label="Current price" value={money(lot.current_price)} />
            <Detail label="Your price floor" value={money(lot.price_floor)} />
            <Detail
              label="Stock value now"
              value={money(lot.quantity_available * lot.current_price)}
            />
          </dl>
          <PriceEditor lot={lot} onSave={(p) => applyPrice(p, "seller")} />
        </Card>
      </div>
    </div>
  );
}

function Recommendation({ lot, onApply }: { lot: Lot; onApply: (price: number) => Promise<void> }) {
  const p = lot.p_sellout;
  const [applying, setApplying] = useState(false);

  if (p === null) return null;

  if (lot.recommended_price !== null) {
    const rec = lot.recommended_price;
    const sellsNow = Math.min(lot.expected_units_p50 ?? 0, lot.quantity_available);
    const revenueNow = sellsNow * lot.current_price;
    const revenueRec = lot.quantity_available * rec;
    return (
      <Card className="p-5">
        <div className="text-[13px] font-medium text-ink2">Suggested action</div>
        <p className="mt-1 text-[18px] font-semibold">
          Drop the price to {money(rec)}{" "}
          <span className="font-normal text-ink2">({discountPct(rec, lot.mrp)}% off MRP)</span>
        </p>
        <p className="mt-1 text-ink2">
          The smallest discount projected to clear this lot before expiry, with at least{" "}
          {pct(TARGET_SELLOUT)} confidence. It stays above your floor of {money(lot.price_floor)}.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Outcome
            label="At today's price"
            value={money(revenueNow)}
            note={`~${count(sellsNow)} of ${count(lot.quantity_available)} units sell; the rest expire`}
          />
          <Outcome
            label="At suggested price"
            value={money(revenueRec)}
            note="If the lot sells out as projected"
            highlight
          />
        </div>
        <Button
          className="mt-4"
          disabled={applying}
          onClick={async () => {
            setApplying(true);
            await onApply(rec).catch(() => {});
            setApplying(false);
          }}
        >
          {applying ? "Applying…" : `Apply ${money(rec)}`}
        </Button>
      </Card>
    );
  }

  if (p >= TARGET_SELLOUT) {
    return (
      <Card className="p-5">
        <div className="text-[13px] font-medium text-ink2">Suggested action</div>
        <p className="mt-1 text-[18px] font-semibold">No discount needed</p>
        <p className="mt-1 text-ink2">
          This lot is on track to sell out at today&apos;s price. Discounting would only give
          away margin.
        </p>
      </Card>
    );
  }

  if (lot.tier === "rules_baseline") {
    return (
      <Card className="p-5">
        <div className="text-[13px] font-medium text-ink2">Suggested action</div>
        <p className="mt-1 text-[18px] font-semibold">Not enough sales data for a price yet</p>
        <p className="mt-1 text-ink2">
          There&apos;s no sales history for this drug or similar ones in your area. Review the
          price yourself, or consider returning it to your distributor.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="text-[13px] font-medium text-ink2">Suggested action</div>
      <p className="mt-1 text-[18px] font-semibold">No price above your floor clears this lot</p>
      <p className="mt-1 text-ink2">
        Even at {money(lot.price_floor)} it&apos;s projected not to sell out in time. Consider
        lowering your floor, transferring stock to another pharmacy, or returning it to your
        distributor.
      </p>
    </Card>
  );
}

function PriceEditor({ lot, onSave }: { lot: Lot; onSave: (price: number) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(lot.current_price));
  const [busy, setBusy] = useState(false);

  if (!editing) {
    return (
      <Button
        variant="secondary"
        className="mt-5 w-full"
        onClick={() => {
          setValue(String(lot.current_price));
          setEditing(true);
        }}
      >
        Change price
      </Button>
    );
  }

  return (
    <form
      className="mt-5 border-t border-line pt-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await onSave(Number(value));
          setEditing(false);
        } catch {
          // The page shows the error; keep the editor open to fix it.
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field
        label="New price (₹)"
        type="number"
        autoFocus
        required
        min={lot.price_floor}
        max={lot.mrp}
        step={0.01}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        hint={`Between your floor ${money(lot.price_floor)} and MRP ${money(lot.mrp)}`}
      />
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save price"}
        </Button>
      </div>
    </form>
  );
}

function Outcome({
  label,
  value,
  note,
  highlight = false,
}: {
  label: string;
  value: string;
  note: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-lg p-3 ${highlight ? "bg-accent-soft" : "bg-sunken"}`}>
      <div className="text-[12px] text-ink2">{label}</div>
      <div className="tabular text-[18px] font-semibold">{value}</div>
      <div className="text-[12px] text-ink2">{note}</div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-ink3">{label}</dt>
      <dd className="tabular mt-0.5 text-ink">{value}</dd>
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/" className="inline-block text-[13px] text-ink2 hover:text-ink">
      ← All lots
    </Link>
  );
}
