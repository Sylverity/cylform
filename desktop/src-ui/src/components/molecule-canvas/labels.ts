export { clampPrecision, formatAngle, formatDistance } from '../../domain/measurements';

export function sanitizeLabelText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/&lt;sub&gt;(.*?)&lt;\/sub&gt;/g, '<sub>$1</sub>')
    .replace(/&lt;sup&gt;(.*?)&lt;\/sup&gt;/g, '<sup>$1</sup>');
}

export function drawRichLabelText(
  ctx: CanvasRenderingContext2D,
  html: string,
  cx: number,
  cy: number,
  baseFontSize: number,
  fontWeight: string,
  fontFamily: string,
) {
  const segments: Array<{ text: string; offsetY: number; scale: number }> = [];
  const regex = /(?:<sub>(.*?)<\/sub>)|(?:<sup>(.*?)<\/sup>)|([^<]+)/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    if (match[1] !== undefined) {
      segments.push({ text: match[1], offsetY: baseFontSize * 0.22, scale: 0.75 });
    } else if (match[2] !== undefined) {
      segments.push({ text: match[2], offsetY: -baseFontSize * 0.22, scale: 0.75 });
    } else if (match[3] !== undefined) {
      segments.push({ text: match[3], offsetY: 0, scale: 1 });
    }
  }

  let totalWidth = 0;
  const segmentWidths: number[] = [];
  for (const seg of segments) {
    ctx.font = `${fontWeight} ${baseFontSize * seg.scale}px ${fontFamily}`;
    const w = ctx.measureText(seg.text).width;
    segmentWidths.push(w);
    totalWidth += w;
  }

  let currentX = cx - totalWidth / 2;
  ctx.textBaseline = 'middle';
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    ctx.font = `${fontWeight} ${baseFontSize * seg.scale}px ${fontFamily}`;
    ctx.fillText(seg.text, currentX + segmentWidths[i] / 2, cy + seg.offsetY);
    currentX += segmentWidths[i];
  }
}
