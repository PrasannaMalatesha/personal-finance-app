import type { RequestHandler } from 'express';
import multer, { MulterError } from 'multer';
import { AppError } from '../errors/AppError';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB — TRD non-functional; caps memory/parse cost

const ACCEPTED_MIME = new Set([
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel', // Excel exports save CSV as this in some browsers
  'text/plain',
  'application/octet-stream',
]);

class PayloadTooLargeError extends AppError {
  constructor(limitBytes: number) {
    super(
      413,
      'PAYLOAD_TOO_LARGE',
      `Upload exceeds max size of ${Math.floor(limitBytes / 1024 / 1024)} MB`,
    );
  }
}

class UnsupportedMediaTypeError extends AppError {
  constructor() {
    super(
      415,
      'UNSUPPORTED_MEDIA_TYPE',
      'Only CSV files are supported',
    );
  }
}

const uploader = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const mimeOk =
      ACCEPTED_MIME.has(file.mimetype) ||
      /\.csv$/i.test(file.originalname);
    if (!mimeOk) {
      cb(new UnsupportedMediaTypeError());
      return;
    }
    cb(null, true);
  },
});

/**
 * Accepts a single 'file' field in multipart/form-data.
 * Adapts multer's error taxonomy to AppError codes so the central
 * errorHandler serializes them uniformly.
 */
export function uploadSingleCsv(fieldName = 'file'): RequestHandler {
  const mw = uploader.single(fieldName) as unknown as RequestHandler;
  const uploadMiddleware: RequestHandler = (req, res, next) => {
    mw(req, res, (err?: unknown) => {
      if (!err) {
        next();
        return;
      }
      if (err instanceof MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          next(new PayloadTooLargeError(MAX_UPLOAD_BYTES));
          return;
        }
        next(new AppError(400, 'VALIDATION_ERROR', `Upload failed: ${err.message}`));
        return;
      }
      next(err instanceof Error ? err : new Error('Upload failed'));
    });
  };
  return uploadMiddleware;
}
