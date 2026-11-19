import { useAppStore } from '../state/appStore';
import { whenMapIdle } from './camera';
import { currentMap } from './mapRegistry';

/** How long a journey stays on each generation once the camera has arrived, at normal speed. */
export const JOURNEY_DWELL_MS = 1600;

/**
 * Moves a playing journey on: once the camera has arrived at a stop (a flight, or a jump cut
 * when motion is off), it waits a moment and goes on to the next generation, and stops at the
 * end. A store subscription, like the focus camera, so it runs outside React.
 */
export function installJourneyPlayer(): () => void {
  let scheduled: { stops: string[]; index: number } | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const cancel = () => {
    clearTimeout(timer);
    scheduled = null;
  };

  return useAppStore.subscribe((state) => {
    const journey = state.journey;
    if (!journey?.playing) {
      cancel();
      return;
    }
    if (scheduled?.stops === journey.stops && scheduled.index === journey.index) return;
    cancel();
    const mine = { stops: journey.stops, index: journey.index };
    scheduled = mine;

    void (async () => {
      const map = currentMap();
      if (map) await whenMapIdle(map);
      if (scheduled !== mine) return;
      const current = useAppStore.getState().journey;
      timer = setTimeout(
        () => {
          if (scheduled !== mine) return;
          const { journey: now, journeyTo, setJourneyPlaying } = useAppStore.getState();
          if (!now?.playing || now.stops !== mine.stops || now.index !== mine.index) return;
          if (now.index + 1 < now.stops.length) journeyTo(now.index + 1);
          else setJourneyPlaying(false);
        },
        JOURNEY_DWELL_MS / (current?.speed ?? 1),
      );
    })();
  });
}
