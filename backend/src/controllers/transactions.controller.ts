import type { TransactionsService } from '../services/transactions.service';
import type { RulesService } from '../services/rules.service';
import {
  CreateTransactionInput,
  ListTransactionsQuery,
  UpdateTransactionInput,
} from '../schemas/transactions';
import type { AuthedRequest } from '../lib/handler';
import type { IdempotencyContext } from '../middleware/idempotency';
import { flags } from '../flags';

export interface TransactionsController {
  list(req: AuthedRequest): Promise<{ status: number; body: unknown }>;
  create(
    req: AuthedRequest,
    ctx?: IdempotencyContext,
  ): Promise<{ status: number; body: unknown }>;
  update(req: AuthedRequest): Promise<{ status: number; body: unknown }>;
  remove(req: AuthedRequest): Promise<{ status: number; body: unknown }>;
}

export function createTransactionsController(
  service: TransactionsService,
  rulesService: RulesService,
): TransactionsController {
  return {
    async list(req) {
      const query = ListTransactionsQuery.parse(req.query);
      const { items, nextCursor } = await service.list(req.user.id, query);
      return { status: 200, body: { data: items, nextCursor } };
    },

    async create(req, ctx) {
      const input = CreateTransactionInput.parse(req.body);
      const tx = await service.create(req.user.id, input, ctx?.client);
      return { status: 201, body: { data: tx } };
    },

    async update(req) {
      const patch = UpdateTransactionInput.parse(req.body);
      const { transaction, previousCategoryId } = await service.update(
        req.user.id,
        req.params.id!,
        patch,
      );
      // Rule-learning: only offer a suggestion when the category actually
      // changed to a non-null value. Skip when the flag is off. Failure in
      // suggest logic must not break the update — swallow + log via throw.
      let suggestedRule = null;
      if (
        flags.ruleLearning &&
        transaction.categoryId &&
        transaction.categoryId !== previousCategoryId
      ) {
        try {
          suggestedRule = await rulesService.suggestForTransaction(req.user.id, {
            transactionId: transaction.id,
            description: transaction.description,
            categoryId: transaction.categoryId,
          });
        } catch {
          suggestedRule = null;
        }
      }
      return { status: 200, body: { data: transaction, suggestedRule } };
    },

    async remove(req) {
      await service.remove(req.user.id, req.params.id!);
      return { status: 204, body: undefined };
    },
  };
}
