#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..');
const outputDir = resolve(repoRoot, 'visual-results', 'render-profiles');

const profiles = [
  {
    id: 'cylview',
    label: 'CYLview',
    background: '#ffffff',
    bondColor: '#129bdd',
    atomSpheres: false,
    splitBonds: true,
    palette: { C: '#129bdd', O: '#e86a1a', H: '#c8ccd0' },
    note: 'primary geometry-forward profile: split endpoint cylinders, hidden atom spheres',
  },
  {
    id: 'ball-stick',
    label: 'Ball and stick',
    background: '#ffffff',
    bondColor: '#2f9df4',
    atomSpheres: true,
    splitBonds: false,
    palette: { C: '#8d949c', O: '#ea6a1a', H: '#cfd3d7' },
    note: 'traditional visible atom spheres with uniform glossy bonds',
  },
  {
    id: 'houkmol',
    label: 'Houkmol',
    background: '#ffffff',
    bondColor: '#6f8796',
    atomSpheres: true,
    splitBonds: false,
    palette: { C: '#8d949c', O: '#ea6a1a', H: '#cfd3d7' },
    note: 'visible atom spheres with flatter figure-prep finish',
  },
];

const atoms = [
  { id: 0, element: 'C', x: 110, y: 175, r: 9, label: 'C1' },
  { id: 1, element: 'C', x: 188, y: 130, r: 9, label: 'C2' },
  { id: 2, element: 'C', x: 266, y: 176, r: 9, label: 'C3' },
  { id: 3, element: 'O', x: 344, y: 130, r: 12, label: 'O1' },
  { id: 4, element: 'H', x: 58, y: 222, r: 7, label: 'H' },
  { id: 5, element: 'H', x: 389, y: 86, r: 7, label: 'H' },
];

const bonds = [
  [0, 1],
  [1, 2],
  [2, 3],
  [0, 4],
  [3, 5],
];

function atom(id) {
  return atoms.find((candidate) => candidate.id === id);
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  })[character]);
}

function cylinder({ x1, y1, x2, y2, color, width = 12 }) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}" stroke-linecap="round" />`;
}

function splitBond(profile, a, b) {
  const split = a.element === 'H' ? 0.28
    : b.element === 'H' ? 0.72
      : a.element !== 'C' && b.element === 'C' ? 0.34
        : a.element === 'C' && b.element !== 'C' ? 0.66
          : 0.5;
  const mx = a.x + (b.x - a.x) * split;
  const my = a.y + (b.y - a.y) * split;
  return [
    cylinder({ x1: a.x, y1: a.y, x2: mx, y2: my, color: profile.palette[a.element] ?? profile.bondColor }),
    cylinder({ x1: mx, y1: my, x2: b.x, y2: b.y, color: profile.palette[b.element] ?? profile.bondColor }),
  ].join('\n');
}

function renderProfile(profile) {
  const bondSvg = bonds.map(([aId, bId]) => {
    const a = atom(aId);
    const b = atom(bId);
    if (profile.splitBonds) return splitBond(profile, a, b);
    return cylinder({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, color: profile.bondColor });
  }).join('\n');

  const atomSvg = profile.atomSpheres
    ? atoms.map((a) => (
      `<circle cx="${a.x}" cy="${a.y}" r="${a.r}" fill="${profile.palette[a.element] ?? '#888888'}" stroke="#ffffff" stroke-width="1.5" />`
    )).join('\n')
    : atoms.map((a) => (
      `<circle cx="${a.x}" cy="${a.y}" r="2.2" fill="${profile.palette[a.element] ?? profile.bondColor}" opacity="0.82" />`
    )).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="460" height="300" viewBox="0 0 460 300" role="img" aria-labelledby="title desc">
  <title id="title">${esc(profile.label)} render profile snapshot</title>
  <desc id="desc">${esc(profile.note)}</desc>
  <rect width="460" height="300" fill="${profile.background}" />
  <g filter="url(#shadow)">
${bondSvg}
${atomSvg}
  </g>
  <path d="M110 175 Q188 76 266 176" fill="none" stroke="#ffa24c" stroke-width="3" stroke-linecap="round" opacity="0.78" />
  <text x="187" y="88" text-anchor="middle" font-family="Arial, sans-serif" font-size="15" font-weight="700" fill="#1f2933">112.4°</text>
  <text x="342" y="104" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#111827">O<tspan baseline-shift="sub" font-size="14">1</tspan></text>
  <text x="99" y="154" font-family="Arial, sans-serif" font-size="20" font-weight="700" fill="#111827">C<tspan baseline-shift="sub" font-size="13">1</tspan></text>
  <text x="20" y="278" font-family="Arial, sans-serif" font-size="13" fill="#4b5563">${esc(profile.note)}</text>
  <defs>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="1.4" dy="2" stdDeviation="1.3" flood-color="#6b7280" flood-opacity="0.28" />
    </filter>
  </defs>
</svg>
`;
}

await mkdir(outputDir, { recursive: true });

for (const profile of profiles) {
  await writeFile(resolve(outputDir, `${profile.id}.svg`), renderProfile(profile), 'utf8');
}

const index = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Cylform render profile snapshots</title>
  <style>
    body { margin: 24px; font: 14px/1.4 system-ui, sans-serif; color: #111827; background: #f6f7f9; }
    main { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
    article { background: white; border: 1px solid #d7dde5; padding: 12px; }
    img { width: 100%; height: auto; display: block; }
  </style>
</head>
<body>
  <h1>Cylform render profile snapshots</h1>
  <main>
${profiles.map((profile) => `    <article><h2>${esc(profile.label)}</h2><img src="./${profile.id}.svg" alt="${esc(profile.label)} snapshot" /></article>`).join('\n')}
  </main>
</body>
</html>
`;

await writeFile(resolve(outputDir, 'index.html'), index, 'utf8');
console.log(`Wrote render profile snapshots to ${outputDir}`);
