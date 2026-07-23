import type { Request } from 'express';
import type { CsvImportService } from '../services/csvImport.service';
import { PreviewImportBody } from '../schemas/imports';
import type { AuthedRequest } from '../lib/handler';
import { AppError, ValidationError } from '../errors/AppError';

// Extend AuthedRequest with the file multer attaches.
type UploadedFileRequest = AuthedRequest & { file?: Express.Multer.File };

export interface ImportsController {
  preview(req: Request): Promise<{ status: number; body: unknown }>;
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
  };
}
