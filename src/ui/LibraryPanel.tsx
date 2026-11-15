import { useRef, useState, type SyntheticEvent } from 'react';
import type { ImportRecord } from '../library/db';
import { useAppStore } from '../state/appStore';
import { IMPORT_ERRORS, importedOn, peopleCount } from './messages';

function LibraryItem({ record }: { record: ImportRecord }) {
  const openImport = useAppStore((s) => s.openImport);
  const renameImport = useAppStore((s) => s.renameImport);
  const deleteImport = useAppStore((s) => s.deleteImport);
  const [mode, setMode] = useState<'view' | 'rename' | 'delete'>('view');
  const [name, setName] = useState(record.name);

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
        onClick={() => fileInput.current?.click()}
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

      <p className="privacy-note">
        Your file is read in this browser and stored only here. It is never uploaded.
      </p>
    </section>
  );
}
