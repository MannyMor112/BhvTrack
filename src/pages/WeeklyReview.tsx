import { useEffect, useMemo, useState } from 'react';
import { useData, useNav, useUi } from '../state';
import { deleteReview, saveReview } from '../db/repo';
import { avgIntensity, countBy, describeRate, inRange, outcomeStats, recurringTerms, signedDelta } from '../lib/stats';
import { addDays, fmtDate, startOfWeek } from '../lib/util';
import { Button, Card, Field, Icon, PageHeader, RateDisplay, TextArea } from '../components/ui';
import { EventList } from '../components/EventList';

export function WeeklyReview() {
  const { issues, events, reviews } = useData();
  const { toast, confirm } = useUi();
  const { go } = useNav();
  const thisWeek = startOfWeek(Date.now());
  const [week, setWeek] = useState(thisWeek);
  const weekEnd = addDays(week, 7);
  const saved = reviews.find((r) => r.weekStart === week);

  const cur = useMemo(() => inRange(events, week, weekEnd), [events, week, weekEnd]);
  const prev = useMemo(() => inRange(events, addDays(week, -7), week), [events, week]);
  const sCur = outcomeStats(cur);
  const sPrev = outcomeStats(prev);
  const emotions = countBy(cur, (e) => e.emotion);
  const terms = recurringTerms(cur);
  const ia = avgIntensity(cur), iaPrev = avgIntensity(prev);
  const titles = new Map(issues.map((i) => [i.id, i.title]));
  const perIssue = countBy(cur, (e) => e.issueId).map(([id, n]) => {
    const s = outcomeStats(cur.filter((e) => e.issueId === id));
    const p = prev.filter((e) => e.issueId === id).length;
    return { id, title: titles.get(id) ?? 'Deleted behavior', n, p, s };
  });
  const unlinked = cur.filter((e) => !e.issueId).length;

  const [form, setForm] = useState(blank());
  useEffect(() => {
    setForm(saved ? { reflection: saved.reflection, whatWorked: saved.whatWorked, whatDidnt: saved.whatDidnt, changeNext: saved.changeNext, focusIssueIds: saved.focusIssueIds, focusNote: saved.focusNote } : blank());
  }, [saved?.id, saved?.updatedAt, week]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof ReturnType<typeof blank>) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const toggleFocus = (id: string) =>
    setForm((f) => ({
      ...f,
      focusIssueIds: f.focusIssueIds.includes(id) ? f.focusIssueIds.filter((x) => x !== id) : f.focusIssueIds.length >= 2 ? [f.focusIssueIds[1], id] : [...f.focusIssueIds, id],
    }));

  const save = async () => { await saveReview({ weekStart: week, ...form }); toast('Review saved'); };
  const remove = async () => {
    if (!saved) return;
    if (!(await confirm({ title: 'Delete this weekly review?', body: 'Your notes for this week will be removed. Logged events are not affected.', confirmLabel: 'Delete', danger: true }))) return;
    await deleteReview(saved.id);
    toast('Review deleted');
  };

  const openIssues = issues.filter((i) => !i.archived && i.status !== 'resolved');
  const label = week === thisWeek ? 'This week' : week === addDays(thisWeek, -7) ? 'Last week' : `Week of ${fmtDate(week)}`;

  return (
    <>
      <PageHeader title="Weekly review" subtitle={`${fmtDate(week)} – ${fmtDate(addDays(week, 6))}`} />

      <div className="mb-5 flex items-center justify-between gap-2">
        <Button size="sm" variant="ghost" onClick={() => setWeek(addDays(week, -7))}><Icon name="back" className="h-4 w-4" />Prev</Button>
        <span className="text-sm font-medium">{label}{saved && <span className="ml-2 text-xs font-normal text-emerald-600">● saved</span>}</span>
        <Button size="sm" variant="ghost" disabled={week >= thisWeek} onClick={() => setWeek(addDays(week, 7))}>Next<Icon name="next" className="h-4 w-4" /></Button>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <Card className="p-4">
            <h2 className="section-title mb-3">This week in numbers</h2>
            <div className="grid grid-cols-3 gap-3 text-center">
              <Num label="Events" v={sCur.total} d={signedDelta(sCur.total, sPrev.total)} />
              <Num label="Applicable" v={sCur.applicable} d={signedDelta(sCur.applicable, sPrev.applicable)} />
              <Num label="Avg intensity" v={ia.avg !== null ? ia.avg.toFixed(1) : '—'} d={ia.avg !== null && iaPrev.avg !== null ? `${(ia.avg - iaPrev.avg >= 0 ? '+' : '')}${(ia.avg - iaPrev.avg).toFixed(1)}` : `n=${ia.n}`} />
            </div>
            <p className="mt-2 text-center text-[11px] text-stone-400">Changes are vs. the previous week.</p>
            <div className="mt-4 grid gap-4 border-t border-stone-100 pt-4 dark:border-stone-800 sm:grid-cols-2">
              <div><p className="mb-1 text-xs text-stone-500">This week</p><RateDisplay s={sCur} compact /></div>
              <div><p className="mb-1 text-xs text-stone-500">Previous week</p><RateDisplay s={sPrev} compact /></div>
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="section-title mb-3">Intervention outcomes by behavior</h2>
            {perIssue.length === 0 ? (
              <p className="text-sm text-stone-500">No events linked to a behavior this week.</p>
            ) : (
              <ul className="space-y-3">
                {perIssue.map((x) => (
                  <li key={x.id} className="text-sm">
                    <button className="text-left font-medium hover:underline" dir="auto" onClick={() => go({ name: 'issue', id: x.id })}>{x.title}</button>
                    <p className="text-xs text-stone-500 dark:text-stone-400">
                      {x.n} event{x.n === 1 ? '' : 's'} ({signedDelta(x.n, x.p)}) · {x.s.successful} success · {x.s.partial} partial · {x.s.unsuccessful} unsuccessful · {x.s.notApplicable + x.s.notAssessed} n/a or not assessed
                    </p>
                    <p className="text-xs text-stone-400">{describeRate(x.s)}</p>
                  </li>
                ))}
              </ul>
            )}
            {unlinked > 0 && <p className="mt-3 text-xs text-stone-400">{unlinked} event(s) not linked to a behavior.</p>}
          </Card>

          <Card className="p-4">
            <h2 className="section-title mb-1">Patterns in this week's logs</h2>
            <p className="mb-3 text-xs text-stone-400">Counts only — no interpretation.</p>
            {emotions.length === 0 && terms.length === 0 ? (
              <p className="text-sm text-stone-500">Not enough data yet.</p>
            ) : (
              <div className="space-y-3 text-sm">
                {emotions.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs text-stone-500">Emotions logged</p>
                    <div className="flex flex-wrap gap-1.5">{emotions.map(([k, n]) => <span key={k} className="rounded-full bg-stone-100 px-2.5 py-1 text-xs dark:bg-stone-800">{k} · {n}</span>)}</div>
                  </div>
                )}
                {terms.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs text-stone-500">Words in 2+ situations</p>
                    <div className="flex flex-wrap gap-1.5">{terms.map(([k, n]) => <span key={k} className="rounded-full bg-stone-100 px-2.5 py-1 text-xs dark:bg-stone-800" dir="auto">{k} · {n}</span>)}</div>
                  </div>
                )}
              </div>
            )}
          </Card>

          {cur.length > 0 && (
            <section>
              <h2 className="section-title mb-2">Events this week ({cur.length})</h2>
              <Card><EventList events={cur} issues={issues} back={{ name: 'review' }} /></Card>
            </section>
          )}
        </div>

        <Card className="h-fit space-y-4 p-4">
          <h2 className="section-title">Reflection</h2>
          <Field label="What worked?"><TextArea value={form.whatWorked} onChange={(e) => set('whatWorked')(e.target.value)} /></Field>
          <Field label="What didn't work?"><TextArea value={form.whatDidnt} onChange={(e) => set('whatDidnt')(e.target.value)} /></Field>
          <Field label="What should I change next week?"><TextArea value={form.changeNext} onChange={(e) => set('changeNext')(e.target.value)} /></Field>
          <div>
            <p className="label">Which one or two behaviors will I focus on next?</p>
            {openIssues.length ? (
              <div className="flex flex-wrap gap-2">
                {openIssues.map((i) => (
                  <button key={i.id} type="button" className={`chip text-left ${form.focusIssueIds.includes(i.id) ? 'chip-on' : ''}`} onClick={() => toggleFocus(i.id)} dir="auto">{i.title}</button>
                ))}
              </div>
            ) : <p className="text-sm text-stone-500">No open behaviors.</p>}
            <input className="input mt-2" dir="auto" placeholder="Optional note on focus" value={form.focusNote} onChange={(e) => set('focusNote')(e.target.value)} />
          </div>
          <Field label="Free reflection" optional><TextArea minRows={3} value={form.reflection} onChange={(e) => set('reflection')(e.target.value)} /></Field>
          <div className="flex gap-2">
            <Button variant="primary" onClick={save}>{saved ? 'Update review' : 'Save review'}</Button>
            {saved && <Button variant="ghost" onClick={remove}>Delete</Button>}
          </div>
          {saved && <p className="text-xs text-stone-400">Saved {new Date(saved.updatedAt).toLocaleString()}</p>}
        </Card>
      </div>

      {reviews.length > 0 && (
        <section className="mt-6">
          <h2 className="section-title mb-2">Past reviews</h2>
          <Card>
            <ul className="divide-y divide-stone-100 dark:divide-stone-800">
              {reviews.map((r) => (
                <li key={r.id}>
                  <button className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-stone-50 dark:hover:bg-stone-800/50 ${r.weekStart === week ? 'bg-stone-50 dark:bg-stone-800/40' : ''}`} onClick={() => { setWeek(r.weekStart); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                    <span className="text-sm font-medium">Week of {fmtDate(r.weekStart)}</span>
                    <span className="truncate text-xs text-stone-500" dir="auto">{r.changeNext || r.whatWorked || r.reflection || '—'}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}
    </>
  );
}

function Num({ label, v, d }: { label: string; v: number | string; d: string }) {
  return (
    <div>
      <p className="text-2xl font-semibold tabular-nums">{v}</p>
      <p className="text-xs text-stone-500">{label}</p>
      <p className="text-[11px] tabular-nums text-stone-400">{d}</p>
    </div>
  );
}

function blank() {
  return { reflection: '', whatWorked: '', whatDidnt: '', changeNext: '', focusIssueIds: [] as string[], focusNote: '' };
}
