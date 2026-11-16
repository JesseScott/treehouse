import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Tree } from '../gedcom/types';

/** What the library remembers about one imported file. The tree itself is stored separately. */
export interface ImportRecord {
  id: string;
  /** Shown in the library; starts as the file name and can be renamed. */
  name: string;
  fileName: string;
  /** ISO timestamp. */
  importedAt: string;
  /** SHA-256 of the GEDCOM bytes: the same file is never imported twice. */
  hash: string;
  people: number;
  families: number;
  warnings: number;
  /** The "home" person the tree is viewed from; null until one is chosen. */
  rootId: string | null;
}

/**
 * A location the app could not work out from its bundled gazetteer: a pin the user set, or
 * the answer of an online lookup. Shared by every import, keyed by `placeKey` of the text.
 */
export interface StoredPlace {
  key: string;
  source: 'manual' | 'online';
  /** Null when an online lookup found nothing, so the same place is not asked about twice. */
  location: { lng: number; lat: number } | null;
  /** What the online service called the place. Empty for a pin. */
  label: string;
  /** ISO timestamp. */
  updatedAt: string;
}

interface TreehouseDb extends DBSchema {
  imports: { key: string; value: ImportRecord; indexes: { hash: string } };
  trees: { key: string; value: Tree };
  places: { key: string; value: StoredPlace };
}

export const DB_NAME = 'treehouse';

let connection: Promise<IDBPDatabase<TreehouseDb>> | undefined;

function db(): Promise<IDBPDatabase<TreehouseDb>> {
  connection ??= openDB<TreehouseDb>(DB_NAME, 2, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) {
        database.createObjectStore('imports', { keyPath: 'id' }).createIndex('hash', 'hash');
        database.createObjectStore('trees');
      }
      // Version 2 (M2): pins and online lookups.
      if (oldVersion < 2) database.createObjectStore('places', { keyPath: 'key' });
    },
  });
  return connection;
}

/** Every import, newest first. */
export async function listImports(): Promise<ImportRecord[]> {
  const records = await (await db()).getAll('imports');
  return records.sort((a, b) => b.importedAt.localeCompare(a.importedAt));
}

export async function findImportByHash(hash: string): Promise<ImportRecord | undefined> {
  return (await db()).getFromIndex('imports', 'hash', hash);
}

/** Stores a record and its tree together, or neither. */
export async function saveImport(record: ImportRecord, tree: Tree): Promise<void> {
  const tx = (await db()).transaction(['imports', 'trees'], 'readwrite');
  await Promise.all([
    tx.objectStore('imports').put(record),
    tx.objectStore('trees').put(tree, record.id),
    tx.done,
  ]);
}

export async function loadTree(id: string): Promise<Tree | undefined> {
  return (await db()).get('trees', id);
}

/** Changes the name or home person of an import. Returns the updated record, if it exists. */
export async function updateImport(
  id: string,
  patch: Partial<Pick<ImportRecord, 'name' | 'rootId'>>,
): Promise<ImportRecord | undefined> {
  const tx = (await db()).transaction('imports', 'readwrite');
  const current = await tx.store.get(id);
  if (!current) return undefined;
  const updated = { ...current, ...patch };
  await Promise.all([tx.store.put(updated), tx.done]);
  return updated;
}

export async function deleteImport(id: string): Promise<void> {
  const tx = (await db()).transaction(['imports', 'trees'], 'readwrite');
  await Promise.all([
    tx.objectStore('imports').delete(id),
    tx.objectStore('trees').delete(id),
    tx.done,
  ]);
}

/** Every pin and online lookup, for all imports. */
export async function listPlaces(): Promise<StoredPlace[]> {
  return (await db()).getAll('places');
}

export async function savePlace(place: StoredPlace): Promise<void> {
  await (await db()).put('places', place);
}

export async function deletePlace(key: string): Promise<void> {
  await (await db()).delete('places', key);
}

/** Closes the connection so a test can start from a fresh database. */
export async function closeDb(): Promise<void> {
  (await connection)?.close();
  connection = undefined;
}
