import { z } from 'zod';

export const RULE_MATCH_TYPES = ['substring', 'exact'] as const;
export type RuleMatchType = (typeof RULE_MATCH_TYPES)[number];

export const CreateRuleInput = z.object({
  matchType: z.enum(RULE_MATCH_TYPES),
  matchValue: z.string().trim().min(1).max(120),
  categoryId: z.string().uuid(),
  // Lower priority runs first (TRD §6.3). Default 100 keeps user rules well
  // above seed rules (which use 500+) unless the user picks something else.
  priority: z.number().int().min(0).max(10_000).default(100),
});
export type CreateRuleInput = z.infer<typeof CreateRuleInput>;

export const UpdateRuleInput = z
  .object({
    matchType: z.enum(RULE_MATCH_TYPES).optional(),
    matchValue: z.string().trim().min(1).max(120).optional(),
    categoryId: z.string().uuid().optional(),
    priority: z.number().int().min(0).max(10_000).optional(),
  })
  .refine(
    (d) =>
      d.matchType !== undefined ||
      d.matchValue !== undefined ||
      d.categoryId !== undefined ||
      d.priority !== undefined,
    { message: 'At least one field must be provided' },
  );
export type UpdateRuleInput = z.infer<typeof UpdateRuleInput>;

export const RulePublic = z.object({
  id: z.string().uuid(),
  matchType: z.enum(RULE_MATCH_TYPES),
  matchValue: z.string(),
  categoryId: z.string().uuid(),
  categoryName: z.string(),
  color: z.string(),
  priority: z.number().int(),
  createdAt: z.string(),
});
export type RulePublic = z.infer<typeof RulePublic>;

// Rule-learning: minimal input — the pattern always uses substring matching,
// and the client passes the target category + whether to back-apply.
export const LearnRuleInput = z.object({
  pattern: z.string().trim().min(3).max(120),
  categoryId: z.string().uuid(),
  applyToExisting: z.boolean().default(false),
});
export type LearnRuleInput = z.infer<typeof LearnRuleInput>;

/**
 * Ships with 15 rules covering common merchants across both regions the app
 * targets (India + US) — matches the "~15 seed rules" mentioned in PRD §5.1.
 * Priority 500+ keeps seeds ranked below any rule the user adds later.
 *
 * category_name references DEFAULT_CATEGORIES; seeding must run after
 * categories are seeded (see auth.service onUserCreated hook composition).
 */
export const DEFAULT_RULES: ReadonlyArray<{
  matchType: RuleMatchType;
  matchValue: string;
  categoryName: string;
  priority: number;
}> = [
  // Dining
  { matchType: 'substring', matchValue: 'STARBUCKS', categoryName: 'Dining', priority: 500 },
  { matchType: 'substring', matchValue: 'MCDONALD', categoryName: 'Dining', priority: 500 },
  { matchType: 'substring', matchValue: 'ZOMATO', categoryName: 'Dining', priority: 500 },
  { matchType: 'substring', matchValue: 'SWIGGY', categoryName: 'Dining', priority: 500 },
  // Groceries
  { matchType: 'substring', matchValue: 'WHOLE FOODS', categoryName: 'Groceries', priority: 500 },
  { matchType: 'substring', matchValue: 'TRADER JOE', categoryName: 'Groceries', priority: 500 },
  { matchType: 'substring', matchValue: 'BIGBASKET', categoryName: 'Groceries', priority: 500 },
  // Transport
  { matchType: 'substring', matchValue: 'UBER', categoryName: 'Transport', priority: 500 },
  { matchType: 'substring', matchValue: 'LYFT', categoryName: 'Transport', priority: 500 },
  { matchType: 'substring', matchValue: 'OLA', categoryName: 'Transport', priority: 500 },
  // Subscriptions
  { matchType: 'substring', matchValue: 'NETFLIX', categoryName: 'Subscriptions', priority: 500 },
  { matchType: 'substring', matchValue: 'SPOTIFY', categoryName: 'Subscriptions', priority: 500 },
  { matchType: 'substring', matchValue: 'AMAZON PRIME', categoryName: 'Subscriptions', priority: 500 },
  // Income
  { matchType: 'substring', matchValue: 'SALARY', categoryName: 'Salary', priority: 500 },
  { matchType: 'substring', matchValue: 'PAYROLL', categoryName: 'Salary', priority: 500 },
];
