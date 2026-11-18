import { useMemo, useState } from 'react';
import { useData, useNav, useUi } from '../state';
import { deleteIssue, editActiveIntervention, setIntervention, updateIssue } from '../db/repo';
import type { Issue, Status } from '../types';
import { STATUSES, STATUS_LABEL } from '../types';
import { activeIntervention, eventsForIntervention, eventsForIssue, outcomeStats, weeklyBuckets } from '../lib/stats';
import { fmtDate, fromLocalInput, relTime, toLocalInput } from '../lib/util';
import { Button, Card, Field, Icon, PageHeader, PriorityMark, RateDisplay, Sheet, StatusBadge, TextArea } from '../components/ui';
import { WeeklyRateChart } from '../components/charts';
import { EventList } from '../components/EventList';
import { IssueSheet } from './Behaviors';

export function IssueDetail({ id }: { id: string }) {
  const { issues, events, loading } = useData();
  const { go, back } = useNav();
  const { toast, confirm } = useUi();
  const issue = issues.find((i) => i.id === id);
  const [editing, setEditing] = useState(false);
  const [planSheet, setPlanSheet] = useState<'new' | 'edit' | null>(null);

  const ev = useMemo(() => (issue ? eventsForIssue(events, issue.id) : []), [events, issue]);
  if (loading) return null;
  if (!issue)
    return (
      <>
        <PageHeader title="Not found" onBack={back} />
        <Card className="p-6 text-sm text-stone-500">This behavior no longer exists.</Card>
      </>
    );

  const iv = activeIntervention(issue);
  const ivStats = iv ? outcomeStats(eventsForIntervention(ev, iv)) : null;
  const past = issue.interventions.filter((i) => i.endedAt).sort((a, b) => b.startedAt - a.startedAt);
  const weeks = iv
    ? weeklyBuckets(eventsForIntervention(ev, iv), Math.min(8, Math.max(4, Math.ceil((Date.now() - iv.startedAt) / (7 * 86_400_000)) + 1)))
    : [];

  const setStatus = async (status: Status) => { await updateIssue(issue.id, { status }); toast(`Status: ${STATUS_LABEL[status]}`); };
  const markReviewed = async () => { await updateIssue(issue.id, { reviewedAt: Date.now() }); toast('Marked as reviewed'); };
  const toggleArchive = async () => { await updateIssue(issue.id, { archived: !issue.archived }); toast(issue.archived ? 'Restored' : 'Archived'); };
  const remove = async () => {
    const ok = await confirm({
      title: 'Delete this behavior?',
      body: <>“{issue.title}” and its intervention history will be permanently deleted. Its {ev.length} logged event{ev.length === 1 ? '' : 's'} will be kept but unlinked. Consider archiving instead.</>,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    await deleteIssue(issue.id);
    toast('Deleted');
    go({ name: 'behaviors' });
  };

  return (
    <>
      <PageHeader
        title={issue.title}
        onBack={back}
        actions={<Button size="sm" onClick={() => setEditing(true)}><Icon name="edit" className="h-4 w-4" /><span className="hidden sm:inline">Edit</span></Button>}
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <StatusBadge status={issue.status} />
        <PriorityMark priority={issue.priority} />
        {issue.archived && <span className="text-xs text-stone-400">Archived</span>}
        <span className="text-xs text-stone-400">· created {fmtDate(issue.createdAt)} · updated {relTime(issue.updatedAt)}</span>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-5">
          <Card className="divide-y divide-stone-100 dark:divide-stone-800">
            <Detail label="Observed behavior" value={issue.description} empty="Describe what you actually do." />
            <Detail label="Triggers" value={issue.triggers} empty="Which situations set this off?" />
            <Detail label="Hypothesis" tag="unverified" value={issue.hypothesis} empty="Why might you behave this way? A guess to test, not a fact." />
            <Detail label="Desired behavior" value={issue.desiredBehavior} empty="What do you want to do instead?" />
            <Detail label="Success criteria" value={issue.successCriteria} empty="How will you know it's working?" />
            <div className="p-4">
              <button className="text-sm font-medium text-stone-600 hover:underline dark:text-stone-300" onClick={() => setEditing(true)}>Edit details</button>
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="section-title mb-3">Status</h2>
            <div className="flex flex-wrap gap-2">
              {STATUSES.map((s) => (
                <button key={s} className={`chip ${issue.status === s ? 'chip-on' : ''}`} onClick={() => setStatus(s)}>{STATUS_LABEL[s]}</button>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2 border-t border-stone-100 pt-4 dark:border-stone-800">
              <Button size="sm" onClick={markReviewed}><Icon name="check" className="h-4 w-4" />Mark reviewed</Button>
              <Button size="sm" onClick={toggleArchive}><Icon name="archive" className="h-4 w-4" />{issue.archived ? 'Unarchive' : 'Archive'}</Button>
              <Button size="sm" variant="danger" onClick={remove}><Icon name="trash" className="h-4 w-4" />Delete</Button>
            </div>
            {issue.reviewedAt && <p className="mt-2 text-xs text-stone-400">Last reviewed {relTime(issue.reviewedAt)}</p>}
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="section-title">Active intervention</h2>
              {iv && <span className="text-xs text-stone-400">since {fmtDate(iv.startedAt)}</span>}
            </div>
            {iv ? (
              <>
                <p className="mb-4 rounded-xl bg-sky-50 px-3.5 py-3 text-[15px] leading-relaxed text-sky-950 dark:bg-sky-950/40 dark:text-sky-100" dir="auto">{iv.ifThen}</p>
                <RateDisplay s={ivStats!} />
                <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
                  {ivStats!.applicable} applicable opportunit{ivStats!.applicable === 1 ? 'y' : 'ies'} logged under this plan. Rate = successful ÷ (successful + unsuccessful); partial shown separately.
                </p>
                {ivStats!.evaluated > 0 && <div className="mt-4"><WeeklyRateChart weeks={weeks} /></div>}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" variant="primary" onClick={() => go({ name: 'log', issueId: issue.id, back: { name: 'issue', id: issue.id } })}><Icon name="plus" className="h-4 w-4" />Log event</Button>
                  <Button size="sm" onClick={() => setPlanSheet('new')}>Replace plan</Button>
                  <Button size="sm" variant="ghost" onClick={() => setPlanSheet('edit')}>Fix wording</Button>
                </div>
              </>
            ) : (
              <>
                <p className="mb-3 text-sm text-stone-500 dark:text-stone-400">
                  Add a concrete “If X happens, then I will do Y” plan. Events logged afterwards are counted toward it.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="primary" onClick={() => setPlanSheet('new')}><Icon name="flask" className="h-4 w-4" />Add intervention</Button>
                  <Button size="sm" onClick={() => go({ name: 'log', issueId: issue.id, back: { name: 'issue', id: issue.id } })}>Log event</Button>
                </div>
              </>
            )}
          </Card>

          {past.length > 0 && (
            <Card className="p-4">
              <h2 className="section-title mb-3">Past interventions</h2>
              <ul className="space-y-4">
                {past.map((p) => {
                  const s = outcomeStats(eventsForIntervention(ev, p));
                  return (
                    <li key={p.id}>
                      <p className="text-sm" dir="auto">{p.ifThen}</p>
                      <p className="mb-2 text-xs text-stone-400">{fmtDate(p.startedAt)} – {fmtDate(p.endedAt!)}</p>
                      <RateDisplay s={s} compact />
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          <section>
            <h2 className="section-title mb-2">Events ({ev.length})</h2>
            {ev.length ? (
              <Card><EventList events={ev} issues={issues} back={{ name: 'issue', id: issue.id }} showIssue={false} /></Card>
            ) : (
              <Card className="p-4 text-sm text-stone-500">No events logged for this behavior yet.</Card>
            )}
          </section>
        </div>
      </div>

      <IssueSheet open={editing} onClose={() => setEditing(false)} issue={issue} />
      <PlanSheet issue={issue} mode={planSheet} onClose={() => setPlanSheet(null)} />
    </>
  );
}

function Detail({ label, value, empty, tag }: { label: string; value: string; empty: string; tag?: string }) {
  return (
    <div className="p-4">
      <p className="mb-1 flex items-center gap-2 text-xs font-medium text-stone-500 dark:text-stone-400">
        {label}
        {tag && <span className="rounded bg-amber-50 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">{tag}</span>}
      </p>
      {value.trim() ? <p className="whitespace-pre-wrap text-sm leading-relaxed" dir="auto">{value}</p> : <p className="text-sm italic text-stone-400">{empty}</p>}
    </div>
  );
}

function PlanSheet({ issue, mode, onClose }: { issue: Issue; mode: 'new' | 'edit' | null; onClose: () => void }) {
  const { toast } = useUi();
  const iv = activeIntervention(issue);
  const [text, setText] = useState('');
  const [start, setStart] = useState(toLocalInput(Date.now()));
  const [lastMode, setLastMode] = useState<typeof mode>(null);
  if (mode !== lastMode) {
    setLastMode(mode);
    if (mode) { setText(mode === 'edit' ? iv?.ifThen ?? '' : ''); setStart(toLocalInput(Date.now())); }
  }
  const save = async () => {
    if (!text.trim()) return;
    if (mode === 'edit') {
      await editActiveIntervention(issue.id, text);
      toast('Plan updated');
    } else {
      const t = fromLocalInput(start) ?? Date.now();
      await setIntervention(issue.id, text, Math.min(t, Date.now()));
      if (issue.status === 'observed' || issue.status === 'investigating') await updateIssue(issue.id, { status: 'experimenting' });
      toast(iv ? 'New plan started — previous one kept in history' : 'Intervention started');
    }
    onClose();
  };
  return (
    <Sheet
      open={!!mode}
      onClose={onClose}
      title={mode === 'edit' ? 'Fix plan wording' : iv ? 'Replace intervention' : 'Add intervention'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!text.trim()} onClick={save}>{mode === 'edit' ? 'Save' : 'Start plan'}</Button></>}
    >
      <div className="space-y-4">
        {mode === 'new' && iv && (
          <p className="rounded-xl bg-stone-100 px-3 py-2.5 text-sm text-stone-600 dark:bg-stone-800 dark:text-stone-300">
            The current plan will be closed and kept in history with its results. New events will count toward the new plan.
          </p>
        )}
        {mode === 'edit' && <p className="text-sm text-stone-500">Use this for typos or clarifications only. If the plan itself changes, replace it so results stay comparable.</p>}
        <Field label="If–then plan" hint="Specific trigger → specific action. e.g. “If I'm criticized in a meeting, then I'll restate their point before replying.”">
          <TextArea autoFocus minRows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="If … then I will …" />
        </Field>
        {mode === 'new' && (
          <Field label="Started" hint="Backdate if you already began using this plan.">
            <input type="datetime-local" className="input" value={start} max={toLocalInput(Date.now())} onChange={(e) => setStart(e.target.value)} />
          </Field>
        )}
      </div>
    </Sheet>
  );
}
