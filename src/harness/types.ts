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
  /** The open tree, or null when nothing is imported (always null until M1). */
  tree: { importId: string; people: number; families: number; rootId: string | null } | null;
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
  /** Resolves once the map has loaded, finished moving and rendered. */
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
