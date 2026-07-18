import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { once } from 'node:events';
import { Readable } from 'node:stream';
import { createGunzip, createGzip } from 'node:zlib';

const TAR_BLOCK_SIZE = 512;
const ZERO_BLOCK = Buffer.alloc(TAR_BLOCK_SIZE);
const DEFAULT_MAX_EXTRACTED_BYTES = 5 * 1024 * 1024 * 1024;

function writeString(buffer, offset, length, value) {
  Buffer.from(String(value), 'utf8').copy(buffer, offset, 0, length);
}

function writeOctal(buffer, offset, length, value) {
  const text = Math.trunc(Number(value) || 0).toString(8).padStart(length - 1, '0');
  writeString(buffer, offset, length, `${text.slice(-(length - 1))}\0`);
}

function splitTarPath(name) {
  if (Buffer.byteLength(name) <= 100) return { name, prefix: '' };
  const parts = name.split('/');
  for (let index = parts.length - 1; index > 0; index -= 1) {
    const prefix = parts.slice(0, index).join('/');
    const fileName = parts.slice(index).join('/');
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(fileName) <= 100) {
      return { name: fileName, prefix };
    }
  }
  throw new Error(`Tar path is too long: ${name}`);
}

function tarHeader({ name, size = 0, mode = 0o600, mtime = Date.now(), type = '0' }) {
  const header = Buffer.alloc(TAR_BLOCK_SIZE);
  const split = splitTarPath(name);
  writeString(header, 0, 100, split.name);
  writeOctal(header, 100, 8, mode);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, Math.floor(new Date(mtime).getTime() / 1000));
  header.fill(0x20, 148, 156);
  writeString(header, 156, 1, type);
  writeString(header, 257, 6, 'ustar');
  writeString(header, 263, 2, '00');
  writeString(header, 345, 155, split.prefix);
  const checksum = [...header].reduce((sum, byte) => sum + byte, 0);
  const checksumText = checksum.toString(8).padStart(6, '0').slice(-6);
  writeString(header, 148, 6, checksumText);
  header[154] = 0;
  header[155] = 0x20;
  return header;
}

function tarPadding(size) {
  const remainder = size % TAR_BLOCK_SIZE;
  return remainder === 0 ? null : Buffer.alloc(TAR_BLOCK_SIZE - remainder);
}

async function* tarDirectoryEntries(rootDirectory, archiveRoot, relativePath = '') {
  const currentDirectory = path.join(rootDirectory, relativePath);
  const entries = (await readdir(currentDirectory, { withFileTypes: true }))
    .filter((entry) => !entry.isSymbolicLink())
    .sort((left, right) => left.name.localeCompare(right.name));

  if (!relativePath) {
    yield tarHeader({ name: `${archiveRoot}/`, mode: 0o700, type: '5' });
  }

  for (const entry of entries) {
    const entryRelativePath = path.join(relativePath, entry.name);
    const archivePath = `${archiveRoot}/${entryRelativePath.replaceAll(path.sep, '/')}`;
    const sourcePath = path.join(rootDirectory, entryRelativePath);
    const stats = await stat(sourcePath);

    if (stats.isDirectory()) {
      yield tarHeader({ name: `${archivePath}/`, mode: stats.mode & 0o777, mtime: stats.mtime, type: '5' });
      yield* tarDirectoryEntries(rootDirectory, archiveRoot, entryRelativePath);
      continue;
    }

    if (!stats.isFile()) continue;
    yield tarHeader({
      name: archivePath,
      size: stats.size,
      mode: stats.mode & 0o777,
      mtime: stats.mtime,
      type: '0',
    });
    for await (const chunk of createReadStream(sourcePath)) yield chunk;
    const padding = tarPadding(stats.size);
    if (padding) yield padding;
  }

  if (!relativePath) {
    yield ZERO_BLOCK;
    yield ZERO_BLOCK;
  }
}

export function createBackupArchiveStream(directory, backupName) {
  return Readable.from(tarDirectoryEntries(directory, backupName)).pipe(createGzip());
}

function parseTarString(buffer, start, length) {
  const slice = buffer.subarray(start, start + length);
  const end = slice.indexOf(0);
  return slice.subarray(0, end === -1 ? slice.length : end).toString('utf8');
}

function parseTarNumber(buffer, start, length) {
  const text = parseTarString(buffer, start, length).trim();
  return text ? Number.parseInt(text, 8) : 0;
}

function normalizeEntryPath(value) {
  const normalized = String(value || '').replaceAll('\\', '/').replace(/^\.\/+/, '').replace(/^\/+/, '');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length === 0 || parts.some((part) => part === '..' || part.includes('\0'))) {
    throw new Error('Backup archive contains an unsafe path.');
  }
  return parts;
}

function safeExtractPath(targetDirectory, relativePath) {
  const target = path.resolve(targetDirectory, relativePath);
  const root = path.resolve(targetDirectory);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error('Backup archive path escapes the upload directory.');
  }
  return target;
}

async function writeChunk(stream, chunk) {
  if (!stream.write(chunk)) await once(stream, 'drain');
}

function stripArchiveExtension(filename) {
  const base = path.basename(String(filename || 'uploaded-backup.tar.gz'));
  return base.replace(/\.tar\.gz$/i, '').replace(/\.tgz$/i, '') || 'uploaded-backup';
}

export async function extractBackupArchive({
  source,
  targetDirectory,
  fallbackName,
  backupNameAllowed,
  maxExtractedBytes = DEFAULT_MAX_EXTRACTED_BYTES,
}) {
  await mkdir(targetDirectory, { recursive: true, mode: 0o700 });
  const stream = source.pipe(createGunzip());
  const iterator = stream[Symbol.asyncIterator]();
  let buffer = Buffer.alloc(0);
  let extractedBytes = 0;
  let archiveRoot = null;
  let sawEntry = false;
  const fallbackRoot = stripArchiveExtension(fallbackName);

  async function readMore() {
    const next = await iterator.next();
    if (next.done) return false;
    extractedBytes += next.value.length;
    if (extractedBytes > maxExtractedBytes) {
      throw new Error('Backup archive is too large.');
    }
    buffer = buffer.length === 0 ? next.value : Buffer.concat([buffer, next.value]);
    return true;
  }

  async function readExact(size) {
    while (buffer.length < size) {
      if (!await readMore()) throw new Error('Backup archive ended unexpectedly.');
    }
    const result = buffer.subarray(0, size);
    buffer = buffer.subarray(size);
    return result;
  }

  async function discard(size) {
    let remaining = size;
    while (remaining > 0) {
      if (buffer.length === 0 && !await readMore()) throw new Error('Backup archive ended unexpectedly.');
      const take = Math.min(buffer.length, remaining);
      buffer = buffer.subarray(take);
      remaining -= take;
    }
  }

  async function writeFileContents(filePath, size) {
    await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
    const output = createWriteStream(filePath, { mode: 0o600 });
    let remaining = size;
    try {
      while (remaining > 0) {
        if (buffer.length === 0 && !await readMore()) throw new Error('Backup archive ended unexpectedly.');
        const take = Math.min(buffer.length, remaining);
        await writeChunk(output, buffer.subarray(0, take));
        buffer = buffer.subarray(take);
        remaining -= take;
      }
    } catch (error) {
      output.destroy(error);
      throw error;
    }
    output.end();
    await once(output, 'finish');
  }

  function resolveRelativePath(parts, type) {
    if (!archiveRoot) {
      archiveRoot = parts.length > 1 || type === '5' ? parts[0] : fallbackRoot;
      if (!backupNameAllowed(archiveRoot)) throw new Error('Backup archive root name is invalid.');
    }
    if (parts[0] === archiveRoot) return parts.slice(1).join('/');
    if (archiveRoot === fallbackRoot) return parts.join('/');
    throw new Error('Backup archive contains multiple root directories.');
  }

  while (true) {
    const header = await readExact(TAR_BLOCK_SIZE);
    if (header.every((byte) => byte === 0)) {
      break;
    }
    sawEntry = true;
    const name = parseTarString(header, 0, 100);
    const prefix = parseTarString(header, 345, 155);
    const entryPath = prefix ? `${prefix}/${name}` : name;
    const size = parseTarNumber(header, 124, 12);
    const type = parseTarString(header, 156, 1) || '0';
    const parts = normalizeEntryPath(entryPath);
    const relativePath = resolveRelativePath(parts, type);

    if (!relativePath) {
      await discard(size + ((TAR_BLOCK_SIZE - (size % TAR_BLOCK_SIZE)) % TAR_BLOCK_SIZE));
      continue;
    }

    const targetPath = safeExtractPath(targetDirectory, relativePath);
    if (type === '5') {
      await mkdir(targetPath, { recursive: true, mode: 0o700 });
    } else if (type === '0' || type === '') {
      await writeFileContents(targetPath, size);
    } else {
      throw new Error('Backup archive contains an unsupported entry type.');
    }
    const paddingSize = (TAR_BLOCK_SIZE - (size % TAR_BLOCK_SIZE)) % TAR_BLOCK_SIZE;
    if (paddingSize) await discard(paddingSize);
  }

  if (!sawEntry) throw new Error('Backup archive is empty.');
  return { backupName: archiveRoot };
}
