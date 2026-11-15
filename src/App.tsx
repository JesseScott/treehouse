import { useEffect, useState, type DragEvent } from 'react';
import { MapView } from './map/MapView';
import { screenOf, useAppStore } from './state/appStore';
import { LibraryPanel } from './ui/LibraryPanel';
import { RootPicker } from './ui/RootPicker';
import { TreePanel } from './ui/TreePanel';

const hasFiles = (event: DragEvent) => event.dataTransfer.types.includes('Files');

export function App() {
  const mapLoaded = useAppStore((s) => s.mapLoaded);
  const open = useAppStore((s) => s.open);
  const screen = useAppStore(screenOf);
  const loadLibrary = useAppStore((s) => s.loadLibrary);
  const importFile = useAppStore((s) => s.importFile);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  return (
    <div
      className="app"
      data-testid="app-shell"
      data-map-loaded={mapLoaded}
      data-screen={screen}
      onDragOver={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDragging(false);
      }}
      onDrop={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files[0];
        if (file) void importFile(file);
      }}
    >
      <header className="app-header" data-testid="app-header">
        <h1 className="app-title">treehouse</h1>
        <p className="app-tagline">Walk your family tree across the world.</p>
      </header>
      <main className="app-main">
        <MapView />
        {screen === 'library' && <LibraryPanel />}
        {screen === 'root-picker' && open && <RootPicker key={open.record.id} open={open} />}
        {screen === 'tree' && open && <TreePanel open={open} />}
        {dragging && (
          <div className="drop-overlay" data-testid="drop-overlay">
            Drop the file to open it
          </div>
        )}
      </main>
    </div>
  );
}
