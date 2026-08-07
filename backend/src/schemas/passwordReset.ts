import { z } from 'zod';

export const RequestResetInput = z.object({
  email: z.string().trim().toLowerCase().email(),
});
export type RequestResetInput = z.infer<typeof RequestResetInput>;

export const ResetPasswordInput = z.object({
  // The raw token (base64url) as delivered in the email link — server
  // hashes it before lookup.
  token: z.string().min(1),
  // Same password rule as signup (PRD §5.1: ≥8 chars).
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});
export type ResetPasswordInput = z.infer<typeof ResetPasswordInput>;
