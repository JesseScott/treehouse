import { displayName } from '../gedcom/people';
import type { Person, Tree } from '../gedcom/types';
import type { ImportRecord } from '../library/db';
import { useAppStore, type SyncState } from '../state/appStore';
import { diffSummary, SYNC_ERRORS } from './messages';

/** How many names each list of the diff shows before "and N more". */
const LISTED = 12;

function PeopleList({
  title,
  ids,
  tree,
  testId,
}: {
  title: string;
  ids: string[];
  tree: Tree | undefined;
  testId: string;
}) {
  if (ids.length === 0 || !tree) return null;
  const byId = new Map<string, Person>(tree.people.map((p) => [p.id, p]));
  const shown = ids.slice(0, LISTED);
  return (
    <details className="sync-list" data-testid={testId}>
      <summary>
        {title} ({ids.length.toLocaleString('en')})
      </summary>
      <ul>
        {shown.map((id) => {
          const person = byId.get(id);
          return <li key={id}>{person ? displayName(person) : id}</li>;
        })}
        {ids.length > LISTED && <li>and {(ids.length - LISTED).toLocaleString('en')} more</li>}
      </ul>
    </details>
  );
}

/**
 * What a sync found and the buttons to apply or cancel it. Names come from the trees in this
 * browser; nothing here is sent anywhere.
 */
export function SyncReview({
  record,
  sync,
  oldTree,
}: {
  record: ImportRecord;
  sync: SyncState;
  /** The tree as stored, for the names of people the file no longer has. */
  oldTree: Tree | undefined;
}) {
  const applySync = useAppStore((s) => s.applySync);
  const closeSync = useAppStore((s) => s.closeSync);
  const close = (
    <button type="button" className="button quiet" data-testid="sync-close" onClick={closeSync}>
      {sync.phase === 'review' ? 'Cancel' : 'Close'}
    </button>
  );

  return (
    <div
      className="sync-review"
      data-testid="sync-review"
      data-phase={sync.phase}
      role="group"
      aria-label={`Sync ${record.name}`}
    >
      <p role="status" data-testid="sync-status">
        {sync.phase === 'reading' && 'Reading the file…'}
        {sync.phase === 'applying' && 'Saving the new version…'}
        {sync.phase === 'unchanged' && 'The file has not changed since it was imported.'}
        {sync.phase === 'done' && 'Synced. Your home person, focus and pins were kept.'}
        {sync.phase === 'review' && 'The file has changed:'}
      </p>
      {sync.phase === 'error' && sync.error && (
        <p className="error" role="alert" data-testid="sync-error" data-error-code={sync.error}>
          {SYNC_ERRORS[sync.error]}
        </p>
      )}
      {sync.phase === 'review' && sync.diff && (
        <>
          <p data-testid="sync-summary">
            {diffSummary(sync.diff).join(', ') || 'Only details the map does not show.'}.
          </p>
          <PeopleList
            title="Added"
            ids={sync.diff.added}
            tree={sync.next?.tree}
            testId="sync-added"
          />
          <PeopleList
            title="Removed"
            ids={sync.diff.removed}
            tree={oldTree}
            testId="sync-removed"
          />
          <PeopleList
            title="Changed"
            ids={sync.diff.changed}
            tree={sync.next?.tree}
            testId="sync-changed"
          />
          {sync.rootLost && (
            <p className="hint" data-testid="sync-root-lost">
              Your home person is not in the new file, so you will choose one again.
            </p>
          )}
          <p className="hint">Pins and places you looked up are kept: they belong to places.</p>
          <div className="row">
            <button
              type="button"
              className="button primary"
              data-testid="sync-apply"
              onClick={() => void applySync()}
            >
              Apply changes
            </button>
            {close}
          </div>
        </>
      )}
      {(sync.phase === 'unchanged' || sync.phase === 'done' || sync.phase === 'error') && (
        <div className="row">{close}</div>
      )}
    </div>
  );
}
