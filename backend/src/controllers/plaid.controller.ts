import type { PlaidService } from '../services/plaid.service';
import type { PlaidItemRow } from '../repositories/plaidItems.repo';
import type { PlaidItemPublic } from '../schemas/plaid';
import { ExchangeInput } from '../schemas/plaid';
import type { AuthedRequest } from '../lib/handler';
import { NotFoundError } from '../errors/AppError';

function toPublic(row: PlaidItemRow): PlaidItemPublic {
  return {
    id: row.id,
    institutionName: row.institution_name,
    lastSyncedAt: row.last_synced_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

export interface PlaidController {
  createLinkToken(req: AuthedRequest): Promise<{ status: number; body: unknown }>;
  exchange(req: AuthedRequest): Promise<{ status: number; body: unknown }>;
  syncItem(req: AuthedRequest): Promise<{ status: number; body: unknown }>;
  listItems(req: AuthedRequest): Promise<{ status: number; body: unknown }>;
  removeItem(req: AuthedRequest): Promise<{ status: number; body: unknown }>;
}

export function createPlaidController(service: PlaidService): PlaidController {
  return {
    async createLinkToken(req) {
      const result = await service.createLinkToken(req.user.id);
      return { status: 200, body: { data: result } };
    },

    async exchange(req) {
      const input = ExchangeInput.parse(req.body);
      const item = await service.exchangePublicToken(req.user.id, input.publicToken);
      return { status: 201, body: { data: toPublic(item) } };
    },

    async syncItem(req) {
      const id = req.params.id;
      if (!id) throw new NotFoundError('PlaidItem');
      const result = await service.syncItem(req.user.id, id);
      return { status: 200, body: { data: result } };
    },

    async listItems(req) {
      const rows = await service.listItems(req.user.id);
      return { status: 200, body: { data: rows.map(toPublic) } };
    },

    async removeItem(req) {
      const id = req.params.id;
      if (!id) throw new NotFoundError('PlaidItem');
      await service.removeItem(req.user.id, id);
      return { status: 204, body: undefined };
    },
  };
}
