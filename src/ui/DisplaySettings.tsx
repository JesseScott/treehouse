import { useAppStore } from '../state/appStore';
import type { MotionSetting } from '../state/motion';

const MOTION_WORDS: Record<MotionSetting, string> = {
  system: 'As the system says',
  on: 'Fly between places',
  off: 'Cut between places',
};

/** Settings kept in this browser for every tree: hiding living people, and camera motion. */
export function DisplaySettings() {
  const hideLiving = useAppStore((s) => s.hideLiving);
  const setHideLiving = useAppStore((s) => s.setHideLiving);
  const motion = useAppStore((s) => s.motion);
  const setMotion = useAppStore((s) => s.setMotion);
  const hidden = useAppStore((s) => s.open?.tree.people.filter((p) => p.living).length ?? 0);
  return (
    <div className="display-settings" data-testid="display-settings">
      <label className="check">
        <input
          type="checkbox"
          data-testid="hide-living"
          checked={hideLiving}
          aria-describedby="hide-living-hint"
          onChange={(event) => {
            setHideLiving(event.target.checked);
          }}
        />
        Hide living people
      </label>
      <p className="hint" id="hide-living-hint" data-testid="hide-living-hint">
        {hideLiving
          ? `${hidden.toLocaleString('en')} ${hidden === 1 ? 'person is' : 'people are'} shown as “Living”, with no dates or places.`
          : 'Shows anyone born in the last 100 years with no death recorded as “Living”, with no dates or places.'}
      </p>
      <label className="field">
        <span>Camera</span>
        <select
          data-testid="motion-setting"
          value={motion}
          onChange={(event) => {
            setMotion(event.target.value as MotionSetting);
          }}
        >
          {(Object.keys(MOTION_WORDS) as MotionSetting[]).map((value) => (
            <option key={value} value={value}>
              {MOTION_WORDS[value]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
