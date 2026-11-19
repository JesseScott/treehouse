import { create } from 'zustand';
import { importFile as readInWorker } from '../gedcom/importFile';
import type { ImportErrorCode } from '../gedcom/readGedcom';
import { journeyStops, type JourneyLine } from '../gedcom/lines';
import { indexTree, step, type Direction } from '../gedcom/relatives';
import type { ThreadKind, ThreadToggles } from '../map/threadData';
import type { Tree } from '../gedcom/types';
import { geocodePlaces } from '../geocode/geocodePlaces';
import { lookUpOnline, NOMINATIM_INTERVAL_MS } from '../geocode/nominatim';
import { collectPlaces } from '../geocode/treePlaces';
import { UNRESOLVED, type LngLat, type PlaceResult, type TreePlace } from '../geocode/types';
import {
  deleteImport as deleteFromDb,
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
} from '../library/db';

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
  tree: Tree;
}

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
  /** Which kinds of thread are drawn between relatives. */
  threadsOn: ThreadToggles;
  journey: Journey | null;
  /** The people the left and right arrows move between, kept so a step back returns. */
  navRow: string[] | null;
  /** `key` of the place whose marker was clicked, listing the people there. */
  openedPlaceKey: string | null;

  /** Previous imports, newest first. */
  library: ImportRecord[];
  /** False until the library has been read from IndexedDB once. */
  libraryLoaded: boolean;
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
  importFile: (file: File) => Promise<void>;
  openImport: (id: string) => Promise<void>;
  closeTree: () => void;
  chooseRoot: (personId: string) => Promise<void>;
  setPickingRoot: (picking: boolean) => void;
  renameImport: (id: string, name: string) => Promise<void>;
  deleteImport: (id: string) => Promise<void>;

  setReviewingPlaces: (reviewing: boolean) => void;
  selectPlace: (key: string | null) => void;
  setPinning: (pinning: boolean) => void;
  /** Sets where a place is by hand. The pin applies to every import that names the place. */
  pinPlace: (key: string, location: LngLat) => Promise<void>;
  /** Forgets a pin or an online answer and goes back to what the gazetteer says. */
  resetPlace: (key: string) => Promise<void>;
  setOnlineEnabled: (enabled: boolean) => void;
  /** Looks up the places the gazetteer could not place exactly, one a second. Opt-in only. */
  lookUpPlacesOnline: () => Promise<void>;
  stopOnlineLookup: () => void;
}

const stripExtension = (fileName: string) => fileName.replace(/\.(ged|gedcom|zip)$/i, '');

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
  /** Opens a tree and starts placing its places on the map. */
  const show = (open: OpenTree, extra: Partial<AppState> = {}) => {
    onlineRun += 1;
    set({
      open,
      pickingRoot: false,
      ...NO_TREE_PLACES,
      focusedPersonId: open.record.rootId,
      online: { ...get().online, running: false, done: 0, total: 0, error: null },
      ...extra,
    });
    void geocode(open.tree);
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
    library: [],
    libraryLoaded: false,
    open: null,
    pickingRoot: false,
    ...NO_TREE_PLACES,
    online: { enabled: readOnlineOptIn(), running: false, done: 0, total: 0, error: null },
    importing: false,
    importAttempts: 0,
    importError: null,
    lastImportMs: null,
    alreadyImported: false,

    setMapLoaded: (mapLoaded) => {
      set({ mapLoaded });
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
            show({ record: existing, tree }, { alreadyImported: true });
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
      const record = get().library.find((r) => r.id === id);
      const tree = record ? await loadTree(id) : undefined;
      if (record && tree) {
        show({ record, tree }, { importError: null, alreadyImported: false });
      }
    },

    closeTree: () => {
      geocodeRun += 1;
      onlineRun += 1;
      set({
        open: null,
        pickingRoot: false,
        alreadyImported: false,
        ...NO_TREE_PLACES,
        online: { ...get().online, running: false },
      });
    },

    chooseRoot: async (personId) => {
      const open = get().open;
      if (!open?.tree.people.some((p) => p.id === personId)) return;
      const record = await updateImport(open.record.id, { rootId: personId });
      if (!record) return;
      set({
        open: { record, tree: open.tree },
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
        ...(record && open?.record.id === id ? { open: { record, tree: open.tree } } : {}),
      });
    },

    deleteImport: async (id) => {
      await deleteFromDb(id);
      set({
        library: await listImports(),
        ...(get().open?.record.id === id
          ? { open: null, pickingRoot: false, ...NO_TREE_PLACES }
          : {}),
      });
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
