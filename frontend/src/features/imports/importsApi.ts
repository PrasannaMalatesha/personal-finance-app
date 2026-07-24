import { apiFetch } from '../../shared/api/client';
import type {
  CommitResult,
  CommitRowEdit,
  ImportBatch,
  PreviewResult,
  UndoResult,
} from './schemas';

interface DataWrap<T> {
  data: T;
}

/**
 * Multipart upload of the CSV. `apiFetch` with `raw: true` skips its own
 * Content-Type header so the browser can attach a `multipart/form-data`
 * boundary correctly (TRD §5.2 preview payload).
 */
export async function previewImport(
  accountId: string,
  file: File,
): Promise<PreviewResult> {
  const form = new FormData();
  form.append('accountId', accountId);
  form.append('file', file);
  const res = await apiFetch<DataWrap<PreviewResult>>('/api/v1/imports/preview', {
    method: 'POST',
    raw: true,
    body: form,
  });
  return res.data;
}

export async function commitImport(
  input: { previewToken: string; filename: string; rows: CommitRowEdit[] },
  idempotencyKey: string,
): Promise<CommitResult> {
  const res = await apiFetch<DataWrap<CommitResult>>('/api/v1/imports/commit', {
    method: 'POST',
    json: input,
    headers: { 'Idempotency-Key': idempotencyKey },
  });
  return res.data;
}

export async function listImports(accountId?: string): Promise<ImportBatch[]> {
  const q = accountId ? `?accountId=${encodeURIComponent(accountId)}` : '';
  const res = await apiFetch<DataWrap<ImportBatch[]>>(`/api/v1/imports${q}`);
  return res.data;
}

export async function undoImport(batchId: string): Promise<UndoResult> {
  const res = await apiFetch<DataWrap<UndoResult>>(
    `/api/v1/imports/${batchId}/undo`,
    { method: 'POST' },
  );
  return res.data;
}
