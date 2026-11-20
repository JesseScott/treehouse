import { create } from 'zustand';
import { importFile as readInWorker } from '../gedcom/importFile';
import type { ImportErrorCode } from '../gedcom/readGedcom';
import { hideLiving as hideLivingIn, livingIds } from '../gedcom/living';
import { journeyStops, type JourneyLine } from '../gedcom/lines';
import { indexTree, step, type Direction } from '../gedcom/relatives';
import type { ThreadKind, ThreadToggles } from '../map/threadData';
import type { Tree } from '../gedcom/types';
import type { MotionSetting } from './motion';
import { geocodePlaces } from '../geocode/geocodePlaces';
import { lookUpOnline, NOMINATIM_INTERVAL_MS } from '../geocode/nominatim';
import { collectPlaces } from '../geocode/treePlaces';
import { UNRESOLVED, type LngLat, type PlaceResult, type TreePlace } from '../geocode/types';
import {
  deleteImport as deleteFromDb,
  deletePlace,
  findImportByHash,
  getImport,
  listFileHandleIds,
  listImports,
  listPlaces,
  loadFileHandle,
  loadTree,
  saveFileHandle,
  saveImport,
  savePlace,
  savePlaces,
  updateImport,
  type CameraView,
  type ImportRecord,
  type ImportView,
  type StoredPlace,
} from '../library/db';
import {
  canRememberFiles,
  FileAccessError,
  pickGedcom,
  readHandle,
  type FileAccessErrorCode,
} from '../library/fileAccess';
import {
  mergePlaces,
  placeFile,
  placeFileName,
  PlaceFileReadError,
  readPlaceFile,
  type PlaceFileError,
} from '../library/placeCache';
import { carriedOver, diffTrees, type SyncDiff } from '../library/syncDiff';

/** What the side panel is showing. */
export type Screen = 'library' | 'root-picker' | 'tree' | 'places';

/** A place of the open tree, with whether an online lookup has already been tried for it. */
export interface ReviewPlace extends TreePlace {
  lookedUp: boolean;
}

export interface OnlineLookup {
  /** The user's opt-in, remembered in this browser. Off until they turn it on. */
  enabled: boolean;
  running: boolean;
  done: number;
  total: number;
  error: 'online-unavailable' | null;
}

const ONLINE_KEY = 'treehouse.onlineLookup';
const readOnlineOptIn = () => {
  try {
    return localStorage.getItem(ONLINE_KEY) === 'on';
  } catch {
    return false;
  }
};

/** A stored pin or online answer takes the place of what the gazetteer said. */
function withStored(result: PlaceResult, stored: StoredPlace | undefined): PlaceResult {
  if (!stored?.location) return result;
  return {
    status: 'resolved',
    ...stored.location,
    label: stored.label,
    level: 'place',
    source: stored.source,
  };
}

/** Places that an online lookup could still improve. */
export const lookupCandidates = (places: ReviewPlace[]) =>
  places.filter((place) => place.result.status !== 'resolved' && !place.lookedUp);

export interface OpenTree {
  record: ImportRecord;
  /** The tree as shown: with living people hidden when `hideLiving` is on, else `full`. */
  tree: Tree;
  /** The tree as read from the file. Places are geocoded from this one. */
  full: Tree;
}

/** The tree to show: the same object while nobody is hidden, so memoised views stay put. */
const shownTrees = new WeakMap<Tree, Tree>();
export function shownTree(full: Tree, hide: boolean): Tree {
  if (!hide) return full;
  let shown = shownTrees.get(full);
  if (!shown) {
    shown = hideLivingIn(full, livingIds(full, new Date().getFullYear()));
    shownTrees.set(full, shown);
  }
  return shown;
}

const MOTION_KEY = 'treehouse.motion';
const readMotion = (): MotionSetting => {
  try {
    const value = localStorage.getItem(MOTION_KEY);
    return value === 'on' || value === 'off' ? value : 'system';
  } catch {
    return 'system';
  }
};

const HIDE_LIVING_KEY = 'treehouse.hideLiving';
const readHideLiving = () => {
  try {
    return localStorage.getItem(HIDE_LIVING_KEY) === 'on';
  } catch {
    return false;
  }
};

/** A journey along one line of the tree, a generation at a time. */
export interface Journey {
  line: JourneyLine;
  /** Person ids, the home person first. */
  stops: string[];
  /** The stop being shown. */
  index: number;
  playing: boolean;
  /** 0.5, 1, 2 or 4: how much faster than normal the journey moves on. */
  speed: number;
}

export const JOURNEY_SPEEDS = [0.5, 1, 2, 4] as const;

/** Syncing an import with its file: read it again, show what changed, then apply. */
export interface SyncState {
  importId: string;
  /**
   * `reading` the file, then `review` of the diff (or `unchanged` when the file is the same),
   * `applying` it, and `done`. `error` carries a fixed code.
   */
  phase: 'reading' | 'review' | 'unchanged' | 'applying' | 'done' | 'error';
  error: ImportErrorCode | FileAccessErrorCode | null;
  diff: SyncDiff | null;
  /** True when the home person is not in the new file, so one has to be chosen again. */
  rootLost: boolean;
  /** The new reading of the file, kept until it is applied or the sync is cancelled. */
  next: { tree: Tree; hash: string; fileName: string } | null;
}

/** What happened to the last place file exported or imported. */
export type PlaceFileStatus =
  | { kind: 'exported'; places: number }
  | { kind: 'imported'; added: number; updated: number; skipped: number; invalid: number }
  | { kind: 'error'; code: PlaceFileError };

export type Projection = 'globe' | 'mercator';

/** Lineage threads are on from the start; the others are opt-in. */
const DEFAULT_THREADS: ThreadToggles = {
  lineage: true,
  family: false,
  ancestors: false,
  migration: false,
};

/** App-wide state. */
interface AppState {
  mapLoaded: boolean;
  /** The person whose profile is open and whose place the camera is over. */
  focusedPersonId: string | null;
  /** Which kinds of thread are drawn between relatives. Remembered per import. */
  threadsOn: ThreadToggles;
  /** How the map is drawn. Remembered per import with the camera. */
  projection: Projection;
  /** A remembered camera to jump to once the map can take it, instead of flying to the focus. */
  cameraRestore: CameraView | null;
  /** True when the open tree's focus, threads and camera came from what was remembered. */
  viewRestored: boolean;
  journey: Journey | null;
  /** The people the left and right arrows move between, kept so a step back returns. */
  navRow: string[] | null;
  /** `key` of the place whose marker was clicked, listing the people there. */
  openedPlaceKey: string | null;

  /** Previous imports, newest first. */
  library: ImportRecord[];
  /** False until the library has been read from IndexedDB once. */
  libraryLoaded: boolean;
  /** Imports whose file the browser remembers, so a sync can read it again without asking. */
  fileHandleIds: string[];
  /** The sync in progress or just finished, shown on the library screen. */
  sync: SyncState | null;
  /** How many pins and online answers are stored, for every import together. */
  storedPlaces: number;
  placeFileBusy: boolean;
  placeFileStatus: PlaceFileStatus | null;
  /** The tree being viewed, or null on the library screen. */
  open: OpenTree | null;
  /** True while the user is changing the home person of an open tree. */
  pickingRoot: boolean;

  /** The distinct places of the open tree and where each is on the map. */
  places: ReviewPlace[];
  /** True while the open tree's places are being matched against the gazetteer. */
  geocoding: boolean;
  geocodeError: 'gazetteer-unavailable' | null;
  /** True while the place-review screen is showing. */
  reviewingPlaces: boolean;
  /** `key` of the place selected on the review screen. */
  selectedPlaceKey: string | null;
  /** True while the next click on the map sets the selected place's location. */
  pinning: boolean;
  online: OnlineLookup;

  importing: boolean;
  /** How many imports have been started, successful or not. */
  importAttempts: number;
  importError: ImportErrorCode | null;
  /** How long the last successful import took to read and parse, in milliseconds. */
  lastImportMs: number | null;
  /** True when the last file chosen was already in the library and was opened instead. */
  alreadyImported: boolean;

  setMapLoaded: (loaded: boolean) => void;
  setProjection: (projection: Projection) => void;
  /** Called once the remembered camera has been applied to the map. */
  cameraRestored: () => void;
  /** Opens a person's profile; the camera flies to where they are shown. */
  focusPerson: (personId: string) => boolean;
  /** Moves the focus the way an arrow key does. False when there is nobody that way. */
  stepFocus: (direction: Direction) => boolean;
  openPlace: (key: string | null) => void;
  setThread: (kind: ThreadKind, on: boolean) => void;
  /**
   * Starts a journey from the home person along a line, or up to the focused person for
   * `ancestor`, and plays it. False when the line has nobody beyond the home person.
   */
  startJourney: (line: JourneyLine) => boolean;
  /** Shows one stop of the journey, as the scrubber does. */
  journeyTo: (index: number) => void;
  setJourneyPlaying: (playing: boolean) => void;
  setJourneySpeed: (speed: number) => void;
  endJourney: () => void;
  loadLibrary: () => Promise<void>;
  /** Imports a file; with a handle (Chromium), the file is remembered for syncing. */
  importFile: (file: File, handle?: FileSystemFileHandle | null) => Promise<void>;
  /**
   * Opens the system file picker where the browser has one that remembers files, and imports
   * the file chosen. False when there is no such picker and a file input is needed instead.
   */
  pickAndImport: () => Promise<boolean>;
  openImport: (id: string) => Promise<void>;
  closeTree: () => void;
  chooseRoot: (personId: string) => Promise<void>;
  setPickingRoot: (picking: boolean) => void;
  renameImport: (id: string, name: string) => Promise<void>;
  deleteImport: (id: string) => Promise<void>;
  /**
   * Starts a sync from the remembered file, or from the system picker. False when neither is
   * available and the file has to be chosen with a file input (`syncFromFile`).
   */
  syncImport: (id: string) => Promise<boolean>;
  /** Reads a file as the new version of an import and shows the diff. */
  syncFromFile: (id: string, file: File, handle?: FileSystemFileHandle | null) => Promise<void>;
  /** Stores the new reading. The home person, focus and pins carry over by id and place. */
  applySync: () => Promise<void>;
  closeSync: () => void;
  /** Saves every pin and online answer to a JSON file. */
  exportPlaces: () => Promise<void>;
  /** Reads pins and online answers from a file saved by `exportPlaces`. */
  importPlaces: (file: File) => Promise<void>;

  setReviewingPlaces: (reviewing: boolean) => void;
  selectPlace: (key: string | null) => void;
  setPinning: (pinning: boolean) => void;
  /** Sets where a place is by hand. The pin applies to every import that names the place. */
  pinPlace: (key: string, location: LngLat) => Promise<void>;
  /** Forgets a pin or an online answer and goes back to what the gazetteer says. */
  resetPlace: (key: string) => Promise<void>;
  setOnlineEnabled: (enabled: boolean) => void;
  /** Hides the names, dates and places of people presumed living (`gedcom/living.ts`). */
  hideLiving: boolean;
  setHideLiving: (hide: boolean) => void;
  /** Whether camera moves fly or cut; `system` follows the reduced-motion setting (`motion.ts`). */
  motion: MotionSetting;
  setMotion: (motion: MotionSetting) => void;
  /** Looks up the places the gazetteer could not place exactly, one a second. Opt-in only. */
  lookUpPlacesOnline: () => Promise<void>;
  stopOnlineLookup: () => void;
}

const stripExtension = (fileName: string) => fileName.replace(/\.(ged|gedcom|zip)$/i, '');

/** The import that was open, so a reload opens it again. One id, in this browser only. */
const OPEN_KEY = 'treehouse.openImport';
function rememberOpen(id: string | null): void {
  try {
    if (id === null) localStorage.removeItem(OPEN_KEY);
    else localStorage.setItem(OPEN_KEY, id);
  } catch {
    // Private browsing: a reload goes back to the library.
  }
}
function rememberedOpen(): string | null {
  try {
    return localStorage.getItem(OPEN_KEY);
  } catch {
    return null;
  }
}

/** Saves text as a file the browser downloads. */
function download(text: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

const NO_TREE_PLACES = {
  focusedPersonId: null,
  navRow: null,
  openedPlaceKey: null,
  journey: null,
  places: [],
  geocoding: false,
  geocodeError: null,
  reviewingPlaces: false,
  selectedPlaceKey: null,
  pinning: false,
} satisfies Partial<AppState>;

/** Counts the geocoding and lookup runs, so one that a newer run has overtaken can tell. */
let geocodeRun = 0;
let onlineRun = 0;

const wait = (milliseconds: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

export const useAppStore = create<AppState>((set, get) => {
  /**
   * Opens a tree and starts placing its places on the map. What was remembered about how it
   * was being looked at (focus, threads, camera) comes back; otherwise it opens on its home
   * person with the lineage threads on.
   */
  const show = (loaded: { record: ImportRecord; tree: Tree }, extra: Partial<AppState> = {}) => {
    onlineRun += 1;
    const open: OpenTree = {
      record: loaded.record,
      full: loaded.tree,
      tree: shownTree(loaded.tree, get().hideLiving),
    };
    const view: ImportView | undefined = open.record.view;
    rememberOpen(open.record.id);
    set({
      open,
      pickingRoot: false,
      ...NO_TREE_PLACES,
      focusedPersonId: carriedOver(open.tree, view?.focusedPersonId ?? null, open.record.rootId),
      threadsOn: view ? { ...DEFAULT_THREADS, ...view.threads } : DEFAULT_THREADS,
      projection: view?.camera?.projection ?? get().projection,
      cameraRestore: view?.camera ?? null,
      viewRestored: view !== undefined,
      sync: null,
      online: { ...get().online, running: false, done: 0, total: 0, error: null },
      ...extra,
    });
    void geocode(open.full);
  };

  const refreshStoredPlaces = async () => {
    set({ storedPlaces: (await listPlaces().catch(() => [])).length });
  };

  const refreshHandles = async () => {
    set({ fileHandleIds: await listFileHandleIds().catch(() => []) });
  };

  const syncFailed = (importId: string, error: SyncState['error']) => {
    set({
      sync: { importId, phase: 'error', error, diff: null, rootLost: false, next: null },
    });
  };

  const geocode = async (tree: Tree) => {
    const run = ++geocodeRun;
    const found = collectPlaces(tree);
    set({
      places: found.map((place) => ({ ...place, result: UNRESOLVED, lookedUp: false })),
      geocoding: true,
      geocodeError: null,
    });
    const [results, stored] = await Promise.all([
      geocodePlaces(found.map((place) => place.text)).catch(() => null),
      listPlaces().catch(() => []),
    ]);
    if (run !== geocodeRun) return;
    const storedByKey = new Map(stored.map((place) => [place.key, place]));
    set({
      places: found.map((place, i) => ({
        ...place,
        result: withStored(results?.[i] ?? UNRESOLVED, storedByKey.get(place.key)),
        lookedUp: storedByKey.get(place.key)?.source === 'online',
      })),
      geocoding: false,
      geocodeError: results ? null : 'gazetteer-unavailable',
    });
  };

  const updatePlace = (key: string, patch: Partial<ReviewPlace>) => {
    set({ places: get().places.map((p) => (p.key === key ? { ...p, ...patch } : p)) });
  };

  /** Focusing someone by hand keeps the scrubber on them if they are a stop, and pauses. */
  const journeyAfterFocus = (personId: string): Journey | null => {
    const journey = get().journey;
    if (!journey) return null;
    const at = journey.stops.indexOf(personId);
    return { ...journey, index: at === -1 ? journey.index : at, playing: false };
  };

  return {
    mapLoaded: false,
    threadsOn: DEFAULT_THREADS,
    projection: 'globe',
    cameraRestore: null,
    viewRestored: false,
    library: [],
    libraryLoaded: false,
    fileHandleIds: [],
    sync: null,
    storedPlaces: 0,
    placeFileBusy: false,
    placeFileStatus: null,
    open: null,
    pickingRoot: false,
    ...NO_TREE_PLACES,
    hideLiving: readHideLiving(),
    motion: readMotion(),
    online: { enabled: readOnlineOptIn(), running: false, done: 0, total: 0, error: null },
    importing: false,
    importAttempts: 0,
    importError: null,
    lastImportMs: null,
    alreadyImported: false,

    setMapLoaded: (mapLoaded) => {
      set({ mapLoaded });
    },

    setProjection: (projection) => {
      set({ projection });
    },

    cameraRestored: () => {
      set({ cameraRestore: null });
    },

    focusPerson: (personId) => {
      const open = get().open;
      if (!open || !indexTree(open.tree).people.has(personId)) return false;
      set({ focusedPersonId: personId, navRow: null, journey: journeyAfterFocus(personId) });
      return true;
    },

    stepFocus: (direction) => {
      const { open, focusedPersonId, navRow } = get();
      if (!open || focusedPersonId === null) return false;
      const next = step(
        indexTree(open.tree),
        open.record.rootId,
        focusedPersonId,
        direction,
        navRow,
      );
      if (!next) return false;
      set({
        focusedPersonId: next.personId,
        navRow: next.row,
        journey: journeyAfterFocus(next.personId),
      });
      return true;
    },

    openPlace: (openedPlaceKey) => {
      set({ openedPlaceKey });
    },

    setThread: (kind, on) => {
      set({ threadsOn: { ...get().threadsOn, [kind]: on } });
    },

    startJourney: (line) => {
      const { open, focusedPersonId, journey } = get();
      if (!open || open.record.rootId === null) return false;
      const stops = journeyStops(
        indexTree(open.tree),
        open.record.rootId,
        line,
        focusedPersonId ?? undefined,
      );
      if (stops.length < 2) return false;
      set({
        journey: { line, stops, index: 0, playing: true, speed: journey?.speed ?? 1 },
        focusedPersonId: stops[0] ?? null,
        navRow: null,
        openedPlaceKey: null,
      });
      return true;
    },

    journeyTo: (index) => {
      const journey = get().journey;
      const personId = journey?.stops[index];
      if (!journey || personId === undefined) return;
      set({ journey: { ...journey, index }, focusedPersonId: personId, navRow: null });
    },

    setJourneyPlaying: (playing) => {
      const journey = get().journey;
      if (!journey) return;
      // Play from the end starts again from the home person.
      const restart = playing && journey.index === journey.stops.length - 1;
      set({ journey: { ...journey, playing } });
      if (restart) get().journeyTo(0);
    },

    setJourneySpeed: (speed) => {
      const journey = get().journey;
      if (journey) set({ journey: { ...journey, speed } });
    },

    endJourney: () => {
      set({ journey: null });
    },

    loadLibrary: async () => {
      const library = await listImports();
      set({ library });
      void refreshHandles();
      void refreshStoredPlaces();
      // A reload opens the tree that was open, before the library counts as loaded, so
      // `whenIdle` does not settle on the library screen in between.
      const id = rememberedOpen();
      const record = id === null ? undefined : library.find((r) => r.id === id);
      const tree = record ? await loadTree(record.id).catch(() => undefined) : undefined;
      if (record && tree && !get().open) show({ record, tree });
      else if (id !== null && !record) rememberOpen(null);
      set({ libraryLoaded: true });
    },

    pickAndImport: async () => {
      if (!canRememberFiles()) return false;
      try {
        const picked = await pickGedcom();
        if (picked) await get().importFile(picked.file, picked.handle);
      } catch {
        set({ importError: 'unknown', importAttempts: get().importAttempts + 1 });
      }
      return true;
    },

    importFile: async (file, handle) => {
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
            if (handle) await saveFileHandle(existing.id, handle);
            show({ record: existing, tree }, { alreadyImported: true });
            void refreshHandles();
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
        if (handle) await saveFileHandle(record.id, handle);
        void refreshHandles();
        show(
          { record, tree: result.tree },
          { library: await listImports(), lastImportMs: result.milliseconds },
        );
      } catch {
        set({ importError: 'unknown' });
      } finally {
        set({ importing: false });
      }
    },

    openImport: async (id) => {
      // Read the record again: its remembered view changes while a tree is looked at.
      const record = (await getImport(id)) ?? get().library.find((r) => r.id === id);
      const tree = record ? await loadTree(id) : undefined;
      if (record && tree) {
        show({ record, tree }, { importError: null, alreadyImported: false });
      }
    },

    closeTree: () => {
      geocodeRun += 1;
      onlineRun += 1;
      rememberOpen(null);
      set({
        open: null,
        pickingRoot: false,
        alreadyImported: false,
        cameraRestore: null,
        viewRestored: false,
        ...NO_TREE_PLACES,
        online: { ...get().online, running: false },
      });
      void refreshStoredPlaces();
    },

    chooseRoot: async (personId) => {
      const open = get().open;
      if (!open?.tree.people.some((p) => p.id === personId)) return;
      const record = await updateImport(open.record.id, { rootId: personId });
      if (!record) return;
      set({
        open: { ...open, record },
        pickingRoot: false,
        focusedPersonId: personId,
        navRow: null,
        journey: null,
        library: await listImports(),
      });
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
        ...(record && open?.record.id === id ? { open: { ...open, record } } : {}),
      });
    },

    deleteImport: async (id) => {
      await deleteFromDb(id);
      const wasOpen = get().open?.record.id === id;
      if (wasOpen) rememberOpen(null);
      set({
        library: await listImports(),
        ...(wasOpen ? { open: null, pickingRoot: false, ...NO_TREE_PLACES } : {}),
        ...(get().sync?.importId === id ? { sync: null } : {}),
      });
      void refreshHandles();
    },

    syncImport: async (id) => {
      const busy = get().sync;
      if (busy && (busy.phase === 'reading' || busy.phase === 'applying')) return true;
      const handle = await loadFileHandle(id).catch(() => undefined);
      if (handle) {
        set({
          sync: {
            importId: id,
            phase: 'reading',
            error: null,
            diff: null,
            rootLost: false,
            next: null,
          },
        });
        try {
          await get().syncFromFile(id, await readHandle(handle));
        } catch (error) {
          syncFailed(id, error instanceof FileAccessError ? error.code : 'unknown');
        }
        return true;
      }
      if (!canRememberFiles()) return false;
      try {
        const picked = await pickGedcom();
        if (picked) await get().syncFromFile(id, picked.file, picked.handle);
      } catch {
        syncFailed(id, 'unknown');
      }
      return true;
    },

    syncFromFile: async (id, file, handle) => {
      set({
        sync: {
          importId: id,
          phase: 'reading',
          error: null,
          diff: null,
          rootLost: false,
          next: null,
        },
      });
      try {
        const [record, tree] = await Promise.all([getImport(id), loadTree(id)]);
        if (!record || !tree) {
          set({ sync: null });
          return;
        }
        const result = await readInWorker(file);
        if (!result.ok) {
          syncFailed(id, result.code);
          return;
        }
        if (handle) {
          await saveFileHandle(id, handle);
          void refreshHandles();
        }
        if (get().sync?.importId !== id) return;
        if (result.hash === record.hash) {
          set({
            sync: {
              importId: id,
              phase: 'unchanged',
              error: null,
              diff: null,
              rootLost: false,
              next: null,
            },
          });
          return;
        }
        set({
          sync: {
            importId: id,
            phase: 'review',
            error: null,
            diff: diffTrees(tree, result.tree),
            rootLost:
              record.rootId !== null && carriedOver(result.tree, record.rootId, null) === null,
            next: { tree: result.tree, hash: result.hash, fileName: file.name },
          },
        });
      } catch {
        syncFailed(id, 'unknown');
      }
    },

    applySync: async () => {
      const sync = get().sync;
      if (sync?.phase !== 'review' || !sync.next) return;
      const { next } = sync;
      set({ sync: { ...sync, phase: 'applying' } });
      try {
        const record = await getImport(sync.importId);
        if (!record) {
          set({ sync: null });
          return;
        }
        // People are matched by GEDCOM id: whoever is still in the file stays home or focused.
        const rootId = carriedOver(next.tree, record.rootId, null);
        const view = record.view && {
          ...record.view,
          focusedPersonId: carriedOver(next.tree, record.view.focusedPersonId, rootId),
        };
        const updated: ImportRecord = {
          ...record,
          fileName: next.fileName,
          hash: next.hash,
          people: next.tree.people.length,
          families: next.tree.families.length,
          warnings: next.tree.warnings.length,
          rootId,
          syncedAt: new Date().toISOString(),
          ...(view ? { view } : {}),
        };
        // Pins and online answers belong to places, not imports, so they are left as they are.
        await saveImport(updated, next.tree);
        set({ library: await listImports(), sync: { ...sync, phase: 'done', next: null } });
      } catch {
        syncFailed(sync.importId, 'unknown');
      }
    },

    closeSync: () => {
      const sync = get().sync;
      if (sync?.phase === 'applying') return;
      set({ sync: null });
    },

    exportPlaces: async () => {
      if (get().placeFileBusy) return;
      set({ placeFileBusy: true });
      try {
        const places = await listPlaces();
        download(`${JSON.stringify(placeFile(places), null, 2)}\n`, placeFileName());
        set({ placeFileStatus: { kind: 'exported', places: places.length } });
      } finally {
        set({ placeFileBusy: false });
      }
    },

    importPlaces: async (file) => {
      if (get().placeFileBusy) return;
      set({ placeFileBusy: true });
      try {
        const { places, invalid } = readPlaceFile(await file.text());
        const merged = mergePlaces(await listPlaces(), places);
        await savePlaces(merged.save);
        const { added, updated, skipped } = merged;
        set({ placeFileStatus: { kind: 'imported', added, updated, skipped, invalid } });
        await refreshStoredPlaces();
      } catch (error) {
        set({
          placeFileStatus: {
            kind: 'error',
            code: error instanceof PlaceFileReadError ? error.code : 'not-a-place-file',
          },
        });
      } finally {
        set({ placeFileBusy: false });
      }
    },

    setReviewingPlaces: (reviewingPlaces) => {
      set({ reviewingPlaces, selectedPlaceKey: null, pinning: false });
    },

    selectPlace: (selectedPlaceKey) => {
      set({ selectedPlaceKey, pinning: false });
    },

    setPinning: (pinning) => {
      set({ pinning: pinning && get().selectedPlaceKey !== null });
    },

    pinPlace: async (key, location) => {
      if (!get().places.some((place) => place.key === key)) return;
      const stored: StoredPlace = {
        key,
        source: 'manual',
        location: { lng: location.lng, lat: location.lat },
        label: '',
        updatedAt: new Date().toISOString(),
      };
      await savePlace(stored);
      updatePlace(key, { result: withStored(UNRESOLVED, stored) });
      set({ pinning: false });
    },

    resetPlace: async (key) => {
      const place = get().places.find((p) => p.key === key);
      if (!place) return;
      await deletePlace(key);
      const results = await geocodePlaces([place.text]).catch(() => null);
      updatePlace(key, { result: results?.[0] ?? UNRESOLVED, lookedUp: false });
    },

    setOnlineEnabled: (enabled) => {
      try {
        if (enabled) localStorage.setItem(ONLINE_KEY, 'on');
        else localStorage.removeItem(ONLINE_KEY);
      } catch {
        // Private browsing: the choice lasts for this visit only.
      }
      if (!enabled) onlineRun += 1;
      set({ online: { ...get().online, enabled, running: enabled && get().online.running } });
    },

    setHideLiving: (hide) => {
      try {
        if (hide) localStorage.setItem(HIDE_LIVING_KEY, 'on');
        else localStorage.removeItem(HIDE_LIVING_KEY);
      } catch {
        // Private browsing: the choice lasts for this visit only.
      }
      const open = get().open;
      set({
        hideLiving: hide,
        ...(open ? { open: { ...open, tree: shownTree(open.full, hide) } } : {}),
      });
    },

    setMotion: (motion) => {
      try {
        if (motion === 'system') localStorage.removeItem(MOTION_KEY);
        else localStorage.setItem(MOTION_KEY, motion);
      } catch {
        // Private browsing: the choice lasts for this visit only.
      }
      set({ motion });
    },

    lookUpPlacesOnline: async () => {
      if (!get().online.enabled || get().online.running) return;
      const run = ++onlineRun;
      const todo = lookupCandidates(get().places);
      const progress = (patch: Partial<OnlineLookup>) => {
        if (run === onlineRun) set({ online: { ...get().online, ...patch } });
      };
      progress({ running: true, done: 0, total: todo.length, error: null });
      try {
        for (const [i, place] of todo.entries()) {
          if (i > 0) await wait(NOMINATIM_INTERVAL_MS);
          if (run !== onlineRun) return;
          // Only the place text goes out: never a name, a date or anything else from the tree.
          const match = await lookUpOnline(place.text);
          if (run !== onlineRun) return;
          const stored: StoredPlace = {
            key: place.key,
            source: 'online',
            location: match && { lng: match.lng, lat: match.lat },
            label: match?.label ?? '',
            updatedAt: new Date().toISOString(),
          };
          await savePlace(stored);
          // A pin set while the lookup was running wins.
          const current = get().places.find((p) => p.key === place.key);
          const pinned =
            current?.result.status !== 'unresolved' && current?.result.source === 'manual';
          if (current && !pinned) {
            updatePlace(place.key, { result: withStored(current.result, stored), lookedUp: true });
          }
          progress({ done: i + 1 });
        }
      } catch {
        progress({ error: 'online-unavailable' });
      } finally {
        progress({ running: false });
      }
    },

    stopOnlineLookup: () => {
      onlineRun += 1;
      set({ online: { ...get().online, running: false } });
    },
  };
});

/** Which screen the state amounts to: a tree with no home person yet goes to the picker. */
export function screenOf(
  state: Pick<AppState, 'open' | 'pickingRoot' | 'reviewingPlaces'>,
): Screen {
  if (!state.open) return 'library';
  if (state.open.record.rootId === null || state.pickingRoot) return 'root-picker';
  return state.reviewingPlaces ? 'places' : 'tree';
}
