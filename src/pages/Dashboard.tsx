import { useMemo, useState } from 'react';
import { useData, useNav } from '../state';
import { activeIntervention, dailyBuckets, eventsForIntervention, outcomeStats, signedDelta, staleIssues, windowComparison } from '../lib/stats';
import { Button, Card, Empty, Icon, PageHeader, RateDisplay, Segmented, StatusBadge } from '../components/ui';
import { DailyChart } from '../components/charts';
import { EventList } from '../components/EventList';
import { relTime } from '../lib/util';

export function Dashboard() {
  const { issues, events, loading } = useData();
  const { go } = useNav();
  const [win, setWin] = useState<'7' | '30'>('7');

  const active = issues.filter((i) => !i.archived && i.status !== 'resolved');
  const experimenting = active.filter((i) => i.status === 'experimenting');
  const cmp = useMemo(() => windowComparison(events, Number(win)), [events, win]);
  const buckets = useMemo(() => dailyBuckets(events, Number(win)), [events, win]);
  const stale = useMemo(() => staleIssues(issues, events), [issues, events]);
  const withPlans = active
    .map((i) => ({ issue: i, iv: activeIntervention(i) }))
    .filter((x) => x.iv)
    .map((x) => ({ ...x, stats: outcomeStats(eventsForIntervention(events, x.iv!)) }));

  if (loading) return <div className="py-20 text-center text-sm text-stone-400">Loading…</div>;

  if (!issues.length && !events.length) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <Empty
          title="Start with one behavior you want to change"
          body="Name a pattern you've noticed — e.g. “Becoming defensive when criticized.” Then log moments when it happens, add an if–then plan, and watch whether your response shifts."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="primary" onClick={() => go({ name: 'behaviors' })}><Icon name="plus" className="h-4 w-4" />Add a behavior</Button>
              <Button onClick={() => go({ name: 'log' })}>Log an event</Button>
            </div>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        actions={<Button variant="primary" className="hidden md:inline-flex" onClick={() => go({ name: 'log' })}><Icon name="plus" className="h-4 w-4" />Log event</Button>}
      />

      <button
        onClick={() => go({ name: 'log' })}
        className="mb-5 flex w-full items-center justify-between rounded-2xl bg-stone-900 px-5 py-4 text-left text-white shadow-sm transition active:scale-[.99] dark:bg-stone-100 dark:text-stone-900 md:hidden"
      >
        <span>
          <span className="block text-[15px] font-semibold">Log an event</span>
          <span className="block text-xs opacity-70">Capture it while it's fresh — only the situation is required</span>
        </span>
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 dark:bg-stone-900/10"><Icon name="plus" /></span>
      </button>

      <div className="mb-5 grid grid-cols-3 gap-3">
        <Stat label="Active behaviors" value={active.length} onClick={() => go({ name: 'behaviors' })} />
        <Stat label="Experimenting" value={experimenting.length} onClick={() => go({ name: 'behaviors' })} />
        <Stat label={`Events · ${win}d`} value={cmp.current.total} sub={`${signedDelta(cmp.current.total, cmp.previous.total)} vs prior ${win}d`} />
      </div>

      <Card className="mb-5 p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="section-title">Progress</h2>
          <Segmented value={win} onChange={setWin} size="sm" options={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }]} />
        </div>
        <DailyChart buckets={buckets} />
        <div className="mt-4 grid gap-4 border-t border-stone-100 pt-4 dark:border-stone-800 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs text-stone-500 dark:text-stone-400">Success rate, last {win} days</p>
            <RateDisplay s={cmp.current} />
          </div>
          <div>
            <p className="mb-1 text-xs text-stone-500 dark:text-stone-400">Previous {win} days</p>
            <RateDisplay s={cmp.previous} compact />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
        <section>
          <h2 className="section-title mb-2">Active interventions</h2>
          {withPlans.length ? (
            <div className="space-y-3">
              {withPlans.map(({ issue, iv, stats }) => (
                <Card key={issue.id} className="p-4" onClick={() => go({ name: 'issue', id: issue.id })}>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium" dir="auto">{issue.title}</p>
                    <StatusBadge status={issue.status} />
                  </div>
                  <p className="mb-3 line-clamp-2 text-xs text-stone-500 dark:text-stone-400" dir="auto">{iv!.ifThen}</p>
                  <RateDisplay s={stats} compact />
                  <p className="mt-1 text-[11px] text-stone-400">Since {relTime(iv!.startedAt)} · all time for this plan</p>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="p-4 text-sm text-stone-500 dark:text-stone-400">
              No active if–then plans. Open a behavior and add one to start measuring.
            </Card>
          )}

          {stale.length > 0 && (
            <>
              <h2 className="section-title mb-2 mt-5">Not reviewed recently</h2>
              <Card>
                <ul className="divide-y divide-stone-100 dark:divide-stone-800">
                  {stale.slice(0, 5).map(({ issue, last }) => (
                    <li key={issue.id}>
                      <button className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-stone-50 dark:hover:bg-stone-800/50" onClick={() => go({ name: 'issue', id: issue.id })}>
                        <span className="truncate text-sm" dir="auto">{issue.title}</span>
                        <span className="shrink-0 text-xs text-stone-400">last activity {relTime(last)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
            </>
          )}
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="section-title">Recent events</h2>
          </div>
          {events.length ? (
            <Card><EventList events={events.slice(0, 8)} issues={issues} back={{ name: 'dashboard' }} /></Card>
          ) : (
            <Card className="p-4 text-sm text-stone-500 dark:text-stone-400">No events yet.</Card>
          )}
        </section>
      </div>
    </>
  );
}

function Stat({ label, value, sub, onClick }: { label: string; value: number | string; sub?: string; onClick?: () => void }) {
  return (
    <Card className="p-3.5" onClick={onClick}>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">{label}</p>
      {sub && <p className="mt-0.5 text-[11px] text-stone-400">{sub}</p>}
    </Card>
  );
}
