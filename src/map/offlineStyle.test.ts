import { describe, expect, it } from 'vitest';
import { offlineStyle } from './offlineStyle';

describe('offlineStyle', () => {
  const style = offlineStyle('/assets/land.geojson');

  it('uses the globe projection', () => {
    expect(style.projection).toEqual({ type: 'globe' });
  });

  it('needs no network: no tiles, glyphs, sprites or remote URLs', () => {
    expect(style.glyphs).toBeUndefined();
    expect(style.sprite).toBeUndefined();
    expect(Object.values(style.sources).map((s) => s.type)).toEqual(['geojson']);
    expect(JSON.stringify(style)).not.toMatch(/https?:\/\//);
  });

  it('has no text layers, which would need glyphs', () => {
    expect(style.layers.some((layer) => layer.type === 'symbol')).toBe(false);
  });
});
