import type { Pool, PoolClient } from 'pg';
import type {
  RulesRepo,
  RuleWithCategoryRow,
} from '../repositories/rules.repo';
import type { CategoriesRepo } from '../repositories/categories.repo';
import type { TransactionsRepo } from '../repositories/transactions.repo';
import type {
  CreateRuleInput,
  RulePublic,
  UpdateRuleInput,
} from '../schemas/rules';
import { DEFAULT_RULES } from '../schemas/rules';
import { extractPattern } from '../lib/rulePattern';
import { withTransaction } from '../lib/tx';
import { NotFoundError } from '../errors/AppError';

export interface RuleSuggestion {
  pattern: string;
  matchType: 'substring';
  categoryId: string;
  categoryName: string;
  matchingCount: number;
}

export interface LearnRuleResult {
  rule: RulePublic;
  backAppliedCount: number;
}

function toPublic(row: RuleWithCategoryRow): RulePublic {
  return {
    id: row.id,
    matchType: row.match_type,
    matchValue: row.match_value,
    categoryId: row.category_id,
    categoryName: row.category_name,
    color: row.category_color,
    priority: row.priority,
    createdAt: row.created_at.toISOString(),
  };
}

export interface RulesServiceDeps {
  pool: Pool;
  rulesRepo: RulesRepo;
  categoriesRepo: CategoriesRepo;
  transactionsRepo: TransactionsRepo;
}

export function createRulesService(deps: RulesServiceDeps) {
  const { pool, rulesRepo, categoriesRepo, transactionsRepo } = deps;

  async function list(userId: string): Promise<RulePublic[]> {
    const rows = await rulesRepo.listWithCategory(userId);
    return rows.map(toPublic);
  }

  async function create(
    userId: string,
    input: CreateRuleInput,
  ): Promise<RulePublic> {
    const category = await categoriesRepo.findByIdForUser(input.categoryId, userId);
    if (!category) throw new NotFoundError('Category');

    const row = await rulesRepo.create({
      userId,
      matchType: input.matchType,
      matchValue: input.matchValue,
      categoryId: input.categoryId,
      priority: input.priority,
    });
    const withCategory = await rulesRepo.findWithCategoryByIdForUser(row.id, userId);
    if (!withCategory) throw new Error('rules.create: freshly created row not found');
    return toPublic(withCategory);
  }

  async function update(
    userId: string,
    id: string,
    patch: UpdateRuleInput,
  ): Promise<RulePublic> {
    if (patch.categoryId !== undefined) {
      const category = await categoriesRepo.findByIdForUser(patch.categoryId, userId);
      if (!category) throw new NotFoundError('Category');
    }
    const updated = await rulesRepo.update(id, userId, patch);
    if (!updated) throw new NotFoundError('Rule');
    const withCategory = await rulesRepo.findWithCategoryByIdForUser(updated.id, userId);
    if (!withCategory) throw new Error('rules.update: post-update lookup failed');
    return toPublic(withCategory);
  }

  async function remove(userId: string, id: string): Promise<void> {
    const ok = await rulesRepo.delete(id, userId);
    if (!ok) throw new NotFoundError('Rule');
  }

  /**
   * Runs inside the signup transaction, after categories are seeded. Depends
   * on the seeded categories being present in the same transaction — the
   * INSERT ... SELECT joins against them by name.
   */
  async function seedDefaultsForUser(
    userId: string,
    client: PoolClient,
  ): Promise<void> {
    await rulesRepo.bulkSeed(userId, DEFAULT_RULES, client);
  }

  /**
   * Rule-learning: after a user manually assigns a category to a transaction,
   * check whether it's worth offering "always do this for descriptions like
   * '<pattern>'". Returns null (no suggestion) when:
   *   - the pattern is too short / a skipped generic token
   *   - a rule with the same (matchType, pattern) already exists for this user
   *   - no other transactions in a different category match the pattern
   */
  async function suggestForTransaction(
    userId: string,
    input: {
      transactionId: string;
      description: string;
      categoryId: string | null;
    },
  ): Promise<RuleSuggestion | null> {
    if (!input.categoryId) return null;
    const pattern = extractPattern(input.description);
    if (!pattern) return null;

    const dup = await rulesRepo.existsWithPattern({
      userId,
      matchType: 'substring',
      matchValue: pattern,
    });
    if (dup) return null;

    const [matchingCount, category] = await Promise.all([
      transactionsRepo.countRuleLearningMatches({
        userId,
        pattern,
        targetCategoryId: input.categoryId,
        excludeTransactionId: input.transactionId,
      }),
      categoriesRepo.findByIdForUser(input.categoryId, userId),
    ]);
    // Zero matches means the rule only helps future imports — still worth
    // surfacing, but the UI can prefer the "N others" copy when > 0.
    if (!category) return null;

    return {
      pattern,
      matchType: 'substring',
      categoryId: input.categoryId,
      categoryName: category.name,
      matchingCount,
    };
  }

  /**
   * Promote a suggestion to a real rule. Creates the rule and optionally
   * back-applies it to matching existing transactions in one DB transaction
   * — so a partial failure leaves nothing changed.
   */
  async function learnRule(
    userId: string,
    input: {
      pattern: string;
      categoryId: string;
      applyToExisting: boolean;
    },
  ): Promise<LearnRuleResult> {
    const category = await categoriesRepo.findByIdForUser(input.categoryId, userId);
    if (!category) throw new NotFoundError('Category');

    return withTransaction(pool, async (client) => {
      // Learned rules go to the end of the priority list (highest number) so
      // seeded system rules keep winning for the common merchants.
      const row = await rulesRepo.create(
        {
          userId,
          matchType: 'substring',
          matchValue: input.pattern,
          categoryId: input.categoryId,
          priority: 1000,
        },
        client,
      );
      let backAppliedCount = 0;
      if (input.applyToExisting) {
        backAppliedCount = await transactionsRepo.applyRuleLearning(
          {
            userId,
            pattern: input.pattern,
            targetCategoryId: input.categoryId,
          },
          client,
        );
      }
      const withCategory = await rulesRepo.findWithCategoryByIdForUser(
        row.id,
        userId,
        client,
      );
      if (!withCategory) throw new Error('learnRule: created row not found');
      return { rule: toPublic(withCategory), backAppliedCount };
    });
  }

  return { list, create, update, remove, seedDefaultsForUser, suggestForTransaction, learnRule };
}

export type RulesService = ReturnType<typeof createRulesService>;
