import type { CategoriesService } from '../services/categories.service';
import {
  CreateCategoryInput,
  UpdateCategoryInput,
} from '../schemas/categories';
import type { AuthedRequest } from '../lib/handler';
import type { IdempotencyContext } from '../middleware/idempotency';

export interface CategoriesController {
  list(req: AuthedRequest): Promise<{ status: number; body: unknown }>;
  create(
    req: AuthedRequest,
    ctx?: IdempotencyContext,
  ): Promise<{ status: number; body: unknown }>;
  update(req: AuthedRequest): Promise<{ status: number; body: unknown }>;
  remove(req: AuthedRequest): Promise<{ status: number; body: unknown }>;
}

export function createCategoriesController(
  service: CategoriesService,
): CategoriesController {
  return {
    async list(req) {
      const items = await service.list(req.user.id);
      return { status: 200, body: { data: items } };
    },

    async create(req, ctx) {
      const input = CreateCategoryInput.parse(req.body);
      const category = await service.create(req.user.id, input, ctx?.client);
      return { status: 201, body: { data: category } };
    },

    async update(req) {
      const patch = UpdateCategoryInput.parse(req.body);
      const category = await service.update(req.user.id, req.params.id!, patch);
      return { status: 200, body: { data: category } };
    },

    async remove(req) {
      await service.remove(req.user.id, req.params.id!);
      return { status: 204, body: undefined };
    },
  };
}
