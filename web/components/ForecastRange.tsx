"use client";

import { useState } from "react";
import { count } from "@/lib/format";

// Expected units sold before expiry (P10–P90 band, P50 marker) against the
// stock that has to clear. If the stock line sits right of most of the band,
// the lot will not clear at today's price.

function niceStep(max: number) {
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
}

type Hover = { x: number; text: string } | null;

export function ForecastRange({
  p10,
  p50,
  p90,
  stock,
}: {
  p10: number;
  p50: number;
  p90: number;
  stock: number;
}) {
  const [hover, setHover] = useState<Hover>(null);
  const step = niceStep(Math.max(p90, stock) * 1.1);
  const max = Math.ceil((Math.max(p90, stock) * 1.1) / step) * step;
  const x = (v: number) => (v / max) * 100;
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step);

  const show = (v: number, text: string) => () => setHover({ x: x(v), text });
  const hide = () => setHover(null);

  return (
    <figure>
      <div className="relative h-[92px] select-none" onMouseLeave={hide}>
        {/* grid */}
        {ticks.map((t) => (
          <div
            key={t}
            className="absolute top-2 bottom-6 w-px"
            style={{ left: `${x(t)}%`, background: t === 0 ? "var(--axis)" : "var(--grid)" }}
          />
        ))}

        {/* P10–P90 band; hit target is taller than the mark */}
        <div
          className="absolute top-[22px] h-[30px] cursor-default"
          style={{ left: `${x(p10)}%`, width: `${x(p90) - x(p10)}%` }}
          onMouseEnter={show((p10 + p90) / 2, `Likely range: ${count(p10)}–${count(p90)} units`)}
        >
          <div
            className="absolute inset-x-0 top-[5px] h-[20px] rounded"
            style={{ background: "var(--series-soft)" }}
          />
        </div>

        {/* P50 */}
        <div
          className="absolute top-[18px] h-[38px] w-4 -translate-x-1/2 cursor-default"
          style={{ left: `${x(p50)}%` }}
          onMouseEnter={show(p50, `Most likely: ${count(p50)} units`)}
        >
          <div
            className="absolute left-1/2 top-[4px] h-[30px] w-[3px] -translate-x-1/2 rounded-full"
            style={{ background: "var(--series)", boxShadow: "0 0 0 2px var(--surface)" }}
          />
        </div>

        {/* stock to clear */}
        <div
          className="absolute top-1 h-[62px] w-4 -translate-x-1/2 cursor-default"
          style={{ left: `${x(stock)}%` }}
          onMouseEnter={show(stock, `In stock: ${count(stock)} units`)}
        >
          <div
            className="absolute left-1/2 top-0 h-full w-0 -translate-x-1/2 border-l-2 border-dashed"
            style={{ borderColor: "var(--ink)" }}
          />
        </div>

        {/* axis labels */}
        {ticks.map((t) => (
          <div
            key={`l${t}`}
            className="tabular absolute bottom-0 -translate-x-1/2 text-[11px] text-ink3"
            style={{ left: `${x(t)}%` }}
          >
            {count(t)}
          </div>
        ))}

        {hover && (
          <div
            role="tooltip"
            className="pointer-events-none absolute -top-7 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-line bg-surface px-2 py-1 text-[12px] text-ink shadow-sm"
            style={{ left: `clamp(60px, ${hover.x}%, calc(100% - 60px))` }}
          >
            {hover.text}
          </div>
        )}
      </div>

      <figcaption className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-ink2">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: "var(--series-soft)" }} />
          Likely range (P10–P90)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-[3px] rounded-full" style={{ background: "var(--series)" }} />
          Most likely (P50)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-0 border-l-2 border-dashed" style={{ borderColor: "var(--ink)" }} />
          Stock to clear
        </span>
      </figcaption>

      {/* Same numbers as text, for screen readers and anyone who prefers them */}
      <table className="sr-only">
        <caption>Expected units sold before expiry</caption>
        <tbody>
          <tr><th>P10</th><td>{count(p10)}</td></tr>
          <tr><th>P50</th><td>{count(p50)}</td></tr>
          <tr><th>P90</th><td>{count(p90)}</td></tr>
          <tr><th>In stock</th><td>{count(stock)}</td></tr>
        </tbody>
      </table>
    </figure>
  );
}
