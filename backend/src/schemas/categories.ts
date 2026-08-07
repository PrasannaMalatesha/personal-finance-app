import { z } from 'zod';

const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be #RRGGBB hex');

// parentCategoryId is nullable + optional; explicit null is meaningful
// (unset to top-level), so we accept null distinctly from undefined.
const ParentCategoryIdInput = z.string().uuid().nullable().optional();

export const CreateCategoryInput = z.object({
  name: z.string().min(1).max(64).trim(),
  color: HexColor,
  parentCategoryId: ParentCategoryIdInput,
});
export type CreateCategoryInput = z.infer<typeof CreateCategoryInput>;

export const UpdateCategoryInput = z
  .object({
    name: z.string().min(1).max(64).trim().optional(),
    color: HexColor.optional(),
    parentCategoryId: ParentCategoryIdInput,
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.color !== undefined ||
      data.parentCategoryId !== undefined,
    { message: 'At least one field must be provided' },
  );
export type UpdateCategoryInput = z.infer<typeof UpdateCategoryInput>;

export const CategoryPublic = z.object({
  id: z.string().uuid(),
  name: z.string(),
  color: z.string(),
  isSystemDefault: z.boolean(),
  parentCategoryId: z.string().uuid().nullable(),
  createdAt: z.string(),
});
export type CategoryPublic = z.infer<typeof CategoryPublic>;

export const DEFAULT_CATEGORIES: ReadonlyArray<{ name: string; color: string }> = [
  { name: 'Dining', color: '#e57373' },
  { name: 'Groceries', color: '#81c784' },
  { name: 'Rent', color: '#7986cb' },
  { name: 'Utilities', color: '#ffb74d' },
  { name: 'Transport', color: '#4fc3f7' },
  { name: 'Shopping', color: '#ba68c8' },
  { name: 'Entertainment', color: '#f06292' },
  { name: 'Health', color: '#ef5350' },
  { name: 'Travel', color: '#26a69a' },
  { name: 'Salary', color: '#66bb6a' },
  { name: 'Refund', color: '#9ccc65' },
  { name: 'Transfer', color: '#90a4ae' },
  { name: 'Fees', color: '#d32f2f' },
  { name: 'Subscriptions', color: '#ab47bc' },
  { name: 'Gifts', color: '#ffa726' },
  { name: 'Education', color: '#29b6f6' },
  { name: 'Other Income', color: '#78909c' },
  { name: 'Other Expense', color: '#6d4c41' },
];
