/**
 * Combines thin Mach-O binaries into one universal ("fat") binary.
 *
 * This is what `lipo -create` does, written out because lipo only exists on
 * macOS and the release is built on Linux. The alternative — shipping separate
 * Intel and Apple Silicon apps — pushes a choice onto the user that the format
 * was designed to remove.
 *
 * The fat container is a big-endian header followed by the untouched thin
 * files, each aligned to 2^14. Nothing inside a slice is rewritten.
 */
import { readFile, writeFile } from 'node:fs/promises';

const FAT_MAGIC = 0xcafebabe;
const MH_MAGIC_64 = 0xfeedfacf;
const ALIGN_POW = 14; // 16 KiB, what the Apple toolchain uses for arm64
const ALIGN = 1 << ALIGN_POW;

/** cputype/cpusubtype are read from each slice rather than assumed, so a
 *  mislabelled input fails loudly instead of producing a broken binary. */
function readThinHeader(buf, label) {
  if (buf.length < 16) throw new Error(`${label}: too small to be Mach-O`);
  const magic = buf.readUInt32LE(0);
  if (magic !== MH_MAGIC_64) {
    throw new Error(
      `${label}: not a little-endian 64-bit Mach-O (magic 0x${magic.toString(16)})`
    );
  }
  return { cpuType: buf.readUInt32LE(4), cpuSubType: buf.readUInt32LE(8) };
}

export async function makeUniversal(inputs, outPath) {
  if (inputs.length < 2) throw new Error('makeUniversal needs at least two slices');

  const slices = [];
  for (const path of inputs) {
    const data = await readFile(path);
    slices.push({ path, data, ...readThinHeader(data, path) });
  }

  const seen = new Set();
  for (const s of slices) {
    const key = `${s.cpuType}/${s.cpuSubType}`;
    if (seen.has(key)) throw new Error(`two slices share architecture ${key}`);
    seen.add(key);
  }

  // Header: magic + count, then 5 words per arch.
  const headerSize = 8 + slices.length * 20;
  let offset = Math.ceil(headerSize / ALIGN) * ALIGN;
  for (const s of slices) {
    s.offset = offset;
    offset += Math.ceil(s.data.length / ALIGN) * ALIGN;
  }

  const out = Buffer.alloc(offset, 0);
  out.writeUInt32BE(FAT_MAGIC, 0);
  out.writeUInt32BE(slices.length, 4);
  slices.forEach((s, i) => {
    const at = 8 + i * 20;
    out.writeUInt32BE(s.cpuType, at);
    out.writeUInt32BE(s.cpuSubType, at + 4);
    out.writeUInt32BE(s.offset, at + 8);
    out.writeUInt32BE(s.data.length, at + 12);
    out.writeUInt32BE(ALIGN_POW, at + 16);
    s.data.copy(out, s.offset);
  });

  await writeFile(outPath, out);
  return { path: outPath, size: out.length, slices: slices.length };
}

/** Human-readable architecture names, for build output. */
export const CPU_NAMES = {
  0x01000007: 'x86_64',
  0x0100000c: 'arm64',
};
