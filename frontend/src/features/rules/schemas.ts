import { z } from 'zod';

export const RULE_MATCH_TYPES = ['substring', 'exact'] as const;
export type RuleMatchType = (typeof RULE_MATCH_TYPES)[number];

export const RULE_MATCH_TYPE_LABELS: Record<RuleMatchType, string> = {
  substring: 'Contains',
  exact: 'Exactly matches',
};

export interface RulePublic {
  id: string;
  matchType: RuleMatchType;
  matchValue: string;
  categoryId: string;
  categoryName: string;
  color: string;
  priority: number;
  createdAt: string;
}

// Priority stays as a string in the form (validated as a bounded integer);
// callers coerce to number before hitting the wire. Keeps the RHF resolver's
// input/output types identical, avoiding the useForm generic contortions.
export const RuleFormSchema = z.object({
  matchType: z.enum(RULE_MATCH_TYPES),
  matchValue: z.string().trim().min(1, 'Required').max(120, 'Too long'),
  categoryId: z.string().uuid('Pick a category'),
  priority: z
    .string()
    .trim()
    .refine((s) => /^\d+$/.test(s), 'Enter a whole number')
    .refine(
      (s) => {
        const n = Number(s);
        return n >= 0 && n <= 10_000;
      },
      { message: 'Between 0 and 10000' },
    ),
});
export type RuleFormInput = z.infer<typeof RuleFormSchema>;

export interface RuleWireInput {
  matchType: RuleMatchType;
  matchValue: string;
  categoryId: string;
  priority: number;
}

export function toWire(input: RuleFormInput): RuleWireInput {
  return {
    matchType: input.matchType,
    matchValue: input.matchValue,
    categoryId: input.categoryId,
    priority: Number(input.priority),
  };
}
