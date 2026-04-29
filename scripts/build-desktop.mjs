#!/usr/bin/env node

import { cpSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = resolve(import.meta.dirname, '..');
const uiDir = join(repoRoot, 'desktop', 'src-ui');
const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';
const binaryName = isWindows ? 'cylform.exe' : 'cylform';
const releaseBinary = join(repoRoot, 'target', 'release', binaryName);
const rootBinary = join(repoRoot, binaryName);
const skipFrontendInstall = process.argv.includes('--skip-frontend-install');

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: isWindows,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function removeIfExists(path) {
  if (existsSync(path)) {
    rmSync(path, { force: true });
  }
}

console.log('==> Building Cylform desktop app');
console.log(`Repo root: ${repoRoot}`);

if (!skipFrontendInstall) {
  console.log('==> Installing frontend dependencies');
  run('npm', ['install'], uiDir);
}

console.log('==> Building frontend bundle');
run('npm', ['run', 'build'], uiDir);

removeIfExists(releaseBinary);
removeIfExists(rootBinary);

console.log('==> Building standalone desktop release');
run('cargo', ['build', '--release', '-p', 'cylform-desktop', '--bin', 'cylform'], repoRoot);

if (!existsSync(releaseBinary)) {
  console.error(`Expected release binary was not found at '${releaseBinary}'.`);
  process.exit(1);
}

cpSync(releaseBinary, rootBinary);

if (isMac) {
  const appBundle = join(repoRoot, 'target', 'release', 'bundle', 'macos', 'Cylform.app');
  const rootApp = join(repoRoot, 'Cylform.app');
  if (existsSync(appBundle)) {
    removeIfExists(rootApp);
    cpSync(appBundle, rootApp, { recursive: true });
    console.log(`App bundle: ${appBundle}`);
    console.log(`Repo-root copy: ${rootApp}`);
  }
}

console.log('==> Refreshed root executable');
console.log(`Standalone binary: ${releaseBinary}`);
console.log(`Repo-root copy: ${rootBinary}`);
