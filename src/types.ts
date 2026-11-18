export const PRIORITIES = ['low', 'medium', 'high'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const STATUSES = ['observed', 'investigating', 'experimenting', 'monitoring', 'resolved'] as const;
export type Status = (typeof STATUSES)[number];

export const OUTCOMES = ['successful', 'partial', 'unsuccessful', 'not_applicable', 'not_assessed'] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const OUTCOME_LABEL: Record<Outcome, string> = {
  successful: 'Successful',
  partial: 'Partially successful',
  unsuccessful: 'Unsuccessful',
  not_applicable: 'Not applicable',
  not_assessed: 'Not assessed',
};

export const STATUS_LABEL: Record<Status, string> = {
  observed: 'Observed',
  investigating: 'Investigating',
  experimenting: 'Experimenting',
  monitoring: 'Monitoring',
  resolved: 'Resolved',
};

export const PRIORITY_LABEL: Record<Priority, string> = { low: 'Low', medium: 'Medium', high: 'High' };

export const COMMON_EMOTIONS = [
  'Anxious', 'Angry', 'Frustrated', 'Sad', 'Ashamed', 'Guilty', 'Embarrassed',
  'Defensive', 'Overwhelmed', 'Lonely', 'Jealous', 'Bored', 'Calm', 'Content',
] as const;

/** A concrete if-then plan. Past plans are kept on the issue for history. */
export interface Intervention {
  id: string;
  ifThen: string;
  startedAt: number;
  /** Set when the intervention was replaced or stopped. */
  endedAt?: number;
  notes?: string;
}

export interface Issue {
  id: string;
  title: string;
  description: string;
  triggers: string;
  hypothesis: string;
  desiredBehavior: string;
  successCriteria: string;
  priority: Priority;
  status: Status;
  archived: boolean;
  /** Active intervention is the entry without endedAt (at most one). */
  interventions: Intervention[];
  createdAt: number;
  updatedAt: number;
  /** Last time the user explicitly marked this issue as reviewed. */
  reviewedAt?: number;
}

export interface BehaviorEvent {
  id: string;
  issueId?: string;
  /** Intervention active at log time, for per-intervention stats. */
  interventionId?: string;
  situation: string;
  thought: string;
  emotion: string;
  intensity?: number;
  reaction: string;
  consequence: string;
  outcome: Outcome;
  occurredAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface WeeklyReview {
  id: string;
  /** Monday 00:00 local time of the reviewed week. */
  weekStart: number;
  reflection: string;
  whatWorked: string;
  whatDidnt: string;
  changeNext: string;
  focusIssueIds: string[];
  focusNote: string;
  createdAt: number;
  updatedAt: number;
}

export interface BackupFile {
  app: 'pattern-behavior-tracker';
  schemaVersion: number;
  exportedAt: string;
  issues: Issue[];
  events: BehaviorEvent[];
  reviews: WeeklyReview[];
}
