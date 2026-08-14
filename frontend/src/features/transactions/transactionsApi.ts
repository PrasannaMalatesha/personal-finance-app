import { apiFetch } from '../../shared/api/client';
import type {
  TransactionFormInput,
  TransactionPublic,
  TransactionsFilters,
} from './schemas';

interface ListResponse {
  data: TransactionPublic[];
  nextCursor: string | null;
}

interface OneResponse {
  data: TransactionPublic;
}

export interface RuleSuggestion {
  pattern: string;
  matchType: 'substring';
  categoryId: string;
  categoryName: string;
  matchingCount: number;
}

interface UpdateResponse {
  data: TransactionPublic;
  suggestedRule: RuleSuggestion | null;
}

function buildQuery(filters: TransactionsFilters, cursor?: string): string {
  const params = new URLSearchParams();
  if (filters.accountId) params.set('accountId', filters.accountId);
  if (filters.categoryId) params.set('categoryId', filters.categoryId);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.q) params.set('q', filters.q);
  if (filters.limit) params.set('limit', String(filters.limit));
  if (cursor) params.set('cursor', cursor);
  const s = params.toString();
  return s ? `?${s}` : '';
}

export async function listTransactions(
  filters: TransactionsFilters,
  cursor?: string,
): Promise<ListResponse> {
  return apiFetch<ListResponse>(`/api/v1/transactions${buildQuery(filters, cursor)}`);
}

/**
 * Backend accepts categoryId as null (explicit "uncategorized") or omitted
 * (server-side auto-categorize via rule engine). Manual entry from the UI
 * should be explicit — we always send null or a real uuid, never `undefined`.
 */
function normalizePayload(input: TransactionFormInput): Record<string, unknown> {
  return {
    accountId: input.accountId,
    date: input.date,
    description: input.description,
    amount: input.amount,
    categoryId: input.categoryId && input.categoryId !== '' ? input.categoryId : null,
  };
}

export async function createTransaction(
  input: TransactionFormInput,
  idempotencyKey: string,
): Promise<TransactionPublic> {
  const res = await apiFetch<OneResponse>('/api/v1/transactions', {
    method: 'POST',
    json: normalizePayload(input),
    headers: { 'Idempotency-Key': idempotencyKey },
  });
  return res.data;
}

export async function updateTransaction(
  id: string,
  patch: TransactionFormInput,
): Promise<UpdateResponse> {
  return apiFetch<UpdateResponse>(`/api/v1/transactions/${id}`, {
    method: 'PATCH',
    json: normalizePayload(patch),
  });
}

export async function deleteTransaction(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/transactions/${id}`, { method: 'DELETE' });
}

/**
 * Downloads a CSV of transactions honoring the current filters. We fetch()
 * with credentials rather than using an <a href> — split-origin deploys
 * (Vercel + Render) don't send cookies on top-level navigations to a
 * different registrable domain, but they do with fetch({credentials}).
 */
export async function downloadTransactionsCsv(filters: TransactionsFilters): Promise<void> {
  const baseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';
  const params = new URLSearchParams();
  if (filters.accountId) params.set('accountId', filters.accountId);
  if (filters.categoryId && filters.categoryId !== 'uncategorized') {
    params.set('categoryId', filters.categoryId);
  }
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.q) params.set('q', filters.q);
  const qs = params.toString();
  const url = `${baseUrl.replace(/\/$/, '')}/api/v1/transactions/export.csv${qs ? `?${qs}` : ''}`;

  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(`Export failed with status ${res.status}`);
  const blob = await res.blob();

  // Filename comes from Content-Disposition when possible; otherwise
  // synthesize one so the browser doesn't save `download`.
  const disp = res.headers.get('Content-Disposition') ?? '';
  const match = /filename="?([^";]+)"?/.exec(disp);
  const filename = match?.[1] ?? `transactions-${new Date().toISOString().slice(0, 10)}.csv`;

  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

export interface LearnRuleResult {
  rule: {
    id: string;
    matchType: string;
    matchValue: string;
    categoryId: string;
    categoryName: string;
    color: string;
    priority: number;
    createdAt: string;
  };
  backAppliedCount: number;
}

export async function learnRule(input: {
  pattern: string;
  categoryId: string;
  applyToExisting: boolean;
}): Promise<LearnRuleResult> {
  const res = await apiFetch<{ data: LearnRuleResult }>('/api/v1/rules/learned', {
    method: 'POST',
    json: input,
  });
  return res.data;
}
