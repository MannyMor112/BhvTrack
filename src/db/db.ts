import Dexie, { type Table } from 'dexie';
import type { BehaviorEvent, Issue, WeeklyReview } from '../types';
import { normalizeEvent, normalizeIssue } from '../lib/validate';

/**
 * IndexedDB schema (Dexie). Never edit an existing version block — add a new
 * one. Dexie upgrades in order, so data survives app updates.
 *
 * v1: initial stores.
 * v2: issues gain `interventions[]` (v1 stored a single `intervention` string)
 *     and events gain `interventionId`. The upgrade converts old rows.
 */
export class PatternDB extends Dexie {
  issues!: Table<Issue, string>;
  events!: Table<BehaviorEvent, string>;
  reviews!: Table<WeeklyReview, string>;

  constructor(name = 'pattern-behavior-tracker') {
    super(name);

    this.version(1).stores({
      issues: 'id, status, priority, archived, updatedAt',
      events: 'id, issueId, occurredAt',
      reviews: 'id, &weekStart',
    });

    this.version(2)
      .stores({
        issues: 'id, status, priority, archived, updatedAt',
        events: 'id, issueId, interventionId, occurredAt',
        reviews: 'id, &weekStart',
      })
      .upgrade(async (tx) => {
        await tx
          .table('issues')
          .toCollection()
          .modify((row: Record<string, unknown>) => {
            if (!Array.isArray(row.interventions)) {
              const legacy = typeof row.intervention === 'string' ? row.intervention.trim() : '';
              row.interventions = legacy
                ? [{ id: `legacy-${row.id}`, ifThen: legacy, startedAt: (row.createdAt as number) ?? Date.now() }]
                : [];
            }
            delete row.intervention;
            const fixed = normalizeIssue(row);
            if (fixed) Object.assign(row, fixed);
          });
        await tx
          .table('events')
          .toCollection()
          .modify((row: Record<string, unknown>) => {
            const fixed = normalizeEvent(row);
            if (fixed) Object.assign(row, fixed);
          });
      });
  }
}

export const db = new PatternDB();
