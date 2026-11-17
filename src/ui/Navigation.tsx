import { useMemo, useState } from 'react';
import { displayName, lifespan, searchPeople } from '../gedcom/people';
import { fatherOf, indexTree, motherOf } from '../gedcom/relatives';
import type { Person } from '../gedcom/types';
import { useAppStore, type OpenTree } from '../state/appStore';

const MAX_RESULTS = 8;
/** A longer line keeps its two ends and drops the middle. */
const MAX_CRUMBS = 7;

export function PersonSearch({ open }: { open: OpenTree }) {
  const focusPerson = useAppStore((s) => s.focusPerson);
  const [query, setQuery] = useState('');
  const matches = useMemo(
    () => (query.trim() === '' ? [] : searchPeople(open.tree, query, MAX_RESULTS)),
    [open.tree, query],
  );

  return (
    <div className="search">
      <label className="field">
        <span>Find a person</span>
        <input
          type="search"
          className="text-input"
          data-testid="person-search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />
      </label>
      {query.trim() !== '' && (
        <ul className="person-list" data-testid="search-results" aria-label="Search results">
          {matches.length === 0 && (
            <li className="hint" data-testid="search-empty">
              Nobody matches that name.
            </li>
          )}
          {matches.map((person) => (
            <li key={person.id}>
              <button
                type="button"
                className="person-option"
                data-testid="search-result"
                data-person-id={person.id}
                onClick={() => {
                  focusPerson(person.id);
                  setQuery('');
                }}
              >
                <span className="person-name">{displayName(person)}</span>
                {lifespan(person) && <span className="person-meta">{lifespan(person)}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The line from the home person to the focused person, each step clickable. */
export function Breadcrumb({ open, path }: { open: OpenTree; path: string[] }) {
  const focusPerson = useAppStore((s) => s.focusPerson);
  if (path.length < 2) return null;
  const index = indexTree(open.tree);
  const shown: (string | null)[] =
    path.length <= MAX_CRUMBS ? path : [...path.slice(0, 2), null, ...path.slice(-4)];

  return (
    <nav aria-label="Line from the home person" data-testid="breadcrumb">
      <ol className="breadcrumb">
        {shown.map((id, i) => {
          const person = id === null ? undefined : index.people.get(id);
          if (!person) {
            return (
              <li key={`gap-${i}`} aria-label={`${path.length - 6} more`}>
                …
              </li>
            );
          }
          const current = i === shown.length - 1;
          return (
            <li key={person.id}>
              <button
                type="button"
                className="link"
                data-testid="breadcrumb-item"
                data-person-id={person.id}
                aria-current={current ? 'true' : undefined}
                disabled={current}
                onClick={() => {
                  focusPerson(person.id);
                }}
              >
                {displayName(person)}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function PedigreeSlot({ person, role }: { person: Person | undefined; role: string }) {
  const focusPerson = useAppStore((s) => s.focusPerson);
  if (!person) {
    return (
      <span className="pedigree-slot empty" data-testid="pedigree-empty">
        {role} unknown
      </span>
    );
  }
  return (
    <button
      type="button"
      className="pedigree-slot"
      data-testid="pedigree-person"
      data-person-id={person.id}
      title={`${role}: ${displayName(person)}`}
      onClick={() => {
        focusPerson(person.id);
      }}
    >
      {displayName(person)}
    </button>
  );
}

/** A small three-generation chart of the focused person, their parents and grandparents. */
export function Pedigree({ open, person }: { open: OpenTree; person: Person }) {
  const index = indexTree(open.tree);
  const father = fatherOf(index, person);
  const mother = motherOf(index, person);
  const up = (p: Person | undefined) =>
    p ? [fatherOf(index, p), motherOf(index, p)] : [undefined, undefined];
  const [ff, fm] = up(father);
  const [mf, mm] = up(mother);

  return (
    <aside className="pedigree" data-testid="pedigree" aria-label="Pedigree">
      <div className="pedigree-row">
        <PedigreeSlot person={ff} role="Grandfather" />
        <PedigreeSlot person={fm} role="Grandmother" />
        <PedigreeSlot person={mf} role="Grandfather" />
        <PedigreeSlot person={mm} role="Grandmother" />
      </div>
      <div className="pedigree-row">
        <PedigreeSlot person={father} role="Father" />
        <PedigreeSlot person={mother} role="Mother" />
      </div>
      <div className="pedigree-row">
        <span className="pedigree-slot self" data-testid="pedigree-self">
          {displayName(person)}
        </span>
      </div>
    </aside>
  );
}
