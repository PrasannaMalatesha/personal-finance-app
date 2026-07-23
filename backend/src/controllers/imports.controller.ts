import type { Request } from 'express';
import type { CsvImportService } from '../services/csvImport.service';
import {
  CommitImportBody,
  ListImportsQuery,
  PreviewImportBody,
} from '../schemas/imports';
import type { AuthedRequest } from '../lib/handler';
import type { IdempotencyContext } from '../middleware/idempotency';
import { AppError, ValidationError } from '../errors/AppError';

// Extend AuthedRequest with the file multer attaches.
type UploadedFileRequest = AuthedRequest & { file?: Express.Multer.File };

export interface ImportsController {
  preview(req: Request): Promise<{ status: number; body: unknown }>;
  commit(
    req: AuthedRequest,
    ctx?: IdempotencyContext,
  ): Promise<{ status: number; body: unknown }>;
  list(req: AuthedRequest): Promise<{ status: number; body: unknown }>;
  undo(req: AuthedRequest): Promise<{ status: number; body: unknown }>;
}

export function createImportsController(
  service: CsvImportService,
): ImportsController {
  return {
    async preview(req) {
      const typed = req as UploadedFileRequest;
      const body = PreviewImportBody.parse(typed.body);
      if (!typed.file) {
        throw new ValidationError("Missing 'file' upload");
      }
      // Cheap sanity check — an empty CSV body would break parsing later.
      if (typed.file.size === 0) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Uploaded file is empty');
      }

      const result = await service.preview(
        typed.user.id,
        body.accountId,
        typed.file.buffer,
      );

      return {
        status: 200,
        body: {
          data: {
            detectedColumns: result.detectedColumns,
            rows: result.rows,
            previewToken: result.previewToken,
            expiresInSec: result.expiresInSec,
          },
        },
      };
    },

    async commit(req, ctx) {
      const body = CommitImportBody.parse(req.body);
      const result = await service.commit(req.user.id, body, ctx?.client);
      return { status: 201, body: { data: result } };
    },

    async list(req) {
      const query = ListImportsQuery.parse(req.query);
      const batches = await service.list(req.user.id, query);
      return { status: 200, body: { data: batches } };
    },

    async undo(req) {
      const result = await service.undo(req.user.id, req.params.id!);
      return { status: 200, body: { data: result } };
    },
  };
}
