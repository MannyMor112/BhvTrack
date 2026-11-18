import type { BehaviorEvent, Issue } from '../types';
import { useNav, type Route } from '../state';
import { fmtDateTime } from '../lib/util';
import { OutcomeTag } from './ui';

export function EventList({ events, issues, back, showIssue = true }: { events: BehaviorEvent[]; issues: Issue[]; back: Route; showIssue?: boolean }) {
  const { go } = useNav();
  const titles = new Map(issues.map((i) => [i.id, i.title]));
  return (
    <ul className="divide-y divide-stone-100 dark:divide-stone-800">
      {events.map((e) => (
        <li key={e.id}>
          <button
            className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-stone-50 dark:hover:bg-stone-800/50"
            onClick={() => go({ name: 'log', eventId: e.id, back })}
          >
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm" dir="auto">{e.situation}</p>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-stone-500 dark:text-stone-400">
                <span>{fmtDateTime(e.occurredAt)}</span>
                {showIssue && e.issueId && titles.get(e.issueId) && <span className="truncate" dir="auto">· {titles.get(e.issueId)}</span>}
                {e.emotion && <span>· {e.emotion}{e.intensity ? ` ${e.intensity}/10` : ''}</span>}
              </p>
            </div>
            <OutcomeTag outcome={e.outcome} />
          </button>
        </li>
      ))}
    </ul>
  );
}
