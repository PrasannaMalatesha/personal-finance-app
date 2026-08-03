import { withTransaction } from '../lib/tx';
import type { Pool } from 'pg';
import type {
  RecurringGroupWithMetaRow,
  RecurringRepo,
  TxForDetectionRow,
} from '../repositories/recurring.repo';
import type {
  DetectResult,
  RecurringGroupPublic,
} from '../schemas/recurring';
import { normalizeDescription } from './categorization.service';
import { NotFoundError } from '../errors/AppError';

const AMOUNT_TOLERANCE_PCT = 0.05; // ±5%
const MIN_CADENCE_DAYS = 28;
const MAX_CADENCE_DAYS = 33;
const MIN_OCCURRENCES = 2;

function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function toPublic(row: RecurringGroupWithMetaRow): RecurringGroupPublic {
  return {
    id: row.id,
    merchantKey: row.merchant_key,
    displayName: row.display_name ?? row.merchant_key,
    categoryId: row.category_id,
    categoryName: row.category_name,
    categoryColor: row.category_color,
    avgAmount: row.avg_amount,
    cadenceDays: row.cadence_days,
    firstSeen: toIsoDate(row.first_seen),
    lastSeen: toIsoDate(row.last_seen),
    nextExpected: row.next_expected ? toIsoDate(row.next_expected) : null,
    isDismissed: row.is_dismissed,
    txCount: row.tx_count,
  };
}

interface DetectedGroup {
  merchantKey: string;
  categoryId: string | null;
  /** Mean of |amount| values in the group. Display-formatted to 2 decimals. */
  avgAmount: string;
  cadenceDays: number;
  firstSeen: Date;
  lastSeen: Date;
  txIds: string[];
}

/**
 * Detection heuristic (PRD §5.2):
 *
 *   For each user, group expense transactions by normalized description.
 *   Within a group, ≥2 transactions must have consecutive dates 28–33 days
 *   apart AND amounts within ±5% of the mean. A qualifying group becomes a
 *   `recurring_group` row with `next_expected = last_seen + cadence`.
 *
 * Math uses plain Number arithmetic — this is heuristic comparison logic,
 * not money persistence. The `avgAmount` we surface is `.toFixed(2)` at the
 * boundary so it round-trips through Postgres NUMERIC(14,2) cleanly.
 */
export function detectRecurring(
  txs: readonly TxForDetectionRow[],
  dismissedKeys: ReadonlySet<string>,
): DetectedGroup[] {
  const byMerchant = new Map<string, TxForDetectionRow[]>();
  for (const tx of txs) {
    const key = normalizeDescription(tx.description);
    if (dismissedKeys.has(key)) continue;
    const bucket = byMerchant.get(key) ?? [];
    bucket.push(tx);
    byMerchant.set(key, bucket);
  }

  const detected: DetectedGroup[] = [];
  for (const [merchantKey, group] of byMerchant) {
    if (group.length < MIN_OCCURRENCES) continue;
    const sorted = [...group].sort((a, b) => a.date.getTime() - b.date.getTime());

    // Amount check: mean ± tolerance
    const amounts = sorted.map((t) => Math.abs(Number(t.amount)));
    const mean = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;
    const tolerance = mean * AMOUNT_TOLERANCE_PCT;
    const amountsOk = amounts.every((a) => Math.abs(a - mean) <= tolerance);
    if (!amountsOk) continue;

    // Cadence check: every consecutive pair must be 28–33 days apart.
    let cadenceOk = true;
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const g = daysBetween(sorted[i - 1]!.date, sorted[i]!.date);
      if (g < MIN_CADENCE_DAYS || g > MAX_CADENCE_DAYS) {
        cadenceOk = false;
        break;
      }
      gaps.push(g);
    }
    if (!cadenceOk) continue;

    const avgCadence = Math.round(
      gaps.reduce((s, g) => s + g, 0) / gaps.length,
    );
    // Pick the most-common category among matched transactions. Ties go to
    // whichever appears first.
    const catCounts = new Map<string, number>();
    for (const t of sorted) {
      if (!t.category_id) continue;
      catCounts.set(t.category_id, (catCounts.get(t.category_id) ?? 0) + 1);
    }
    let dominantCategory: string | null = null;
    let bestCount = 0;
    for (const [cid, count] of catCounts) {
      if (count > bestCount) {
        bestCount = count;
        dominantCategory = cid;
      }
    }

    detected.push({
      merchantKey,
      categoryId: dominantCategory,
      avgAmount: mean.toFixed(2),
      cadenceDays: avgCadence,
      firstSeen: sorted[0]!.date,
      lastSeen: sorted[sorted.length - 1]!.date,
      txIds: sorted.map((t) => t.id),
    });
  }
  return detected;
}

export interface RecurringServiceDeps {
  pool: Pool;
  recurringRepo: RecurringRepo;
}

export function createRecurringService(deps: RecurringServiceDeps) {
  const { pool, recurringRepo } = deps;

  async function list(userId: string): Promise<RecurringGroupPublic[]> {
    const rows = await recurringRepo.listWithMeta(userId);
    return rows.map(toPublic);
  }

  async function detect(userId: string): Promise<DetectResult> {
    return withTransaction(pool, async (client) => {
      const [txs, dismissedKeys] = await Promise.all([
        recurringRepo.listUserExpenseTx(userId, client),
        recurringRepo.listDismissedMerchantKeys(userId, client),
      ]);

      // Wipe stale group memberships, then re-assign from scratch. Simpler
      // than diffing and cheap for expected user data sizes (<10k tx).
      await recurringRepo.clearAllAssignments(userId, client);

      const detected = detectRecurring(txs, dismissedKeys);
      let inserted = 0;
      let updated = 0;
      for (const g of detected) {
        const next = new Date(g.lastSeen);
        next.setUTCDate(next.getUTCDate() + g.cadenceDays);
        const { id, wasInsert } = await recurringRepo.upsertGroup(
          {
            userId,
            merchantKey: g.merchantKey,
            categoryId: g.categoryId,
            avgAmount: g.avgAmount,
            cadenceDays: g.cadenceDays,
            firstSeen: toIsoDate(g.firstSeen),
            lastSeen: toIsoDate(g.lastSeen),
            nextExpected: toIsoDate(next),
          },
          client,
        );
        await recurringRepo.assignTxToGroup(g.txIds, id, client);
        if (wasInsert) inserted++;
        else updated++;
      }
      return { detected: inserted, updated, totalGroups: detected.length };
    });
  }

  async function dismiss(userId: string, id: string): Promise<RecurringGroupPublic> {
    const found = await recurringRepo.findById(id, userId);
    if (!found) throw new NotFoundError('Recurring group');
    await recurringRepo.setDismissed(id, userId, true);
    const list = await recurringRepo.listWithMeta(userId);
    const updated = list.find((r) => r.id === id);
    if (!updated) throw new Error('recurring.dismiss: post-update lookup failed');
    return toPublic(updated);
  }

  async function remove(userId: string, id: string): Promise<void> {
    const ok = await recurringRepo.delete(id, userId);
    if (!ok) throw new NotFoundError('Recurring group');
  }

  return { list, detect, dismiss, remove };
}

export type RecurringService = ReturnType<typeof createRecurringService>;
