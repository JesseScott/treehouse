import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import type { Tree } from '../gedcom/types';
import { loadTree, type ImportRecord } from '../library/db';
import { useAppStore } from '../state/appStore';
import { IMPORT_ERRORS, importedOn, PLACE_FILE_ERRORS, peopleCount, pinCount } from './messages';
import { SyncReview } from './SyncReview';

/** The stored tree of an import, read while its sync is being reviewed (for removed names). */
function useStoredTree(id: string, wanted: boolean): Tree | undefined {
  const [tree, setTree] = useState<{ id: string; tree: Tree } | undefined>();
  useEffect(() => {
    if (!wanted) return;
    let live = true;
    void loadTree(id).then((loaded) => {
      if (live && loaded) setTree({ id, tree: loaded });
    });
    return () => {
      live = false;
    };
  }, [id, wanted]);
  return wanted && tree?.id === id ? tree.tree : undefined;
}

function LibraryItem({ record }: { record: ImportRecord }) {
  const openImport = useAppStore((s) => s.openImport);
  const renameImport = useAppStore((s) => s.renameImport);
  const deleteImport = useAppStore((s) => s.deleteImport);
  const syncImport = useAppStore((s) => s.syncImport);
  const syncFromFile = useAppStore((s) => s.syncFromFile);
  const sync = useAppStore((s) => (s.sync?.importId === record.id ? s.sync : null));
  const remembered = useAppStore((s) => s.fileHandleIds.includes(record.id));
  const [mode, setMode] = useState<'view' | 'rename' | 'delete'>('view');
  const [name, setName] = useState(record.name);
  const syncInput = useRef<HTMLInputElement>(null);
  const oldTree = useStoredTree(record.id, sync?.phase === 'review');
  const syncing = sync?.phase === 'reading' || sync?.phase === 'applying';

  const submitRename = (event: SyntheticEvent) => {
    event.preventDefault();
    void renameImport(record.id, name).then(() => {
      setMode('view');
    });
  };

  return (
    <li className="library-item" data-testid="library-item" data-import-id={record.id}>
      {mode === 'rename' ? (
        <form className="row" onSubmit={submitRename}>
          <input
            className="text-input"
            data-testid="rename-input"
            aria-label={`New name for ${record.name}`}
            value={name}
            autoFocus
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
          <button type="submit" className="button" data-testid="rename-save">
            Save
          </button>
          <button
            type="button"
            className="button quiet"
            onClick={() => {
              setName(record.name);
              setMode('view');
            }}
          >
            Cancel
          </button>
        </form>
      ) : (
        <>
          <button
            type="button"
            className="library-open"
            data-testid="library-open"
            onClick={() => void openImport(record.id)}
          >
            <span className="library-name">{record.name}</span>
            <span className="library-meta">
              {peopleCount(record.people)} · added {importedOn(record.importedAt)}
              {record.syncedAt && ` · synced ${importedOn(record.syncedAt)}`}
            </span>
          </button>
          {mode === 'delete' ? (
            <div className="row" role="group" aria-label={`Delete ${record.name}?`}>
              <span className="confirm-text">Delete this tree from your browser?</span>
              <button
                type="button"
                className="button danger"
                data-testid="delete-confirm"
                onClick={() => void deleteImport(record.id)}
              >
                Delete
              </button>
              <button
                type="button"
                className="button quiet"
                onClick={() => {
                  setMode('view');
                }}
              >
                Keep
              </button>
            </div>
          ) : (
            <div className="row">
              <input
                ref={syncInput}
                type="file"
                accept=".ged,.gedcom,.zip"
                className="visually-hidden"
                data-testid="sync-file-input"
                aria-label={`New version of ${record.name}`}
                tabIndex={-1}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void syncFromFile(record.id, file);
                }}
              />
              <button
                type="button"
                className="button quiet"
                data-testid="sync-button"
                aria-label={`Sync ${record.name} with its file`}
                title={
                  remembered
                    ? 'Read the file again and show what changed'
                    : 'Choose the newer export of this tree and see what changed'
                }
                disabled={syncing}
                onClick={() => {
                  // Without a picker that remembers files, the input has to be opened now,
                  // while the click still counts as the user's.
                  void syncImport(record.id).then((started) => {
                    if (!started) syncInput.current?.click();
                  });
                }}
              >
                {syncing ? 'Syncing…' : 'Sync'}
              </button>
              <button
                type="button"
                className="button quiet"
                data-testid="rename-button"
                aria-label={`Rename ${record.name}`}
                onClick={() => {
                  setMode('rename');
                }}
              >
                Rename
              </button>
              <button
                type="button"
                className="button quiet"
                data-testid="delete-button"
                aria-label={`Delete ${record.name}`}
                onClick={() => {
                  setMode('delete');
                }}
              >
                Delete
              </button>
            </div>
          )}
          {sync && <SyncReview record={record} sync={sync} oldTree={oldTree} />}
        </>
      )}
    </li>
  );
}

export function LibraryPanel() {
  const library = useAppStore((s) => s.library);
  const libraryLoaded = useAppStore((s) => s.libraryLoaded);
  const importing = useAppStore((s) => s.importing);
  const importError = useAppStore((s) => s.importError);
  const importFile = useAppStore((s) => s.importFile);
  const pickAndImport = useAppStore((s) => s.pickAndImport);
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <section className="panel" data-testid="library-panel" aria-labelledby="library-title">
      <h2 id="library-title">Your trees</h2>

      {libraryLoaded && library.length === 0 && (
        <p data-testid="empty-state">
          No tree yet. Open a GEDCOM file to begin: a .ged file, or the .zip a family tree site
          gives you when you export.
        </p>
      )}

      {library.length > 0 && (
        <ul className="library-list" data-testid="library-list">
          {library.map((record) => (
            <LibraryItem key={record.id} record={record} />
          ))}
        </ul>
      )}

      <input
        ref={fileInput}
        type="file"
        accept=".ged,.gedcom,.zip"
        className="visually-hidden"
        data-testid="file-input"
        aria-label="GEDCOM file to open"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void importFile(file);
        }}
      />
      <button
        type="button"
        className="button primary"
        data-testid="open-file-button"
        disabled={importing}
        onClick={() => {
          // Chromium's picker lets the file be remembered for syncing; elsewhere, the input.
          void pickAndImport().then((picked) => {
            if (!picked) fileInput.current?.click();
          });
        }}
      >
        {importing ? 'Reading…' : 'Open a GEDCOM file'}
      </button>
      <p className="hint">Or drop a file anywhere on this page.</p>

      <p className="status" role="status" data-testid="import-status">
        {importing ? 'Reading the file…' : ''}
      </p>
      {importError && (
        <p className="error" role="alert" data-testid="import-error" data-error-code={importError}>
          {IMPORT_ERRORS[importError]}
        </p>
      )}

      <PlaceFileSection />

      <p className="privacy-note">
        Your file is read in this browser and stored only here. It is never uploaded.
      </p>
    </section>
  );
}

/** Saving pins and online answers to a file, and reading them back (in another browser, say). */
function PlaceFileSection() {
  const stored = useAppStore((s) => s.storedPlaces);
  const busy = useAppStore((s) => s.placeFileBusy);
  const status = useAppStore((s) => s.placeFileStatus);
  const exportPlaces = useAppStore((s) => s.exportPlaces);
  const importPlaces = useAppStore((s) => s.importPlaces);
  const input = useRef<HTMLInputElement>(null);

  return (
    <section className="place-file" data-testid="place-file" aria-labelledby="place-file-title">
      <h3 id="place-file-title">Your pins</h3>
      <p className="hint" data-testid="stored-places">
        {stored === 0
          ? 'No pins or online answers yet. Pins you set and places found online are shared by all your trees.'
          : `${pinCount(stored)}, shared by all your trees. The file holds place names and where they are, nothing else.`}
      </p>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        className="visually-hidden"
        data-testid="place-file-input"
        aria-label="File of pins to read"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void importPlaces(file);
        }}
      />
      <div className="row">
        <button
          type="button"
          className="button quiet"
          data-testid="export-places"
          disabled={busy || stored === 0}
          onClick={() => void exportPlaces()}
        >
          Save pins to a file
        </button>
        <button
          type="button"
          className="button quiet"
          data-testid="import-places"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          Read pins from a file
        </button>
      </div>
      {status?.kind === 'exported' && (
        <p className="hint" role="status" data-testid="place-file-status">
          Saved {pinCount(status.places)}.
        </p>
      )}
      {status?.kind === 'imported' && (
        <p className="hint" role="status" data-testid="place-file-status">
          Read {status.added.toLocaleString('en')} new and {status.updated.toLocaleString('en')}{' '}
          updated
          {status.skipped > 0 && `; ${status.skipped.toLocaleString('en')} already here`}
          {status.invalid > 0 && `; ${status.invalid.toLocaleString('en')} could not be read`}.
        </p>
      )}
      {status?.kind === 'error' && (
        <p
          className="error"
          role="alert"
          data-testid="place-file-error"
          data-error-code={status.code}
        >
          {PLACE_FILE_ERRORS[status.code]}
        </p>
      )}
    </section>
  );
}
