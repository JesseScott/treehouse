import { displayName, lifespan } from '../gedcom/people';
import { ancestorPath } from '../gedcom/lines';
import { fatherOf, indexTree, motherOf } from '../gedcom/relatives';
import { THREAD_COLORS, THREAD_KINDS, type ThreadKind } from '../map/threadData';
import { JOURNEY_SPEEDS, useAppStore, type OpenTree } from '../state/appStore';
import { focusOf } from '../state/focus';

const THREAD_WORDS: Record<ThreadKind, { label: string; hint: string }> = {
  lineage: { label: 'Line from home', hint: 'from the home person to whoever is shown' },
  family: { label: 'Close family', hint: 'to their parents, spouses and children' },
  ancestors: { label: 'All ancestors', hint: 'every ancestor of the home person' },
  migration: { label: 'Their moves', hint: 'their own places, in order' },
};

/** Check boxes for the kinds of thread drawn between relatives, each with its colour. */
export function ThreadToggles() {
  const threadsOn = useAppStore((s) => s.threadsOn);
  const setThread = useAppStore((s) => s.setThread);
  return (
    <fieldset className="threads" data-testid="thread-toggles">
      <legend className="visually-hidden">Threads on the map</legend>
      {THREAD_KINDS.map((kind) => (
        <label key={kind} className="check" title={THREAD_WORDS[kind].hint}>
          <input
            type="checkbox"
            data-testid={`thread-${kind}`}
            checked={threadsOn[kind]}
            onChange={(event) => {
              setThread(kind, event.target.checked);
            }}
          />
          <span className="swatch" aria-hidden="true" style={{ background: THREAD_COLORS[kind] }} />
          {THREAD_WORDS[kind].label}
        </label>
      ))}
    </fieldset>
  );
}

/** Buttons that start a journey from the home person back along a line. */
export function JourneyStart({ open }: { open: OpenTree }) {
  const startJourney = useAppStore((s) => s.startJourney);
  const focus = useAppStore(focusOf);
  const index = indexTree(open.tree);
  const rootId = open.record.rootId;
  const root = rootId === null ? undefined : index.people.get(rootId);
  const toFocused = rootId !== null && focus ? ancestorPath(index, rootId, focus.person.id) : null;

  return (
    <div className="row">
      <button
        type="button"
        className="button"
        data-testid="journey-paternal"
        disabled={!root || !fatherOf(index, root)}
        onClick={() => startJourney('paternal')}
      >
        Father’s line
      </button>
      <button
        type="button"
        className="button"
        data-testid="journey-maternal"
        disabled={!root || !motherOf(index, root)}
        onClick={() => startJourney('maternal')}
      >
        Mother’s line
      </button>
      <button
        type="button"
        className="button"
        data-testid="journey-ancestor"
        disabled={!toFocused}
        title={toFocused ? undefined : 'Show an ancestor of the home person first'}
        onClick={() => startJourney('ancestor')}
      >
        To this ancestor
      </button>
    </div>
  );
}

const LINE_WORDS = {
  paternal: 'Father’s line',
  maternal: 'Mother’s line',
  ancestor: 'Line to an ancestor',
} as const;

/** Playback for a journey: play or pause, a scrubber over the generations, and the speed. */
export function JourneyBar({ open }: { open: OpenTree }) {
  const journey = useAppStore((s) => s.journey);
  const journeyTo = useAppStore((s) => s.journeyTo);
  const setPlaying = useAppStore((s) => s.setJourneyPlaying);
  const setSpeed = useAppStore((s) => s.setJourneySpeed);
  const endJourney = useAppStore((s) => s.endJourney);
  if (!journey) return null;

  const person = indexTree(open.tree).people.get(journey.stops[journey.index] ?? '');
  const last = journey.stops.length - 1;
  const years = person ? lifespan(person) : '';

  return (
    <section
      className="journey-bar"
      data-testid="journey-bar"
      data-playing={journey.playing}
      aria-label="Journey"
    >
      <div className="journey-head">
        <strong>{LINE_WORDS[journey.line]}</strong>
        <span data-testid="journey-position" aria-live="polite">
          Generation {journey.index + 1} of {last + 1}
          {person && `: ${displayName(person)}`}
          {years && ` (${years})`}
        </span>
      </div>
      <div className="journey-controls">
        <button
          type="button"
          className="button"
          data-testid="journey-play"
          onClick={() => {
            setPlaying(!journey.playing);
          }}
        >
          {journey.playing ? 'Pause' : journey.index === last ? 'Play again' : 'Play'}
        </button>
        <input
          type="range"
          className="journey-scrubber"
          data-testid="journey-scrubber"
          aria-label="Generation"
          aria-valuetext={`Generation ${journey.index + 1} of ${last + 1}`}
          min={0}
          max={last}
          step={1}
          value={journey.index}
          onChange={(event) => {
            setPlaying(false);
            journeyTo(Number(event.target.value));
          }}
        />
        <label className="journey-speed">
          <span className="visually-hidden">Speed</span>
          <select
            data-testid="journey-speed"
            value={journey.speed}
            onChange={(event) => {
              setSpeed(Number(event.target.value));
            }}
          >
            {JOURNEY_SPEEDS.map((speed) => (
              <option key={speed} value={speed}>
                {speed}×
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="button quiet"
          data-testid="journey-close"
          onClick={endJourney}
        >
          End
        </button>
      </div>
    </section>
  );
}
