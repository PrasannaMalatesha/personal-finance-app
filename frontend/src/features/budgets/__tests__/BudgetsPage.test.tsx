import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../auth/__tests__/testUtils';
import { BudgetsPage } from '../BudgetsPage';
import * as budgetsApi from '../budgetsApi';
import * as categoriesApi from '../../categories/categoriesApi';
import * as authApi from '../../auth/authApi';
import type { BudgetPublic } from '../schemas';
import { currentMonth } from '../schemas';

vi.mock('../budgetsApi');
vi.mock('../../categories/categoriesApi');
vi.mock('../../auth/authApi');

const USER = { id: 'u1', email: 'a@example.com', baseCurrency: 'USD' as const };
const CAT = {
  id: '22222222-2222-2222-2222-222222222222',
  name: 'Dining',
  color: '#e57373',
  isSystemDefault: true,
  parentCategoryId: null,
  createdAt: '2026-01-01T00:00:00Z',
};
const BUDGET: BudgetPublic = {
  budgetId: '33333333-3333-3333-3333-333333333333',
  categoryId: CAT.id,
  categoryName: CAT.name,
  color: CAT.color,
  month: `${currentMonth()}-01`,
  amountLimit: '500.00',
  amountSpent: '120.00',
  amountRemaining: '380.00',
  percentUsed: 24,
  isOverBudget: false,
};

describe('BudgetsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(authApi.me).mockResolvedValue(USER);
    vi.mocked(categoriesApi.listCategories).mockResolvedValue([CAT]);
  });

  it('shows empty state when no budgets are set for the month', async () => {
    vi.mocked(budgetsApi.listBudgets).mockResolvedValue([]);
    renderWithProviders(<BudgetsPage />);
    expect(
      await screen.findByText(/no budgets set for this month/i),
    ).toBeInTheDocument();
  });

  it('renders a card per budget with category, spent, and percent', async () => {
    vi.mocked(budgetsApi.listBudgets).mockResolvedValue([BUDGET]);
    renderWithProviders(<BudgetsPage />);
    await waitFor(() =>
      expect(screen.getByText('Dining')).toBeInTheDocument(),
    );
    // Digits from limit and spent (formatter locale-agnostic).
    expect(screen.getByText(/500\.00/)).toBeInTheDocument();
    expect(screen.getByText(/120\.00/)).toBeInTheDocument();
    expect(screen.getByText(/24% used/)).toBeInTheDocument();
  });

  it('confirms then deletes a budget when the menu action is used', async () => {
    vi.mocked(budgetsApi.listBudgets).mockResolvedValue([BUDGET]);
    vi.mocked(budgetsApi.deleteBudget).mockResolvedValue();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    renderWithProviders(<BudgetsPage />);
    await waitFor(() => expect(screen.getByText('Dining')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /more actions for dining/i }));
    await user.click(await screen.findByRole('menuitem', { name: /delete/i }));

    await waitFor(() =>
      expect(vi.mocked(budgetsApi.deleteBudget)).toHaveBeenCalledWith(BUDGET.budgetId),
    );
  });
});
