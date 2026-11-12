import type { Point } from "@/lib/usage-series";
import { fmt } from "./labels";

/** A "nice" axis maximum: 1, 2, 5 times a power of ten, at least `min`. */
export function niceMax(v: number, min = 4): number {
  const m = Math.max(v, min);
  const p = 10 ** Math.floor(Math.log10(m));
  for (const k of [1, 2, 5, 10]) if (m <= k * p) return k * p;
  return 10 * p;
}

/**
 * Bar chart as plain SVG, no chart library. One series, a ledger rule at zero, three gridlines, an optional dashed
 * limit line. The same numbers are available as a table (details element) so nothing depends on seeing the picture.
 */
export function BarChart({ title, unit, points, limit, limitLabel, id }: { title: string; unit: string; points: Point[]; limit?: number; limitLabel?: string; id: string }) {
  const W = 640, H = 220, L = 44, R = 8, T = 12, B = 28;
  const max = niceMax(Math.max(...points.map((p) => p.value), limit && limit <= Math.max(...points.map((p) => p.value)) * 4 ? limit : 0), 4);
  const iw = W - L - R, ih = H - T - B;
  const slot = iw / Math.max(points.length, 1);
  const bw = Math.max(2, Math.min(28, slot * 0.7));
  const y = (v: number) => T + ih - (v / max) * ih;
  const total = points.reduce((a, p) => a + p.value, 0);
  const every = Math.max(1, Math.ceil(points.length / 6));
  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span id={`${id}-t`} className="title-4 text-text">{title}</span>
        <span className="caption-4 text-text-subtle figures">{fmt(total)} {unit} in total</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${id}-t ${id}-d`} className="h-auto w-full max-w-full overflow-visible">
        <desc id={`${id}-d`}>{`Bar chart, ${points.length} bars from ${points[0]?.label ?? "none"} to ${points.at(-1)?.label ?? "none"}. Highest bar ${fmt(Math.max(0, ...points.map((p) => p.value)))} ${unit}.`}</desc>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={L} x2={W - R} y1={y(max * f)} y2={y(max * f)} className={f === 0 ? "stroke-text" : "stroke-border"} strokeWidth={f === 0 ? 1.5 : 1} />
            <text x={L - 6} y={y(max * f) + 4} textAnchor="end" className="fill-text-subtle figures" fontSize="11">{fmt(Math.round(max * f))}</text>
          </g>
        ))}
        {points.map((p, i) => {
          const x = L + slot * i + (slot - bw) / 2;
          const h = Math.max(p.value > 0 ? 1.5 : 0, (p.value / max) * ih);
          return (
            <g key={p.label}>
              <rect x={x} y={T + ih - h} width={bw} height={h} rx={1.5} className="fill-action"><title>{`${p.label}: ${fmt(p.value)} ${unit}`}</title></rect>
              {i % every === 0 || i === points.length - 1 ? <text x={x + bw / 2} y={H - 8} textAnchor="middle" className="fill-text-subtle figures" fontSize="11">{p.label.length > 7 ? p.label.slice(5) : p.label}</text> : null}
            </g>
          );
        })}
        {limit !== undefined && limit <= max ? (
          <g>
            <line x1={L} x2={W - R} y1={y(limit)} y2={y(limit)} className="stroke-danger" strokeWidth={1.5} strokeDasharray="5 4" />
            <text x={W - R} y={y(limit) - 5} textAnchor="end" className="fill-danger figures" fontSize="11">{limitLabel ?? `Limit ${fmt(limit)}`}</text>
          </g>
        ) : null}
      </svg>
      <details className="caption-4 text-text-subtle">
        <summary className="min-h-11 cursor-pointer py-2 focus-visible:focus-ring">Show the numbers</summary>
        <table className="mt-2 w-full max-w-sm figures">
          <caption className="sr-only">{title}</caption>
          <thead><tr className="text-left"><th scope="col" className="py-1 pr-4 font-semibold">Period</th><th scope="col" className="py-1 text-right font-semibold">{unit}</th></tr></thead>
          <tbody>{points.map((p) => <tr key={p.label} className="border-t border-border"><th scope="row" className="py-1 pr-4 text-left font-normal">{p.label}</th><td className="py-1 text-right">{fmt(p.value)}</td></tr>)}</tbody>
        </table>
      </details>
    </figure>
  );
}
