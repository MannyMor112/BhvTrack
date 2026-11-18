import { db } from '../db/db';
import type { BehaviorEvent, Issue, Outcome } from '../types';
import { DAY, uid } from './util';

/** Sample data for exploring the app. Clearly fictional. */
export async function seedDemo() {
  const now = Date.now();
  const iv1Old = uid(), iv1 = uid(), iv2 = uid();
  const a: Issue = {
    id: uid(),
    title: '[Sample] Becoming defensive when criticized',
    description: 'When someone points out a mistake, I immediately explain or justify instead of listening.',
    triggers: 'Code review comments; feedback in meetings; critical tone in messages',
    hypothesis: 'I may interpret criticism as a threat to my competence.',
    desiredBehavior: 'Listen fully and acknowledge the point before responding.',
    successCriteria: 'Restate first in at least 7 of 10 applicable situations over a month.',
    priority: 'high',
    status: 'experimenting',
    archived: false,
    interventions: [
      { id: iv1Old, ifThen: 'If I feel criticized, then I will count to three before replying.', startedAt: now - 34 * DAY, endedAt: now - 20 * DAY },
      { id: iv1, ifThen: "If I'm criticized, then I will first restate the other person's point before responding.", startedAt: now - 20 * DAY },
    ],
    createdAt: now - 40 * DAY,
    updatedAt: now - 1 * DAY,
  };
  const b: Issue = {
    id: uid(),
    title: '[Sample] Checking phone when anxious at work',
    description: 'I pick up my phone and scroll when a task feels uncertain.',
    triggers: 'Ambiguous tasks, waiting for replies',
    hypothesis: 'Scrolling might be a way to avoid uncomfortable uncertainty.',
    desiredBehavior: 'Write the next concrete step instead.',
    successCriteria: '',
    priority: 'medium',
    status: 'experimenting',
    archived: false,
    interventions: [{ id: iv2, ifThen: 'If I reach for my phone during focus time, then I will write down the next smallest step first.', startedAt: now - 12 * DAY }],
    createdAt: now - 15 * DAY,
    updatedAt: now - 2 * DAY,
  };
  const ev = (issue: Issue, ivId: string | undefined, daysAgo: number, outcome: Outcome, situation: string, emotion: string, intensity?: number, extra: Partial<BehaviorEvent> = {}): BehaviorEvent => {
    const t = now - daysAgo * DAY - (daysAgo % 3) * 3_600_000;
    return { id: uid(), issueId: issue.id, ...(ivId ? { interventionId: ivId } : {}), situation, thought: '', emotion, ...(intensity ? { intensity } : {}), reaction: '', consequence: '', outcome, occurredAt: t, createdAt: t, updatedAt: t, ...extra };
  };
  const events: BehaviorEvent[] = [
    ev(a, undefined, 38, 'not_applicable', 'Manager questioned my estimate in planning meeting', 'Defensive', 7, { reaction: 'Argued for ten minutes' }),
    ev(a, iv1Old, 32, 'unsuccessful', 'Review comment said my approach was overcomplicated', 'Frustrated', 8),
    ev(a, iv1Old, 29, 'partial', 'Colleague corrected me in the meeting', 'Embarrassed', 6),
    ev(a, iv1Old, 26, 'unsuccessful', 'Code review asked for a full rewrite', 'Angry', 8),
    ev(a, iv1Old, 23, 'successful', 'Feedback on my presentation slides', 'Anxious', 5),
    ev(a, iv1, 19, 'unsuccessful', 'Review comment on naming in my code', 'Defensive', 6, { thought: 'They think I am careless' }),
    ev(a, iv1, 17, 'successful', 'Manager said the report was missing context', 'Anxious', 5),
    ev(a, iv1, 15, 'successful', 'Code review pointed out a bug', 'Embarrassed', 4),
    ev(a, iv1, 13, 'partial', 'Meeting: my proposal was challenged', 'Defensive', 6),
    ev(a, iv1, 11, 'not_applicable', 'Partner criticized how I loaded the dishwasher', 'Frustrated', 3),
    ev(a, iv1, 9, 'successful', 'Code review asked for more tests', 'Calm', 3),
    ev(a, iv1, 6, 'unsuccessful', 'Manager questioned the deadline in meeting', 'Angry', 7),
    ev(a, iv1, 4, 'successful', 'Review feedback on API design', 'Anxious', 4, { consequence: 'Good discussion, changed design' }),
    ev(a, iv1, 2, 'successful', 'Colleague said my comment was harsh', 'Ashamed', 5),
    ev(a, iv1, 1, 'not_assessed', 'Quick criticism in chat about formatting', 'Defensive', 3),
    ev(b, iv2, 11, 'unsuccessful', 'Unclear ticket, waiting on reply', 'Anxious', 6),
    ev(b, iv2, 8, 'successful', 'Stuck on a design decision', 'Overwhelmed', 5),
    ev(b, iv2, 5, 'partial', 'Waiting for review reply', 'Anxious', 4),
    ev(b, iv2, 3, 'successful', 'Ambiguous task from manager', 'Anxious', 5),
  ];
  await db.transaction('rw', db.issues, db.events, async () => {
    await db.issues.bulkAdd([a, b]);
    await db.events.bulkAdd(events);
  });
}
