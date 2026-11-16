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
  screen: 'library' | 'root-picker' | 'tree';
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
  /** Geocode coverage of the open tree's places (all zero until M2). */
  geocode: { places: number; resolved: number; approximate: number; unresolved: number };
}

export interface CameraTarget {
  lng: number;
  lat: number;
  zoom?: number;
}

export type FocusResult = { ok: true } | { ok: false; reason: 'no-tree' | 'unknown-person' };

export interface TreehouseDebugApi {
  /** A plain-JSON snapshot of what the app is showing. */
  state(): TreehouseState;
  /** Resolves once the map is idle, the library has loaded and no import is running. */
  whenIdle(): Promise<void>;
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
