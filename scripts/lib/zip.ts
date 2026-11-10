import { inflateRawSync } from 'node:zlib';

/**
 * Minimal ZIP reader for the GTFS feed.
 *
 * Node has no built-in archive API, and the alternative — adding a dependency
 * used by exactly one build script — is not worth it for a format this simple:
 * GTFS archives are flat collections of stored or deflated text files. This
 * reads the central directory and inflates the entries by name.
 *
 * Supported: stored (method 0) and deflate (method 8), which is everything a
 * GTFS feed uses. Encrypted and ZIP64 archives are rejected explicitly rather
 * than mis-parsed.
 */

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_FILE_HEADER = 0x02014b50;
const ZIP64_END_LOCATOR = 0x07064b50;

export interface ZipEntry {
  readonly name: string;
  readonly compressionMethod: number;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly localHeaderOffset: number;
  readonly flags: number;
}

/** Locate the end-of-central-directory record, scanning back over any comment. */
function findEndRecord(buffer: Buffer): number {
  // The record is 22 bytes plus a comment of up to 65,535 bytes.
  const minOffset = Math.max(0, buffer.length - 22 - 0xffff);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY) return offset;
  }
  throw new Error('Not a ZIP archive: no end-of-central-directory record.');
}

export function readZipEntries(buffer: Buffer): Map<string, ZipEntry> {
  const endOffset = findEndRecord(buffer);

  // A ZIP64 locator immediately before the end record means the offsets we read
  // below may be truncated sentinels, so refuse rather than read garbage.
  if (
    endOffset >= 20 &&
    buffer.readUInt32LE(endOffset - 20) === ZIP64_END_LOCATOR
  ) {
    throw new Error('ZIP64 archives are not supported by this reader.');
  }

  const entryCount = buffer.readUInt16LE(endOffset + 10);
  let cursor = buffer.readUInt32LE(endOffset + 16);
  const entries = new Map<string, ZipEntry>();

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(cursor) !== CENTRAL_FILE_HEADER) {
      throw new Error(`Corrupt central directory at entry ${index}.`);
    }

    const flags = buffer.readUInt16LE(cursor + 8);
    const compressionMethod = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer
      .subarray(cursor + 46, cursor + 46 + nameLength)
      .toString('utf8');

    entries.set(name, {
      name,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
      flags,
    });

    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

/** Inflate one entry to a UTF-8 string. */
export function readZipFile(buffer: Buffer, entry: ZipEntry): string {
  // Bit 0 of the general-purpose flags marks an encrypted entry.
  if ((entry.flags & 0x1) !== 0) {
    throw new Error(`Entry ${entry.name} is encrypted.`);
  }

  const headerOffset = entry.localHeaderOffset;
  if (buffer.readUInt32LE(headerOffset) !== 0x04034b50) {
    throw new Error(`Entry ${entry.name} has no local file header.`);
  }

  // The local header repeats the name and extra fields, whose lengths can
  // differ from the central directory's, so they are re-read here.
  const nameLength = buffer.readUInt16LE(headerOffset + 26);
  const extraLength = buffer.readUInt16LE(headerOffset + 28);
  const dataStart = headerOffset + 30 + nameLength + extraLength;
  const data = buffer.subarray(dataStart, dataStart + entry.compressedSize);

  if (entry.compressionMethod === 0) return data.toString('utf8');
  if (entry.compressionMethod === 8) return inflateRawSync(data).toString('utf8');

  throw new Error(
    `Entry ${entry.name} uses unsupported compression method ${entry.compressionMethod}.`,
  );
}
