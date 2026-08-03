import type { RecurringService } from '../services/recurring.service';
import type { AuthedRequest } from '../lib/handler';

export interface RecurringController {
  list(req: AuthedRequest): Promise<{ status: number; body: unknown }>;
  detect(req: AuthedRequest): Promise<{ status: number; body: unknown }>;
  dismiss(req: AuthedRequest): Promise<{ status: number; body: unknown }>;
  remove(req: AuthedRequest): Promise<{ status: number; body: unknown }>;
}

export function createRecurringController(
  service: RecurringService,
): RecurringController {
  return {
    async list(req) {
      const groups = await service.list(req.user.id);
      return { status: 200, body: { data: groups } };
    },

    async detect(req) {
      const result = await service.detect(req.user.id);
      return { status: 200, body: { data: result } };
    },

    async dismiss(req) {
      const group = await service.dismiss(req.user.id, req.params.id!);
      return { status: 200, body: { data: group } };
    },

    async remove(req) {
      await service.remove(req.user.id, req.params.id!);
      return { status: 204, body: undefined };
    },
  };
}
