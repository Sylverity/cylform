#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultBinary = process.platform === 'win32'
  ? resolve(repoRoot, 'target/release/cylform.exe')
  : resolve(repoRoot, 'target/release/cylform');

function parseArgs(argv) {
  const options = {
    binary: defaultBinary,
    sizes: [5_000, 10_000, 25_000, 40_000, 60_000, 80_000, 100_000],
    outputDir: resolve(repoRoot, 'benchmark-results'),
    timeoutMs: 120_000,
    sampleMs: 3_000,
    interactionMs: 1_200,
    targetFps: 30,
    screenshot: parseEnvFlag(process.env.CYLFORM_BENCH_SCREENSHOT),
    renderProfile: process.env.CYLFORM_BENCH_RENDER_PROFILE?.trim() || null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === '--binary' && value) {
      options.binary = resolve(value);
      index += 1;
    } else if (arg === '--sizes' && value) {
      options.sizes = value.split(',').map((item) => Number.parseInt(item.trim(), 10));
      index += 1;
    } else if (arg === '--output-dir' && value) {
      options.outputDir = resolve(value);
      index += 1;
    } else if (arg === '--timeout-ms' && value) {
      options.timeoutMs = Number.parseInt(value, 10);
      index += 1;
    } else if (arg === '--sample-ms' && value) {
      options.sampleMs = Number.parseInt(value, 10);
      index += 1;
    } else if (arg === '--interaction-ms' && value) {
      options.interactionMs = Number.parseInt(value, 10);
      index += 1;
    } else if (arg === '--target-fps' && value) {
      options.targetFps = Number.parseFloat(value);
      index += 1;
    } else if (arg === '--screenshot') {
      options.screenshot = true;
    } else if (arg === '--render-profile' && value) {
      options.renderProfile = value.trim();
      options.screenshot = true;
      index += 1;
    } else if (arg === '--help') {
      printHelp();
      process.exit(0);
    }
  }

  options.sizes = options.sizes.filter((size) => Number.isFinite(size) && size > 0);
  if (options.sizes.length === 0) {
    throw new Error('At least one positive atom count is required.');
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 5_000) {
    throw new Error('--timeout-ms must be at least 5000.');
  }

  return options;
}

function parseEnvFlag(value) {
  return ['1', 'true', 'TRUE', 'yes', 'YES', 'on', 'ON'].includes(value ?? '');
}

function printHelp() {
  console.log(`Usage: node scripts/benchmark-atom-capacity.mjs [options]

Options:
  --binary <path>       Built Cylform binary to launch
  --sizes <csv>         Atom counts to test, e.g. 5000,10000,25000,50000
  --output-dir <path>   Directory for fixtures and JSON results
  --timeout-ms <ms>     Per-run timeout, default 120000
  --sample-ms <ms>      Frame sampling window inside the app, default 3000
  --interaction-ms <ms> Per orbit/pan/zoom interaction phase, default 1200
  --target-fps <fps>    Responsiveness target, default 30
  --screenshot          Save a PNG of each run's rendered view under benchmark-results/screenshots/
  --render-profile <id> Force a render style for the screenshot (cylview | ball-stick | houkmol); implies --screenshot
`);
}

function wslgEnvironment() {
  if (process.platform !== 'linux' || !existsSync('/mnt/wslg')) {
    return {};
  }

  const env = {};
  if (!process.env.DISPLAY) {
    env.DISPLAY = ':0';
  }
  if (!process.env.WAYLAND_DISPLAY) {
    env.WAYLAND_DISPLAY = 'wayland-0';
  }
  if (existsSync('/mnt/wslg/runtime-dir/wayland-0')) {
    env.XDG_RUNTIME_DIR = '/mnt/wslg/runtime-dir';
  }
  if (!process.env.PULSE_SERVER && existsSync('/mnt/wslg/PulseServer')) {
    env.PULSE_SERVER = '/mnt/wslg/PulseServer';
  }
  if (!process.env.GALLIUM_DRIVER) {
    env.GALLIUM_DRIVER = 'd3d12';
  }
  if (!process.env.MESA_D3D12_DEFAULT_ADAPTER_NAME && existsSync('/usr/lib/wsl/lib/nvidia-smi')) {
    env.MESA_D3D12_DEFAULT_ADAPTER_NAME = 'NVIDIA';
  }
  env.LD_LIBRARY_PATH = process.env.LD_LIBRARY_PATH
    ? `/usr/lib/wsl/lib:${process.env.LD_LIBRARY_PATH}`
    : '/usr/lib/wsl/lib';
  return env;
}

function generateXyz(atomCount, outputPath) {
  mkdirSync(dirname(outputPath), { recursive: true });
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      process.execPath,
      [resolve(repoRoot, 'scripts/generate-benchmark-xyz.mjs'), String(atomCount), outputPath],
      { stdio: 'inherit' },
    );
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        reject(new Error(`Fixture generator exited with code ${code}.`));
      }
    });
  });
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
    }, 250);
    child.once('exit', () => {
      childExited = true;
    });
  });
}

async function runOne(options, atomCount) {
  const fixturePath = resolve(options.outputDir, 'fixtures', `benchmark-${atomCount}-atoms.xyz`);
  const resultPath = resolve(options.outputDir, `benchmark-${atomCount}-atoms.json`);
  const profileSuffix = options.renderProfile ? `-${options.renderProfile}` : '';
  const screenshotPath = resolve(
    options.outputDir,
    'screenshots',
    `benchmark-${atomCount}-atoms${profileSuffix}.png`,
  );

  await generateXyz(atomCount, fixturePath);
  if (existsSync(resultPath)) {
    unlinkSync(resultPath);
  }
  if (options.screenshot) {
    // export_png requires the destination directory to already exist.
    mkdirSync(dirname(screenshotPath), { recursive: true });
  }
  console.log(`Launching Cylform benchmark for ${atomCount.toLocaleString()} atoms...`);

  const child = spawn(options.binary, [fixturePath], {
    env: {
      ...process.env,
      ...wslgEnvironment(),
      CYLFORM_BENCHMARK: '1',
      CYLFORM_BENCH_OUTPUT: resultPath,
      CYLFORM_BENCH_MAX_ATOMS: String(Math.max(...options.sizes)),
      CYLFORM_BENCH_SAMPLE_MS: String(options.sampleMs),
      CYLFORM_BENCH_INTERACTION_MS: String(options.interactionMs),
      CYLFORM_BENCH_TARGET_FPS: String(options.targetFps),
      CYLFORM_BENCH_SCREENSHOT: options.screenshot ? '1' : '0',
      ...(options.screenshot ? { CYLFORM_BENCH_SCREENSHOT_PATH: screenshotPath } : {}),
      ...(options.renderProfile ? { CYLFORM_BENCH_RENDER_PROFILE: options.renderProfile } : {}),
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  });

  try {
    const result = await waitForResult(resultPath, options.timeoutMs, child);
    await new Promise((resolvePromise) => {
      child.once('exit', resolvePromise);
      setTimeout(resolvePromise, 3_000);
    });
    if (!child.killed) child.kill();
    return result;
  } catch (error) {
    if (!child.killed) child.kill();
    const message = error instanceof Error ? error.message : String(error);
    const result = {
      status: message.includes('Timed out') ? 'timeout' : 'app-error',
      error: message,
      atoms: atomCount,
      path: fixturePath,
      timestamp: new Date().toISOString(),
    };
    writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    return result;
  }
}

function summarize(results) {
  const responsive = results
    .filter((result) => result.status === 'ok' && result.responsive)
    .sort((a, b) => a.atoms - b.atoms);
  const observedLimit = responsive.at(-1)?.atoms ?? 0;
  const conservativeLimit = observedLimit > 0
    ? Math.max(1_000, Math.floor((observedLimit * 0.6) / 1_000) * 1_000)
    : 0;

  console.log('\nCylform atom capacity benchmark');
  console.table(results.map((result) => ({
    atoms: result.atoms,
    bonds: result.totalBonds ?? result.bonds ?? '',
    status: result.status,
    responsive: Boolean(result.responsive),
    profile: result.renderProfile ?? result.materialPreset ?? '',
    quality: result.renderQuality?.qualityT?.toFixed?.(2) ?? '',
    cylSegments: result.renderQuality?.cylinderRadialSegments ?? '',
    pixelRatio: result.renderQuality?.pixelRatio?.toFixed?.(2) ?? '',
    loadMs: result.loadMs ?? '',
    rebuildMs: result.rebuildSceneMs ?? '',
    avgFps: result.averageFps ? result.averageFps.toFixed(1) : '',
    p95FrameMs: result.p95FrameMs ? result.p95FrameMs.toFixed(1) : '',
    interactionFps: result.interactionAverageFps ? result.interactionAverageFps.toFixed(1) : '',
    interactionP95Ms: result.interactionP95FrameMs ? result.interactionP95FrameMs.toFixed(1) : '',
    renderCalls: result.renderCalls ?? '',
    sceneObjects: result.sceneObjects ?? '',
    pickMs: result.pickTotalMs ? result.pickTotalMs.toFixed(1) : '',
    pickHit: result.pickHitType ?? '',
    screenshot: result.screenshotPath ? basename(result.screenshotPath) : '',
  })));
  console.log(`Observed responsive ceiling on this system: ${observedLimit.toLocaleString()} atoms`);
  console.log(`Suggested conservative README limit: ${conservativeLimit.toLocaleString()} atoms`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!existsSync(options.binary)) {
    throw new Error(`Cylform binary not found: ${options.binary}. Build it first with pnpm --dir desktop/src-ui run build:desktop:fast`);
  }

  mkdirSync(options.outputDir, { recursive: true });
  const results = [];
  for (const size of options.sizes) {
    results.push(await runOne(options, size));
  }

  writeFileSync(
    resolve(options.outputDir, 'summary.json'),
    `${JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2)}\n`,
    'utf8',
  );
  summarize(results);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
