import { useMemo, useState } from 'react';
import { displayName, eventOf, lifespan, searchPeople } from '../gedcom/people';
import { useAppStore, type OpenTree } from '../state/appStore';

const MAX_RESULTS = 40;

export function RootPicker({ open }: { open: OpenTree }) {
  const chooseRoot = useAppStore((s) => s.chooseRoot);
  const setPickingRoot = useAppStore((s) => s.setPickingRoot);
  const closeTree = useAppStore((s) => s.closeTree);
  const [query, setQuery] = useState('');

  const matches = useMemo(() => searchPeople(open.tree, query, MAX_RESULTS), [open.tree, query]);
  const hasRoot = open.record.rootId !== null;

  return (
    <section className="panel" data-testid="root-picker" aria-labelledby="root-picker-title">
      <h2 id="root-picker-title">Who is the home person?</h2>
      <p>
        <strong>{open.record.name}</strong> is drawn from one person&apos;s point of view, usually
        you. You can change this later.
      </p>

      <label className="field">
        <span>Search by name</span>
        <input
          type="search"
          className="text-input"
          data-testid="root-search"
          value={query}
          autoFocus
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />
      </label>

      <p className="hint" role="status" data-testid="root-result-count">
        {matches.length === 0
          ? 'Nobody matches that name.'
          : query.trim() === ''
            ? 'The first people in the file:'
            : matches.length === MAX_RESULTS
              ? `The first ${MAX_RESULTS} matches. Type more to narrow it down.`
              : `${matches.length} ${matches.length === 1 ? 'match' : 'matches'}:`}
      </p>

      <ul className="person-list" data-testid="root-options">
        {matches.map((person) => {
          const years = lifespan(person);
          const place = eventOf(person, 'birth')?.place;
          return (
            <li key={person.id}>
              <button
                type="button"
                className="person-option"
                data-testid="root-option"
                data-person-id={person.id}
                aria-current={person.id === open.record.rootId ? 'true' : undefined}
                onClick={() => void chooseRoot(person.id)}
              >
                <span className="person-name">{displayName(person)}</span>
                <span className="person-meta">
                  {[years, place].filter(Boolean).join(' · ') || 'No dates or places recorded'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="row">
        {hasRoot ? (
          <button
            type="button"
            className="button quiet"
            data-testid="root-cancel"
            onClick={() => {
              setPickingRoot(false);
            }}
          >
            Cancel
          </button>
        ) : (
          <button
            type="button"
            className="button quiet"
            data-testid="back-to-library"
            onClick={closeTree}
          >
            Back to your trees
          </button>
        )}
      </div>
    </section>
  );
}
