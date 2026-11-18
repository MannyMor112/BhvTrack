import { useState } from 'react';
import type { DayBucket, WeekBucket } from '../lib/stats';
import { MIN_SAMPLE_FOR_RATE } from '../lib/stats';
import { Legend, OUTCOME_COLOR } from './ui';

const fmtShort = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** Daily event counts, stacked by outcome. */
export function DailyChart({ buckets, height = 120 }: { buckets: DayBucket[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(3, ...buckets.map((b) => b.total));
  const n = buckets.length;
  const W = 420;
  const gap = n > 14 ? 2 : 6;
  const bw = (W - gap * (n - 1)) / n;
  const H = height;
  const sy = (v: number) => (v / max) * (H - 4);
  const active = hover !== null ? buckets[hover] : null;
  const total = buckets.reduce((a, b) => a + b.total, 0);

  return (
    <div>
      <div className="mb-2 flex h-5 items-center justify-between text-xs text-stone-500 dark:text-stone-400">
        {active ? (
          <span className="tabular-nums">
            <b className="font-semibold text-stone-800 dark:text-stone-200">{fmtShort(active.day)}</b> · {active.total} event{active.total === 1 ? '' : 's'}
            {active.total > 0 && ` · ${active.successful} success · ${active.partial} partial · ${active.unsuccessful} unsuccessful · ${active.other} other`}
          </span>
        ) : (
          <span>{total} event{total === 1 ? "" : "s"} in {n} days · tap a bar for details</span>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-32 w-full md:h-40" role="img" aria-label={`Events per day, ${total} total`} onMouseLeave={() => setHover(null)}>
        <line x1={0} x2={W} y1={H} y2={H} className="stroke-stone-200 dark:stroke-stone-800" strokeWidth={1} />
        {buckets.map((b, i) => {
          const x = i * (bw + gap);
          let y = H;
          const segs: Array<[number, string]> = [
            [b.successful, OUTCOME_COLOR.successful],
            [b.partial, OUTCOME_COLOR.partial],
            [b.unsuccessful, OUTCOME_COLOR.unsuccessful],
            [b.other, OUTCOME_COLOR.other],
          ];
          return (
            <g key={b.day} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} opacity={hover === null || hover === i ? 1 : 0.45}>
              <rect x={x} y={0} width={bw} height={H} fill="transparent" />
              {b.total === 0 && <rect x={x} y={H - 2} width={bw} height={2} rx={1} className="fill-stone-200 dark:fill-stone-800" />}
              {segs.map(([v, c], k) => {
                if (!v) return null;
                const h = sy(v);
                y -= h;
                return <rect key={k} x={x} y={y + 0.5} width={bw} height={Math.max(0, h - 1)} rx={1.5} fill={c} />;
              })}
            </g>
          );
        })}
      </svg>
      <div className="mt-1 grid text-center text-[11px] text-stone-400" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {buckets.map((b, i) => (
          <span key={b.day} className="truncate">
            {n <= 7 ? new Date(b.day).toLocaleDateString(undefined, { weekday: 'short' }) : i === 0 || i === n - 1 || i % 7 === 0 ? fmtShort(b.day) : ''}
          </span>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
        <Legend color={OUTCOME_COLOR.successful} label="Successful" />
        <Legend color={OUTCOME_COLOR.partial} label="Partial" />
        <Legend color={OUTCOME_COLOR.unsuccessful} label="Unsuccessful" />
        <Legend color={OUTCOME_COLOR.other} label="N/A / not assessed" />
      </div>
    </div>
  );
}

/** Weekly success rate with sample size. Weeks with too few evaluations show no bar. */
export function WeeklyRateChart({ weeks }: { weeks: WeekBucket[] }) {
  const W = 420, H = 100, n = weeks.length, gap = 6;
  const bw = (W - gap * (n - 1)) / n;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H + 34}`} className="w-full" role="img" aria-label="Weekly success rate">
        {[0, 0.5, 1].map((g) => (
          <g key={g}>
            <line x1={0} x2={W} y1={H - g * H} y2={H - g * H} className="stroke-stone-100 dark:stroke-stone-800" strokeDasharray={g ? '3 4' : undefined} />
          </g>
        ))}
        {weeks.map((w, i) => {
          const x = i * (bw + gap);
          const s = w.stats;
          const show = s.rate !== null && s.evaluated >= MIN_SAMPLE_FOR_RATE;
          const h = show ? Math.max(2, s.rate! * H) : 0;
          return (
            <g key={w.weekStart}>
              {show ? (
                <rect x={x} y={H - h} width={bw} height={h} rx={4} fill={OUTCOME_COLOR.successful} opacity={s.evaluated < 10 ? 0.55 : 0.9} />
              ) : (
                <rect x={x + 0.5} y={H - 18} width={bw - 1} height={18} rx={4} fill="none" className="stroke-stone-300 dark:stroke-stone-700" strokeDasharray="3 3" />
              )}
              <text x={x + bw / 2} y={show ? H - h - 5 : H - 23} textAnchor="middle" className="fill-stone-600 text-[12px] font-medium dark:fill-stone-300">
                {show ? `${Math.round(s.rate! * 100)}%` : ''}
              </text>
              <text x={x + bw / 2} y={H + 14} textAnchor="middle" className="fill-stone-400 text-[11px]">{fmtShort(w.weekStart)}</text>
              <text x={x + bw / 2} y={H + 28} textAnchor="middle" className="fill-stone-400 text-[10px]">n={s.evaluated}</text>
            </g>
          );
        })}
      </svg>
      <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
        n = evaluated opportunities (success + unsuccessful). Dashed boxes: fewer than {MIN_SAMPLE_FOR_RATE}, no rate shown. Lighter bars: under 10.
      </p>
    </div>
  );
}
