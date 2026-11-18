import { useMemo, useState } from 'react';
import { useData, useNav, useUi } from '../state';
import { createIssue, updateIssue } from '../db/repo';
import type { Issue, Priority, Status } from '../types';
import { PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL } from '../types';
import { activeIntervention, eventsForIssue, lastActivity, outcomeStats, describeRate } from '../lib/stats';
import { relTime } from '../lib/util';
import { Button, Card, Empty, Field, Icon, PageHeader, PriorityMark, Sheet, StatusBadge, TextArea } from '../components/ui';

type Filter = 'active' | Status | 'archived' | 'all';

export function Behaviors() {
  const { issues, events } = useData();
  const { go } = useNav();
  const [filter, setFilter] = useState<Filter>('active');
  const [prio, setPrio] = useState<Priority | 'any'>('any');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);

  const counts = useMemo(() => {
    const c: Record<string, number> = { active: 0, archived: 0, all: issues.length };
    for (const i of issues) {
      if (i.archived) c.archived++;
      else {
        if (i.status !== 'resolved') c.active++;
        c[i.status] = (c[i.status] ?? 0) + 1;
      }
    }
    return c;
  }, [issues]);

  const shown = issues
    .filter((i) => {
      if (filter === 'all') return true;
      if (filter === 'archived') return i.archived;
      if (i.archived) return false;
      if (filter === 'active') return i.status !== 'resolved';
      return i.status === filter;
    })
    .filter((i) => prio === 'any' || i.priority === prio)
    .filter((i) => !q.trim() || (i.title + ' ' + i.description).toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => PRIORITIES.indexOf(b.priority) - PRIORITIES.indexOf(a.priority) || b.updatedAt - a.updatedAt);

  const filters: Array<{ v: Filter; label: string }> = [
    { v: 'active', label: 'Active' },
    ...STATUSES.map((s) => ({ v: s as Filter, label: STATUS_LABEL[s] })),
    { v: 'archived', label: 'Archived' },
  ];

  return (
    <>
      <PageHeader
        title="Behaviors"
        subtitle="Patterns you're working on"
        actions={<Button variant="primary" onClick={() => setCreating(true)}><Icon name="plus" className="h-4 w-4" /><span className="hidden sm:inline">New behavior</span><span className="sm:hidden">New</span></Button>}
      />

      {issues.length > 0 && (
        <div className="mb-4 space-y-3">
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
            {filters.map((f) => (
              <button key={f.v} onClick={() => setFilter(f.v)} className={`chip shrink-0 ${filter === f.v ? 'chip-on' : ''}`}>
                {f.label}
                <span className="tabular-nums opacity-60">{counts[f.v] ?? 0}</span>
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input className="input flex-1" placeholder="Search behaviors" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search behaviors" />
            <select className="input w-auto" value={prio} onChange={(e) => setPrio(e.target.value as Priority | 'any')} aria-label="Filter by priority">
              <option value="any">Any priority</option>
              {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
            </select>
          </div>
        </div>
      )}

      {!issues.length ? (
        <Empty
          title="No behaviors yet"
          body="A title and a short description is enough to start. You can add triggers, a hypothesis and an if–then plan later."
          action={<Button variant="primary" onClick={() => setCreating(true)}><Icon name="plus" className="h-4 w-4" />Add your first behavior</Button>}
        />
      ) : shown.length === 0 ? (
        <Card className="p-6 text-center text-sm text-stone-500">Nothing matches these filters.</Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {shown.map((i) => {
            const ev = eventsForIssue(events, i.id);
            const iv = activeIntervention(i);
            const s = outcomeStats(iv ? ev.filter((e) => e.interventionId === iv.id) : []);
            return (
              <Card key={i.id} className="p-4" onClick={() => go({ name: 'issue', id: i.id })}>
                <div className="mb-2 flex items-center gap-2">
                  <StatusBadge status={i.status} />
                  <PriorityMark priority={i.priority} />
                  {i.archived && <span className="text-xs text-stone-400">Archived</span>}
                </div>
                <p className="font-medium leading-snug" dir="auto">{i.title}</p>
                {i.description && <p className="mt-1 line-clamp-2 text-sm text-stone-500 dark:text-stone-400" dir="auto">{i.description}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-stone-100 pt-3 text-xs text-stone-500 dark:border-stone-800 dark:text-stone-400">
                  <span>{ev.length} event{ev.length === 1 ? '' : 's'}</span>
                  {iv ? <span className="inline-flex items-center gap-1"><Icon name="flask" className="h-3.5 w-3.5" />{describeRate(s)}</span> : <span>No plan yet</span>}
                  <span className="ml-auto">{relTime(lastActivity(i, events))}</span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <IssueSheet open={creating} onClose={() => setCreating(false)} onSaved={(id) => go({ name: 'issue', id })} />
    </>
  );
}

export function IssueSheet({ open, onClose, issue, onSaved }: { open: boolean; onClose: () => void; issue?: Issue; onSaved?: (id: string) => void }) {
  const { toast } = useUi();
  const [f, setF] = useState(() => init(issue));
  const [more, setMore] = useState(!!issue);
  const [busy, setBusy] = useState(false);
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) { setF(init(issue)); setMore(!!issue); }
  }
  const set = <K extends keyof typeof f>(k: K) => (v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.title.trim()) return toast('Give it a short title', 'err');
    setBusy(true);
    try {
      const { intervention, ...rest } = f;
      if (issue) {
        await updateIssue(issue.id, rest);
        toast('Saved');
        onSaved?.(issue.id);
      } else {
        const created = await createIssue(
          { ...rest, status: intervention.trim() && rest.status === 'observed' ? 'experimenting' : rest.status },
          intervention,
        );
        toast('Behavior added');
        onSaved?.(created.id);
      }
      onClose();
    } catch (e) {
      toast((e as Error).message || 'Could not save', 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={issue ? 'Edit behavior' : 'New behavior'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={busy || !f.title.trim()} onClick={save}>{issue ? 'Save' : 'Add behavior'}</Button></>}
    >
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field label="Title" htmlFor="iss-title">
          <input id="iss-title" className="input" dir="auto" autoFocus={!issue} maxLength={300} placeholder="e.g. Becoming defensive when criticized" value={f.title} onChange={(e) => set('title')(e.target.value)} />
        </Field>
        <Field label="What behavior am I observing?" optional>
          <TextArea value={f.description} onChange={(e) => set('description')(e.target.value)} placeholder="Describe what you actually do — observable, not judgments." />
        </Field>

        {!more ? (
          <button type="button" className="text-sm font-medium text-stone-600 underline-offset-4 hover:underline dark:text-stone-300" onClick={() => setMore(true)}>
            + Add triggers, hypothesis, plan and more
          </button>
        ) : (
          <>
            <Field label="Triggers" optional hint="Situations that tend to set this off.">
              <TextArea value={f.triggers} onChange={(e) => set('triggers')(e.target.value)} placeholder="e.g. Code review comments, feedback in meetings" />
            </Field>
            <Field label="Underlying hypothesis" optional hint="Your best guess about why. This is a hypothesis to test — it's labelled as such in exports.">
              <TextArea value={f.hypothesis} onChange={(e) => set('hypothesis')(e.target.value)} placeholder="e.g. I interpret criticism as a threat to my competence" />
            </Field>
            <Field label="Desired behavior" optional>
              <TextArea value={f.desiredBehavior} onChange={(e) => set('desiredBehavior')(e.target.value)} placeholder="What do you want to do instead?" />
            </Field>
            {!issue && (
              <Field label="Intervention (if–then plan)" optional hint="You can add or change this later; past plans are kept.">
                <TextArea value={f.intervention} onChange={(e) => set('intervention')(e.target.value)} placeholder="If I'm criticized, then I will first restate their point before responding." />
              </Field>
            )}
            <Field label="Success criteria" optional>
              <TextArea value={f.successCriteria} onChange={(e) => set('successCriteria')(e.target.value)} placeholder="e.g. I restate first in at least 7 of 10 applicable situations over a month" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Priority">
                <select className="input" value={f.priority} onChange={(e) => set('priority')(e.target.value as Priority)}>
                  {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
                </select>
              </Field>
              <Field label="Status">
                <select className="input" value={f.status} onChange={(e) => set('status')(e.target.value as Status)}>
                  {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
              </Field>
            </div>
          </>
        )}
      </form>
    </Sheet>
  );
}

function init(i?: Issue) {
  return {
    title: i?.title ?? '',
    description: i?.description ?? '',
    triggers: i?.triggers ?? '',
    hypothesis: i?.hypothesis ?? '',
    desiredBehavior: i?.desiredBehavior ?? '',
    successCriteria: i?.successCriteria ?? '',
    priority: (i?.priority ?? 'medium') as Priority,
    status: (i?.status ?? 'observed') as Status,
    intervention: '',
  };
}
