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
