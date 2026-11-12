import { create } from 'zustand';

/** App-wide UI state. Tree data, threads and geocoding arrive in later milestones. */
interface AppState {
  mapLoaded: boolean;
  focusedPersonId: string | null;
  setMapLoaded: (loaded: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  mapLoaded: false,
  focusedPersonId: null,
  setMapLoaded: (mapLoaded) => {
    set({ mapLoaded });
  },
}));
