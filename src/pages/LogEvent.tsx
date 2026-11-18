import { useEffect, useRef, useState } from 'react';
import { useData, useNav, useUi, type Route } from '../state';
import { deleteEvent, saveEvent } from '../db/repo';
import type { Outcome } from '../types';
import { COMMON_EMOTIONS, OUTCOME_LABEL } from '../types';
import { activeIntervention } from '../lib/stats';
import { fromLocalInput, toLocalInput } from '../lib/util';
import { Button, Card, Field, Icon, PageHeader, TextArea } from '../components/ui';
import { storage } from '../lib/platform';

const DRAFT_KEY = 'draft-event';

export function LogEvent({ issueId: presetIssue, eventId, back }: { issueId?: string; eventId?: string; back?: Route }) {
  const { issues, events, loading } = useData();
  const { go } = useNav();
  const { toast, confirm } = useUi();
  const existing = eventId ? events.find((e) => e.id === eventId) : undefined;
  const loaded = useRef(false);

  const [issueId, setIssueId] = useState(presetIssue ?? '');
  const [situation, setSituation] = useState('');
  const [thought, setThought] = useState('');
  const [emotion, setEmotion] = useState('');
  const [custom, setCustom] = useState(false);
  const [intensity, setIntensity] = useState<number | null>(null);
  const [reaction, setReaction] = useState('');
  const [consequence, setConsequence] = useState('');
  const [outcome, setOutcome] = useState<Outcome>('not_assessed');
  const [outcomeTouched, setOutcomeTouched] = useState(false);
  const [when, setWhen] = useState(toLocalInput(Date.now()));
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);

  // Load existing event, or restore an unsent draft.
  useEffect(() => {
    if (loaded.current || loading) return;
    loaded.current = true;
    if (existing) {
      setIssueId(existing.issueId ?? '');
      setSituation(existing.situation);
      setThought(existing.thought);
      setEmotion(existing.emotion);
      setCustom(!!existing.emotion && !(COMMON_EMOTIONS as readonly string[]).includes(existing.emotion));
      setIntensity(existing.intensity ?? null);
      setReaction(existing.reaction);
      setConsequence(existing.consequence);
      setOutcome(existing.outcome);
      setOutcomeTouched(true);
      setWhen(toLocalInput(existing.occurredAt));
      setMore(true);
    } else if (!eventId) {
      try {
        const d = JSON.parse(storage.get(DRAFT_KEY) ?? 'null');
        if (d && typeof d.situation === 'string' && d.situation) {
          setSituation(d.situation); setThought(d.thought ?? ''); setReaction(d.reaction ?? ''); setConsequence(d.consequence ?? '');
          setEmotion(d.emotion ?? '');
          if (!presetIssue && d.issueId) setIssueId(d.issueId);
        }
      } catch { /* ignore bad draft */ }
    }
  }, [loading, existing, eventId, presetIssue]);

  // Keep a local draft so an interrupted entry isn't lost.
  useEffect(() => {
    if (eventId || !loaded.current) return;
    const t = setTimeout(() => storage.set(DRAFT_KEY, JSON.stringify({ situation, thought, reaction, consequence, emotion, issueId })), 400);
    return () => clearTimeout(t);
  }, [situation, thought, reaction, consequence, emotion, issueId, eventId]);

  const issue = issues.find((i) => i.id === issueId);
  const iv = issue ? activeIntervention(issue) : undefined;
  useEffect(() => {
    if (outcomeTouched) return;
    setOutcome(issueId && iv ? 'not_assessed' : issueId ? 'not_applicable' : 'not_assessed');
  }, [issueId, iv, outcomeTouched]);

  const selectable = issues.filter((i) => !i.archived || i.id === issueId).sort((a, b) => b.updatedAt - a.updatedAt);
  const leave = () => (back ? go(back) : go({ name: 'dashboard' }));

  const save = async () => {
    if (!situation.trim()) return toast('Describe the situation', 'err');
    const occurredAt = fromLocalInput(when) ?? Date.now();
    setBusy(true);
    try {
      await saveEvent({
        id: existing?.id,
        issueId: issueId || undefined,
        situation, thought, emotion: emotion.trim(),
        intensity: intensity ?? undefined,
        reaction, consequence, outcome, occurredAt,
      });
      if (!existing) storage.set(DRAFT_KEY, '');
      toast(existing ? 'Event updated' : 'Event logged');
      leave();
    } catch (e) {
      toast((e as Error).message || 'Could not save', 'err');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!existing) return;
    if (!(await confirm({ title: 'Delete this event?', body: 'This cannot be undone.', confirmLabel: 'Delete', danger: true }))) return;
    await deleteEvent(existing.id);
    toast('Event deleted');
    leave();
  };

  if (eventId && !loading && !existing)
    return (<><PageHeader title="Event not found" onBack={leave} /><Card className="p-6 text-sm text-stone-500">It may have been deleted.</Card></>);

  const outcomeOpts: Outcome[] = ['successful', 'partial', 'unsuccessful', 'not_applicable', 'not_assessed'];

  return (
    <>
      <PageHeader title={existing ? 'Edit event' : 'Log event'} subtitle={existing ? undefined : 'Only the situation is required.'} onBack={back || existing ? leave : undefined} />

      <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Card className="space-y-4 p-4">
          <Field label="What happened?" htmlFor="ev-sit">
            <TextArea id="ev-sit" autoFocus={!existing} minRows={2} value={situation} onChange={(e) => setSituation(e.target.value)} placeholder="Situation, briefly — where, who, what" />
          </Field>

          <Field label="Related behavior" optional>
            <select className="input" value={issueId} onChange={(e) => setIssueId(e.target.value)}>
              <option value="">None</option>
              {selectable.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}
            </select>
          </Field>

          {issue && (
            <div>
              <p className="label">Did you apply your plan?</p>
              {iv ? (
                <p className="mb-2 rounded-lg bg-sky-50 px-3 py-2 text-[13px] text-sky-900 dark:bg-sky-950/40 dark:text-sky-200" dir="auto">{iv.ifThen}</p>
              ) : (
                <p className="mb-2 text-xs text-stone-500">No active intervention for this behavior — the event will be logged as an observation.</p>
              )}
              <div className="flex flex-wrap gap-2">
                {outcomeOpts.map((o) => (
                  <button type="button" key={o} className={`chip ${outcome === o ? 'chip-on' : ''}`} onClick={() => { setOutcome(o); setOutcomeTouched(true); }}>
                    {OUTCOME_LABEL[o]}
                  </button>
                ))}
              </div>
              <p className="hint">
                Choose <b>Not applicable</b> if the plan couldn't reasonably have been used. Only successful and unsuccessful count toward the rate; partial is shown separately.
              </p>
            </div>
          )}
        </Card>

        <Card className="space-y-4 p-4">
          <div>
            <p className="label">Emotion <span className="font-normal text-stone-400">· optional</span></p>
            <div className="flex flex-wrap gap-2">
              {COMMON_EMOTIONS.map((e) => (
                <button type="button" key={e} className={`chip ${emotion === e && !custom ? 'chip-on' : ''}`} onClick={() => { setCustom(false); setEmotion(emotion === e ? '' : e); }}>{e}</button>
              ))}
              <button type="button" className={`chip ${custom ? 'chip-on' : ''}`} onClick={() => { setCustom(!custom); if (!custom) setEmotion(''); }}>Other…</button>
            </div>
            {custom && <input className="input mt-2" dir="auto" autoFocus maxLength={60} value={emotion} onChange={(e) => setEmotion(e.target.value)} placeholder="Name the emotion" />}
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="label mb-0">Intensity <span className="font-normal text-stone-400">· optional</span></p>
              {intensity !== null ? (
                <button type="button" className="text-xs text-stone-500 hover:underline" onClick={() => setIntensity(null)}>Clear</button>
              ) : null}
            </div>
            <div className="grid grid-cols-10 gap-1">
              {Array.from({ length: 10 }, (_, k) => k + 1).map((n) => (
                <button
                  type="button"
                  key={n}
                  aria-label={`Intensity ${n}`}
                  onClick={() => setIntensity(intensity === n ? null : n)}
                  className={`rounded-lg py-2 text-sm font-medium tabular-nums transition ${intensity !== null && n <= intensity ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900' : 'bg-stone-100 text-stone-500 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-400'}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </Card>

        {!more ? (
          <button type="button" className="text-sm font-medium text-stone-600 hover:underline dark:text-stone-300" onClick={() => setMore(true)}>
            + Thought, reaction, consequence, time
          </button>
        ) : (
          <Card className="space-y-4 p-4">
            <Field label="Automatic thought" optional>
              <TextArea value={thought} onChange={(e) => setThought(e.target.value)} placeholder="What went through your mind?" />
            </Field>
            <Field label="Reaction" optional>
              <TextArea value={reaction} onChange={(e) => setReaction(e.target.value)} placeholder="What did you actually do?" />
            </Field>
            <Field label="Consequence" optional>
              <TextArea value={consequence} onChange={(e) => setConsequence(e.target.value)} placeholder="What happened afterward?" />
            </Field>
            <Field label="When">
              <input type="datetime-local" className="input" value={when} onChange={(e) => setWhen(e.target.value)} />
            </Field>
          </Card>
        )}

        <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-10 -mx-4 flex gap-2 border-t border-stone-200 bg-stone-50/95 px-4 py-3 backdrop-blur dark:border-stone-800 dark:bg-stone-950/95 md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
          {existing && <Button variant="danger" onClick={remove}><Icon name="trash" className="h-4 w-4" /></Button>}
          <Button variant="primary" size="lg" className="flex-1 md:flex-none" type="submit" disabled={busy || !situation.trim()}>
            {existing ? 'Save changes' : 'Save event'}
          </Button>
        </div>
      </form>
    </>
  );
}
