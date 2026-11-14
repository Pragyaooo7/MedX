"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card, ErrorNote, Field, SelectField } from "@/components/ui";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import type { Drug, DrugForm, NewDrug } from "@/lib/types";

const FORMS: DrugForm[] = [
  "tablet", "capsule", "syrup", "injection", "ointment", "drops", "inhaler", "powder", "other",
];

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export default function NewLotPage() {
  const router = useRouter();
  const [drug, setDrug] = useState<Drug | null>(null);
  const [batch, setBatch] = useState("");
  const [expiry, setExpiry] = useState("");
  const [quantity, setQuantity] = useState("");
  const [mrp, setMrp] = useState("");
  const [price, setPrice] = useState("");
  const [floor, setFloor] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function pick(d: Drug) {
    setDrug(d);
    setMrp(String(d.mrp));
    setPrice(String(d.mrp));
    setFloor((d.mrp * 0.5).toFixed(2));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!drug) return;
    setBusy(true);
    setError(null);
    try {
      const lot = await api.createLot({
        drug_id: drug.id,
        batch_number: batch,
        expiry_date: expiry,
        quantity: Number(quantity),
        mrp: Number(mrp),
        current_price: Number(price),
        price_floor: Number(floor),
      });
      router.push(`/lots/${lot.listing_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add the lot");
      setBusy(false);
    }
  }

  const tomorrow = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href="/" className="inline-block text-[13px] text-ink2 hover:text-ink">
        ← All lots
      </Link>
      <div>
        <h1 className="text-[22px] font-semibold">Add a lot</h1>
        <p className="mt-0.5 text-ink2">
          One batch of one drug. It&apos;s scored tonight, or straight away with “Rescore now”.
        </p>
      </div>

      <Card className="p-5">
        <h2 className="mb-3 font-semibold">1. Drug</h2>
        {drug ? (
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg bg-sunken p-3">
            <div>
              <div className="font-medium">{drug.brand_name}</div>
              <div className="text-[13px] text-ink2">
                {drug.composition} · {cap(drug.form)}
                {drug.schedule_class !== "OTC" && ` · Schedule ${drug.schedule_class}`}
              </div>
            </div>
            <Button variant="secondary" onClick={() => setDrug(null)}>
              Change
            </Button>
          </div>
        ) : (
          <DrugPicker onPick={pick} />
        )}
      </Card>

      {drug && (
        <form onSubmit={onSubmit}>
          <Card className="p-5">
            <h2 className="mb-3 font-semibold">2. Batch and price</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Batch number" required value={batch} onChange={(e) => setBatch(e.target.value)} />
              <Field
                label="Expiry date"
                type="date"
                required
                min={tomorrow}
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
              />
              <Field
                label="Units in stock"
                type="number"
                required
                min={1}
                step={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                hint="Strips, bottles or packs — however you sell it"
              />
              <Field
                label="MRP per unit (₹)"
                type="number"
                required
                min={0.01}
                step={0.01}
                value={mrp}
                onChange={(e) => setMrp(e.target.value)}
              />
              <Field
                label="Your price (₹)"
                type="number"
                required
                min={0.01}
                max={mrp || undefined}
                step={0.01}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                hint="Can't be above MRP"
              />
              <Field
                label="Lowest price you'd accept (₹)"
                type="number"
                required
                min={0.01}
                max={price || undefined}
                step={0.01}
                value={floor}
                onChange={(e) => setFloor(e.target.value)}
                hint="We'll never suggest a price below this"
              />
            </div>
            {error && <div className="mt-4"><ErrorNote message={error} /></div>}
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => router.push("/")}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Adding…" : "Add lot"}
              </Button>
            </div>
          </Card>
        </form>
      )}
    </div>
  );
}

function DrugPicker({ onPick }: { onPick: (d: Drug) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Drug[] | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      api.searchDrugs(q.trim()).then((r) => !cancelled && setResults(r), () => !cancelled && setResults([]));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  if (adding) return <NewDrugForm initialName={q} onCreated={onPick} onCancel={() => setAdding(false)} />;

  return (
    <div>
      <Field
        label="Search by brand or composition"
        placeholder="e.g. Dolo 650 or paracetamol"
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {results && (
        <ul className="mt-2 max-h-72 overflow-y-auto rounded-lg border border-line">
          {results.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => onPick(d)}
                className="flex w-full items-baseline justify-between gap-3 border-b border-line px-3 py-2 text-left last:border-0 hover:bg-sunken"
              >
                <span>
                  <span className="font-medium">{d.brand_name}</span>
                  <span className="block text-[12px] text-ink3">{d.composition}</span>
                </span>
                <span className="tabular shrink-0 text-[13px] text-ink2">MRP {money(d.mrp)}</span>
              </button>
            </li>
          ))}
          {results.length === 0 && (
            <li className="px-3 py-3 text-ink2">No match in the catalog.</li>
          )}
        </ul>
      )}
      {results && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-3 text-[13px] font-medium text-ink underline-offset-2 hover:underline"
        >
          Can&apos;t find it? Add it to the catalog
        </button>
      )}
    </div>
  );
}

function NewDrugForm({
  initialName,
  onCreated,
  onCancel,
}: {
  initialName: string;
  onCreated: (d: Drug) => void;
  onCancel: () => void;
}) {
  const [d, setD] = useState<NewDrug>({
    brand_name: initialName,
    composition: "",
    strength: "",
    form: "tablet",
    manufacturer: "",
    mrp: 0,
    schedule_class: "OTC",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof NewDrug) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setD((x) => ({ ...x, [k]: k === "mrp" ? Number(e.target.value) : e.target.value }));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      onCreated(await api.createDrug(d));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add the drug");
      setBusy(false);
    }
  }

  return (
    // Not a <form>: it sits outside the lot form but is filled in first, and a
    // nested submit would be confusing.
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Brand name" required value={d.brand_name} onChange={set("brand_name")} />
      <Field label="Manufacturer" required value={d.manufacturer} onChange={set("manufacturer")} />
      <Field
        label="Composition"
        required
        className="sm:col-span-2"
        placeholder="Paracetamol 500mg + Caffeine 30mg"
        value={d.composition}
        onChange={set("composition")}
      />
      <Field label="Strength" required placeholder="500mg" value={d.strength} onChange={set("strength")} />
      <SelectField
        label="Form"
        value={d.form}
        onChange={set("form")}
        options={FORMS.map((f) => ({ value: f, label: cap(f) }))}
      />
      <SelectField
        label="Schedule"
        value={d.schedule_class}
        onChange={set("schedule_class")}
        options={[
          { value: "OTC", label: "OTC — no prescription" },
          { value: "H", label: "Schedule H" },
          { value: "H1", label: "Schedule H1" },
          { value: "X", label: "Schedule X" },
        ]}
      />
      <Field
        label="MRP (₹)"
        type="number"
        min={0.01}
        step={0.01}
        required
        value={d.mrp || ""}
        onChange={set("mrp")}
      />
      {error && <div className="sm:col-span-2"><ErrorNote message={error} /></div>}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" variant="secondary" onClick={onCancel}>Back to search</Button>
        <Button
          type="button"
          onClick={save}
          disabled={busy || !d.brand_name || !d.composition || !d.strength || !d.manufacturer || !d.mrp}
        >
          {busy ? "Adding…" : "Add drug"}
        </Button>
      </div>
    </div>
  );
}
