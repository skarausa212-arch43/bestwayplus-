/**
 * Upload validation. The declared content type is a claim, not a fact — it is
 * used to bind the presigned URL, and the worker re-checks the magic bytes
 * after the object lands.
 */

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB

export const ALLOWED_MIME = {
  'application/pdf': ['pdf'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/heic': ['heic'],
  'image/heif': ['heif'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
} as const;

export type AllowedMime = keyof typeof ALLOWED_MIME;

/** Magic-byte prefixes, checked in the worker against the stored object. */
export const MAGIC: Array<{ mime: AllowedMime; bytes: number[]; offset?: number }> = [
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] },              // %PDF
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/heic', bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 },        // ftyp
  { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    bytes: [0x50, 0x4b, 0x03, 0x04] },                                       // zip
];

export function isAllowedMime(value: string): value is AllowedMime {
  return Object.prototype.hasOwnProperty.call(ALLOWED_MIME, value);
}

export function assertUploadable(mimeType: string, sizeBytes: number): asserts mimeType is AllowedMime {
  if (!isAllowedMime(mimeType)) {
    const error = new Error('Unsupported file type') as Error & { code: string; messageKey: string };
    error.code = 'UNSUPPORTED_MEDIA_TYPE';
    error.messageKey = 'validation.fileType';
    throw error;
  }
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_UPLOAD_BYTES) {
    const error = new Error('File too large') as Error & { code: string; messageKey: string };
    error.code = 'PAYLOAD_TOO_LARGE';
    error.messageKey = 'validation.fileTooLarge';
    throw error;
  }
}

export function matchesMagic(head: Uint8Array, mime: AllowedMime): boolean {
  return MAGIC.filter((m) => m.mime === mime).some(({ bytes, offset = 0 }) =>
    bytes.every((b, i) => head[offset + i] === b),
  );
}
