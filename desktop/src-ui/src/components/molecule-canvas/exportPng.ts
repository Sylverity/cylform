import { Vector2 } from 'three';
import type { SceneCtx } from './types';
import type { MoleculeData } from '../../App';
import { drawRichLabelText } from './labels';

export function renderCurrentViewDataUrl(
  ctx: SceneCtx,
  host: HTMLDivElement | null,
  options: {
    moleculeData: MoleculeData | null;
    pngExportScale: 1 | 2 | 4;
    maxWidth?: number;
  },
): string {
  const { moleculeData, pngExportScale, maxWidth } = options;
  if (!moleculeData) {
    throw new Error('Load a molecule before exporting a PNG.');
  }

  const renderer = ctx.renderer;
  const sourceCanvas = renderer.domElement;
  const originalPixelRatio = renderer.getPixelRatio();
  const originalSize = new Vector2();
  renderer.getSize(originalSize);
  const cssWidth = sourceCanvas.clientWidth || originalSize.x || 800;
  const cssHeight = sourceCanvas.clientHeight || originalSize.y || 600;
  const exportScale = maxWidth ? 1 : Math.max(1, pngExportScale);
  const shouldRenderScaled = !maxWidth && exportScale > 1;

  try {
    if (shouldRenderScaled) {
      const renderWidth = Math.max(1, Math.round(cssWidth * exportScale));
      const renderHeight = Math.max(1, Math.round(cssHeight * exportScale));
      renderer.setPixelRatio(1);
      renderer.setSize(renderWidth, renderHeight, false);
      ctx.perspectiveCamera.aspect = renderWidth / renderHeight;
      ctx.perspectiveCamera.updateProjectionMatrix();
    }

    renderer.render(ctx.scene, ctx.camera);

    const outputScale = maxWidth && sourceCanvas.width > maxWidth
      ? maxWidth / sourceCanvas.width
      : 1;
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = Math.max(1, Math.round(sourceCanvas.width * outputScale));
    exportCanvas.height = Math.max(1, Math.round(sourceCanvas.height * outputScale));
    const exportCtx = exportCanvas.getContext('2d');
    if (!exportCtx) {
      throw new Error('Could not prepare PNG export canvas.');
    }

    exportCtx.drawImage(sourceCanvas, 0, 0, exportCanvas.width, exportCanvas.height);
    if (host) {
      const scaleX = exportCanvas.width / cssWidth;
      const scaleY = exportCanvas.height / cssHeight;
      const hostRect = host.getBoundingClientRect();
      const labels = host.querySelectorAll<HTMLElement>(
        '.bond-distance-label, .angle-measure-label, .dihedral-measure-label, .persistent-label',
      );

      for (const label of labels) {
        const text = label.textContent?.trim();
        if (!text || label.style.display === 'none') continue;
        const rect = label.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        const styles = window.getComputedStyle(label);
        const x = (rect.left - hostRect.left) * scaleX;
        const y = (rect.top - hostRect.top) * scaleY;
        const width = rect.width * scaleX;
        const height = rect.height * scaleY;
        const radius = Math.min(12 * scaleX, height / 2);

        exportCtx.save();
        exportCtx.fillStyle = styles.backgroundColor || 'rgba(255, 255, 255, 0.92)';
        exportCtx.strokeStyle = styles.borderColor || 'rgba(160, 175, 190, 0.85)';
        exportCtx.lineWidth = Math.max(1, scaleX);
        exportCtx.beginPath();
        exportCtx.roundRect(x, y, width, height, radius);
        exportCtx.fill();
        exportCtx.stroke();
        exportCtx.fillStyle = styles.color || '#1f2933';
        const baseFontSize = Number.parseFloat(styles.fontSize || '12') * scaleY;
        exportCtx.font = `${styles.fontWeight || '700'} ${baseFontSize}px ${styles.fontFamily || 'sans-serif'}`;
        exportCtx.textAlign = 'center';
        exportCtx.textBaseline = 'middle';
        const html = label.innerHTML ?? text;
        if (/<sub>|<sup>/.test(html)) {
          drawRichLabelText(exportCtx, html, x + width / 2, y + height / 2, baseFontSize, styles.fontWeight || '700', styles.fontFamily || 'sans-serif');
        } else {
          exportCtx.fillText(text, x + width / 2, y + height / 2, width - 8 * scaleX);
        }
        exportCtx.restore();
      }

      const linkCanvasEl = host.querySelector<HTMLCanvasElement>('.label-link-overlay');
      if (linkCanvasEl && linkCanvasEl.style.display !== 'none') {
        exportCtx.drawImage(linkCanvasEl, 0, 0, exportCanvas.width, exportCanvas.height);
      }
    }

    return exportCanvas.toDataURL('image/png');
  } finally {
    if (shouldRenderScaled) {
      renderer.setPixelRatio(originalPixelRatio);
      renderer.setSize(originalSize.x, originalSize.y, false);
      ctx.perspectiveCamera.aspect = cssWidth / cssHeight;
      ctx.perspectiveCamera.updateProjectionMatrix();
      renderer.render(ctx.scene, ctx.camera);
    }
  }
}
