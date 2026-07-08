import type { PublicationExportSettings } from './exportPng';

export type ExportFrameSelection = Pick<
  PublicationExportSettings,
  'frameSelection' | 'frameStart' | 'frameEnd' | 'frameStep'
>;

/** Replace characters that are unsafe in export file names. */
export function sanitizeExportFileName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, '_');
}

/**
 * Resolve which zero-based frame indices a sequence export should render.
 * Falls back to the current frame for single-frame files, "current"
 * selection, or degenerate ranges.
 */
export function resolveExportFrameIndices(
  settings: ExportFrameSelection,
  frameCount: number,
  currentFrameIndex: number,
): number[] {
  if (frameCount <= 1 || settings.frameSelection === 'current') return [currentFrameIndex];
  const count = Math.max(1, frameCount);
  const start = Math.min(count - 1, Math.max(0, Math.round(settings.frameStart) - 1));
  const end = Math.min(count - 1, Math.max(0, Math.round(settings.frameEnd) - 1));
  const step = settings.frameSelection === 'range'
    ? 1
    : Math.max(1, Math.round(settings.frameStep));
  const first = Math.min(start, end);
  const last = Math.max(start, end);
  const indices: number[] = [];
  for (let index = first; index <= last; index += step) {
    indices.push(index);
  }
  return indices.length > 0 ? indices : [currentFrameIndex];
}

/**
 * Build the numbered output path for one frame of a sequence export.
 * Single-frame exports keep the user's chosen path untouched.
 */
export function numberedPngPath(targetPath: string, frame: number, sequenceLength: number): string {
  if (sequenceLength <= 1) return targetPath;
  const extensionIndex = targetPath.toLowerCase().endsWith('.png') ? targetPath.length - 4 : targetPath.length;
  const base = targetPath.slice(0, extensionIndex);
  const suffix = String(frame + 1).padStart(4, '0');
  return `${base}_${suffix}.png`;
}
