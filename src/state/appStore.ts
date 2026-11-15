import { create } from 'zustand';
import { importFile as readInWorker } from '../gedcom/importFile';
import type { ImportErrorCode } from '../gedcom/readGedcom';
import type { Tree } from '../gedcom/types';
import {
  deleteImport as deleteFromDb,
  findImportByHash,
  listImports,
  loadTree,
  saveImport,
  updateImport,
  type ImportRecord,
} from '../library/db';

/** What the side panel is showing. */
export type Screen = 'library' | 'root-picker' | 'tree';

export interface OpenTree {
  record: ImportRecord;
  tree: Tree;
}

/** App-wide state. Threads and geocoding arrive in later milestones. */
interface AppState {
  mapLoaded: boolean;
  focusedPersonId: string | null;

  /** Previous imports, newest first. */
  library: ImportRecord[];
  /** False until the library has been read from IndexedDB once. */
  libraryLoaded: boolean;
  /** The tree being viewed, or null on the library screen. */
  open: OpenTree | null;
  /** True while the user is changing the home person of an open tree. */
  pickingRoot: boolean;

  importing: boolean;
  /** How many imports have been started, successful or not. */
  importAttempts: number;
  importError: ImportErrorCode | null;
  /** How long the last successful import took to read and parse, in milliseconds. */
  lastImportMs: number | null;
  /** True when the last file chosen was already in the library and was opened instead. */
  alreadyImported: boolean;

  setMapLoaded: (loaded: boolean) => void;
  loadLibrary: () => Promise<void>;
  importFile: (file: File) => Promise<void>;
  openImport: (id: string) => Promise<void>;
  closeTree: () => void;
  chooseRoot: (personId: string) => Promise<void>;
  setPickingRoot: (picking: boolean) => void;
  renameImport: (id: string, name: string) => Promise<void>;
  deleteImport: (id: string) => Promise<void>;
}

const stripExtension = (fileName: string) => fileName.replace(/\.(ged|gedcom|zip)$/i, '');

export const useAppStore = create<AppState>((set, get) => ({
  mapLoaded: false,
  focusedPersonId: null,
  library: [],
  libraryLoaded: false,
  open: null,
  pickingRoot: false,
  importing: false,
  importAttempts: 0,
  importError: null,
  lastImportMs: null,
  alreadyImported: false,

  setMapLoaded: (mapLoaded) => {
    set({ mapLoaded });
  },

  loadLibrary: async () => {
    set({ library: await listImports(), libraryLoaded: true });
  },

  importFile: async (file) => {
    if (get().importing) return;
    set({
      importing: true,
      importAttempts: get().importAttempts + 1,
      importError: null,
      alreadyImported: false,
    });
    try {
      const result = await readInWorker(file);
      if (!result.ok) {
        set({ importError: result.code });
        return;
      }
      // The same file again: open what is already there instead of storing a copy.
      const existing = await findImportByHash(result.hash);
      if (existing) {
        const tree = await loadTree(existing.id);
        if (tree) {
          set({ open: { record: existing, tree }, pickingRoot: false, alreadyImported: true });
          return;
        }
      }
      const record: ImportRecord = {
        id: crypto.randomUUID(),
        name: stripExtension(file.name),
        fileName: file.name,
        importedAt: new Date().toISOString(),
        hash: result.hash,
        people: result.tree.people.length,
        families: result.tree.families.length,
        warnings: result.tree.warnings.length,
        rootId: null,
      };
      await saveImport(record, result.tree);
      set({
        library: await listImports(),
        open: { record, tree: result.tree },
        pickingRoot: false,
        lastImportMs: result.milliseconds,
      });
    } catch {
      set({ importError: 'unknown' });
    } finally {
      set({ importing: false });
    }
  },

  openImport: async (id) => {
    const record = get().library.find((r) => r.id === id);
    const tree = record ? await loadTree(id) : undefined;
    if (record && tree) {
      set({
        open: { record, tree },
        pickingRoot: false,
        importError: null,
        alreadyImported: false,
      });
    }
  },

  closeTree: () => {
    set({ open: null, pickingRoot: false, alreadyImported: false });
  },

  chooseRoot: async (personId) => {
    const open = get().open;
    if (!open?.tree.people.some((p) => p.id === personId)) return;
    const record = await updateImport(open.record.id, { rootId: personId });
    if (!record) return;
    set({ open: { record, tree: open.tree }, pickingRoot: false, library: await listImports() });
  },

  setPickingRoot: (pickingRoot) => {
    set({ pickingRoot });
  },

  renameImport: async (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const record = await updateImport(id, { name: trimmed });
    const open = get().open;
    set({
      library: await listImports(),
      ...(record && open?.record.id === id ? { open: { record, tree: open.tree } } : {}),
    });
  },

  deleteImport: async (id) => {
    await deleteFromDb(id);
    set({
      library: await listImports(),
      ...(get().open?.record.id === id ? { open: null, pickingRoot: false } : {}),
    });
  },
}));

/** Which screen the state amounts to: a tree with no home person yet goes to the picker. */
export function screenOf(state: Pick<AppState, 'open' | 'pickingRoot'>): Screen {
  if (!state.open) return 'library';
  return state.open.record.rootId === null || state.pickingRoot ? 'root-picker' : 'tree';
}
