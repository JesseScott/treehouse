import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseGedcom } from '../gedcom/parse';
import {
  closeDb,
  DB_NAME,
  deleteImport,
  deletePlace,
  findImportByHash,
  getImport,
  listFileHandleIds,
  loadFileHandle,
  saveFileHandle,
  savePlaces,
  listImports,
  listPlaces,
  loadTree,
  saveImport,
  savePlace,
  updateImport,
  type ImportRecord,
  type StoredPlace,
} from './db';

const tree = parseGedcom(
  ['0 HEAD', '0 @I1@ INDI', '1 NAME Rowan /Testfold/', '1 BIRT', '2 DATE 1986'].join('\n'),
);

const record = (id: string, importedAt: string, hash = `hash-${id}`): ImportRecord => ({
  id,
  name: `Tree ${id}`,
  fileName: `${id}.ged`,
  importedAt,
  hash,
  people: 1,
  families: 0,
  warnings: 0,
  rootId: null,
});

beforeEach(async () => {
  await closeDb();
  globalThis.indexedDB = new IDBFactory();
});

describe('library database', () => {
  it('starts empty', async () => {
    expect(await listImports()).toEqual([]);
    expect(await loadTree('missing')).toBeUndefined();
    expect(await findImportByHash('nothing')).toBeUndefined();
  });

  it('stores an import with its tree and lists newest first', async () => {
    await saveImport(record('a', '2026-11-01T10:00:00.000Z'), tree);
    await saveImport(record('b', '2026-11-03T10:00:00.000Z'), tree);
    await saveImport(record('c', '2026-11-02T10:00:00.000Z'), tree);

    expect((await listImports()).map((r) => r.id)).toEqual(['b', 'c', 'a']);
    // The tree comes back as it went in, parsed dates included.
    expect(await loadTree('a')).toEqual(tree);
  });

  it('survives closing and reopening the database', async () => {
    await saveImport(record('a', '2026-11-01T10:00:00.000Z'), tree);
    await closeDb();
    expect((await listImports()).map((r) => r.id)).toEqual(['a']);
    expect((await loadTree('a'))?.people[0]?.name).toBe('Rowan Testfold');
  });

  it('finds an import by the hash of its file', async () => {
    await saveImport(record('a', '2026-11-01T10:00:00.000Z', 'abc'), tree);
    expect((await findImportByHash('abc'))?.id).toBe('a');
    expect(await findImportByHash('abd')).toBeUndefined();
  });

  it('renames an import and sets its home person without touching the rest', async () => {
    const original = record('a', '2026-11-01T10:00:00.000Z');
    await saveImport(original, tree);

    expect(await updateImport('a', { name: 'My side' })).toEqual({ ...original, name: 'My side' });
    expect(await updateImport('a', { rootId: '@I1@' })).toEqual({
      ...original,
      name: 'My side',
      rootId: '@I1@',
    });
    expect((await listImports())[0]).toMatchObject({ name: 'My side', rootId: '@I1@' });
    expect(await updateImport('missing', { name: 'x' })).toBeUndefined();
  });

  it('remembers how an import was looked at, and reads one record by id', async () => {
    await saveImport(record('a', '2026-11-01T10:00:00.000Z'), tree);
    expect((await getImport('a'))?.view).toBeUndefined();
    const view = {
      focusedPersonId: '@I1@',
      camera: { lng: -4.2, lat: 57.5, zoom: 6, projection: 'mercator' as const },
      threads: { lineage: true, family: true, ancestors: false, migration: false },
    };
    await updateImport('a', { view });
    await closeDb();
    expect((await getImport('a'))?.view).toEqual(view);
    expect(await getImport('missing')).toBeUndefined();
  });

  it('deletes an import together with its tree', async () => {
    await saveImport(record('a', '2026-11-01T10:00:00.000Z'), tree);
    await saveImport(record('b', '2026-11-02T10:00:00.000Z'), tree);
    await deleteImport('a');

    expect((await listImports()).map((r) => r.id)).toEqual(['b']);
    expect(await loadTree('a')).toBeUndefined();
    expect(await loadTree('b')).toEqual(tree);
  });
});

describe('upgrading', () => {
  it('keeps imports, trees and pins from a version 2 library', async () => {
    // A library as M2 to M4 left it: no handles store, records without a view.
    const old = await openDB(DB_NAME, 2, {
      upgrade(database) {
        database.createObjectStore('imports', { keyPath: 'id' }).createIndex('hash', 'hash');
        database.createObjectStore('trees');
        database.createObjectStore('places', { keyPath: 'key' });
      },
    });
    await old.put('imports', record('a', '2026-11-01T10:00:00.000Z'));
    await old.put('trees', tree, 'a');
    await old.put('places', {
      key: 'elmford',
      source: 'manual',
      location: null,
      label: '',
      updatedAt: '',
    });
    old.close();

    expect((await listImports()).map((r) => r.id)).toEqual(['a']);
    expect(await loadTree('a')).toEqual(tree);
    expect(await listPlaces()).toHaveLength(1);
    expect(await listFileHandleIds()).toEqual([]);
  });
});

describe('file handles', () => {
  it('keeps one per import and forgets it with the import', async () => {
    await saveImport(record('a', '2026-11-01T10:00:00.000Z'), tree);
    // fake-indexeddb clones values as browsers do; a plain object stands in for a handle.
    const handle = { kind: 'file', name: 'a.ged' } as unknown as FileSystemFileHandle;
    expect(await saveFileHandle('a', handle)).toBe(true);
    expect(await listFileHandleIds()).toEqual(['a']);
    expect(await loadFileHandle('a')).toEqual(handle);

    // A value the browser cannot store is refused quietly.
    const unclonable = { getFile: () => null } as unknown as FileSystemFileHandle;
    expect(await saveFileHandle('b', unclonable)).toBe(false);

    await deleteImport('a');
    expect(await loadFileHandle('a')).toBeUndefined();
    expect(await listFileHandleIds()).toEqual([]);
  });
});

describe('stored places', () => {
  const pin: StoredPlace = {
    key: 'elmford, northmark',
    source: 'manual',
    location: { lng: 10.1, lat: 12.1 },
    label: '',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  it('keeps pins and online answers, one per place, apart from the imports', async () => {
    expect(await listPlaces()).toEqual([]);
    await savePlace(pin);
    await savePlace({ key: 'nowhere', source: 'online', location: null, label: '', updatedAt: '' });
    await savePlace({ ...pin, location: { lng: 11, lat: 13 } });
    const stored = await listPlaces();
    expect(stored).toHaveLength(2);
    expect(stored.find((p) => p.key === pin.key)?.location).toEqual({ lng: 11, lat: 13 });

    // Deleting an import leaves the places alone: they are shared by every import.
    await saveImport(record('a', '2026-01-01T00:00:00.000Z'), tree);
    await deleteImport('a');
    expect(await listPlaces()).toHaveLength(2);

    await deletePlace(pin.key);
    expect((await listPlaces()).map((p) => p.key)).toEqual(['nowhere']);
  });

  it('stores several places at once', async () => {
    await savePlaces([pin, { ...pin, key: 'ashby' }]);
    expect((await listPlaces()).map((p) => p.key).sort()).toEqual(['ashby', 'elmford, northmark']);
    await savePlaces([]);
    expect(await listPlaces()).toHaveLength(2);
  });
});
