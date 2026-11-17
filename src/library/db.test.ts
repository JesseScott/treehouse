import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseGedcom } from '../gedcom/parse';
import {
  closeDb,
  deleteImport,
  deletePlace,
  findImportByHash,
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

  it('deletes an import together with its tree', async () => {
    await saveImport(record('a', '2026-11-01T10:00:00.000Z'), tree);
    await saveImport(record('b', '2026-11-02T10:00:00.000Z'), tree);
    await deleteImport('a');

    expect((await listImports()).map((r) => r.id)).toEqual(['b']);
    expect(await loadTree('a')).toBeUndefined();
    expect(await loadTree('b')).toEqual(tree);
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
});
