/**
 * The debug API an agent or test drives instead of comparing pixels.
 * Exposed as `window.__treehouse` in dev and with `?harness=1`. See docs/HARNESS.md.
 */
export interface TreehouseState {
  app: { name: 'treehouse'; version: string; commit: string };
  flags: { harness: boolean; motion: boolean };
  map: {
    loaded: boolean;
    moving: boolean;
    style: 'offline';
    projection: string;
    center: { lng: number; lat: number };
    zoom: number;
    bearing: number;
    pitch: number;
  };
  /** Which side panel is showing. A tree with no home person yet shows the picker. */
  screen: 'library' | 'root-picker' | 'tree' | 'places';
  /** Previous imports, newest first. `loaded` is false until IndexedDB has been read. */
  library: {
    loaded: boolean;
    imports: {
      id: string;
      name: string;
      people: number;
      families: number;
      rootId: string | null;
      /** ISO timestamp of the last sync that changed it, or null. */
      syncedAt: string | null;
      /** True when the browser remembers its file, so a sync reads it without asking. */
      fileRemembered: boolean;
    }[];
  };
  /** The open tree, or null on the library screen. */
  tree: {
    importId: string;
    name: string;
    people: number;
    families: number;
    /** Lines and links in the file that could not be read. */
    warnings: number;
    rootId: string | null;
  } | null;
  /**
   * Remembering how each import is looked at. `restored` is true when the open tree's focus,
   * threads and camera came back from storage; `saving` while a change is waiting to be written.
   */
  view: { restored: boolean; saving: boolean };
  /**
   * The sync on the library screen, or null. Counts and ids only: what the file added, removed
   * and changed is never in the state as names or place text.
   */
  sync: {
    importId: string;
    phase: 'reading' | 'review' | 'unchanged' | 'applying' | 'done' | 'error';
    /** A fixed code, such as `not-gedcom` or `permission-denied`. */
    error: string | null;
    added: number;
    removed: number;
    changed: number;
    families: { added: number; removed: number; changed: number };
    newPlaces: number;
    droppedPlaces: number;
    /** True when the home person is not in the new file. */
    rootLost: boolean;
  } | null;
  /** Pins and online answers, shared by every import, and the last place file saved or read. */
  placeCache: {
    stored: number;
    busy: boolean;
    last:
      | { kind: 'exported'; places: number }
      | { kind: 'imported'; added: number; updated: number; skipped: number; invalid: number }
      | { kind: 'error'; code: string }
      | null;
  };
  /** The file import in progress or just finished. `error` is a fixed code, never file content. */
  import: {
    busy: boolean;
    /** How many imports have been started in this page load, successful or not. */
    attempts: number;
    error: string | null;
    /** Worker time to read and parse the last successful import, in milliseconds. */
    lastMs: number | null;
    /** True when the last file chosen was already in the library and was opened instead. */
    alreadyImported: boolean;
  };
  focusedPersonId: string | null;
  /**
   * The focused person: how they are related to the home person (a fixed genealogical term
   * such as "2nd great-grandfather", never a name) and which event they are shown at.
   */
  focus: {
    personId: string;
    relationship: { kind: 'self' | 'blood' | 'spouse' | 'in-law' | 'none'; label: string };
    /** People on the line from the home person to this person, both included; 0 if unrelated. */
    pathLength: number;
    /** Null when nobody close has a place on the map, so the camera stays where it is. */
    shownAt: {
      basis: 'birth' | 'baptism' | 'residence' | 'marriage' | 'death' | 'burial' | 'relative';
      approximate: boolean;
      level: 'place' | 'area' | 'region' | 'country';
      lng: number;
      lat: number;
    } | null;
  } | null;
  /** Place markers: one per place on the map, and how many markers and clusters are drawn now. */
  markers: { places: number; rendered: number };
  /** The list of people at a clicked place. */
  placeCard: { open: boolean; people: number };
  /**
   * Number of arcs drawn per thread type. A type that is switched off draws none; an arc joins
   * two people's own places (or two of one person's places for `migration`) a km or more apart.
   */
  threads: { lineage: number; family: number; ancestors: number; migration: number };
  /** Which thread types are switched on. */
  threadToggles: { lineage: boolean; family: boolean; ancestors: boolean; migration: boolean };
  /** The journey being shown, or null. `index` counts stops from the home person (0). */
  journey: {
    line: 'paternal' | 'maternal' | 'ancestor';
    stops: number;
    index: number;
    /** The person at the current stop. */
    personId: string;
    playing: boolean;
    speed: number;
  } | null;
  /**
   * Where the open tree's distinct places are on the map. `resolved` + `approximate` +
   * `unresolved` = `places`. Counts only: a place string never appears in the state.
   */
  geocode: {
    /** True while the places are being matched against the bundled gazetteer. */
    busy: boolean;
    /** A fixed code: `gazetteer-unavailable` when the bundled place data could not be loaded. */
    error: string | null;
    places: number;
    resolved: number;
    approximate: number;
    unresolved: number;
    /** How many of the resolved places are pins the user set, or answers from an online lookup. */
    pinned: number;
    online: number;
  };
  /** The place-review screen: whether a place is selected, and whether a map click will pin it. */
  placeReview: { selected: boolean; pinning: boolean };
  /** The opt-in online lookup. `enabled` is the user's consent; nothing is sent without it. */
  onlineLookup: {
    enabled: boolean;
    running: boolean;
    done: number;
    total: number;
    /** A fixed code: `online-unavailable` when the lookup service could not be reached. */
    error: string | null;
  };
}

/** Where one place string of the open tree is, as `place()` reports it. */
export type PlaceLocation =
  | { status: 'unresolved' }
  | {
      status: 'resolved' | 'approximate';
      lng: number;
      lat: number;
      level: 'place' | 'area' | 'region' | 'country';
      source: 'gazetteer' | 'online' | 'manual';
    };

export interface CameraTarget {
  lng: number;
  lat: number;
  zoom?: number;
}

export type FocusResult = { ok: true } | { ok: false; reason: 'no-tree' | 'unknown-person' };

export interface TreehouseDebugApi {
  /** A plain-JSON snapshot of what the app is showing. */
  state(): TreehouseState;
  /**
   * Resolves once the map is idle, the library has loaded, no import, sync, geocoding, online
   * lookup or place file is running, and any change of view has been remembered.
   */
  whenIdle(): Promise<void>;
  /** Where a place string of the open tree is, or null when the tree does not name it. */
  place(text: string): PlaceLocation | null;
  /**
   * Focuses a person as a click on them would, then waits until the camera has arrived at
   * where they are shown (their birthplace, or the fallback in `state().focus.shownAt`).
   */
  focus(personId: string): Promise<FocusResult>;
  /** Where a point is on screen, in page pixels, for clicking a marker. Null off the globe. */
  project(at: { lng: number; lat: number }): { x: number; y: number } | null;
  /** Moves the camera the way a focus will (instant with `?motion=off`), then waits for idle. */
  flyTo(target: CameraTarget): Promise<void>;
}

declare global {
  interface Window {
    __treehouse?: TreehouseDebugApi;
  }
}
