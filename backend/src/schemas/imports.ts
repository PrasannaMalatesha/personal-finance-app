import { z } from 'zod';

export const PreviewImportBody = z.object({
  accountId: z.string().uuid(),
});
export type PreviewImportBody = z.infer<typeof PreviewImportBody>;

export const CommitRowEdit = z.object({
  index: z.number().int().nonnegative(),
  categoryId: z.string().uuid().nullable().optional(),
  skip: z.boolean().optional(),
});
export type CommitRowEdit = z.infer<typeof CommitRowEdit>;

export const CommitImportBody = z.object({
  previewToken: z.string().min(1),
  filename: z.string().min(1).max(255),
  rows: z.array(CommitRowEdit).default([]),
});
export type CommitImportBody = z.infer<typeof CommitImportBody>;

export const ListImportsQuery = z.object({
  accountId: z.string().uuid().optional(),
});
export type ListImportsQuery = z.infer<typeof ListImportsQuery>;
