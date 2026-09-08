import { randomUUID } from 'node:crypto';
import { S3Client, HeadObjectCommand, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { MAX_UPLOAD_BYTES, type AllowedMime } from './mime';

const UPLOAD_URL_TTL_SECONDS = 5 * 60;
const DOWNLOAD_URL_TTL_SECONDS = 60;

let client: S3Client | null = null;

function s3(): S3Client {
  if (client) return client;
  client = new S3Client({
    region: process.env.S3_REGION!,
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: Boolean(process.env.S3_ENDPOINT),
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    },
  });
  return client;
}

const bucket = () => process.env.S3_BUCKET!;

/**
 * Opaque object key. Two random UUIDs, no filename, no user id, no document
 * type — enumeration reveals nothing and a leaked key is useless unsigned.
 */
export function newStorageKey(): string {
  return `${randomUUID()}/${randomUUID()}`;
}

/**
 * A presigned PUT bound to the declared content type and length. The browser
 * uploads straight to storage; document bytes never reach the application.
 */
export async function createUploadUrl(params: {
  storageKey: string;
  mimeType: AllowedMime;
  sizeBytes: number;
}): Promise<{ url: string; expiresInSeconds: number; requiredHeaders: Record<string, string> }> {
  if (params.sizeBytes > MAX_UPLOAD_BYTES) throw new Error('size exceeds limit');

  const command = new PutObjectCommand({
    Bucket: bucket(),
    Key: params.storageKey,
    ContentType: params.mimeType,
    ContentLength: params.sizeBytes,
    ServerSideEncryption: process.env.S3_KMS_KEY_ID ? 'aws:kms' : 'AES256',
    SSEKMSKeyId: process.env.S3_KMS_KEY_ID,
  });

  const url = await getSignedUrl(s3(), command, {
    expiresIn: UPLOAD_URL_TTL_SECONDS,
    signableHeaders: new Set(['content-type', 'content-length']),
  });

  return {
    url,
    expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
    requiredHeaders: {
      'Content-Type': params.mimeType,
      'Content-Length': String(params.sizeBytes),
    },
  };
}

/**
 * A 60-second GET that forces an attachment disposition, so a crafted SVG or
 * HTML document cannot execute against our origin.
 */
export async function createDownloadUrl(params: {
  storageKey: string;
  downloadName: string;
  mimeType: string;
}): Promise<{ url: string; expiresInSeconds: number }> {
  const safeName = params.downloadName.replace(/[^\w.\-() ]+/g, '_').slice(0, 120);

  const command = new GetObjectCommand({
    Bucket: bucket(),
    Key: params.storageKey,
    ResponseContentDisposition: `attachment; filename="${safeName}"`,
    ResponseContentType: params.mimeType,
  });

  const url = await getSignedUrl(s3(), command, { expiresIn: DOWNLOAD_URL_TTL_SECONDS });
  return { url, expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS };
}

/** Confirms the object landed and matches what was declared. */
export async function headObject(storageKey: string) {
  const out = await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: storageKey }));
  return { sizeBytes: out.ContentLength ?? 0, mimeType: out.ContentType ?? 'application/octet-stream' };
}

export async function deleteObject(storageKey: string): Promise<void> {
  await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: storageKey }));
}
