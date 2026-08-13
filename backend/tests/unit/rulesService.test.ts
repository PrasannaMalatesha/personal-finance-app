import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import { createRulesService } from '../../src/services/rules.service';
import type { RulesRepo } from '../../src/repositories/rules.repo';
import type { CategoriesRepo } from '../../src/repositories/categories.repo';
import type { TransactionsRepo } from '../../src/repositories/transactions.repo';

/**
 * withTransaction opens a client and runs the callback with it. For unit
 * tests the callback runs synchronously against a fake client whose query
 * mock returns whatever the test expects — no real SQL involved.
 */
function fakePool(): Pool {
  const client = { query: vi.fn(async () => ({ rowCount: 0, rows: [] })), release: vi.fn() };
  return { connect: async () => client, query: vi.fn() } as unknown as Pool;
}

function makeMocks(overrides: {
  rulesRepo?: Partial<RulesRepo>;
  categoriesRepo?: Partial<CategoriesRepo>;
  transactionsRepo?: Partial<TransactionsRepo>;
} = {}) {
  const rulesRepo = {
    existsWithPattern: vi.fn(async () => false),
    create: vi.fn(async () => ({
      id: 'rule-new',
      user_id: 'u1',
      match_type: 'substring',
      match_value: 'starbucks',
      category_id: 'cat-dining',
      priority: 1000,
      created_at: new Date(),
    })),
    findWithCategoryByIdForUser: vi.fn(async () => ({
      id: 'rule-new',
      user_id: 'u1',
      match_type: 'substring',
      match_value: 'starbucks',
      category_id: 'cat-dining',
      priority: 1000,
      created_at: new Date(),
      category_name: 'Dining',
      category_color: '#f00',
    })),
    ...overrides.rulesRepo,
  } as unknown as RulesRepo;

  const categoriesRepo = {
    findByIdForUser: vi.fn(async () => ({ id: 'cat-dining', name: 'Dining', color: '#f00' })),
    ...overrides.categoriesRepo,
  } as unknown as CategoriesRepo;

  const transactionsRepo = {
    countRuleLearningMatches: vi.fn(async () => 3),
    applyRuleLearning: vi.fn(async () => 3),
    ...overrides.transactionsRepo,
  } as unknown as TransactionsRepo;

  return { rulesRepo, categoriesRepo, transactionsRepo };
}

describe('RulesService.suggestForTransaction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a suggestion when pattern is usable and no dup rule exists', async () => {
    const { rulesRepo, categoriesRepo, transactionsRepo } = makeMocks();
    const svc = createRulesService({ pool: fakePool(), rulesRepo, categoriesRepo, transactionsRepo });

    const s = await svc.suggestForTransaction('u1', {
      transactionId: 'tx1',
      description: 'STARBUCKS COFFEE #4521',
      categoryId: 'cat-dining',
    });
    expect(s).not.toBeNull();
    expect(s?.pattern).toBe('starbucks');
    expect(s?.matchingCount).toBe(3);
    expect(s?.categoryName).toBe('Dining');
  });

  it('returns null when the transaction has no category', async () => {
    const { rulesRepo, categoriesRepo, transactionsRepo } = makeMocks();
    const svc = createRulesService({ pool: fakePool(), rulesRepo, categoriesRepo, transactionsRepo });
    const s = await svc.suggestForTransaction('u1', {
      transactionId: 'tx1',
      description: 'STARBUCKS COFFEE',
      categoryId: null,
    });
    expect(s).toBeNull();
  });

  it('returns null when the description yields no usable pattern', async () => {
    const { rulesRepo, categoriesRepo, transactionsRepo } = makeMocks();
    const svc = createRulesService({ pool: fakePool(), rulesRepo, categoriesRepo, transactionsRepo });
    const s = await svc.suggestForTransaction('u1', {
      transactionId: 'tx1',
      description: '#123 $$$',
      categoryId: 'cat-dining',
    });
    expect(s).toBeNull();
  });

  it('returns null when a rule for the same pattern already exists', async () => {
    const { rulesRepo, categoriesRepo, transactionsRepo } = makeMocks({
      rulesRepo: { existsWithPattern: vi.fn(async () => true) },
    });
    const svc = createRulesService({ pool: fakePool(), rulesRepo, categoriesRepo, transactionsRepo });
    const s = await svc.suggestForTransaction('u1', {
      transactionId: 'tx1',
      description: 'STARBUCKS COFFEE',
      categoryId: 'cat-dining',
    });
    expect(s).toBeNull();
  });

  it('still suggests with matchingCount=0 (useful for future imports)', async () => {
    const { rulesRepo, categoriesRepo, transactionsRepo } = makeMocks({
      transactionsRepo: { countRuleLearningMatches: vi.fn(async () => 0) },
    });
    const svc = createRulesService({ pool: fakePool(), rulesRepo, categoriesRepo, transactionsRepo });
    const s = await svc.suggestForTransaction('u1', {
      transactionId: 'tx1',
      description: 'NETFLIX',
      categoryId: 'cat-dining',
    });
    expect(s).not.toBeNull();
    expect(s?.matchingCount).toBe(0);
  });
});

describe('RulesService.learnRule', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates the rule and back-applies when applyToExisting=true', async () => {
    const { rulesRepo, categoriesRepo, transactionsRepo } = makeMocks();
    const svc = createRulesService({ pool: fakePool(), rulesRepo, categoriesRepo, transactionsRepo });

    const res = await svc.learnRule('u1', {
      pattern: 'starbucks',
      categoryId: 'cat-dining',
      applyToExisting: true,
    });
    expect(rulesRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        matchType: 'substring',
        matchValue: 'starbucks',
        categoryId: 'cat-dining',
        priority: 1000,
      }),
      expect.anything(),
    );
    expect(transactionsRepo.applyRuleLearning).toHaveBeenCalledTimes(1);
    expect(res.backAppliedCount).toBe(3);
    expect(res.rule.matchValue).toBe('starbucks');
  });

  it('creates the rule but skips back-apply when applyToExisting=false', async () => {
    const { rulesRepo, categoriesRepo, transactionsRepo } = makeMocks();
    const svc = createRulesService({ pool: fakePool(), rulesRepo, categoriesRepo, transactionsRepo });

    const res = await svc.learnRule('u1', {
      pattern: 'starbucks',
      categoryId: 'cat-dining',
      applyToExisting: false,
    });
    expect(rulesRepo.create).toHaveBeenCalled();
    expect(transactionsRepo.applyRuleLearning).not.toHaveBeenCalled();
    expect(res.backAppliedCount).toBe(0);
  });
});
