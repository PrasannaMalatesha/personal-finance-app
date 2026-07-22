import type { PoolClient } from 'pg';
import type { CategoriesRepo, CategoryRow } from '../repositories/categories.repo';
import type { Executor } from '../lib/tx';
import type {
  CategoryPublic,
  CreateCategoryInput,
  UpdateCategoryInput,
} from '../schemas/categories';
import { DEFAULT_CATEGORIES } from '../schemas/categories';
import { ConflictError, NotFoundError } from '../errors/AppError';

function toCategoryPublic(row: CategoryRow): CategoryPublic {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    isSystemDefault: row.is_system_default,
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

  async function list(userId: string): Promise<CategoryPublic[]> {
    const rows = await categoriesRepo.listByUser(userId);
    return rows.map(toCategoryPublic);
  }

  async function create(
    userId: string,
    input: CreateCategoryInput,
    executor?: Executor,
  ): Promise<CategoryPublic> {
    try {
      const row = await categoriesRepo.create(
        { userId, name: input.name, color: input.color, isSystemDefault: false },
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
