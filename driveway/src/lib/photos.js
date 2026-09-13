import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import multer from 'multer';
import { config } from '../config.js';
import { badRequest } from './errors.js';

/** Uploads are held in memory, validated, then written out by sharp. */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.photo.maxBytes, files: config.photo.maxPerListing },
  fileFilter(_req, file, cb) {
    if (!/^image\/(jpe?g|png|webp|avif|heic|heif)$/i.test(file.mimetype)) {
      return cb(badRequest('Photos must be JPEG, PNG, WebP or HEIC.'));
    }
    cb(null, true);
  }
});

const listingDir = (listingId) => path.join(config.uploadDir, String(listingId));

/**
 * Writes one uploaded buffer as a full-size photo plus a thumbnail.
 * Re-encoding through sharp also strips EXIF, which would otherwise leak the
 * seller's home GPS coordinates along with the car.
 */
export async function savePhoto(listingId, buffer, tag = 'other', position = 0) {
  const dir = listingDir(listingId);
  await fs.mkdir(dir, { recursive: true });

  const id = crypto.randomBytes(8).toString('hex');
  const fullName = `${id}.jpg`;
  const thumbName = `${id}_t.jpg`;

  const image = sharp(buffer, { failOn: 'error' }).rotate();
  const meta = await image.metadata();
  if (!meta.width || !meta.height) throw badRequest('That file is not a readable image.');

  const full = await image
    .clone()
    .resize({ width: config.photo.fullWidth, withoutEnlargement: true })
    .jpeg({ quality: config.photo.quality, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });

  const thumb = await image
    .clone()
    .resize({ width: config.photo.thumbWidth, withoutEnlargement: true })
    .jpeg({ quality: 78, mozjpeg: true })
    .toBuffer();

  await fs.writeFile(path.join(dir, fullName), full.data);
  await fs.writeFile(path.join(dir, thumbName), thumb);

  return {
    path: `/uploads/${listingId}/${fullName}`,
    thumbPath: `/uploads/${listingId}/${thumbName}`,
    tag,
    position,
    width: full.info.width,
    height: full.info.height
  };
}

/* ---------------- cold-start audio ---------------- */

export const AUDIO_MAX_BYTES = 4 * 1024 * 1024;

export const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: AUDIO_MAX_BYTES, files: 1 },
  fileFilter(_req, file, cb) {
    if (!/^(audio|video)\/(webm|ogg|mp4|mpeg|wav|x-wav|x-m4a|aac)$/i.test(file.mimetype)) {
      return cb(badRequest('Recordings must be WebM, OGG, MP4/M4A, MP3 or WAV.'));
    }
    cb(null, true);
  }
});

/**
 * Checks the bytes rather than the declared type. A browser can claim any
 * content-type it likes, and we serve these files back to other people.
 */
export function sniffAudio(buffer) {
  if (!buffer || buffer.length < 12) return null;
  const ascii = (start, end) => buffer.subarray(start, end).toString('latin1');

  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) return 'webm'; // EBML
  if (ascii(0, 4) === 'OggS') return 'ogg';
  if (ascii(4, 8) === 'ftyp') return 'm4a';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') return 'wav';
  if (ascii(0, 3) === 'ID3') return 'mp3';
  if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) return 'mp3'; // MPEG frame sync
  return null;
}

export async function saveAudio(listingId, buffer) {
  const ext = sniffAudio(buffer);
  if (!ext) throw badRequest('That file is not a readable audio recording.');

  const dir = listingDir(listingId);
  await fs.mkdir(dir, { recursive: true });
  const name = `audio-${crypto.randomBytes(6).toString('hex')}.${ext}`;
  await fs.writeFile(path.join(dir, name), buffer);
  return { path: `/uploads/${listingId}/${name}`, bytes: buffer.length };
}

export async function removeFile(publicPath) {
  if (!publicPath) return;
  const file = path.join(config.uploadDir, publicPath.replace(/^\/uploads\//, ''));
  await fs.rm(file, { force: true });
}

/** Removes a listing's photo directory; missing files are not an error. */
export async function removeListingPhotos(listingId) {
  await fs.rm(listingDir(listingId), { recursive: true, force: true });
}

export async function removePhotoFiles(photo) {
  const toFile = (p) => path.join(config.uploadDir, p.replace(/^\/uploads\//, ''));
  await Promise.all(
    [photo.path, photo.thumb_path].filter(Boolean).map((p) => fs.rm(toFile(p), { force: true }))
  );
}
