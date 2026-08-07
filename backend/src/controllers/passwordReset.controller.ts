import type { PasswordResetService } from '../services/passwordReset.service';
import {
  RequestResetInput,
  ResetPasswordInput,
} from '../schemas/passwordReset';
import type { AuthedRequest } from '../lib/handler';

export interface PasswordResetController {
  requestReset(req: AuthedRequest): Promise<{ status: number; body: unknown }>;
  resetPassword(req: AuthedRequest): Promise<{ status: number; body: unknown }>;
}

export function createPasswordResetController(
  service: PasswordResetService,
): PasswordResetController {
  return {
    async requestReset(req) {
      const input = RequestResetInput.parse(req.body);
      await service.requestReset(input);
      // Always 200 — no user enumeration.
      return { status: 200, body: { data: { ok: true } } };
    },

    async resetPassword(req) {
      const input = ResetPasswordInput.parse(req.body);
      await service.resetPassword(input);
      return { status: 200, body: { data: { ok: true } } };
    },
  };
}
