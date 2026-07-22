import type { NextFunction, Request, Response } from 'express';
import type { Pool, PoolClient } from 'pg';
import { AppError } from '../errors/AppError';
import { sha256 } from '../lib/hash';
import { withTransaction } from '../lib/tx';
import type { IdempotencyKeysRepo } from '../repositories/idempotencyKeys.repo';

export class IdempotencyKeyRequiredError extends AppError {
  constructor() {
    super(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Missing Idempotency-Key header');
  }
}

export class IdempotencyKeyMismatchError extends AppError {
  constructor() {
    super(
      422,
      'IDEMPOTENCY_KEY_MISMATCH',
      'Idempotency-Key reused with a different request body',
    );
  }
}

export interface IdempotencyContext {
  client: PoolClient;
  userId: string;
  key: string;
}

type AuthedRequest = Request & { user: { id: string } };

export type IdempotentHandler = (
  req: AuthedRequest,
  ctx: IdempotencyContext,
) => Promise<{ status: number; body: unknown }>;

function canonicalize(input: unknown): string {
  return JSON.stringify(input, (_key, value) => {
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(value as Record<string, unknown>).sort()) {
        sorted[k] = (value as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return value;
  });
}

export function createIdempotency(pool: Pool, repo: IdempotencyKeysRepo) {
  return function idempotent(handler: IdempotentHandler) {
    return async function idempotentMiddleware(
      req: Request,
      res: Response,
      next: NextFunction,
    ): Promise<void> {
      try {
        const key = req.get('Idempotency-Key');
        if (!key) throw new IdempotencyKeyRequiredError();

        const authReq = req as AuthedRequest;
        if (!authReq.user?.id) {
          // Programmer error: idempotent(...) must be mounted after authMiddleware.
          throw new AppError(
            500,
            'INTERNAL',
            'idempotent() requires authMiddleware upstream',
          );
        }

        const userId = authReq.user.id;
        const requestHash = sha256(canonicalize(req.body));

        const result = await withTransaction(pool, async (client) => {
          const existing = await repo.findByUserAndKey(client, userId, key);
          if (existing) {
            if (existing.request_hash !== requestHash) {
              throw new IdempotencyKeyMismatchError();
            }
            return {
              status: existing.response_status,
              body: existing.response_body,
            };
          }

          const response = await handler(authReq, { client, userId, key });

          if (response.status >= 200 && response.status < 300) {
            await repo.insert(client, {
              userId,
              key,
              requestHash,
              responseStatus: response.status,
              responseBody: response.body,
            });
          }

          return { status: response.status, body: response.body };
        });

        res.status(result.status).json(result.body);
      } catch (err) {
        next(err);
      }
    };
  };
}

export type IdempotencyWrapper = ReturnType<typeof createIdempotency>;
