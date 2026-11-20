import { describe, expect, it } from 'vitest';
import { coveredBottom } from './panelPadding';

const map = { top: 0, bottom: 800, left: 0, right: 375 };

describe('coveredBottom', () => {
  it('is the height of a sheet along the bottom of a phone screen', () => {
    expect(coveredBottom({ top: 420, bottom: 760, left: 8, right: 367 }, map)).toBe(380);
  });

  it('is zero for a panel beside the map', () => {
    const wide = { top: 0, bottom: 800, left: 0, right: 1280 };
    expect(coveredBottom({ top: 16, bottom: 700, left: 16, right: 368 }, wide)).toBe(0);
  });

  it('is zero for a full-width panel at the top', () => {
    expect(coveredBottom({ top: 8, bottom: 300, left: 8, right: 367 }, map)).toBe(0);
  });
});
