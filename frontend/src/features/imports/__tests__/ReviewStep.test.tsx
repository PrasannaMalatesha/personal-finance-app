import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../auth/__tests__/testUtils';
import { ReviewStep } from '../ReviewStep';
import * as importsApi from '../importsApi';
import * as categoriesApi from '../../categories/categoriesApi';
import * as authApi from '../../auth/authApi';
import type { PreviewResult } from '../schemas';

vi.mock('../importsApi');
vi.mock('../../categories/categoriesApi');
vi.mock('../../auth/authApi');

const USER = { id: 'u1', email: 'a@example.com', baseCurrency: 'USD' as const };
const CAT = {
  id: 'cat1',
  name: 'Dining',
  color: '#e57373',
  isSystemDefault: true,
  parentCategoryId: null,
  createdAt: '2026-01-01T00:00:00Z',
};

const PREVIEW: PreviewResult = {
  detectedColumns: {
    presetName: 'Chase',
    date: 'Posting Date',
    description: 'Description',
    amount: 'Amount',
    debit: null,
    credit: null,
    amountKind: 'signed',
  },
  rows: [
    {
      index: 0,
      date: '2026-07-15',
      description: 'STARBUCKS',
      amount: '-6.50',
      proposedCategoryId: CAT.id,
      proposedCategoryName: CAT.name,
      matchedRuleId: 'r1',
      isDuplicate: false,
      duplicateOfTransactionId: null,
    },
    {
      index: 1,
      date: '2026-07-16',
      description: 'PAYROLL',
      amount: '2500.00',
      proposedCategoryId: null,
      proposedCategoryName: null,
      matchedRuleId: null,
      isDuplicate: true,
      duplicateOfTransactionId: 'tx-existing',
    },
  ],
  previewToken: 'preview-tok',
  expiresInSec: 300,
};

describe('ReviewStep', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(authApi.me).mockResolvedValue(USER);
    vi.mocked(categoriesApi.listCategories).mockResolvedValue([CAT]);
  });

  it('defaults duplicates to skip=true; imports the remaining row', async () => {
    const user = userEvent.setup();
    vi.mocked(importsApi.commitImport).mockResolvedValue({
      importBatchId: 'batch1',
      inserted: 1,
      skipped: 1,
    });

    const onCommitted = vi.fn();
    renderWithProviders(
      <ReviewStep
        preview={PREVIEW}
        filename="chase.csv"
        onBack={() => undefined}
        onCommitted={onCommitted}
      />,
    );

    // The duplicate row (index 1) starts with skip=true, so import count is 1.
    expect(await screen.findByText(/1 will import/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /import 1/i })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: /import 1/i }));

    await waitFor(() => expect(vi.mocked(importsApi.commitImport)).toHaveBeenCalled());
    const [payload, key] = vi.mocked(importsApi.commitImport).mock.calls[0]!;
    expect(payload).toMatchObject({
      previewToken: 'preview-tok',
      filename: 'chase.csv',
      rows: expect.arrayContaining([
        expect.objectContaining({ index: 0, skip: false, categoryId: CAT.id }),
        expect.objectContaining({ index: 1, skip: true }),
      ]),
    });
    expect(key).toMatch(/^[0-9a-f-]{36}$/);

    await waitFor(() => expect(onCommitted).toHaveBeenCalled());
  });

  it('toggling the skip checkbox flips the import count', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ReviewStep
        preview={PREVIEW}
        filename="chase.csv"
        onBack={() => undefined}
        onCommitted={() => undefined}
      />,
    );

    expect(await screen.findByText(/1 will import/i)).toBeInTheDocument();

    // Un-skip the duplicate row (checkbox for row 2)
    const skipCheckbox2 = screen.getByLabelText(/skip row 2/i);
    await user.click(skipCheckbox2);

    expect(await screen.findByText(/2 will import/i)).toBeInTheDocument();
  });

  it('back button calls onBack', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    renderWithProviders(
      <ReviewStep
        preview={PREVIEW}
        filename="chase.csv"
        onBack={onBack}
        onCommitted={() => undefined}
      />,
    );
    await user.click(screen.getByRole('button', { name: /back/i }));
    expect(onBack).toHaveBeenCalled();
  });
});
