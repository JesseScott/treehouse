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
  /** Number of arcs drawn per thread type (all zero until M4). */
  threads: { lineage: number; family: number; ancestors: number; migration: number };
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
   * Resolves once the map is idle, the library has loaded, and no import, geocoding or
   * online lookup is running.
   */
  whenIdle(): Promise<void>;
  /** Where a place string of the open tree is, or null when the tree does not name it. */
  place(text: string): PlaceLocation | null;
  /** Focuses a person and flies to their birthplace. A stub until M3: always `no-tree`. */
  focus(personId: string): Promise<FocusResult>;
  /** Moves the camera the way a focus will (instant with `?motion=off`), then waits for idle. */
  flyTo(target: CameraTarget): Promise<void>;
}

declare global {
  interface Window {
    __treehouse?: TreehouseDebugApi;
  }
}
