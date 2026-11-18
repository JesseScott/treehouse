import { indexTree } from '../gedcom/relatives';
import { threadCollection, type ThreadCollection } from '../map/threadData';
import type { useAppStore } from './appStore';
import { locatorOf } from './focus';

type State = ReturnType<typeof useAppStore.getState>;

const EMPTY: ThreadCollection = { type: 'FeatureCollection', features: [] };

let last: { inputs: unknown[]; threads: ThreadCollection } | null = null;

/** The threads the map draws for the state, memoised so the map and the debug API agree. */
export function threadsOf(
  state: Pick<State, 'open' | 'places' | 'focusedPersonId' | 'threadsOn'>,
): ThreadCollection {
  const { open, places, focusedPersonId, threadsOn } = state;
  const inputs = [open?.tree, open?.record.rootId, places, focusedPersonId, threadsOn];
  if (last && last.inputs.every((input, i) => input === inputs[i])) return last.threads;
  const threads = open
    ? threadCollection({
        index: indexTree(open.tree),
        rootId: open.record.rootId,
        focusedId: focusedPersonId,
        locate: locatorOf(places),
        on: threadsOn,
      })
    : EMPTY;
  last = { inputs, threads };
  return threads;
}
