import { describe, expect, it } from 'vitest';
import { clampPrecision, formatAngle, formatDistance } from './measurements';

describe('clampPrecision', () => {
  it('clamps precision into the 1-4 range and rounds', () => {
    expect(clampPrecision(0)).toBe(1);
    expect(clampPrecision(2.6)).toBe(3);
    expect(clampPrecision(9)).toBe(4);
  });
});

describe('formatDistance', () => {
  it('formats with plain units by default', () => {
    expect(formatDistance(1.5344, 2)).toBe('1.53 A');
  });

  it('formats with the angstrom symbol when symbol units are enabled', () => {
    expect(formatDistance(1.5344, 3, true)).toBe('1.534 Å');
  });
});

describe('formatAngle', () => {
  it('formats with plain units by default', () => {
    expect(formatAngle(109.4712, 1)).toBe('109.5deg');
  });

  it('formats with the degree symbol when symbol units are enabled', () => {
    expect(formatAngle(109.4712, 2, true)).toBe('109.47°');
  });
});
