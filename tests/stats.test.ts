import { describe, expect, it } from 'vitest';
import { describeRate, outcomeStats, recurringTerms, staleIssues, windowComparison } from '../src/lib/stats';
import type { BehaviorEvent, Outcome } from '../src/types';
import { normalizeIssue } from '../src/lib/validate';

const ev = (outcome: Outcome, occurredAt = Date.now(), situation = 'x'): BehaviorEvent => ({
  id: Math.random().toString(), situation, thought: '', emotion: '', reaction: '', consequence: '',
  outcome, occurredAt, createdAt: occurredAt, updatedAt: occurredAt,
});

describe('outcomeStats', () => {
  it('uses only clear successes and failures as the denominator', () => {
    const s = outcomeStats([
      ev('successful'), ev('successful'), ev('successful'), ev('unsuccessful'), ev('unsuccessful'),
      ev('partial'), ev('partial'), ev('not_applicable'), ev('not_assessed'),
    ]);
    expect(s.evaluated).toBe(5);
    expect(s.rate).toBeCloseTo(0.6);
    expect(s.partial).toBe(2);
    expect(s.applicable).toBe(7);
    expect(s.total).toBe(9);
  });

  it('does not count partial successes as successes', () => {
    const s = outcomeStats([ev('partial'), ev('partial'), ev('unsuccessful')]);
    expect(s.successful).toBe(0);
    expect(s.rate).toBe(0);
  });

  it('has no rate when nothing was evaluated', () => {
    const s = outcomeStats([ev('not_applicable'), ev('not_assessed')]);
    expect(s.rate).toBeNull();
    expect(s.reliability).toBe('none');
    expect(describeRate(s)).toMatch(/No evaluated/);
  });

  it('refuses to show a percentage for tiny samples', () => {
    const s = outcomeStats([ev('successful'), ev('successful'), ev('unsuccessful')]);
    expect(s.reliability).toBe('insufficient');
    expect(describeRate(s)).not.toMatch(/%/);
    expect(describeRate(s)).toMatch(/2 of 3/);
  });

  it('flags small but usable samples', () => {
    const s = outcomeStats(Array.from({ length: 6 }, (_, i) => ev(i < 3 ? 'successful' : 'unsuccessful')));
    expect(s.reliability).toBe('low');
    expect(describeRate(s)).toBe('50% (3 of 6) — small sample');
  });
});

describe('windows and recurrence', () => {
  it('splits current and previous windows', () => {
    const now = new Date('2026-03-20T12:00').getTime();
    const day = 86_400_000;
    const events = [ev('successful', now - day), ev('unsuccessful', now - 3 * day), ev('successful', now - 9 * day)];
    const w = windowComparison(events, 7, now);
    expect(w.current.total).toBe(2);
    expect(w.previous.total).toBe(1);
  });

  it('counts words once per event and ignores stopwords', () => {
    const t = recurringTerms([
      ev('successful', 1, 'Manager criticized my report in the meeting'),
      ev('successful', 2, 'meeting ran late, manager manager annoyed'),
      ev('successful', 3, 'Traffic'),
    ]);
    expect(t).toEqual([['manager', 2], ['meeting', 2]]);
  });

  it('finds behaviors without recent activity', () => {
    const now = Date.now();
    const old = normalizeIssue({ title: 'Old', createdAt: now - 40 * 86_400_000, updatedAt: now - 40 * 86_400_000 })!;
    const fresh = normalizeIssue({ title: 'Fresh', createdAt: now, updatedAt: now })!;
    expect(staleIssues([old, fresh], [], now).map((x) => x.issue.title)).toEqual(['Old']);
  });
});
