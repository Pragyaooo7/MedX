"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ErrorNote, Logo } from "@/components/ui";
import { DEMO, login } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState(DEMO ? "demo@medx.in" : "");
  const [password, setPassword] = useState(DEMO ? "demo" : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Logo />
          <h1 className="mt-4 text-[22px] font-semibold">Sign in to MedX</h1>
          <p className="mt-1 text-ink2">See which stock will expire unsold — and fix it.</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-line bg-surface p-6">
          {DEMO && (
            <p className="rounded-lg bg-accent-soft px-3 py-2 text-[13px] text-ink">
              Demo mode — sample data, no backend needed. Any email and password work.
            </p>
          )}
          <label className="block">
            <span className="text-[13px] font-medium text-ink2">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-line bg-page px-3 py-2 outline-none focus:border-accent"
            />
          </label>
          <label className="block">
            <span className="text-[13px] font-medium text-ink2">Password</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-line bg-page px-3 py-2 outline-none focus:border-accent"
            />
          </label>
          {error && <ErrorNote message={error} />}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <p className="mt-4 text-center text-[13px] text-ink2">
          New pharmacy?{" "}
          <Link href="/signup" className="font-medium text-ink underline-offset-2 hover:underline">
            Register
          </Link>
        </p>
      </div>
    </main>
  );
}
