import type { Executor } from '../lib/tx';
import type { RulesRepo, RuleRow } from '../repositories/rules.repo';

/**
 * Rule engine (TRD §6.3).
 *
 * Rules are loaded per user, ordered by priority ASC (lower runs first).
 * Description is normalized (uppercase, collapsed whitespace) before matching.
 * substring: needle in haystack. exact: full equality.
 * First match wins; no match → null.
 *
 * Complexity is O(R) per description. For expected R ≤ 100, no indexing needed.
 * When categorizing many rows (e.g. a CSV batch) load rules once and reuse via
 * `categorizeWithRules`.
 */

export function normalizeDescription(input: string): string {
  return input.trim().replace(/\s+/g, ' ').toUpperCase();
}

export function categorizeWithRules(
  rules: readonly RuleRow[],
  description: string,
): string | null {
  const normalized = normalizeDescription(description);
  for (const rule of rules) {
    const needle = rule.match_value.toUpperCase();
    if (rule.match_type === 'substring') {
      if (normalized.includes(needle)) return rule.category_id;
    } else {
      if (normalized === needle) return rule.category_id;
    }
  }
  return null;
}

export interface CategorizationServiceDeps {
  rulesRepo: RulesRepo;
}

export function createCategorizationService(deps: CategorizationServiceDeps) {
  const { rulesRepo } = deps;

  async function categorize(
    userId: string,
    description: string,
    executor?: Executor,
  ): Promise<string | null> {
    const rules = await rulesRepo.listByUser(userId, executor);
    return categorizeWithRules(rules, description);
  }

  async function loadRules(
    userId: string,
    executor?: Executor,
  ): Promise<readonly RuleRow[]> {
    return rulesRepo.listByUser(userId, executor);
  }

  return { categorize, loadRules };
}

export type CategorizationService = ReturnType<typeof createCategorizationService>;
