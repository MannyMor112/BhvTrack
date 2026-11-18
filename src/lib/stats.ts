import type { BehaviorEvent, Intervention, Issue, Outcome } from '../types';
import { addDays, DAY, startOfDay, startOfWeek } from './util';

/** Below this many evaluated opportunities a percentage is not shown. */
export const MIN_SAMPLE_FOR_RATE = 5;
/** Below this, a rate is shown with a "low sample" caution. */
export const SOLID_SAMPLE = 10;

export interface OutcomeStats {
  total: number;
  successful: number;
  partial: number;
  unsuccessful: number;
  notApplicable: number;
  notAssessed: number;
  /** Opportunities where the intervention applied (success + partial + unsuccessful). */
  applicable: number;
  /** Denominator for the success rate: clear success or clear failure only. */
  evaluated: number;
  /** successful / evaluated, or null when evaluated === 0. */
  rate: number | null;
  reliability: 'none' | 'insufficient' | 'low' | 'ok';
}

export function outcomeStats(events: BehaviorEvent[]): OutcomeStats {
  const c: Record<Outcome, number> = { successful: 0, partial: 0, unsuccessful: 0, not_applicable: 0, not_assessed: 0 };
  for (const e of events) c[e.outcome] = (c[e.outcome] ?? 0) + 1;
  const evaluated = c.successful + c.unsuccessful;
  const rate = evaluated > 0 ? c.successful / evaluated : null;
  const reliability =
    evaluated === 0 ? 'none' : evaluated < MIN_SAMPLE_FOR_RATE ? 'insufficient' : evaluated < SOLID_SAMPLE ? 'low' : 'ok';
  return {
    total: events.length,
    successful: c.successful,
    partial: c.partial,
    unsuccessful: c.unsuccessful,
    notApplicable: c.not_applicable,
    notAssessed: c.not_assessed,
    applicable: c.successful + c.partial + c.unsuccessful,
    evaluated,
    rate,
    reliability,
  };
}

/** Human-readable rate that refuses to overstate small samples. */
export function describeRate(s: OutcomeStats): string {
  if (s.evaluated === 0) return 'No evaluated opportunities yet';
  const frac = `${s.successful} of ${s.evaluated}`;
  if (s.reliability === 'insufficient') return `${frac} successful — too few to calculate a rate`;
  const pct = Math.round((s.rate ?? 0) * 100);
  return `${pct}% (${frac})${s.reliability === 'low' ? ' — small sample' : ''}`;
}

export function inRange(events: BehaviorEvent[], from: number, to: number) {
  return events.filter((e) => e.occurredAt >= from && e.occurredAt < to);
}

/** Current window [now-days, now) vs the previous window of equal length. */
export function windowComparison(events: BehaviorEvent[], days: number, now = Date.now()) {
  const end = startOfDay(now) + DAY;
  const start = end - days * DAY;
  const prevStart = start - days * DAY;
  const cur = inRange(events, start, end);
  const prev = inRange(events, prevStart, start);
  return { start, end, current: outcomeStats(cur), previous: outcomeStats(prev), currentEvents: cur, previousEvents: prev };
}

export function eventsForIssue(events: BehaviorEvent[], issueId: string) {
  return events.filter((e) => e.issueId === issueId);
}

export function eventsForIntervention(events: BehaviorEvent[], iv: Intervention) {
  return events.filter((e) => e.interventionId === iv.id);
}

export function activeIntervention(issue: Issue): Intervention | undefined {
  return issue.interventions.find((i) => !i.endedAt);
}

export interface DayBucket {
  day: number;
  total: number;
  successful: number;
  partial: number;
  unsuccessful: number;
  other: number;
}

export function dailyBuckets(events: BehaviorEvent[], days: number, now = Date.now()): DayBucket[] {
  const first = startOfDay(addDays(now, -(days - 1)));
  const buckets: DayBucket[] = [];
  for (let i = 0; i < days; i++) {
    buckets.push({ day: addDays(first, i), total: 0, successful: 0, partial: 0, unsuccessful: 0, other: 0 });
  }
  const idx = new Map(buckets.map((b, i) => [b.day, i]));
  for (const e of events) {
    const i = idx.get(startOfDay(e.occurredAt));
    if (i === undefined) continue;
    const b = buckets[i];
    b.total++;
    if (e.outcome === 'successful') b.successful++;
    else if (e.outcome === 'partial') b.partial++;
    else if (e.outcome === 'unsuccessful') b.unsuccessful++;
    else b.other++;
  }
  return buckets;
}

export interface WeekBucket { weekStart: number; stats: OutcomeStats }

export function weeklyBuckets(events: BehaviorEvent[], weeks: number, now = Date.now()): WeekBucket[] {
  const thisWeek = startOfWeek(now);
  const out: WeekBucket[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const ws = addDays(thisWeek, -7 * i);
    out.push({ weekStart: ws, stats: outcomeStats(inRange(events, ws, addDays(ws, 7))) });
  }
  return out;
}

/** Last meaningful activity on an issue: edit, review, or logged event. */
export function lastActivity(issue: Issue, events: BehaviorEvent[]): number {
  let t = Math.max(issue.updatedAt, issue.reviewedAt ?? 0);
  for (const e of events) if (e.issueId === issue.id && e.occurredAt > t) t = e.occurredAt;
  return t;
}

export const STALE_DAYS = 14;

export function staleIssues(issues: Issue[], events: BehaviorEvent[], now = Date.now()) {
  return issues
    .filter((i) => !i.archived && i.status !== 'resolved')
    .map((i) => ({ issue: i, last: lastActivity(i, events) }))
    .filter((x) => now - x.last > STALE_DAYS * DAY)
    .sort((a, b) => a.last - b.last);
}

export function countBy<T>(items: T[], key: (t: T) => string | undefined): Array<[string, number]> {
  const m = new Map<string, number>();
  for (const it of items) {
    const k = key(it)?.trim();
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

const STOP = new Set(
  ('a an the and or but if then so of to in on at for with from by about as into over after before ' +
    'i me my mine we our you your he she they them his her their it its this that these those ' +
    'is am are was were be been being do did does done have has had having will would can could should ' +
    'not no yes just very really too also up down out off again more most some any all what when where why how ' +
    'who which there here than while because said told got get went go going felt feel think thought ' +
    'like one two day today yesterday time back still even much made make').split(' '),
);

/**
 * Words that recur across different logged situations. Purely a count —
 * no interpretation. A word counts once per event.
 */
export function recurringTerms(events: BehaviorEvent[], minEvents = 2, limit = 8): Array<[string, number]> {
  const m = new Map<string, number>();
  for (const e of events) {
    const words = new Set(
      e.situation
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
        .split(/\s+/)
        .map((w) => w.replace(/^['-]+|['-]+$/g, ''))
        .filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w)),
    );
    for (const w of words) m.set(w, (m.get(w) ?? 0) + 1);
  }
  return [...m.entries()]
    .filter(([, n]) => n >= minEvents)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);
}

export function avgIntensity(events: BehaviorEvent[]): { avg: number | null; n: number } {
  const xs = events.map((e) => e.intensity).filter((x): x is number => typeof x === 'number');
  if (!xs.length) return { avg: null, n: 0 };
  return { avg: xs.reduce((a, b) => a + b, 0) / xs.length, n: xs.length };
}

export function signedDelta(cur: number, prev: number): string {
  const d = cur - prev;
  return d === 0 ? 'no change' : d > 0 ? `+${d}` : `${d}`;
}
