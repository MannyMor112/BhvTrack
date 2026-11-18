import { beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { PatternDB } from '../src/db/db';
import {
  buildBackup, createIssue, deleteIssue, listEvents, listIssues, restoreBackup, saveEvent, setIntervention, updateIssue,
} from '../src/db/repo';

let d: PatternDB;
let n = 0;
beforeEach(async () => {
  d = new PatternDB(`test-${++n}`);
  await d.open();
});

const baseEvent = { situation: 'Got feedback', thought: '', emotion: 'Defensive', reaction: '', consequence: '', outcome: 'successful' as const };

describe('persistence', () => {
  it('creates an issue with only a title and reads it back after reopening', async () => {
    const i = await createIssue({ title: 'Defensive when criticized' }, undefined, d);
    d.close();
    const again = new PatternDB(d.name);
    const list = await listIssues(again);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(i.id);
    expect(list[0].status).toBe('observed');
    expect(list[0].priority).toBe('medium');
  });

  it('preserves intervention history when replacing', async () => {
    const i = await createIssue({ title: 'T' }, 'If criticized, restate first', d);
    await setIntervention(i.id, 'If criticized, pause 3 seconds', Date.now() + 1000, d);
    const [got] = await listIssues(d);
    expect(got.interventions).toHaveLength(2);
    expect(got.interventions[0].endedAt).toBeDefined();
    expect(got.interventions[1].endedAt).toBeUndefined();
  });

  it('attributes events to the intervention active at the time', async () => {
    const t0 = Date.now() - 10_000;
    const i = await createIssue({ title: 'T' }, undefined, d);
    await setIntervention(i.id, 'Plan A', t0, d);
    const [iss] = await listIssues(d);
    const e = await saveEvent({ ...baseEvent, issueId: i.id, occurredAt: t0 + 5000 }, d);
    expect(e.interventionId).toBe(iss.interventions[0].id);
    const before = await saveEvent({ ...baseEvent, issueId: i.id, occurredAt: t0 - 5000 }, d);
    expect(before.interventionId).toBeUndefined();
  });

  it('keeps events (unlinked) when a behavior is deleted', async () => {
    const i = await createIssue({ title: 'T' }, undefined, d);
    await saveEvent({ ...baseEvent, issueId: i.id, occurredAt: Date.now() }, d);
    await deleteIssue(i.id, d);
    const ev = await listEvents(d);
    expect(ev).toHaveLength(1);
    expect(ev[0].issueId).toBeUndefined();
  });

  it('rejects an empty title on update', async () => {
    const i = await createIssue({ title: 'T' }, undefined, d);
    await expect(updateIssue(i.id, { title: '  ' }, d)).rejects.toThrow();
  });

  it('round-trips a full backup and rejects invalid files', async () => {
    const i = await createIssue({ title: 'T', hypothesis: 'H' }, 'Plan', d);
    await saveEvent({ ...baseEvent, issueId: i.id, occurredAt: Date.now() }, d);
    const json = JSON.stringify(await buildBackup(d));

    const other = new PatternDB(`restore-${n}`);
    expect((await restoreBackup('not json', other)).ok).toBe(false);
    expect((await restoreBackup('{"app":"something-else"}', other)).ok).toBe(false);
    const res = await restoreBackup(json, other);
    expect(res.ok).toBe(true);
    expect((await listIssues(other))[0].hypothesis).toBe('H');
    expect(await listEvents(other)).toHaveLength(1);
  });

  it('skips corrupted rows in a backup instead of failing', async () => {
    const res = await restoreBackup(
      JSON.stringify({
        app: 'pattern-behavior-tracker', schemaVersion: 2,
        issues: [{ title: 'Good', id: 'a' }, { nope: true }, null],
        events: [{ situation: 'ok', issueId: 'missing', outcome: 'weird', intensity: 99 }, { situation: '' }],
      }),
      d,
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.report.counts).toEqual({ issues: 1, events: 1, reviews: 0 });
      expect(res.report.warnings.length).toBeGreaterThan(0);
    }
    const [e] = await listEvents(d);
    expect(e.outcome).toBe('not_assessed');
    expect(e.intensity).toBeUndefined();
    expect(e.issueId).toBeUndefined();
  });

  it('migrates v1 data (single intervention string) to v2', async () => {
    const name = `migrate-${n}`;
    const v1 = new Dexie(name);
    v1.version(1).stores({ issues: 'id, status, priority, archived, updatedAt', events: 'id, issueId, occurredAt', reviews: 'id, &weekStart' });
    await v1.table('issues').add({ id: 'x', title: 'Legacy', intervention: 'If A then B', createdAt: 1000, updatedAt: 1000 });
    v1.close();
    const v2 = new PatternDB(name);
    const [iss] = await listIssues(v2);
    expect(iss.interventions).toHaveLength(1);
    expect(iss.interventions[0].ifThen).toBe('If A then B');
    expect((iss as unknown as Record<string, unknown>).intervention).toBeUndefined();
  });
});
