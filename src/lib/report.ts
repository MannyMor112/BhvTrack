import type { BehaviorEvent, Issue, WeeklyReview } from '../types';
import { OUTCOME_LABEL, PRIORITY_LABEL, STATUS_LABEL } from '../types';
import {
  avgIntensity, countBy, describeRate, eventsForIntervention, inRange, outcomeStats, recurringTerms,
  MIN_SAMPLE_FOR_RATE, SOLID_SAMPLE,
} from './stats';
import { DAY, fmtDate, fmtDateTime, fmtISODate, startOfDay } from './util';

/*
 * A report is a list of neutral blocks. Markdown, plain text and PDF are all
 * rendered from the same blocks so the formats never disagree.
 */
export type Block =
  | { t: 'h1'; text: string }
  | { t: 'h2'; text: string }
  | { t: 'h3'; text: string }
  | { t: 'p'; text: string }
  | { t: 'note'; text: string }
  | { t: 'kv'; label: string; value: string }
  | { t: 'bullets'; items: string[] }
  | { t: 'table'; head: string[]; rows: string[][] }
  | { t: 'hr' };

export type RangePreset = '7' | '30' | '90' | 'custom';

export interface ExportOptions {
  from: number; // inclusive
  to: number; // exclusive
  issueIds: string[];
  includeEvents: boolean;
  includeReflections: boolean;
  includeUnlinkedEvents: boolean;
}

export function rangeFromPreset(preset: RangePreset, now = Date.now(), custom?: { from: string; to: string }) {
  const end = startOfDay(now) + DAY;
  if (preset === 'custom' && custom) {
    const f = new Date(custom.from + 'T00:00').getTime();
    const t = new Date(custom.to + 'T00:00').getTime() + DAY;
    if (Number.isFinite(f) && Number.isFinite(t) && t > f) return { from: f, to: t };
  }
  const days = preset === 'custom' ? 30 : Number(preset);
  return { from: end - days * DAY, to: end };
}

const orDash = (s: string) => (s.trim() ? s.trim() : '—');

export function buildReport(
  data: { issues: Issue[]; events: BehaviorEvent[]; reviews: WeeklyReview[] },
  opt: ExportOptions,
  now = Date.now(),
): Block[] {
  const B: Block[] = [];
  const selected = data.issues.filter((i) => opt.issueIds.includes(i.id));
  const periodEvents = inRange(data.events, opt.from, opt.to);
  const selIds = new Set(selected.map((i) => i.id));
  const scoped = periodEvents.filter((e) => (e.issueId ? selIds.has(e.issueId) : opt.includeUnlinkedEvents));
  const lastDay = opt.to - 1;

  B.push({ t: 'h1', text: 'Behavioral Pattern Summary' });
  B.push({
    t: 'note',
    text:
      'Self-tracked data from a personal behavior log, generated on ' + fmtDate(now) + '. ' +
      'This is not a clinical assessment. Sections are labelled by source: OBSERVED = what the person logged; ' +
      'HYPOTHESIS = the person\'s own explanation, not an established finding; MEASURED = counts calculated from logged events.',
  });

  // 1. Reporting period
  B.push({ t: 'h2', text: '1. Reporting period' });
  B.push({ t: 'kv', label: 'Period', value: `${fmtDate(opt.from)} – ${fmtDate(lastDay)} (${Math.round((opt.to - opt.from) / DAY)} days)` });
  B.push({ t: 'kv', label: 'Behaviors included', value: String(selected.length) });
  B.push({ t: 'kv', label: 'Events logged in period (in scope)', value: String(scoped.length) });
  B.push({
    t: 'kv',
    label: 'How success rates are calculated',
    value:
      `successful ÷ (successful + unsuccessful). Partial successes are reported separately and are not counted as successes. ` +
      `"Not applicable" and "not assessed" events are excluded. No rate is shown with fewer than ${MIN_SAMPLE_FOR_RATE} evaluated opportunities; ` +
      `rates from ${MIN_SAMPLE_FOR_RATE}–${SOLID_SAMPLE - 1} are flagged as small samples.`,
  });

  // 2. Active behavioral issues overview
  B.push({ t: 'h2', text: '2. Behaviors tracked' });
  if (!selected.length) B.push({ t: 'p', text: 'No behaviors selected.' });
  else
    B.push({
      t: 'table',
      head: ['Behavior', 'Status', 'Priority', 'Events (period)', 'Success rate (period)'],
      rows: selected.map((i) => {
        const ev = scoped.filter((e) => e.issueId === i.id);
        return [i.title, STATUS_LABEL[i.status] + (i.archived ? ' (archived)' : ''), PRIORITY_LABEL[i.priority], String(ev.length), describeRate(outcomeStats(ev))];
      }),
    });

  // 3–6. Per-issue detail
  B.push({ t: 'h2', text: '3. Behavior details' });
  selected.forEach((issue, idx) => {
    const ev = scoped.filter((e) => e.issueId === issue.id);
    B.push({ t: 'h3', text: `3.${idx + 1} ${issue.title}` });
    B.push({ t: 'kv', label: 'Status / priority', value: `${STATUS_LABEL[issue.status]} · ${PRIORITY_LABEL[issue.priority]} priority · tracked since ${fmtDate(issue.createdAt)}` });
    B.push({ t: 'kv', label: 'OBSERVED — description', value: orDash(issue.description) });
    B.push({ t: 'kv', label: 'OBSERVED — reported triggers', value: orDash(issue.triggers) });
    B.push({ t: 'kv', label: 'HYPOTHESIS — the person\'s explanation (unverified)', value: orDash(issue.hypothesis) });
    B.push({ t: 'kv', label: 'GOAL — desired behavior', value: orDash(issue.desiredBehavior) });
    B.push({ t: 'kv', label: 'GOAL — success criteria', value: orDash(issue.successCriteria) });

    // Interventions
    const ivs = [...issue.interventions].sort((a, b) => a.startedAt - b.startedAt);
    if (!ivs.length) B.push({ t: 'kv', label: 'Interventions attempted', value: 'None defined yet.' });
    else {
      B.push({ t: 'p', text: 'Interventions attempted (MEASURED counts are for this reporting period only):' });
      B.push({
        t: 'table',
        head: ['Plan (if–then)', 'Dates', 'Success', 'Partial', 'Unsuccessful', 'Rate'],
        rows: ivs.map((iv) => {
          const s = outcomeStats(eventsForIntervention(ev, iv));
          return [
            iv.ifThen,
            `${fmtDate(iv.startedAt)} – ${iv.endedAt ? fmtDate(iv.endedAt) : 'active'}`,
            String(s.successful),
            String(s.partial),
            String(s.unsuccessful),
            describeRate(s),
          ];
        }),
      });
    }

    // Quantitative progress
    const s = outcomeStats(ev);
    const unlinkedToIv = ev.filter((e) => !e.interventionId).length;
    const ia = avgIntensity(ev);
    B.push({
      t: 'bullets',
      items: [
        `MEASURED — events logged: ${s.total}`,
        `MEASURED — opportunities where the plan applied: ${s.applicable} (successful ${s.successful}, partial ${s.partial}, unsuccessful ${s.unsuccessful})`,
        `MEASURED — excluded from rate: ${s.notApplicable} not applicable, ${s.notAssessed} not assessed`,
        `MEASURED — success rate: ${describeRate(s)}`,
        ...(ia.n ? [`MEASURED — average emotional intensity: ${ia.avg!.toFixed(1)}/10 (rated in ${ia.n} of ${s.total} events)`] : []),
        ...(unlinkedToIv ? [`${unlinkedToIv} event(s) occurred while no intervention was active.`] : []),
      ],
    });
    const halves = splitHalves(ev, opt.from, opt.to);
    if (halves.first.evaluated + halves.second.evaluated >= MIN_SAMPLE_FOR_RATE * 2) {
      B.push({ t: 'p', text: `MEASURED — first half of period: ${describeRate(halves.first)}; second half: ${describeRate(halves.second)}.` });
    }

    if (opt.includeEvents) {
      if (!ev.length) B.push({ t: 'p', text: 'No events in this period.' });
      else {
        B.push({ t: 'p', text: `OBSERVED — event log (${ev.length}):` });
        B.push({
          t: 'table',
          head: ['When', 'Situation', 'Thought', 'Emotion', 'Reaction', 'Consequence', 'Outcome'],
          rows: [...ev].sort((a, b) => a.occurredAt - b.occurredAt).map(eventRow),
        });
      }
    }
  });

  // Unlinked events
  const unlinked = scoped.filter((e) => !e.issueId);
  if (opt.includeUnlinkedEvents && unlinked.length) {
    B.push({ t: 'h3', text: 'Events not linked to a behavior' });
    B.push({ t: 'p', text: `MEASURED — ${unlinked.length} event(s).` });
    if (opt.includeEvents)
      B.push({ t: 'table', head: ['When', 'Situation', 'Thought', 'Emotion', 'Reaction', 'Consequence', 'Outcome'], rows: unlinked.map(eventRow) });
  }

  // 7. Recurring observations (counts only)
  B.push({ t: 'h2', text: '4. Recurring observations in logged data' });
  B.push({ t: 'note', text: 'Frequency counts only. No interpretation is applied.' });
  const emo = countBy(scoped, (e) => e.emotion).filter(([, n]) => n >= 2);
  const terms = recurringTerms(scoped);
  const items: string[] = [];
  if (emo.length) items.push('Emotions reported more than once: ' + emo.map(([k, n]) => `${k} (${n})`).join(', '));
  if (terms.length) items.push('Words appearing in several situation descriptions: ' + terms.map(([k, n]) => `"${k}" (${n} events)`).join(', '));
  const dow = countBy(scoped, (e) => new Date(e.occurredAt).toLocaleDateString('en-US', { weekday: 'long' }));
  if (scoped.length >= 5 && dow.length) items.push('Most events by weekday: ' + dow.slice(0, 3).map(([k, n]) => `${k} (${n})`).join(', '));
  const tod = countBy(scoped, (e) => timeOfDay(e.occurredAt));
  if (scoped.length >= 5 && tod.length) items.push('Time of day: ' + tod.map(([k, n]) => `${k} (${n})`).join(', '));
  B.push(items.length ? { t: 'bullets', items } : { t: 'p', text: 'Not enough data to show recurring items.' });

  // 8. Weekly review notes
  const reviews = data.reviews
    .filter((r) => r.weekStart + 7 * DAY > opt.from && r.weekStart < opt.to)
    .sort((a, b) => a.weekStart - b.weekStart);
  if (opt.includeReflections) {
    B.push({ t: 'h2', text: '5. Weekly review notes (the person\'s own reflections)' });
    if (!reviews.length) B.push({ t: 'p', text: 'No weekly reviews in this period.' });
    for (const r of reviews) {
      B.push({ t: 'h3', text: `Week of ${fmtDate(r.weekStart)}` });
      if (r.reflection.trim()) B.push({ t: 'kv', label: 'Reflection', value: r.reflection.trim() });
      if (r.whatWorked.trim()) B.push({ t: 'kv', label: 'What worked', value: r.whatWorked.trim() });
      if (r.whatDidnt.trim()) B.push({ t: 'kv', label: 'What didn\'t work', value: r.whatDidnt.trim() });
      if (r.changeNext.trim()) B.push({ t: 'kv', label: 'Planned change', value: r.changeNext.trim() });
      const focus = r.focusIssueIds.map((id) => data.issues.find((i) => i.id === id)?.title).filter(Boolean);
      if (focus.length || r.focusNote.trim()) B.push({ t: 'kv', label: 'Focus for next week', value: [focus.join(', '), r.focusNote.trim()].filter(Boolean).join(' — ') });
    }
  }

  // 9. Outstanding challenges and goals
  B.push({ t: 'h2', text: `${opt.includeReflections ? 6 : 5}. Outstanding challenges and current goals` });
  const open = selected.filter((i) => i.status !== 'resolved' && !i.archived);
  const goals: string[] = [];
  for (const i of open) {
    const s = outcomeStats(scoped.filter((e) => e.issueId === i.id));
    const iv = i.interventions.find((x) => !x.endedAt);
    let line = `${i.title} — ${STATUS_LABEL[i.status]}.`;
    if (i.desiredBehavior.trim()) line += ` Goal: ${i.desiredBehavior.trim()}.`;
    if (iv) line += ` Current plan: ${iv.ifThen}.`;
    else line += ' No active intervention.';
    if (s.evaluated && s.unsuccessful > s.successful) line += ` In this period, unsuccessful outcomes (${s.unsuccessful}) outnumbered successful ones (${s.successful}).`;
    goals.push(line.replace(/\.\./g, '.'));
  }
  if (opt.includeReflections) {
    const latest = reviews[reviews.length - 1];
    if (latest?.changeNext.trim()) goals.push(`Most recent planned change (week of ${fmtDate(latest.weekStart)}): ${latest.changeNext.trim()}`);
  }
  B.push(goals.length ? { t: 'bullets', items: goals } : { t: 'p', text: 'No open behaviors in this selection.' });

  return B;
}

function eventRow(e: BehaviorEvent): string[] {
  return [
    fmtDateTime(e.occurredAt),
    e.situation,
    orDash(e.thought),
    e.emotion ? `${e.emotion}${e.intensity ? ` (${e.intensity}/10)` : ''}` : e.intensity ? `${e.intensity}/10` : '—',
    orDash(e.reaction),
    orDash(e.consequence),
    OUTCOME_LABEL[e.outcome],
  ];
}

function timeOfDay(t: number) {
  const h = new Date(t).getHours();
  return h < 5 ? 'Night' : h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : h < 22 ? 'Evening' : 'Night';
}

function splitHalves(ev: BehaviorEvent[], from: number, to: number) {
  const mid = from + (to - from) / 2;
  return { first: outcomeStats(inRange(ev, from, mid)), second: outcomeStats(inRange(ev, mid, to)) };
}

/* ---------- Markdown ---------- */

const mdEscCell = (s: string) => s.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');

export function toMarkdown(blocks: Block[]): string {
  const out: string[] = [];
  for (const b of blocks) {
    switch (b.t) {
      case 'h1': out.push(`# ${b.text}`, ''); break;
      case 'h2': out.push(`## ${b.text}`, ''); break;
      case 'h3': out.push(`### ${b.text}`, ''); break;
      case 'p': out.push(b.text, ''); break;
      case 'note': out.push(`> ${b.text}`, ''); break;
      case 'kv': out.push(`**${b.label}:** ${b.value.includes('\n') ? '\n' + b.value.split('\n').map((l) => '  ' + l).join('\n') : b.value}`, ''); break;
      case 'bullets': out.push(...b.items.map((i) => `- ${i}`), ''); break;
      case 'table':
        out.push(`| ${b.head.map(mdEscCell).join(' | ')} |`);
        out.push(`| ${b.head.map(() => '---').join(' | ')} |`);
        for (const r of b.rows) out.push(`| ${r.map(mdEscCell).join(' | ')} |`);
        out.push('');
        break;
      case 'hr': out.push('---', ''); break;
    }
  }
  return out.join('\n').trim() + '\n';
}

export function reportFilename(opt: ExportOptions, ext: string) {
  return `behavior-summary_${fmtISODate(opt.from)}_to_${fmtISODate(opt.to - 1)}.${ext}`;
}
