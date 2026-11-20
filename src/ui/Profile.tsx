import { displayName, lifespan } from '../gedcom/people';
import {
  childrenOf,
  indexTree,
  parentsOf,
  siblingsOf,
  spousesOf,
  type TreeIndex,
} from '../gedcom/relatives';
import type { FamilyEventType, Person, PersonEventType } from '../gedcom/types';
import type { ParsedDate } from '../gedcom/dates';
import { placeKey } from '../geocode/normalize';
import type { PlaceLevel } from '../geocode/types';
import { motionOn } from '../state/motion';
import { moveCamera } from '../map/camera';
import { FOCUS_ZOOM } from '../map/focusCamera';
import { currentMap } from '../map/mapRegistry';
import { useAppStore, type OpenTree } from '../state/appStore';
import { locatorOf, type Focus } from '../state/focus';
import { EVENT_WORDS, focusNote } from './messages';

interface TimelineEvent {
  type: PersonEventType | FamilyEventType;
  date?: ParsedDate;
  place?: string;
  /** The other partner, for a marriage or divorce. */
  with?: Person;
}

/** Undated births come first and undated deaths last; everything else by year, then file order. */
function timelineOf(index: TreeIndex, person: Person): TimelineEvent[] {
  const events: TimelineEvent[] = [
    ...person.events,
    ...spousesOf(index, person).flatMap(({ spouse, family }) =>
      family.events.map((event) => ({ ...event, with: spouse })),
    ),
  ];
  const sortYear = (event: TimelineEvent) =>
    event.date?.year ??
    (event.type === 'birth' || event.type === 'baptism'
      ? Number.NEGATIVE_INFINITY
      : Number.POSITIVE_INFINITY);
  return events
    .map((event, i) => ({ event, i }))
    .sort((a, b) => {
      const ya = sortYear(a.event);
      const yb = sortYear(b.event);
      return ya === yb ? a.i - b.i : ya < yb ? -1 : 1;
    })
    .map(({ event }) => event);
}

function showPlace(at: { lng: number; lat: number; level: PlaceLevel }) {
  const map = currentMap();
  if (map) moveCamera(map, { lng: at.lng, lat: at.lat, zoom: FOCUS_ZOOM[at.level] }, motionOn());
}

function Chips({ title, people, relation }: { title: string; people: Person[]; relation: string }) {
  const focusPerson = useAppStore((s) => s.focusPerson);
  if (people.length === 0) return null;
  return (
    <div className="chip-group">
      <h4>{title}</h4>
      <div className="chips">
        {people.map((person) => (
          <button
            key={person.id}
            type="button"
            className="chip"
            data-testid="relative-chip"
            data-relation={relation}
            data-person-id={person.id}
            onClick={() => {
              focusPerson(person.id);
            }}
          >
            {displayName(person)}
            {lifespan(person) && <span className="chip-years"> {lifespan(person)}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Profile({ open, focus }: { open: OpenTree; focus: Focus }) {
  const places = useAppStore((s) => s.places);
  const openPlace = useAppStore((s) => s.openPlace);
  const index = indexTree(open.tree);
  const { person, place, relationship } = focus;
  const locate = locatorOf(places);
  const relative = place?.relativeId ? index.people.get(place.relativeId) : undefined;
  const years = lifespan(person);

  return (
    <article className="profile" data-testid="profile" data-person-id={person.id}>
      <h2 className="profile-name" data-testid="profile-name">
        {displayName(person)}
      </h2>
      {years && <p className="profile-years">{years}</p>}
      {relationship.label && (
        <p data-testid="profile-relationship" data-kind={relationship.kind}>
          {relationship.label}
        </p>
      )}
      <p
        className="hint"
        data-testid="profile-place"
        data-basis={place?.basis ?? 'none'}
        data-approximate={place?.approximate ?? true}
      >
        {focusNote(place, relative && displayName(relative))}
      </p>
      {place && (
        <div className="row">
          <button
            type="button"
            className="button quiet"
            data-testid="show-on-map"
            onClick={() => {
              showPlace(place);
            }}
          >
            Show on the map
          </button>
        </div>
      )}

      <h3>Timeline</h3>
      <ol className="timeline" data-testid="profile-timeline">
        {timelineOf(index, person).map((event, i) => {
          const result = event.place === undefined ? undefined : locate(event.place);
          const located = result && result.status !== 'unresolved' ? result : null;
          return (
            <li key={i} data-testid="timeline-event" data-type={event.type}>
              <span className="timeline-what">
                {EVENT_WORDS[event.type]}
                {event.with && ` ${displayName(event.with)}`}
              </span>
              {event.date && <span className="timeline-when"> {event.date.text}</span>}
              {event.place !== undefined &&
                (located ? (
                  <button
                    type="button"
                    className="link"
                    data-testid="timeline-place"
                    onClick={() => {
                      showPlace(located);
                      if (event.place !== undefined) openPlace(placeKey(event.place));
                    }}
                  >
                    {event.place}
                  </button>
                ) : (
                  <span className="timeline-place">{event.place}</span>
                ))}
            </li>
          );
        })}
      </ol>
      {person.events.length === 0 && (
        <p className="hint">No events are recorded for this person.</p>
      )}

      <Chips title="Parents" relation="parent" people={parentsOf(index, person)} />
      <Chips
        title="Spouses"
        relation="spouse"
        people={spousesOf(index, person).map((p) => p.spouse)}
      />
      <Chips title="Children" relation="child" people={childrenOf(index, person)} />
      <Chips title="Siblings" relation="sibling" people={siblingsOf(index, person)} />

      {person.notes.length > 0 && (
        <details className="notes">
          <summary>Notes ({person.notes.length})</summary>
          {person.notes.map((note, i) => (
            <p key={i} className="note">
              {note}
            </p>
          ))}
        </details>
      )}
    </article>
  );
}
