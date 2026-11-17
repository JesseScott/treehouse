import { indexTree, relationship, type Relationship } from '../gedcom/relatives';
import type { Person } from '../gedcom/types';
import { focusPlaceOf, type FocusPlace, type Locate } from '../geocode/focusPlace';
import { placeKey } from '../geocode/normalize';
import type { PlaceResult } from '../geocode/types';
import type { ReviewPlace, useAppStore } from './appStore';

type State = ReturnType<typeof useAppStore.getState>;

const locators = new WeakMap<ReviewPlace[], Locate>();

/** Where each place string of the open tree is, looked up by its key. */
export function locatorOf(places: ReviewPlace[]): Locate {
  let locate = locators.get(places);
  if (!locate) {
    const byKey = new Map<string, PlaceResult>(places.map((p) => [p.key, p.result]));
    locate = (place) => byKey.get(placeKey(place));
    locators.set(places, locate);
  }
  return locate;
}

export interface Focus {
  person: Person;
  /** Where the person is shown, or null when nobody close has a place on the map. */
  place: FocusPlace | null;
  relationship: Relationship;
}

let last: { inputs: unknown[]; focus: Focus | null } | null = null;

/** The focused person, where they are shown and how they are related to the home person. */
export function focusOf(state: Pick<State, 'open' | 'places' | 'focusedPersonId'>): Focus | null {
  const { open, places, focusedPersonId } = state;
  const inputs = [open?.tree, open?.record.rootId, places, focusedPersonId];
  if (last && last.inputs.every((input, i) => input === inputs[i])) return last.focus;

  let focus: Focus | null = null;
  const index = open && indexTree(open.tree);
  const person = focusedPersonId === null ? undefined : index?.people.get(focusedPersonId);
  if (open && index && person) {
    focus = {
      person,
      place: focusPlaceOf(index, person.id, locatorOf(places)),
      relationship:
        open.record.rootId === null
          ? { kind: 'none', label: '', path: [] }
          : relationship(index, open.record.rootId, person.id),
    };
  }
  last = { inputs, focus };
  return focus;
}
