import { z } from 'zod';

export const PreviewImportBody = z.object({
  accountId: z.string().uuid(),
});
export type PreviewImportBody = z.infer<typeof PreviewImportBody>;
