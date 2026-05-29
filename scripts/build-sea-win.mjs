/**
 * Build a Node.js SEA (Single Executable Application) binary for Windows x64.
 *
 * Produces: bin/simple-win-sea.exe
 *
 * This replaces @yao-pkg/pkg for the Windows target because pkg's patched
 * process.dlopen crashes on Windows when loading uWebSockets.js native modules.
 * Node.js SEA does not patch process.dlopen, so the crash is avoided.
 *
 * The SEA binary embeds:
 *   - dist/**  (compiled frontend, served from memory via express in SEA mode)
 *   - uws_win32_x64_<modules>.node  (uWebSockets.js native module for Windows x64)
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { patchPe } from './patch-pe-no-cfg.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
if (nodeMajor !== 24) {
  console.error(`[SEA] ERROR: Node.js v${process.versions.node} is not supported for SEA builds.`);
  console.error('[SEA]        SEA injection is only reliable on Node.js 24.');
  process.exit(1);
}

// ── 1. Build frontend and backend ────────────────────────────────────────────

console.log('\n[SEA] Building frontend...');
execSync('npm run build:frontend', { cwd: root, stdio: 'inherit' });

console.log('\n[SEA] Building backend...');
execSync('npm run build:backend', { cwd: root, stdio: 'inherit' });

// ── 2. Collect all dist/ files as SEA assets ─────────────────────────────────

const distDir = path.join(root, 'dist');

function collectAssets(dir, base = distDir) {
  const out = {};
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      Object.assign(out, collectAssets(full, base));
    } else {
      const key = 'dist/' + path.relative(base, full).replace(/\\/g, '/');
      const value = path.relative(root, full).replace(/\\/g, '/');
      out[key] = value;
    }
  }
  return out;
}

const distAssets = collectAssets(distDir);
console.log(`\n[SEA] ${Object.keys(distAssets).length} frontend files collected.`);

// ── 3. Add uWebSockets.js native module for Windows x64 ──────────────────────

const modulesVer = process.versions.modules; // e.g. '137'
const uwsFile = `uws_win32_x64_${modulesVer}.node`;
const uwsPath = path.join(root, 'node_modules', 'uWebSockets.js', uwsFile);

if (!fs.existsSync(uwsPath)) {
  console.error(`[SEA] ERROR: ${uwsFile} not found. Is uWebSockets.js installed?`);
  process.exit(1);
}

const assets = {
  ...distAssets,
  [uwsFile]: path.relative(root, uwsPath).replace(/\\/g, '/'),
};

console.log(`[SEA] Including native module: ${uwsFile}`);

// ── 4. Write sea-config.json ──────────────────────────────────────────────────

const seaConfig = {
  main: 'dist-api/index.cjs',
  output: 'sea-prep.blob',
  disableExperimentalSEAWarning: true,
  assets,
};

fs.writeFileSync(path.join(root, 'sea-config.json'), JSON.stringify(seaConfig, null, 2));
console.log(`[SEA] sea-config.json written (${Object.keys(assets).length} assets).`);

// ── 5. Generate SEA blob ──────────────────────────────────────────────────────

console.log('\n[SEA] Generating blob...');
execSync('node --experimental-sea-config sea-config.json', { cwd: root, stdio: 'inherit' });
console.log('[SEA] Blob generated: sea-prep.blob');

// ── 6. Locate the Windows node.exe to use as the base binary ─────────────────

const nodeVersion = process.version; // e.g. 'v24.16.0'
const pkgCachedExe = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  '.pkg-cache', 'sea', `node-${nodeVersion}-win-x64.exe`,
);

let sourceExe;
if (fs.existsSync(pkgCachedExe)) {
  sourceExe = pkgCachedExe;
  console.log(`\n[SEA] Using pkg-cached node binary: ${sourceExe}`);
} else {
  sourceExe = process.execPath;
  console.log(`\n[SEA] Using current node.exe: ${sourceExe}`);
}

// ── 7. Copy node.exe and inject SEA blob ─────────────────────────────────────

// The output binary MUST be named "node.exe".
// Windows applies an AppCompat shim to any executable named "node.exe" that
// is required for process.dlopen to load the uWebSockets.js native module.
// Without this shim the DLL initialization crashes with 0xC0000005 regardless
// of path, signature, or CFG status.  We place it in its own subdirectory so
// it does not conflict with a system node installation.
const outDir = path.join(root, 'bin', 'win');
fs.mkdirSync(outDir, { recursive: true });
const outExe = path.join(outDir, 'node.exe');

fs.copyFileSync(sourceExe, outExe);
console.log(`[SEA] Copied to: ${outExe}`);

// Strip the Authenticode signature and clear the CFG flag BEFORE postject
// injects the SEA blob.  postject adds a raw PE section which invalidates the
// Authenticode signature, leaving it "corrupted".  A corrupted-signature binary
// behaves differently from an unsigned one under Windows loader security policies,
// causing 0xC0000005 when process.dlopen tries to load the uWebSockets.js NAPI
// module.  Starting from a clean unsigned binary avoids that regression.
patchPe(outExe);

console.log('[SEA] PE patched (signature stripped, CFG cleared).');

console.log('[SEA] Injecting blob with postject...');
execSync(
  `npx postject "${outExe}" NODE_SEA_BLOB sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 --overwrite`,
  { cwd: root, stdio: 'inherit' },
);

const sizeMB = (fs.statSync(outExe).size / 1024 / 1024).toFixed(1);
console.log(`\n[SEA] Done!`);
console.log(`      Output:  ${outExe}`);
console.log(`      Size:    ${sizeMB} MB`);

// ── 10. Build the self-extracting launcher and bundle node.exe into it ───────
//
// The SEA binary must be named "node.exe" (Windows AppCompat shim requirement).
// Rather than shipping two files, we embed node.exe inside a thin .NET launcher
// named whatever the user wants (default: simple-win.exe).
//
// Bundle layout:
//   [launcher exe bytes] [node.exe bytes] [8-byte size LE] [4-byte magic "SWPN"]
//
// On first launch the embedded node.exe is extracted to a per-size temp folder
// and reused on subsequent launches.

const launcherName = process.env.LAUNCHER_NAME || 'simple-win.exe';
const launcherExe = path.join(outDir, launcherName);
const goExe = 'C:\\Program Files\\Go\\bin\\go.exe';
const launcherSrc = path.join(__dirname, 'launcher-win.go');

console.log(`\n[Launcher] Compiling ${launcherName} (Go)...`);
execSync(
  `"${goExe}" build -ldflags="-s -w" -trimpath -o "${launcherExe}" "${launcherSrc}"`,
  { cwd: root, stdio: 'inherit' },
);

console.log('[Launcher] Bundling node.exe into launcher...');
const launcherBytes = fs.readFileSync(launcherExe);
const nodeBytes     = fs.readFileSync(outExe);

// 12-byte footer: [8 bytes: embedded size as int64 LE] [4 bytes: magic "SWPN"]
const footer = Buffer.alloc(12);
footer.writeBigInt64LE(BigInt(nodeBytes.length), 0);
footer.write('SWPN', 8, 'ascii');

fs.writeFileSync(launcherExe, Buffer.concat([launcherBytes, nodeBytes, footer]));

// The separate node.exe is no longer needed — everything is inside the launcher.
fs.unlinkSync(outExe);

const bundleMB = (fs.statSync(launcherExe).size / 1024 / 1024).toFixed(1);
console.log(`\n[Build] Done!`);
console.log(`        Output: ${launcherExe}`);
console.log(`        Size:   ${bundleMB} MB (launcher + embedded node.exe)`);
