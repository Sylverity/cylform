#!/usr/bin/env node

// Launch the real Cylform desktop app on a given molecule and save a clean,
// static PNG of the rendered view — no frame-timing sample and no orbit/pan/zoom
// interaction (unlike scripts/benchmark-atom-capacity.mjs). Intended for quick
// visual review of a real structure across render profiles, and as a foundation
// for screenshotting app render state without running the performance benchmark.

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultBinary = process.platform === 'win32'
  ? resolve(repoRoot, 'target/release/cylform.exe')
  : resolve(repoRoot, 'target/release/cylform');
const VALID_PROFILES = ['cylview', 'ball-stick', 'houkmol'];

function parseArgs(argv) {
  const options = {
    binary: defaultBinary,
    molecule: process.env.CYLFORM_SNAPSHOT_MOLECULE?.trim() || null,
    profiles: ['cylview', 'ball-stick', 'houkmol'],
    outputDir: resolve(repoRoot, 'benchmark-results', 'snapshots'),
    timeoutMs: 60_000,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if ((arg === '--molecule' || arg === '-m') && value) {
      options.molecule = resolve(value);
      index += 1;
    } else if (arg === '--profiles' && value) {
      options.profiles = value.split(',').map((item) => item.trim()).filter(Boolean);
      index += 1;
    } else if (arg === '--output-dir' && value) {
      options.outputDir = resolve(value);
      index += 1;
    } else if (arg === '--binary' && value) {
      options.binary = resolve(value);
      index += 1;
    } else if (arg === '--timeout-ms' && value) {
      options.timeoutMs = Number.parseInt(value, 10);
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  if (!options.molecule) {
    throw new Error('A molecule file is required. Pass --molecule <path> (or set CYLFORM_SNAPSHOT_MOLECULE).');
  }
  const invalid = options.profiles.filter((profile) => !VALID_PROFILES.includes(profile));
  if (invalid.length > 0) {
    throw new Error(`Unknown render profile(s): ${invalid.join(', ')}. Valid: ${VALID_PROFILES.join(', ')}.`);
  }
  if (options.profiles.length === 0) {
    throw new Error('At least one render profile is required.');
  }
  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/snapshot-molecule.mjs --molecule <path> [options]

Loads a real molecule in the desktop app and saves a static PNG of the rendered
view per render profile, with no performance sampling or camera interaction.

Options:
  --molecule, -m <path>  Molecule file to open (required; XYZ/PDB/etc.)
  --profiles <csv>       Render profiles to capture (default: ${VALID_PROFILES.join(',')})
  --output-dir <path>    Directory for the PNGs (default: benchmark-results/snapshots)
  --binary <path>        Built Cylform binary to launch
  --timeout-ms <ms>      Per-profile timeout, default 60000
`);
}

function wslgEnvironment() {
  if (process.platform !== 'linux' || !existsSync('/mnt/wslg')) {
    return {};
  }
  const env = {};
  if (!process.env.DISPLAY) env.DISPLAY = ':0';
  if (!process.env.WAYLAND_DISPLAY) env.WAYLAND_DISPLAY = 'wayland-0';
  if (existsSync('/mnt/wslg/runtime-dir/wayland-0')) env.XDG_RUNTIME_DIR = '/mnt/wslg/runtime-dir';
  if (!process.env.PULSE_SERVER && existsSync('/mnt/wslg/PulseServer')) env.PULSE_SERVER = '/mnt/wslg/PulseServer';
  if (!process.env.GALLIUM_DRIVER) env.GALLIUM_DRIVER = 'd3d12';
  if (!process.env.MESA_D3D12_DEFAULT_ADAPTER_NAME && existsSync('/usr/lib/wsl/lib/nvidia-smi')) {
    env.MESA_D3D12_DEFAULT_ADAPTER_NAME = 'NVIDIA';
  }
  env.LD_LIBRARY_PATH = process.env.LD_LIBRARY_PATH
    ? `/usr/lib/wsl/lib:${process.env.LD_LIBRARY_PATH}`
    : '/usr/lib/wsl/lib';
  return env;
}

function waitForResult(path, timeoutMs, child) {
  const startedAt = Date.now();
  return new Promise((resolvePromise, reject) => {
    let childExited = false;
    const timer = setInterval(() => {
      if (existsSync(path)) {
        clearInterval(timer);
        resolvePromise(JSON.parse(readFileSync(path, 'utf8')));
        return;
      }
      if (childExited) {
        clearInterval(timer);
        reject(new Error(`Cylform exited before writing ${path}.`));
        return;
      }
      if (Date.now() - startedAt > timeoutMs) {
        clearInterval(timer);
        reject(new Error(`Timed out waiting for ${path}.`));
      }
    }, 200);
    child.once('exit', () => {
      childExited = true;
    });
  });
}

async function captureProfile(options, moleculeName, profile) {
  const screenshotPath = resolve(options.outputDir, `${moleculeName}-${profile}.png`);
  const resultPath = resolve(options.outputDir, `${moleculeName}-${profile}.result.json`);
  mkdirSync(dirname(screenshotPath), { recursive: true });
  if (existsSync(resultPath)) unlinkSync(resultPath);
  if (existsSync(screenshotPath)) unlinkSync(screenshotPath);

  console.log(`Capturing ${moleculeName} in ${profile} profile...`);
  const child = spawn(options.binary, [options.molecule], {
    env: {
      ...process.env,
      ...wslgEnvironment(),
      CYLFORM_BENCHMARK: '1',
      CYLFORM_BENCH_SNAPSHOT: '1',
      CYLFORM_BENCH_SCREENSHOT: '1',
      CYLFORM_BENCH_SCREENSHOT_PATH: screenshotPath,
      CYLFORM_BENCH_RENDER_PROFILE: profile,
      CYLFORM_BENCH_OUTPUT: resultPath,
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  });

  try {
    await waitForResult(resultPath, options.timeoutMs, child);
    await new Promise((resolvePromise) => {
      child.once('exit', resolvePromise);
      setTimeout(resolvePromise, 2_000);
    });
    if (!child.killed) child.kill();
    const ok = existsSync(screenshotPath);
    console.log(ok ? `  -> ${screenshotPath}` : `  !! screenshot not written for ${profile}`);
    return ok;
  } catch (error) {
    if (!child.killed) child.kill();
    console.error(`  !! ${profile}: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!existsSync(options.binary)) {
    throw new Error(`Cylform binary not found: ${options.binary}. Build it first with pnpm --dir desktop/src-ui run build:desktop:fast`);
  }
  if (!existsSync(options.molecule)) {
    throw new Error(`Molecule file not found: ${options.molecule}`);
  }

  const moleculeName = basename(options.molecule, extname(options.molecule));
  mkdirSync(options.outputDir, { recursive: true });

  const captured = [];
  for (const profile of options.profiles) {
    if (await captureProfile(options, moleculeName, profile)) {
      captured.push(resolve(options.outputDir, `${moleculeName}-${profile}.png`));
    }
  }

  writeFileSync(
    resolve(options.outputDir, `${moleculeName}.snapshots.json`),
    `${JSON.stringify({ timestamp: new Date().toISOString(), molecule: options.molecule, screenshots: captured }, null, 2)}\n`,
    'utf8',
  );

  console.log(`\nSaved ${captured.length}/${options.profiles.length} snapshot(s) to ${options.outputDir}`);
  if (captured.length < options.profiles.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
