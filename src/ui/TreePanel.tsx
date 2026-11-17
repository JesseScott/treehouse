import { useState } from 'react';
import { displayName, lifespan } from '../gedcom/people';
import { indexTree } from '../gedcom/relatives';
import { coverageOf } from '../geocode/treePlaces';
import { currentMap } from '../map/mapRegistry';
import { projectionName } from '../map/camera';
import { useAppStore, type OpenTree } from '../state/appStore';
import { focusOf } from '../state/focus';
import { coverageSummary, familyCount, peopleCount } from './messages';
import { Breadcrumb, Pedigree, PersonSearch } from './Navigation';
import { useArrowKeys } from './useArrowKeys';
import { Profile } from './Profile';

function ProjectionToggle() {
  const mapLoaded = useAppStore((s) => s.mapLoaded);
  const [globe, setGlobe] = useState(() => {
    const map = currentMap();
    return !map || projectionName(map) === 'globe';
  });
  return (
    <button
      type="button"
      className="button"
      data-testid="projection-toggle"
      disabled={!mapLoaded}
      onClick={() => {
        currentMap()?.setProjection({ type: globe ? 'mercator' : 'globe' });
        setGlobe(!globe);
      }}
    >
      {globe ? 'Flat map' : 'Globe'}
    </button>
  );
}

export function TreePanel({ open }: { open: OpenTree }) {
  const setPickingRoot = useAppStore((s) => s.setPickingRoot);
  const closeTree = useAppStore((s) => s.closeTree);
  const focusPerson = useAppStore((s) => s.focusPerson);
  const alreadyImported = useAppStore((s) => s.alreadyImported);
  const places = useAppStore((s) => s.places);
  const geocoding = useAppStore((s) => s.geocoding);
  const geocodeError = useAppStore((s) => s.geocodeError);
  const setReviewingPlaces = useAppStore((s) => s.setReviewingPlaces);
  const focus = useAppStore(focusOf);
  useArrowKeys();

  const root =
    open.record.rootId === null ? undefined : indexTree(open.tree).people.get(open.record.rootId);
  const years = root ? lifespan(root) : '';

  return (
    <>
      <section className="panel" data-testid="tree-panel" aria-labelledby="tree-title">
        <h2 id="tree-title" className="tree-title" data-testid="tree-name">
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

        <PersonSearch open={open} />
        {focus && <Breadcrumb open={open} path={focus.relationship.path} />}
        {focus && <Profile open={open} focus={focus} />}
        <p className="hint">
          Arrow keys walk the tree: up for the father (shift for the mother), down for a child, left
          and right for siblings and spouses.
        </p>

        <h3>Home person</h3>
        <p data-testid="home-person" data-person-id={root?.id}>
          {root ? (
            <button
              type="button"
              className="link person-name"
              data-testid="focus-home"
              onClick={() => {
                focusPerson(root.id);
              }}
            >
              {displayName(root)}
            </button>
          ) : (
            <span className="person-name">Not chosen</span>
          )}
          {years && <span className="person-meta">{years}</span>}
        </p>

        <h3>Places</h3>
        <p role="status" data-testid="geocode-summary">
          {geocoding
            ? 'Finding places on the map…'
            : geocodeError
              ? 'The built-in list of places could not be loaded.'
              : coverageSummary(coverageOf(places))}
        </p>
        <div className="row">
          <button
            type="button"
            className="button"
            data-testid="review-places"
            onClick={() => {
              setReviewingPlaces(true);
            }}
          >
            Review places
          </button>
          <ProjectionToggle />
        </div>

        {open.record.warnings > 0 && (
          <p className="hint" data-testid="tree-warnings">
            {open.record.warnings.toLocaleString('en')}{' '}
            {open.record.warnings === 1 ? 'line or link' : 'lines or links'} in the file could not
            be read and {open.record.warnings === 1 ? 'was' : 'were'} skipped.
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
      {focus && <Pedigree open={open} person={focus.person} />}
    </>
  );
}
