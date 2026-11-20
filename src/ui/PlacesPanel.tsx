import { useState } from 'react';
import { coverageOf } from '../geocode/treePlaces';
import { lookupCandidates, useAppStore, type OpenTree, type ReviewPlace } from '../state/appStore';
import { coverageSummary, eventCount, placeCount, placeOutcome } from './messages';

/** A long list is cut here; the needs-attention filter is what keeps it short. */
const MAX_ROWS = 200;

function PlaceActions({ place }: { place: ReviewPlace }) {
  const pinning = useAppStore((s) => s.pinning);
  const setPinning = useAppStore((s) => s.setPinning);
  const resetPlace = useAppStore((s) => s.resetPlace);
  const stored = place.result.status !== 'unresolved' && place.result.source !== 'gazetteer';

  return (
    <div className="place-actions" data-testid="place-actions">
      <div className="row">
        <button
          type="button"
          className="button"
          data-testid="pin-place"
          aria-pressed={pinning}
          onClick={() => {
            setPinning(!pinning);
          }}
        >
          {pinning ? 'Cancel' : 'Set on the map'}
        </button>
        {stored && (
          <button
            type="button"
            className="button quiet"
            data-testid="reset-place"
            onClick={() => void resetPlace(place.key)}
          >
            {place.result.status !== 'unresolved' && place.result.source === 'manual'
              ? 'Remove my pin'
              : 'Forget the online result'}
          </button>
        )}
      </div>
      <p className="hint" role="status" data-testid="pin-hint">
        {pinning
          ? 'Click the map where this place is.'
          : place.result.status === 'unresolved'
            ? 'Not on the map yet.'
            : 'You can also drag the pin on the map.'}
      </p>
    </div>
  );
}

function OnlineLookupSection({ places }: { places: ReviewPlace[] }) {
  const online = useAppStore((s) => s.online);
  const setOnlineEnabled = useAppStore((s) => s.setOnlineEnabled);
  const lookUpPlacesOnline = useAppStore((s) => s.lookUpPlacesOnline);
  const stopOnlineLookup = useAppStore((s) => s.stopOnlineLookup);
  const todo = lookupCandidates(places).length;

  return (
    <>
      <h3>Online lookup</h3>
      <label className="check">
        <input
          type="checkbox"
          data-testid="online-opt-in"
          checked={online.enabled}
          onChange={(event) => {
            setOnlineEnabled(event.target.checked);
          }}
        />
        <span>Allow looking places up online</span>
      </label>
      <p className="hint">
        Off unless you turn it on. It asks OpenStreetMap&apos;s Nominatim service about the places
        the built-in list could not place exactly, one a second. Only the place text is sent, never
        a name or a date.
      </p>
      {online.enabled && (
        <div className="row">
          {online.running ? (
            <button
              type="button"
              className="button"
              data-testid="online-stop"
              onClick={stopOnlineLookup}
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              className="button"
              data-testid="online-start"
              disabled={todo === 0}
              onClick={() => void lookUpPlacesOnline()}
            >
              {todo === 0 ? 'Nothing left to look up' : `Look up ${placeCount(todo)} online`}
            </button>
          )}
        </div>
      )}
      <p className="hint status" role="status" data-testid="online-status">
        {online.running
          ? `Looked up ${online.done} of ${online.total}…`
          : online.total > 0 && !online.error
            ? `Looked up ${placeCount(online.done)}.`
            : ''}
      </p>
      {online.error && (
        <p className="error" role="alert" data-testid="online-error">
          The lookup service could not be reached. What was found so far is kept; try again later.
        </p>
      )}
    </>
  );
}

export function PlacesPanel({ open }: { open: OpenTree }) {
  const places = useAppStore((s) => s.places);
  const geocoding = useAppStore((s) => s.geocoding);
  const geocodeError = useAppStore((s) => s.geocodeError);
  const selectedKey = useAppStore((s) => s.selectedPlaceKey);
  const selectPlace = useAppStore((s) => s.selectPlace);
  const setReviewingPlaces = useAppStore((s) => s.setReviewingPlaces);
  const [showAll, setShowAll] = useState(false);

  const coverage = coverageOf(places);
  const attention = coverage.approximate + coverage.unresolved;
  // The selected place stays listed after it is pinned, so it does not vanish under the cursor.
  const listed = places
    .filter((p) => showAll || p.result.status !== 'resolved' || p.key === selectedKey)
    .sort(
      (a, b) =>
        Number(a.result.status !== 'unresolved') - Number(b.result.status !== 'unresolved') ||
        b.events - a.events,
    );

  return (
    <section className="panel" data-testid="places-panel" aria-labelledby="places-title">
      <h2 id="places-title" tabIndex={-1} data-panel-heading>
        Places in {open.record.name}
      </h2>
      <p role="status" data-testid="places-summary">
        {geocoding ? 'Finding places on the map…' : coverageSummary(coverage)}
      </p>
      {geocodeError && (
        <p className="error" role="alert" data-testid="geocode-error">
          The built-in list of places could not be loaded, so nothing could be placed. Check your
          connection and open the tree again.
        </p>
      )}

      <div className="row" role="group" aria-label="Which places to list">
        <button
          type="button"
          className="button"
          data-testid="filter-attention"
          aria-pressed={!showAll}
          onClick={() => {
            setShowAll(false);
          }}
        >
          To check ({attention.toLocaleString('en')})
        </button>
        <button
          type="button"
          className="button"
          data-testid="filter-all"
          aria-pressed={showAll}
          onClick={() => {
            setShowAll(true);
          }}
        >
          All ({coverage.places.toLocaleString('en')})
        </button>
      </div>

      {listed.length === 0 && !geocoding && (
        <p className="hint" data-testid="places-empty">
          {coverage.places === 0
            ? 'This tree names no places.'
            : 'Every place was found. Nothing to check.'}
        </p>
      )}
      <ul className="person-list" data-testid="place-list">
        {listed.slice(0, MAX_ROWS).map((place) => (
          <li key={place.key}>
            <button
              type="button"
              className="person-option"
              data-testid="place-option"
              data-status={place.result.status}
              aria-current={place.key === selectedKey ? 'true' : undefined}
              onClick={() => {
                selectPlace(place.key === selectedKey ? null : place.key);
              }}
            >
              <span className="person-name">{place.text}</span>
              <span className="person-meta">
                {eventCount(place.events)} · {placeOutcome(place.result)}
              </span>
            </button>
            {place.key === selectedKey && <PlaceActions place={place} />}
          </li>
        ))}
      </ul>
      {listed.length > MAX_ROWS && (
        <p className="hint">
          Showing the first {MAX_ROWS} of {listed.length.toLocaleString('en')}.
        </p>
      )}

      <OnlineLookupSection places={places} />

      <p className="hint">
        Place data from GeoNames (CC BY 4.0). Online results © OpenStreetMap contributors.
      </p>
      <div className="row">
        <button
          type="button"
          className="button quiet"
          data-testid="back-to-tree"
          onClick={() => {
            setReviewingPlaces(false);
          }}
        >
          Back to the tree
        </button>
      </div>
    </section>
  );
}
