import { db as defaultDb, PatternDB } from './db';
import type { BackupFile, BehaviorEvent, Issue, WeeklyReview } from '../types';
import { normalizeEvent, normalizeIssue, normalizeReview, SCHEMA_VERSION, validateBackup } from '../lib/validate';
import { uid } from '../lib/util';

/* All reads pass through normalizers so a corrupted row never crashes the UI. */

export async function listIssues(d: PatternDB = defaultDb): Promise<Issue[]> {
  const rows = await d.issues.toArray();
  return rows.map((r) => normalizeIssue(r)).filter((x): x is Issue => !!x);
}

export async function listEvents(d: PatternDB = defaultDb): Promise<BehaviorEvent[]> {
  const rows = await d.events.orderBy('occurredAt').reverse().toArray();
  return rows.map((r) => normalizeEvent(r)).filter((x): x is BehaviorEvent => !!x);
}

export async function listReviews(d: PatternDB = defaultDb): Promise<WeeklyReview[]> {
  const rows = await d.reviews.toArray();
  return rows
    .map((r) => normalizeReview(r))
    .filter((x): x is WeeklyReview => !!x)
    .sort((a, b) => b.weekStart - a.weekStart);
}

export type IssueDraft = Partial<Omit<Issue, 'id' | 'createdAt' | 'updatedAt' | 'interventions'>> & { title: string };

export async function createIssue(draft: IssueDraft, intervention?: string, d: PatternDB = defaultDb): Promise<Issue> {
  const now = Date.now();
  const issue = normalizeIssue({
    ...draft,
    id: uid(),
    createdAt: now,
    updatedAt: now,
    interventions: intervention?.trim() ? [{ id: uid(), ifThen: intervention.trim(), startedAt: now }] : [],
  })!;
  if (!issue) throw new Error('A title is required.');
  await d.issues.add(issue);
  return issue;
}

export async function updateIssue(id: string, patch: Partial<Issue>, d: PatternDB = defaultDb): Promise<void> {
  const cur = await d.issues.get(id);
  if (!cur) throw new Error('Behavior not found.');
  const next = normalizeIssue({ ...cur, ...patch, id, updatedAt: Date.now() });
  if (!next) throw new Error('A title is required.');
  await d.issues.put(next);
}

/**
 * Replace the active intervention. The previous one is closed (kept for
 * history) rather than overwritten. Pass an empty string to just stop it.
 */
export async function setIntervention(
  issueId: string,
  ifThen: string,
  startedAt = Date.now(),
  d: PatternDB = defaultDb,
): Promise<void> {
  await d.transaction('rw', d.issues, async () => {
    const cur = normalizeIssue(await d.issues.get(issueId));
    if (!cur) throw new Error('Behavior not found.');
    const now = Date.now();
    const list = cur.interventions.map((i) => (i.endedAt ? i : { ...i, endedAt: Math.max(i.startedAt, Math.min(now, startedAt)) }));
    if (ifThen.trim()) list.push({ id: uid(), ifThen: ifThen.trim(), startedAt });
    await d.issues.put({ ...cur, interventions: list, updatedAt: now });
  });
  await reattributeEvents(issueId, d);
}

/** Recompute which intervention each of an issue's events belongs to (after backdating or replacing). */
export async function reattributeEvents(issueId: string, d: PatternDB = defaultDb) {
  const issue = normalizeIssue(await d.issues.get(issueId));
  if (!issue) return;
  await d.events.where('issueId').equals(issueId).modify((e: BehaviorEvent) => {
    const iv = issue.interventions.find((i) => i.startedAt <= e.occurredAt && (!i.endedAt || i.endedAt > e.occurredAt));
    if (iv) e.interventionId = iv.id;
    else delete e.interventionId;
  });
}

/** Edit the text of the active intervention without starting a new one (typo fixes). */
export async function editActiveIntervention(issueId: string, ifThen: string, d: PatternDB = defaultDb) {
  const cur = normalizeIssue(await d.issues.get(issueId));
  if (!cur) return;
  const list = cur.interventions.map((i) => (!i.endedAt ? { ...i, ifThen: ifThen.trim() || i.ifThen } : i));
  await d.issues.put({ ...cur, interventions: list, updatedAt: Date.now() });
}

export async function deleteIssue(id: string, d: PatternDB = defaultDb): Promise<void> {
  // Events are kept but unlinked, so deleting a behavior never silently loses logs.
  await d.transaction('rw', d.issues, d.events, d.reviews, async () => {
    await d.events.where('issueId').equals(id).modify((e: BehaviorEvent) => {
      delete e.issueId;
      delete e.interventionId;
    });
    await d.reviews.toCollection().modify((r: WeeklyReview) => {
      r.focusIssueIds = (r.focusIssueIds ?? []).filter((x) => x !== id);
    });
    await d.issues.delete(id);
  });
}

export type EventDraft = Omit<BehaviorEvent, 'id' | 'createdAt' | 'updatedAt' | 'interventionId'>;

export async function saveEvent(draft: EventDraft & { id?: string }, d: PatternDB = defaultDb): Promise<BehaviorEvent> {
  const now = Date.now();
  const existing = draft.id ? await d.events.get(draft.id) : undefined;
  let interventionId: string | undefined;
  if (draft.issueId) {
    const issue = normalizeIssue(await d.issues.get(draft.issueId));
    // Attribute to the intervention that was active when the event happened.
    interventionId = issue?.interventions.find(
      (i) => i.startedAt <= draft.occurredAt && (!i.endedAt || i.endedAt > draft.occurredAt),
    )?.id;
  }
  const ev = normalizeEvent({
    ...existing,
    ...draft,
    id: draft.id ?? uid(),
    interventionId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });
  if (!ev) throw new Error('Describe the situation.');
  if (!draft.issueId) delete ev.issueId;
  if (!interventionId) delete ev.interventionId;
  await d.events.put(ev);
  if (ev.issueId) await d.issues.update(ev.issueId, { updatedAt: now });
  return ev;
}

export async function deleteEvent(id: string, d: PatternDB = defaultDb) {
  await d.events.delete(id);
}

export async function saveReview(r: Omit<WeeklyReview, 'id' | 'createdAt' | 'updatedAt'>, d: PatternDB = defaultDb) {
  const now = Date.now();
  const existing = await d.reviews.where('weekStart').equals(r.weekStart).first();
  const rec = normalizeReview({ ...existing, ...r, id: existing?.id ?? uid(), createdAt: existing?.createdAt ?? now, updatedAt: now })!;
  await d.reviews.put(rec);
  // Saving a review counts as reviewing the focus behaviors.
  for (const id of rec.focusIssueIds) await d.issues.update(id, { reviewedAt: now });
  return rec;
}

export async function deleteReview(id: string, d: PatternDB = defaultDb) {
  await d.reviews.delete(id);
}

export async function buildBackup(d: PatternDB = defaultDb): Promise<BackupFile> {
  return {
    app: 'pattern-behavior-tracker',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    issues: await listIssues(d),
    events: await listEvents(d),
    reviews: await listReviews(d),
  };
}

/** Restore replaces everything, atomically. Validation happens first. */
export async function restoreBackup(json: string, d: PatternDB = defaultDb) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false as const, error: 'File is not valid JSON.' };
  }
  const report = validateBackup(parsed);
  if (!report.ok || !report.data) return { ok: false as const, error: report.error ?? 'Invalid backup.' };
  const data = report.data;
  await d.transaction('rw', d.issues, d.events, d.reviews, async () => {
    await Promise.all([d.issues.clear(), d.events.clear(), d.reviews.clear()]);
    await d.issues.bulkPut(data.issues);
    await d.events.bulkPut(data.events);
    // Unique weekStart: keep the latest per week.
    const byWeek = new Map<number, WeeklyReview>();
    for (const r of data.reviews) {
      const prev = byWeek.get(r.weekStart);
      if (!prev || prev.updatedAt < r.updatedAt) byWeek.set(r.weekStart, r);
    }
    await d.reviews.bulkPut([...byWeek.values()]);
  });
  return { ok: true as const, report };
}

export async function wipeAll(d: PatternDB = defaultDb) {
  await d.transaction('rw', d.issues, d.events, d.reviews, async () => {
    await Promise.all([d.issues.clear(), d.events.clear(), d.reviews.clear()]);
  });
}
