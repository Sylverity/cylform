import { describe, expect, it } from 'vitest';
import {
  numberedPngPath,
  resolveExportFrameIndices,
  sanitizeExportFileName,
} from './exportWorkflow';

const selection = (
  frameSelection: 'current' | 'range' | 'every-nth',
  frameStart = 1,
  frameEnd = 1,
  frameStep = 1,
) => ({ frameSelection, frameStart, frameEnd, frameStep });

describe('resolveExportFrameIndices', () => {
  it('uses the current frame for single-frame molecules', () => {
    expect(resolveExportFrameIndices(selection('range', 1, 10), 1, 0)).toEqual([0]);
  });

  it('uses the current frame when selection is current', () => {
    expect(resolveExportFrameIndices(selection('current'), 20, 7)).toEqual([7]);
  });

  it('resolves an inclusive 1-based range to zero-based indices', () => {
    expect(resolveExportFrameIndices(selection('range', 2, 5), 10, 0)).toEqual([1, 2, 3, 4]);
  });

  it('clamps out-of-bounds ranges to the frame count', () => {
    expect(resolveExportFrameIndices(selection('range', -3, 99), 4, 0)).toEqual([0, 1, 2, 3]);
  });

  it('swaps reversed start and end bounds', () => {
    expect(resolveExportFrameIndices(selection('range', 5, 2), 10, 0)).toEqual([1, 2, 3, 4]);
  });

  it('samples every Nth frame', () => {
    expect(resolveExportFrameIndices(selection('every-nth', 1, 10, 3), 10, 0)).toEqual([0, 3, 6, 9]);
  });

  it('treats non-positive steps as 1', () => {
    expect(resolveExportFrameIndices(selection('every-nth', 1, 3, 0), 10, 0)).toEqual([0, 1, 2]);
  });
});

describe('numberedPngPath', () => {
  it('keeps the chosen path for single-frame exports', () => {
    expect(numberedPngPath('/out/figure.png', 4, 1)).toBe('/out/figure.png');
  });

  it('numbers sequence frames with a 1-based padded suffix', () => {
    expect(numberedPngPath('/out/figure.png', 0, 3)).toBe('/out/figure_0001.png');
    expect(numberedPngPath('/out/figure.png', 41, 3)).toBe('/out/figure_0042.png');
  });

  it('appends the png extension when the target has none', () => {
    expect(numberedPngPath('/out/figure', 1, 2)).toBe('/out/figure_0002.png');
  });
});

describe('sanitizeExportFileName', () => {
  it('replaces unsafe characters and whitespace with underscores', () => {
    expect(sanitizeExportFileName('my mol: "final"?.png')).toBe('my_mol___final__.png');
  });
});
