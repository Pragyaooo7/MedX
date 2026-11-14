import { RISK_META, type Risk } from "@/lib/risk";

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-line bg-surface ${className}`}>
      {children}
    </section>
  );
}

export function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="p-4">
      <div className="text-[13px] text-ink2">{label}</div>
      <div className="tabular mt-1 text-[26px] font-semibold leading-tight">{value}</div>
      {hint && <div className="mt-1 text-[12px] text-ink3">{hint}</div>}
    </Card>
  );
}

// Color never carries the meaning alone: every badge has an icon and a label.
export function RiskBadge({ risk }: { risk: Risk }) {
  const m = RISK_META[risk];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-surface px-2 py-0.5 text-[12px] font-medium text-ink">
      <span aria-hidden style={{ color: m.color }} className="text-[10px]">
        {m.icon}
      </span>
      {m.label}
    </span>
  );
}

export function SelloutBar({ p }: { p: number | null }) {
  if (p === null) return <span className="text-ink3">—</span>;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-sunken" aria-hidden>
        <div className="h-full rounded-full bg-series" style={{ width: `${p * 100}%` }} />
      </div>
      <span className="tabular text-ink">{Math.round(p * 100)}%</span>
    </div>
  );
}

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
}) {
  const styles =
    variant === "primary"
      ? "bg-accent text-accent-ink hover:opacity-90"
      : "border border-line bg-surface text-ink hover:bg-sunken";
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-[14px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-lg border border-line bg-surface p-3 text-ink">
      <span style={{ color: "var(--crit)" }} aria-hidden>
        ▲{" "}
      </span>
      {message}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-sunken ${className}`} />;
}

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2 text-[18px] font-semibold tracking-tight">
      <span
        aria-hidden
        className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-[15px] font-bold text-accent-ink"
      >
        M
      </span>
      MedX
    </span>
  );
}

const inputClass =
  "mt-1 w-full rounded-lg border border-line bg-page px-3 py-2 text-ink outline-none focus:border-accent";

export function Field({
  label,
  hint,
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-[13px] font-medium text-ink2">{label}</span>
      <input {...props} className={inputClass} />
      {hint && <span className="mt-1 block text-[12px] text-ink3">{hint}</span>}
    </label>
  );
}

export function SelectField({
  label,
  options,
  className = "",
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  options: { value: string; label: string }[];
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-[13px] font-medium text-ink2">{label}</span>
      <select {...props} className={inputClass}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
