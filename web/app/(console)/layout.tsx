"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/ui";
import { api, DEMO, isSignedIn, logout } from "@/lib/api";
import type { Me } from "@/lib/types";

// Sellers can sign in before their licence is verified, but every seller
// endpoint refuses them until it is. Say why, instead of showing errors.
function NotReady({ me }: { me: Me }) {
  const [title, body] =
    me.role !== "seller"
      ? ["This console is for sellers", "Sign in with a pharmacy account to see its stock."]
      : me.seller_status === "suspended"
        ? ["Your account is suspended", "Contact MedX support to restore access."]
        : me.seller_status === "verified"
          ? ["Your drug licence has expired", "Upload a renewed licence to keep listing stock."]
          : [
              "We're checking your drug licence",
              "This usually takes a day. You'll be able to add stock as soon as it's verified.",
            ];
  return (
    <div className="mx-auto max-w-md rounded-xl border border-line bg-surface p-8 text-center">
      <div aria-hidden className="text-[28px]">⏳</div>
      <h1 className="mt-2 text-[18px] font-semibold">{title}</h1>
      <p className="mt-1 text-ink2">{body}</p>
    </div>
  );
}

const NAV = [
  { href: "/", label: "Lots at risk" },
  { href: "/alerts", label: "Alerts" },
];

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    if (!isSignedIn()) {
      router.replace("/login");
      return;
    }
    setReady(true);
    api.me().then(setMe, () => {
      // Token rejected or expired: back to sign-in.
      logout();
      router.replace("/login");
    });
  }, [router]);

  if (!ready) return null;

  const active = (href: string) =>
    href === "/" ? pathname === "/" || pathname.startsWith("/lots") : pathname.startsWith(href);

  return (
    <div className="min-h-screen">
      <header
        className="sticky z-20 border-b border-line bg-surface"
        style={{ top: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <Link href="/" aria-label="MedX home">
            <Logo />
          </Link>
          <nav className="flex gap-1">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`rounded-lg px-3 py-1.5 text-[14px] font-medium ${
                  active(n.href) ? "bg-sunken text-ink" : "text-ink2 hover:text-ink"
                }`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-[13px]">
            {DEMO && (
              <span className="rounded-full bg-accent-soft px-2.5 py-0.5 font-medium text-ink">
                Demo data
              </span>
            )}
            {me && (
              <span className="hidden text-ink2 sm:inline">
                {me.business_name ?? me.full_name}
                {me.region_code && <span className="text-ink3"> · {me.region_code}</span>}
              </span>
            )}
            <button
              onClick={() => {
                logout();
                router.replace("/login");
              }}
              className="text-ink2 underline-offset-2 hover:text-ink hover:underline"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {!me ? null : me.can_list ? children : <NotReady me={me} />}
      </main>
    </div>
  );
}
