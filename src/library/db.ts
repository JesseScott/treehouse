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
  /** ISO timestamp of the last sync that changed the tree; absent until the first one. */
  syncedAt?: string;
  /** How the tree was last looked at, restored when it is opened again; absent until then. */
  view?: ImportView;
}

/** The camera, as remembered for an import. */
export interface CameraView {
  lng: number;
  lat: number;
  zoom: number;
  projection: 'globe' | 'mercator';
}

/** What the app remembers about how an import was being looked at. Ids and numbers only. */
export interface ImportView {
  focusedPersonId: string | null;
  camera: CameraView | null;
  threads: { lineage: boolean; family: boolean; ancestors: boolean; migration: boolean };
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
  /** A File System Access handle to the file an import came from, by import id (Chromium). */
  handles: { key: string; value: FileSystemFileHandle };
}

export const DB_NAME = 'treehouse';

let connection: Promise<IDBPDatabase<TreehouseDb>> | undefined;

function db(): Promise<IDBPDatabase<TreehouseDb>> {
  connection ??= openDB<TreehouseDb>(DB_NAME, 3, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) {
        database.createObjectStore('imports', { keyPath: 'id' }).createIndex('hash', 'hash');
        database.createObjectStore('trees');
      }
      // Version 2 (M2): pins and online lookups.
      if (oldVersion < 2) database.createObjectStore('places', { keyPath: 'key' });
      // Version 3 (M5): file handles, so an import can be synced from its file again.
      if (oldVersion < 3) database.createObjectStore('handles');
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

export async function getImport(id: string): Promise<ImportRecord | undefined> {
  return (await db()).get('imports', id);
}

export async function loadTree(id: string): Promise<Tree | undefined> {
  return (await db()).get('trees', id);
}

/** Changes the name, home person or view of an import. Returns the updated record, if any. */
export async function updateImport(
  id: string,
  patch: Partial<Pick<ImportRecord, 'name' | 'rootId' | 'view'>>,
): Promise<ImportRecord | undefined> {
  const tx = (await db()).transaction('imports', 'readwrite');
  const current = await tx.store.get(id);
  if (!current) return undefined;
  const updated = { ...current, ...patch };
  await Promise.all([tx.store.put(updated), tx.done]);
  return updated;
}

export async function deleteImport(id: string): Promise<void> {
  const tx = (await db()).transaction(['imports', 'trees', 'handles'], 'readwrite');
  await Promise.all([
    tx.objectStore('imports').delete(id),
    tx.objectStore('trees').delete(id),
    tx.objectStore('handles').delete(id),
    tx.done,
  ]);
}

/** Remembers the file an import came from. False when the handle cannot be stored. */
export async function saveFileHandle(id: string, handle: FileSystemFileHandle): Promise<boolean> {
  try {
    await (await db()).put('handles', handle, id);
    return true;
  } catch {
    return false;
  }
}

export async function loadFileHandle(id: string): Promise<FileSystemFileHandle | undefined> {
  return (await db()).get('handles', id);
}

/** The ids of the imports whose file is remembered. */
export async function listFileHandleIds(): Promise<string[]> {
  return (await db()).getAllKeys('handles');
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

/** Stores several places in one transaction. */
export async function savePlaces(places: StoredPlace[]): Promise<void> {
  const tx = (await db()).transaction('places', 'readwrite');
  await Promise.all([...places.map((place) => tx.store.put(place)), tx.done]);
}

/** Closes the connection so a test can start from a fresh database. */
export async function closeDb(): Promise<void> {
  (await connection)?.close();
  connection = undefined;
}
