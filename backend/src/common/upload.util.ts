import { BadRequestException } from '@nestjs/common';
import { extname } from 'path';

export const MB = 1024 * 1024;

// Multer fileFilter that only accepts the given extensions (lowercase, with dot).
// Extension check rather than mimetype: browsers report inconsistent mimetypes
// for CSV/XLSX, and the extension is what our importers dispatch on anyway.
export function extensionFilter(allowed: string[]) {
  return (
    _req: unknown,
    file: Express.Multer.File,
    cb: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    const ext = extname(file.originalname ?? '').toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new BadRequestException(`File type ${ext || '(none)'} not allowed — expected ${allowed.join(', ')}`), false);
    }
  };
}
