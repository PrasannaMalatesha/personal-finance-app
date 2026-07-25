import type { PoolClient } from 'pg';
import type {
  RulesRepo,
  RuleWithCategoryRow,
} from '../repositories/rules.repo';
import type { CategoriesRepo } from '../repositories/categories.repo';
import type {
  CreateRuleInput,
  RulePublic,
  UpdateRuleInput,
} from '../schemas/rules';
import { DEFAULT_RULES } from '../schemas/rules';
import { NotFoundError } from '../errors/AppError';

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
  rulesRepo: RulesRepo;
  categoriesRepo: CategoriesRepo;
}

export function createRulesService(deps: RulesServiceDeps) {
  const { rulesRepo, categoriesRepo } = deps;

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

  return { list, create, update, remove, seedDefaultsForUser };
}

export type RulesService = ReturnType<typeof createRulesService>;
