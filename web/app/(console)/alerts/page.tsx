"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, Card, ErrorNote, RiskBadge, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import type { Alert, AlertTier } from "@/lib/types";

const TIER_HELP: Record<AlertTier, string> = {
  critical: "Sent by push and email",
  warning: "In your daily digest",
  watch: "Dashboard only",
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAlerts(null);
    api.alerts(showDone).then(setAlerts, (e) => setError(e.message));
  }, [showDone]);

  async function ack(id: string) {
    try {
      const updated = await api.ack(id);
      setAlerts((prev) =>
        prev && (showDone ? prev.map((a) => (a.id === id ? updated : a)) : prev.filter((a) => a.id !== id)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't mark as done");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-[22px] font-semibold">Alerts</h1>
          <p className="mt-0.5 text-ink2">
            Lots that need a decision. The same lot won&apos;t alert again at the same level for 7
            days.
          </p>
        </div>
        <label className="flex items-center gap-2 text-[13px] text-ink2">
          <input
            type="checkbox"
            checked={showDone}
            onChange={(e) => setShowDone(e.target.checked)}
            className="accent-[var(--accent)]"
          />
          Show done
        </label>
      </div>

      {error && <ErrorNote message={error} />}

      <Card>
        {!alerts && (
          <div className="space-y-3 p-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        )}
        {alerts?.length === 0 && (
          <p className="px-4 py-12 text-center text-ink2">
            Nothing needs your attention right now.
          </p>
        )}
        <ul>
          {alerts?.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-start gap-3 border-b border-line p-4 last:border-0 sm:flex-nowrap"
            >
              <div className="w-24 shrink-0 pt-0.5">
                <RiskBadge risk={a.tier} />
              </div>
              <div className="min-w-0 flex-1">
                <p className={a.acknowledged_at ? "text-ink3" : "text-ink"}>{a.message}</p>
                <p className="mt-1 text-[12px] text-ink3">
                  {relativeTime(a.created_at)} · {TIER_HELP[a.tier]} ·{" "}
                  <Link href={`/lots/${a.listing_id}`} className="text-ink2 underline-offset-2 hover:underline">
                    View lot
                  </Link>
                </p>
              </div>
              {a.acknowledged_at ? (
                <span className="shrink-0 text-[13px] text-ink3">✓ Done</span>
              ) : (
                <Button variant="secondary" className="shrink-0" onClick={() => ack(a.id)}>
                  Mark done
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
