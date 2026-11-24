import { useEffect, useRef, useState, type DragEvent } from 'react';
import { MapView } from './map/MapView';
import { FocusPin } from './map/FocusPin';
import { PlaceMarkers } from './map/PlaceMarkers';
import { PlacePin } from './map/PlacePin';
import { usePanelPadding } from './map/panelPadding';
import { Threads } from './map/Threads';
import { droppedHandle } from './library/fileAccess';
import { screenOf, useAppStore } from './state/appStore';
import { LibraryPanel } from './ui/LibraryPanel';
import { PlaceCard } from './ui/PlaceCard';
import { PlacesPanel } from './ui/PlacesPanel';
import { RootPicker } from './ui/RootPicker';
import { TreePanel } from './ui/TreePanel';
import { focusPanelHeading } from './ui/panelFocus';

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

  // When the side panel changes (library, picker, tree, places), keyboard focus follows it, so
  // a keyboard or screen reader user is not left on a button that has gone. Not on first load.
  usePanelPadding(screen, mapLoaded);

  const shownScreen = useRef(screen);
  useEffect(() => {
    if (shownScreen.current === screen) return;
    shownScreen.current = screen;
    focusPanelHeading();
  }, [screen]);

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
        // Where the browser offers it, the file's handle is kept so the import can be synced.
        const handle = droppedHandle(event.dataTransfer.items);
        if (file) void handle.then((h) => importFile(file, h));
      }}
    >
      <a
        className="skip-link"
        href="#main"
        data-testid="skip-link"
        onClick={(event) => {
          event.preventDefault();
          focusPanelHeading();
        }}
      >
        Skip to the side panel
      </a>
      <header className="app-header" data-testid="app-header">
        <h1 className="app-title">treehouse</h1>
        <p className="app-tagline">Walk your family tree across the world.</p>
      </header>
      <main className="app-main" id="main">
        <MapView />
        <Threads />
        <PlaceMarkers />
        <FocusPin />
        <PlacePin />
        {screen === 'library' && <LibraryPanel />}
        {screen === 'root-picker' && open && <RootPicker key={open.record.id} open={open} />}
        {screen === 'tree' && open && <TreePanel open={open} />}
        {screen === 'places' && open && <PlacesPanel open={open} />}
        {screen === 'tree' && open && <PlaceCard open={open} />}
        {dragging && (
          <div className="drop-overlay" data-testid="drop-overlay">
            Drop the file to open it
          </div>
        )}
      </main>
    </div>
  );
}
