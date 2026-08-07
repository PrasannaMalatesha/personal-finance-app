import type { PoolClient } from 'pg';
import type { CategoriesRepo, CategoryRow } from '../repositories/categories.repo';
import type { Executor } from '../lib/tx';
import type {
  CategoryPublic,
  CreateCategoryInput,
  UpdateCategoryInput,
} from '../schemas/categories';
import { DEFAULT_CATEGORIES } from '../schemas/categories';
import { ConflictError, NotFoundError, ValidationError } from '../errors/AppError';

function toCategoryPublic(row: CategoryRow): CategoryPublic {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    isSystemDefault: row.is_system_default,
    parentCategoryId: row.parent_category_id,
    createdAt: row.created_at.toISOString(),
  };
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === '23505'
  );
}

export interface CategoriesServiceDeps {
  categoriesRepo: CategoriesRepo;
}

export function createCategoriesService(deps: CategoriesServiceDeps) {
  const { categoriesRepo } = deps;

  /**
   * Enforce depth-2 hierarchy (PRD §5.2):
   *   - Parent must belong to the same user.
   *   - Parent must itself be top-level (parent.parent_category_id === null),
   *     preventing grandchildren.
   *   - selfId (when updating) must not equal parentId — a category can't be
   *     its own parent.
   *   - selfId must not have children — a parent can't be re-parented under
   *     another category (would create a 3-deep chain).
   */
  async function assertValidParent(
    userId: string,
    parentId: string,
    selfId: string | null,
  ): Promise<void> {
    if (selfId && selfId === parentId) {
      throw new ValidationError('A category cannot be its own parent');
    }
    const parent = await categoriesRepo.findByIdForUser(parentId, userId);
    if (!parent) throw new NotFoundError('Parent category');
    if (parent.parent_category_id !== null) {
      throw new ValidationError(
        'Only two levels are supported — pick a top-level category as the parent',
      );
    }
    if (selfId) {
      const selfHasChildren = await categoriesRepo.hasChildren(selfId, userId);
      if (selfHasChildren) {
        throw new ValidationError(
          'This category has children, so it cannot itself become a subcategory',
        );
      }
    }
  }

  async function list(userId: string): Promise<CategoryPublic[]> {
    const rows = await categoriesRepo.listByUser(userId);
    return rows.map(toCategoryPublic);
  }

  async function create(
    userId: string,
    input: CreateCategoryInput,
    executor?: Executor,
  ): Promise<CategoryPublic> {
    if (input.parentCategoryId) {
      await assertValidParent(userId, input.parentCategoryId, null);
    }
    try {
      const row = await categoriesRepo.create(
        {
          userId,
          name: input.name,
          color: input.color,
          isSystemDefault: false,
          parentCategoryId: input.parentCategoryId ?? null,
        },
        executor,
      );
      return toCategoryPublic(row);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError(`Category '${input.name}' already exists`);
      }
      throw err;
    }
  }

  async function update(
    userId: string,
    id: string,
    patch: UpdateCategoryInput,
  ): Promise<CategoryPublic> {
    if (patch.parentCategoryId !== undefined && patch.parentCategoryId !== null) {
      await assertValidParent(userId, patch.parentCategoryId, id);
    }
    try {
      const row = await categoriesRepo.update(id, userId, patch);
      if (!row) throw new NotFoundError('Category');
      return toCategoryPublic(row);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError('Category name already exists');
      }
      throw err;
    }
  }

  async function remove(userId: string, id: string): Promise<void> {
    const deleted = await categoriesRepo.delete(id, userId);
    if (!deleted) throw new NotFoundError('Category');
  }

  async function seedDefaultsForUser(
    userId: string,
    client: PoolClient,
  ): Promise<void> {
    await categoriesRepo.bulkCreate(userId, DEFAULT_CATEGORIES, client);
  }

  return { list, create, update, remove, seedDefaultsForUser };
}

export type CategoriesService = ReturnType<typeof createCategoriesService>;
