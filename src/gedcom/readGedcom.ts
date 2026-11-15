import { unzipSync } from 'fflate';
import { parseGedcom } from './parse';
import type { Tree } from './types';

/** Why a file could not be imported. Fixed codes; the wording lives in the UI. */
export type ImportErrorCode = 'empty' | 'not-gedcom' | 'bad-zip' | 'no-gedcom-in-zip' | 'unknown';

export class ImportError extends Error {
  constructor(readonly code: ImportErrorCode) {
    super(code);
    this.name = 'ImportError';
  }
}

export interface ReadResult {
  tree: Tree;
  /** SHA-256 of the GEDCOM bytes (after unzipping), as hex. Identifies this exact file. */
  hash: string;
  /** The `.ged` file's own name: the entry inside a zip, or the file itself. */
  gedcomFileName: string;
}

const isZip = (bytes: Uint8Array) => bytes[0] === 0x50 && bytes[1] === 0x4b;

/** Finds the GEDCOM inside a zip export (the largest `.ged`, if there are several). */
function unzipGedcom(bytes: Uint8Array): { name: string; bytes: Uint8Array } {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes, { filter: (file) => /\.(ged|gedcom)$/i.test(file.name) });
  } catch {
    throw new ImportError('bad-zip');
  }
  const found = Object.entries(entries).sort((a, b) => b[1].length - a[1].length)[0];
  if (!found) throw new ImportError('no-gedcom-in-zip');
  return { name: found[0].split('/').pop() ?? found[0], bytes: found[1] };
}

/** Decodes as UTF-8 unless a byte-order mark says UTF-16. */
function decode(bytes: Uint8Array): string {
  const utf16 =
    bytes[0] === 0xff && bytes[1] === 0xfe
      ? 'utf-16le'
      : bytes[0] === 0xfe && bytes[1] === 0xff
        ? 'utf-16be'
        : null;
  return new TextDecoder(utf16 ?? 'utf-8').decode(bytes);
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Reads a `.ged` file, or a `.zip` holding one, into a tree. Runs in the import
 * worker; kept free of worker and DOM APIs so it can be unit-tested directly.
 */
export async function readGedcom(input: Uint8Array, fileName: string): Promise<ReadResult> {
  if (input.length === 0) throw new ImportError('empty');
  const file = isZip(input) ? unzipGedcom(input) : { name: fileName, bytes: input };
  if (file.bytes.length === 0) throw new ImportError('empty');

  const text = decode(file.bytes);
  // A GEDCOM file opens with a level-0 HEAD record.
  if (!/^\s*0\s+HEAD\b/i.test(text.slice(0, 200))) throw new ImportError('not-gedcom');

  return { tree: parseGedcom(text), hash: await sha256(file.bytes), gedcomFileName: file.name };
}
