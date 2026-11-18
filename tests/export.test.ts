import { describe, expect, it } from 'vitest';
import { buildReport, toMarkdown } from '../src/lib/report';
import { renderPdf } from '../src/lib/pdf';
import { normalizeIssue, normalizeEvent, normalizeReview } from '../src/lib/validate';
import type { BehaviorEvent, Outcome } from '../src/types';

const now = new Date('2026-03-20T12:00').getTime();
const day = 86_400_000;
const issue = normalizeIssue({
  id: 'i1', title: 'Defensive when criticized', description: 'I argue back immediately',
  hypothesis: 'I read criticism as a threat to competence', triggers: 'Code review, feedback from manager',
  createdAt: now - 60 * day,
  interventions: [{ id: 'iv1', ifThen: 'If criticized, then restate their point first', startedAt: now - 40 * day }],
})!;
const outcomes: Outcome[] = ['successful', 'successful', 'unsuccessful', 'partial', 'not_applicable', 'successful'];
const events = outcomes.map((o, k) =>
  normalizeEvent({ id: 'e' + k, issueId: 'i1', interventionId: 'iv1', situation: `Secret detail ${k} in review meeting`, emotion: 'Defensive', outcome: o, occurredAt: now - k * day }),
) as BehaviorEvent[];
const review = normalizeReview({ weekStart: now - 3 * day, reflection: 'PRIVATE REFLECTION', changeNext: 'Pause first' })!;
const data = { issues: [issue], events, reviews: [review] };
const base = { from: now - 30 * day, to: now + day, issueIds: ['i1'], includeEvents: false, includeReflections: false, includeUnlinkedEvents: false };

describe('export', () => {

  it('reports the right counts', () => {
    const md = toMarkdown(buildReport(data, base, now));
    // 3 successful, 1 unsuccessful -> 3 of 4, under min sample -> no percentage
    expect(md).toContain('3 of 4 successful — too few to calculate a rate');
    expect(md).toContain('partial 1');
    expect(md).toContain('1 not applicable');
  });

  it('labels hypotheses separately from observations', () => {
    const md = toMarkdown(buildReport(data, base, now));
    expect(md).toMatch(/HYPOTHESIS[^\n]*unverified[^\n]*\*\* I read criticism/);
    expect(md).toMatch(/OBSERVED — description:\*\* I argue back/);
  });

  it('excludes raw event details and reflections by default', () => {
    const md = toMarkdown(buildReport(data, base, now));
    expect(md).not.toContain('Secret detail');
    expect(md).not.toContain('PRIVATE REFLECTION');
  });

  it('includes them when asked', () => {
    const md = toMarkdown(buildReport(data, { ...base, includeEvents: true, includeReflections: true }, now));
    expect(md).toContain('Secret detail 0');
    expect(md).toContain('PRIVATE REFLECTION');
  });

  it('renders a valid PDF, including Hebrew text', () => {
    const heb = { ...data, issues: [{ ...issue, description: 'אני מתגונן מיד כשמבקרים אותי' }] };
    const buf = renderPdf(buildReport(heb, { ...base, includeEvents: true }, now));
    const head = new TextDecoder().decode(new Uint8Array(buf).slice(0, 5));
    expect(head).toBe('%PDF-');
    expect(buf.byteLength).toBeGreaterThan(2000);
  });
});
