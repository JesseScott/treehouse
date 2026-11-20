import { useEffect, useRef } from 'react';
import { displayName, lifespan } from '../gedcom/people';
import { indexTree } from '../gedcom/relatives';
import { placeVisits, type Visit } from '../geocode/treePlaces';
import { useAppStore, type OpenTree } from '../state/appStore';
import { EVENT_WORDS, peopleCount, placeOutcome } from './messages';

/** The people with events at the place whose marker was clicked. */
export function PlaceCard({ open }: { open: OpenTree }) {
  const key = useAppStore((s) => s.openedPlaceKey);
  const place = useAppStore((s) => s.places.find((p) => p.key === s.openedPlaceKey));
  const focusPerson = useAppStore((s) => s.focusPerson);
  const openPlace = useAppStore((s) => s.openPlace);
  const heading = useRef<HTMLHeadingElement>(null);
  // Opening a place moves keyboard focus to its card, so its list is next in the tab order.
  useEffect(() => {
    if (key !== null) heading.current?.focus();
  }, [key]);
  if (key === null || !place) return null;

  const index = indexTree(open.tree);
  const byPerson = new Map<string, Visit[]>();
  for (const visit of placeVisits(open.tree).get(key) ?? []) {
    const list = byPerson.get(visit.personId);
    if (list) list.push(visit);
    else byPerson.set(visit.personId, [visit]);
  }

  return (
    <aside
      className="place-card"
      data-testid="place-card"
      aria-labelledby="place-card-title"
      onKeyDown={(event) => {
        if (event.key === 'Escape') openPlace(null);
      }}
    >
      <div className="place-card-head">
        <h2 id="place-card-title" ref={heading} tabIndex={-1} data-card-heading>
          {place.text}
        </h2>
        <button
          type="button"
          className="button quiet"
          data-testid="close-place-card"
          aria-label="Close"
          onClick={() => {
            openPlace(null);
          }}
        >
          ✕
        </button>
      </div>
      <p className="hint">
        {peopleCount(byPerson.size)} · {placeOutcome(place.result)}
      </p>
      <ul className="person-list" data-testid="place-people">
        {[...byPerson].map(([personId, visits]) => {
          const person = index.people.get(personId);
          if (!person) return null;
          const what = visits
            .map((v) => `${EVENT_WORDS[v.type]}${v.year === undefined ? '' : ` ${v.year}`}`)
            .join(', ');
          return (
            <li key={personId}>
              <button
                type="button"
                className="person-option"
                data-testid="place-person"
                data-person-id={personId}
                onClick={() => {
                  focusPerson(personId);
                }}
              >
                <span className="person-name">{displayName(person)}</span>
                <span className="person-meta">
                  {[lifespan(person), what].filter(Boolean).join(' · ')}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
