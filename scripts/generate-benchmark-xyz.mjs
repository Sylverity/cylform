#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const atomCount = Number.parseInt(process.argv[2] ?? '25000', 10);
const outputPath = resolve(process.argv[3] ?? `benchmark-${atomCount}-atoms.xyz`);

if (!Number.isFinite(atomCount) || atomCount < 1) {
  console.error('Usage: node scripts/generate-benchmark-xyz.mjs [atom-count] [output.xyz]');
  process.exit(1);
}

const side = Math.ceil(Math.cbrt(atomCount));
const spacing = 1.58;
const elements = ['C', 'H', 'N', 'O', 'S'];
const lines = [
  String(atomCount),
  `Cylform benchmark fixture: ${atomCount} atoms on a spaced molecular lattice`,
];

for (let index = 0; index < atomCount; index += 1) {
  const xIndex = index % side;
  const yIndex = Math.floor(index / side) % side;
  const zIndex = Math.floor(index / (side * side));
  const element = elements[index % elements.length];
  const x = (xIndex - side / 2) * spacing;
  const y = (yIndex - side / 2) * spacing;
  const z = (zIndex - side / 2) * spacing;

  lines.push(`${element} ${x.toFixed(4)} ${y.toFixed(4)} ${z.toFixed(4)}`);
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
console.log(`Wrote ${atomCount.toLocaleString()} atoms to ${outputPath}`);
