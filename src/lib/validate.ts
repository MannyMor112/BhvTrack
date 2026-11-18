import {
  BackupFile, BehaviorEvent, Intervention, Issue, OUTCOMES, Outcome, PRIORITIES, Priority,
  STATUSES, Status, WeeklyReview,
} from '../types';
import { uid } from './util';

/*
 * Normalizers turn anything (old records, hand-edited backups, partially
 * written rows) into a well-formed record, or return null if the record is
 * unusable. They never throw.
 */

const str = (v: unknown, max = 20_000): string => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;
const time = (v: unknown, fallback: number): number => {
  const n = num(v);
  if (n !== undefined && n > 0) return n;
  if (typeof v === 'string') {
    const t = Date.parse(v);
    if (Number.isFinite(t)) return t;
  }
  return fallback;
};
const oneOf = <T extends string>(v: unknown, list: readonly T[], fb: T): T =>
  list.includes(v as T) ? (v as T) : fb;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function normalizeIntervention(raw: unknown, now = Date.now()): Intervention | null {
  if (!isObj(raw)) return null;
  const ifThen = str(raw.ifThen).trim();
  if (!ifThen) return null;
  const endedAt = num(raw.endedAt);
  return {
    id: str(raw.id) || uid(),
    ifThen,
    startedAt: time(raw.startedAt, now),
    ...(endedAt ? { endedAt } : {}),
    ...(str(raw.notes) ? { notes: str(raw.notes) } : {}),
  };
}

export function normalizeIssue(raw: unknown, now = Date.now()): Issue | null {
  if (!isObj(raw)) return null;
  const title = str(raw.title, 300).trim();
  if (!title) return null;
  const interventions = (Array.isArray(raw.interventions) ? raw.interventions : [])
    .map((x) => normalizeIntervention(x, now))
    .filter((x): x is Intervention => !!x)
    .sort((a, b) => a.startedAt - b.startedAt);
  // Guarantee at most one active intervention: close all but the newest open one.
  const open = interventions.filter((i) => !i.endedAt);
  open.slice(0, -1).forEach((i) => (i.endedAt = i.startedAt));
  const createdAt = time(raw.createdAt, now);
  return {
    id: str(raw.id) || uid(),
    title,
    description: str(raw.description),
    triggers: str(raw.triggers),
    hypothesis: str(raw.hypothesis),
    desiredBehavior: str(raw.desiredBehavior),
    successCriteria: str(raw.successCriteria),
    priority: oneOf<Priority>(raw.priority, PRIORITIES, 'medium'),
    status: oneOf<Status>(raw.status, STATUSES, 'observed'),
    archived: raw.archived === true,
    interventions,
    createdAt,
    updatedAt: time(raw.updatedAt, createdAt),
    ...(num(raw.reviewedAt) ? { reviewedAt: num(raw.reviewedAt) } : {}),
  };
}

export function normalizeEvent(raw: unknown, now = Date.now()): BehaviorEvent | null {
  if (!isObj(raw)) return null;
  const situation = str(raw.situation).trim();
  if (!situation) return null;
  const intensity = num(raw.intensity);
  const occurredAt = time(raw.occurredAt, now);
  return {
    id: str(raw.id) || uid(),
    ...(str(raw.issueId) ? { issueId: str(raw.issueId) } : {}),
    ...(str(raw.interventionId) ? { interventionId: str(raw.interventionId) } : {}),
    situation,
    thought: str(raw.thought),
    emotion: str(raw.emotion, 60),
    ...(intensity !== undefined && intensity >= 1 && intensity <= 10 ? { intensity: Math.round(intensity) } : {}),
    reaction: str(raw.reaction),
    consequence: str(raw.consequence),
    outcome: oneOf<Outcome>(raw.outcome, OUTCOMES, 'not_assessed'),
    occurredAt,
    createdAt: time(raw.createdAt, occurredAt),
    updatedAt: time(raw.updatedAt, occurredAt),
  };
}

export function normalizeReview(raw: unknown, now = Date.now()): WeeklyReview | null {
  if (!isObj(raw)) return null;
  const weekStart = num(raw.weekStart);
  if (!weekStart) return null;
  return {
    id: str(raw.id) || uid(),
    weekStart,
    reflection: str(raw.reflection),
    whatWorked: str(raw.whatWorked),
    whatDidnt: str(raw.whatDidnt),
    changeNext: str(raw.changeNext),
    focusIssueIds: Array.isArray(raw.focusIssueIds) ? raw.focusIssueIds.filter((x) => typeof x === 'string').slice(0, 2) : [],
    focusNote: str(raw.focusNote),
    createdAt: time(raw.createdAt, now),
    updatedAt: time(raw.updatedAt, now),
  };
}

export interface ValidationReport {
  ok: boolean;
  error?: string;
  data?: Omit<BackupFile, 'exportedAt'> & { exportedAt: string };
  counts: { issues: number; events: number; reviews: number };
  skipped: { issues: number; events: number; reviews: number };
  warnings: string[];
}

/** Validates a parsed backup JSON. Bad rows are skipped and reported, not fatal. */
export function validateBackup(parsed: unknown): ValidationReport {
  const empty = { issues: 0, events: 0, reviews: 0 };
  if (!isObj(parsed)) return { ok: false, error: 'File is not a JSON object.', counts: empty, skipped: empty, warnings: [] };
  if (parsed.app !== 'pattern-behavior-tracker')
    return { ok: false, error: 'This does not look like a Pattern backup file.', counts: empty, skipped: empty, warnings: [] };
  const sv = num(parsed.schemaVersion);
  if (!sv) return { ok: false, error: 'Backup is missing a schema version.', counts: empty, skipped: empty, warnings: [] };
  if (sv > SCHEMA_VERSION)
    return { ok: false, error: `Backup was made by a newer version (schema ${sv}). Update the app first.`, counts: empty, skipped: empty, warnings: [] };

  const arr = (k: string) => (Array.isArray(parsed[k]) ? (parsed[k] as unknown[]) : []);
  const warnings: string[] = [];
  for (const k of ['issues', 'events', 'reviews']) if (!Array.isArray(parsed[k])) warnings.push(`"${k}" missing — treated as empty.`);

  const issues = arr('issues').map((x) => normalizeIssue(x)).filter((x): x is Issue => !!x);
  const events = arr('events').map((x) => normalizeEvent(x)).filter((x): x is BehaviorEvent => !!x);
  const reviews = arr('reviews').map((x) => normalizeReview(x)).filter((x): x is WeeklyReview => !!x);

  // Drop dangling references rather than failing.
  const ids = new Set(issues.map((i) => i.id));
  let dangling = 0;
  for (const e of events) if (e.issueId && !ids.has(e.issueId)) { delete e.issueId; delete e.interventionId; dangling++; }
  if (dangling) warnings.push(`${dangling} event(s) referenced a missing behavior and were unlinked.`);
  for (const r of reviews) r.focusIssueIds = r.focusIssueIds.filter((id) => ids.has(id));

  const skipped = {
    issues: arr('issues').length - issues.length,
    events: arr('events').length - events.length,
    reviews: arr('reviews').length - reviews.length,
  };
  if (skipped.issues + skipped.events + skipped.reviews > 0)
    warnings.push(`Skipped invalid rows: ${skipped.issues} behaviors, ${skipped.events} events, ${skipped.reviews} reviews.`);

  return {
    ok: true,
    data: { app: 'pattern-behavior-tracker', schemaVersion: SCHEMA_VERSION, exportedAt: str(parsed.exportedAt), issues, events, reviews },
    counts: { issues: issues.length, events: events.length, reviews: reviews.length },
    skipped,
    warnings,
  };
}

export const SCHEMA_VERSION = 2;
