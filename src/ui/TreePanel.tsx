import { displayName, eventOf, lifespan } from '../gedcom/people';
import { useAppStore, type OpenTree } from '../state/appStore';
import { familyCount, peopleCount } from './messages';

export function TreePanel({ open }: { open: OpenTree }) {
  const setPickingRoot = useAppStore((s) => s.setPickingRoot);
  const closeTree = useAppStore((s) => s.closeTree);
  const alreadyImported = useAppStore((s) => s.alreadyImported);

  const root = open.tree.people.find((person) => person.id === open.record.rootId);
  const years = root ? lifespan(root) : '';
  const birthPlace = root ? eventOf(root, 'birth')?.place : undefined;

  return (
    <section className="panel" data-testid="tree-panel" aria-labelledby="tree-title">
      <h2 id="tree-title" data-testid="tree-name">
        {open.record.name}
      </h2>
      {alreadyImported && (
        <p className="hint" role="status" data-testid="already-imported">
          That file was already in your trees, so it was opened rather than added again.
        </p>
      )}
      <p data-testid="tree-counts">
        {peopleCount(open.record.people)}, {familyCount(open.record.families)}.
      </p>

      <h3>Home person</h3>
      <p data-testid="home-person" data-person-id={root?.id}>
        <span className="person-name">{root ? displayName(root) : 'Not chosen'}</span>
        {(years || birthPlace) && (
          <span className="person-meta">{[years, birthPlace].filter(Boolean).join(' · ')}</span>
        )}
      </p>

      {open.record.warnings > 0 && (
        <p className="hint" data-testid="tree-warnings">
          {open.record.warnings.toLocaleString('en')}{' '}
          {open.record.warnings === 1 ? 'line or link' : 'lines or links'} in the file could not be
          read and {open.record.warnings === 1 ? 'was' : 'were'} skipped.
        </p>
      )}

      <div className="row">
        <button
          type="button"
          className="button"
          data-testid="change-root"
          onClick={() => {
            setPickingRoot(true);
          }}
        >
          Change home person
        </button>
        <button
          type="button"
          className="button quiet"
          data-testid="back-to-library"
          onClick={closeTree}
        >
          Back to your trees
        </button>
      </div>
    </section>
  );
}
