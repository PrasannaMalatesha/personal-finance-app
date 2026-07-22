import type { AccountsService } from '../services/accounts.service';
import {
  CreateAccountInput,
  UpdateAccountInput,
} from '../schemas/accounts';
import type { AuthedRequest } from '../lib/handler';
import type { IdempotencyContext } from '../middleware/idempotency';

export interface AccountsController {
  list(req: AuthedRequest): Promise<{ status: number; body: unknown }>;
  create(
    req: AuthedRequest,
    ctx?: IdempotencyContext,
  ): Promise<{ status: number; body: unknown }>;
  update(req: AuthedRequest): Promise<{ status: number; body: unknown }>;
  remove(req: AuthedRequest): Promise<{ status: number; body: unknown }>;
}

export function createAccountsController(
  service: AccountsService,
): AccountsController {
  return {
    async list(req) {
      const items = await service.list(req.user.id);
      return { status: 200, body: { data: items } };
    },

    async create(req, ctx) {
      const input = CreateAccountInput.parse(req.body);
      const account = await service.create(req.user.id, input, ctx?.client);
      return { status: 201, body: { data: account } };
    },

    async update(req) {
      const patch = UpdateAccountInput.parse(req.body);
      const account = await service.update(req.user.id, req.params.id!, patch);
      return { status: 200, body: { data: account } };
    },

    async remove(req) {
      await service.remove(req.user.id, req.params.id!);
      return { status: 204, body: undefined };
    },
  };
}
