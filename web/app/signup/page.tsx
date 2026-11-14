"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ErrorNote, Field, Logo } from "@/components/ui";
import { DEMO, registerSeller } from "@/lib/api";
import type { SellerSignup } from "@/lib/types";

const EMPTY: SellerSignup = {
  email: "",
  password: "",
  full_name: "",
  phone: "",
  business_name: "",
  license_number: "",
  license_expiry: "",
  gstin: "",
  address_line: "",
  city: "",
  state: "",
  pincode: "",
};

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState<SellerSignup>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof SellerSignup) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await registerSeller({
        ...form,
        phone: form.phone || undefined,
        gstin: form.gstin || undefined,
      });
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-up failed");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen justify-center px-4 py-10">
      <div className="w-full max-w-xl">
        <div className="mb-6 text-center">
          <Logo />
          <h1 className="mt-4 text-[22px] font-semibold">Register your pharmacy</h1>
          <p className="mt-1 text-ink2">
            We check your drug licence before you can list stock. It usually takes a day.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-6 rounded-xl border border-line bg-surface p-6">
          {DEMO && (
            <p className="rounded-lg bg-accent-soft px-3 py-2 text-[13px] text-ink">
              Demo mode — the licence check is skipped and you&apos;ll go straight to the demo data.
            </p>
          )}

          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-3 font-semibold">Your account</legend>
            <Field label="Full name" required value={form.full_name} onChange={set("full_name")} autoComplete="name" />
            <Field label="Phone" type="tel" value={form.phone} onChange={set("phone")} autoComplete="tel" />
            <Field label="Email" type="email" required value={form.email} onChange={set("email")} autoComplete="email" />
            <Field
              label="Password"
              type="password"
              required
              minLength={8}
              value={form.password}
              onChange={set("password")}
              autoComplete="new-password"
              hint="At least 8 characters"
            />
          </fieldset>

          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-3 font-semibold">Your pharmacy</legend>
            <Field
              label="Business name"
              required
              className="sm:col-span-2"
              value={form.business_name}
              onChange={set("business_name")}
            />
            <Field
              label="Drug licence number"
              required
              value={form.license_number}
              onChange={set("license_number")}
              hint="Form 20/21 retail or wholesale licence"
            />
            <Field
              label="Licence valid until"
              type="date"
              required
              value={form.license_expiry}
              onChange={set("license_expiry")}
            />
            <Field label="GSTIN" value={form.gstin} onChange={set("gstin")} hint="Optional" />
            <Field
              label="PIN code"
              required
              inputMode="numeric"
              pattern="[1-9][0-9]{5}"
              maxLength={6}
              value={form.pincode}
              onChange={set("pincode")}
              hint="Used to compare you with demand nearby"
            />
            <Field
              label="Address"
              required
              className="sm:col-span-2"
              value={form.address_line}
              onChange={set("address_line")}
              autoComplete="street-address"
            />
            <Field label="City" required value={form.city} onChange={set("city")} />
            <Field label="State" required value={form.state} onChange={set("state")} />
          </fieldset>

          {error && <ErrorNote message={error} />}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Creating account…" : "Create account"}
          </Button>
          <p className="text-center text-[13px] text-ink2">
            Already registered?{" "}
            <Link href="/login" className="font-medium text-ink underline-offset-2 hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
