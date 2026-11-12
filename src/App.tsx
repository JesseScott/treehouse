import { MapView } from './map/MapView';
import { useAppStore } from './state/appStore';

export function App() {
  const mapLoaded = useAppStore((s) => s.mapLoaded);
  return (
    <div className="app" data-testid="app-shell" data-map-loaded={mapLoaded}>
      <header className="app-header" data-testid="app-header">
        <h1 className="app-title">treehouse</h1>
        <p className="app-tagline">Walk your family tree across the world.</p>
      </header>
      <main className="app-main">
        <MapView />
        <section className="empty-state" data-testid="empty-state" aria-label="Getting started">
          <h2>No tree yet</h2>
          <p>
            Soon you will be able to open a GEDCOM file here. It stays in your browser and is never
            uploaded.
          </p>
        </section>
      </main>
    </div>
  );
}
