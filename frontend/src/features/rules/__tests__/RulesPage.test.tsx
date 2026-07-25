import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../auth/__tests__/testUtils';
import { RulesPage } from '../RulesPage';
import * as rulesApi from '../rulesApi';
import * as categoriesApi from '../../categories/categoriesApi';
import type { RulePublic } from '../schemas';

vi.mock('../rulesApi');
vi.mock('../../categories/categoriesApi');

const CAT = {
  id: '22222222-2222-2222-2222-222222222222',
  name: 'Dining',
  color: '#e57373',
  isSystemDefault: true,
  createdAt: '2026-01-01T00:00:00Z',
};
const RULE: RulePublic = {
  id: '33333333-3333-3333-3333-333333333333',
  matchType: 'substring',
  matchValue: 'STARBUCKS',
  categoryId: CAT.id,
  categoryName: CAT.name,
  color: CAT.color,
  priority: 500,
  createdAt: '2026-01-01T00:00:00Z',
};

describe('RulesPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(categoriesApi.listCategories).mockResolvedValue([CAT]);
  });

  it('shows the empty state when no rules exist', async () => {
    vi.mocked(rulesApi.listRules).mockResolvedValue([]);
    renderWithProviders(<RulesPage />);
    expect(await screen.findByText(/no rules yet/i)).toBeInTheDocument();
  });

  it('renders a row per rule with match value, category, and priority', async () => {
    vi.mocked(rulesApi.listRules).mockResolvedValue([RULE]);
    renderWithProviders(<RulesPage />);
    await waitFor(() =>
      expect(screen.getByText('STARBUCKS')).toBeInTheDocument(),
    );
    expect(screen.getByText('Dining')).toBeInTheDocument();
    expect(screen.getByText('500')).toBeInTheDocument();
  });

  it('confirms then deletes a rule from the row menu', async () => {
    vi.mocked(rulesApi.listRules).mockResolvedValue([RULE]);
    vi.mocked(rulesApi.deleteRule).mockResolvedValue();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    renderWithProviders(<RulesPage />);
    await waitFor(() => expect(screen.getByText('STARBUCKS')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /more actions for rule starbucks/i }));
    await user.click(await screen.findByRole('menuitem', { name: /delete/i }));

    await waitFor(() =>
      expect(vi.mocked(rulesApi.deleteRule)).toHaveBeenCalledWith(RULE.id),
    );
  });
});
