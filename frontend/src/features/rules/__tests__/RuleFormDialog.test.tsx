import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../auth/__tests__/testUtils';
import { RuleFormDialog } from '../RuleFormDialog';
import * as api from '../rulesApi';
import type { CategoryPublic } from '../../categories/categoriesApi';

vi.mock('../rulesApi');

const CAT: CategoryPublic = {
  id: '22222222-2222-2222-2222-222222222222',
  name: 'Dining',
  color: '#e57373',
  isSystemDefault: true,
  createdAt: '2026-01-01T00:00:00Z',
};

describe('RuleFormDialog (create)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('rejects an empty match value', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <RuleFormDialog open onClose={() => undefined} categories={[CAT]} />,
    );
    // Pick a category first so the categoryId error doesn't shadow the matchValue one.
    await user.click(screen.getByLabelText(/set category to/i));
    await user.click(await screen.findByRole('option', { name: /dining/i }));
    await user.click(screen.getByRole('button', { name: /^create$/i }));

    expect(await screen.findByText(/required/i)).toBeInTheDocument();
    expect(vi.mocked(api.createRule)).not.toHaveBeenCalled();
  });

  it('submits with an Idempotency-Key and closes on success', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    vi.mocked(api.createRule).mockResolvedValue({
      id: 'r1',
      matchType: 'substring',
      matchValue: 'AMAZON',
      categoryId: CAT.id,
      categoryName: CAT.name,
      color: CAT.color,
      priority: 100,
      createdAt: '2026-07-01T00:00:00Z',
    });

    renderWithProviders(
      <RuleFormDialog open onClose={onClose} categories={[CAT]} />,
    );

    await user.type(screen.getByLabelText(/match value/i), 'AMAZON');
    await user.click(screen.getByLabelText(/set category to/i));
    await user.click(await screen.findByRole('option', { name: /dining/i }));
    await user.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() => expect(vi.mocked(api.createRule)).toHaveBeenCalled());
    const call = vi.mocked(api.createRule).mock.calls[0]!;
    expect(call[0]).toMatchObject({
      matchType: 'substring',
      matchValue: 'AMAZON',
      categoryId: CAT.id,
      priority: 100,
    });
    // Idempotency-Key is a UUID
    expect(call[1]).toMatch(/^[0-9a-f-]{36}$/);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
