/**
 * Build a Node.js SEA (Single Executable Application) for the current
 * Unix platform (Linux x64 or macOS x64/arm64).
 *
 * Run this script on the target platform — it uses process.execPath as
 * the base binary and embeds the matching uWebSockets.js and node-hid
 * .node files.
 *
 * Produces:
 *   bin/simple-linux   (when run on Linux)
 *   bin/simple-macos   (when run on macOS)
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const platform = process.platform; // 'linux' | 'darwin'
const arch = process.arch; // 'x64' | 'arm64'

if (platform !== "linux" && platform !== "darwin") {
	console.error("[SEA] This script is for Linux/macOS. Use build-sea-win.mjs on Windows.");
	process.exit(1);
}

// Node.js v26 (Arch Linux package) has a broken SEA implementation: postject
// corrupts the ELF binary and the objcopy approach produces sections without
// program segments, so dl_iterate_phdr never finds the blob → SIGSEGV at boot.
// CI uses Node.js 24; local builds must match.
const nodeMajor = parseInt(process.versions.node.split(".")[0], 10);
if (nodeMajor !== 24) {
	console.error(`[SEA] ERROR: Node.js v${process.versions.node} is not supported for SEA builds.`);
	console.error("[SEA]        SEA injection is only reliable on Node.js 24.");
	console.error("[SEA]        Run:  nvm use 24  (or: nvm install 24)");
	process.exit(1);
}

const outputName = platform === "darwin" ? "simple-macos" : "simple-linux";

// ── 1. Build frontend and backend ────────────────────────────────────────────

console.log("\n[SEA] Building frontend...");
execSync("npm run build:frontend", { cwd: root, stdio: "inherit" });

console.log("\n[SEA] Building backend...");
execSync("npm run build:backend", { cwd: root, stdio: "inherit" });

// ── 2. Collect all dist/ files as SEA assets ─────────────────────────────────

const distDir = path.join(root, "dist");

function collectAssets(dir, base = distDir) {
	const out = {};
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			Object.assign(out, collectAssets(full, base));
		} else {
			const key = `dist/${path.relative(base, full)}`;
			const value = path.relative(root, full);
			out[key] = value;
		}
	}
	return out;
}

const distAssets = collectAssets(distDir);
console.log(`\n[SEA] ${Object.keys(distAssets).length} frontend files collected.`);

// ── 3. Add uWebSockets.js native module for this platform ────────────────────

const modulesVer = process.versions.modules;
const uwsFile = `uws_${platform}_${arch}_${modulesVer}.node`;
const uwsPath = path.join(root, "node_modules", "uWebSockets.js", uwsFile);

if (!fs.existsSync(uwsPath)) {
	console.error(`[SEA] ERROR: ${uwsFile} not found. Is uWebSockets.js installed?`);
	process.exit(1);
}

console.log(`[SEA] Including native module: ${uwsFile}`);

// ── 3b. Add node-hid native module for this platform ─────────────────────────
//
// node-hid ships prebuilt NAPI binaries via prebuild-install, with a node-gyp
// fallback.  Check the prebuild path first, then the gyp Release path.

function findHidBinary() {
	const hidDir = path.join(root, "node_modules", "node-hid");
	if (!fs.existsSync(hidDir)) {
		console.error("[SEA] ERROR: node-hid not found in node_modules. Run: npm install");
		process.exit(1);
	}
	// node-hid ships as prebuilds/{name}-{platform}-{arch}/node-napi-v4.node
	// On Linux, the hidraw driver variant is the default and preferred.
	const primaryName = platform === "linux" ? "HID_hidraw" : "HID";
	const candidates = [
		path.join(hidDir, "prebuilds", `${primaryName}-${platform}-${arch}`, "node-napi-v4.node"),
		// fallback to non-hidraw on Linux if hidraw prebuilt is absent
		...(platform === "linux" ? [path.join(hidDir, "prebuilds", `HID-${platform}-${arch}`, "node-napi-v4.node")] : []),
		// legacy node-gyp build output
		path.join(hidDir, "build", "Release", "HID.node"),
	];
	for (const c of candidates) {
		if (fs.existsSync(c)) return c;
	}
	console.error("[SEA] ERROR: node-hid native binary not found. Tried:");
	candidates.forEach((c) => {
		console.error(`         ${c}`);
	});
	process.exit(1);
}

const hidPath = findHidBinary();
console.log(`[SEA] Including native module: HID.node  (from ${path.relative(root, hidPath)})`);

// ── 3c. Add toolkit files (headset APKs + custom scrcpy server binary) ────────
//
// HeadsetSetup and ScrcpyServer read these at runtime via resolveToolkitAsset,
// which extracts them from the SEA asset store (keys: `toolkit/<name>`).

const toolkitDir = path.join(root, "toolkit");
const toolkitAssets = {};
if (fs.existsSync(toolkitDir)) {
	for (const name of fs.readdirSync(toolkitDir)) {
		const full = path.join(toolkitDir, name);
		if (fs.statSync(full).isFile()) {
			toolkitAssets[`toolkit/${name}`] = path.relative(root, full);
		}
	}
}
const toolkitCount = Object.keys(toolkitAssets).length;
if (toolkitCount === 0) {
	console.error("[SEA] ERROR: no files found in toolkit/. Headset setup and streaming need them.");
	process.exit(1);
}
console.log(`[SEA] Including ${toolkitCount} toolkit file(s): ${Object.keys(toolkitAssets).join(", ")}`);

const assets = {
	...distAssets,
	...toolkitAssets,
	[uwsFile]: path.relative(root, uwsPath),
	"HID.node": path.relative(root, hidPath),
};

// ── 4. Write sea-config.json ──────────────────────────────────────────────────

const seaConfig = {
	main: "dist-api/index.cjs",
	output: "sea-prep.blob",
	disableExperimentalSEAWarning: true,
	assets,
};

fs.writeFileSync(path.join(root, "sea-config.json"), JSON.stringify(seaConfig, null, 2));
console.log(`[SEA] sea-config.json written (${Object.keys(assets).length} assets).`);

// ── 5. Generate SEA blob ──────────────────────────────────────────────────────

console.log("\n[SEA] Generating blob...");
execSync("node --experimental-sea-config sea-config.json", { cwd: root, stdio: "inherit" });

// ── 6. Copy node binary ───────────────────────────────────────────────────────

const outDir = path.join(root, "bin");
fs.mkdirSync(outDir, { recursive: true });
const outBin = path.join(outDir, outputName);

fs.copyFileSync(process.execPath, outBin);
fs.chmodSync(outBin, 0o755);
console.log(`\n[SEA] Copied node binary to: ${outBin}`);

// ── 7. Inject SEA blob with postject ─────────────────────────────────────────
//
// macOS (Mach-O) requires --macho-segment-name NODE_SEA in addition to the
// standard section name argument.

console.log("[SEA] Injecting blob with postject...");
const machoFlag = platform === "darwin" ? "--macho-segment-name NODE_SEA" : "";
execSync(
	`npx postject "${outBin}" NODE_SEA_BLOB sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 --overwrite ${machoFlag}`.trim(),
	{ cwd: root, stdio: "inherit" },
);

// ── 8. Sign and notarize the binary (macOS only) ─────────────────────────────
//
// postject modifies the Mach-O binary, invalidating any existing signature, so
// macOS requires a re-sign before the binary will run.
//
// Two modes:
//
//   1. Distribution — set APPLE_SIGNING_IDENTITY to a "Developer ID Application"
//      certificate. The binary is signed with the hardened runtime + timestamp
//      + entitlements, then (if notarization credentials are present) submitted
//      to Apple's notary service. This is what Gatekeeper accepts on machines
//      that download the release. See scripts/entitlements.mac.plist.
//
//   2. Local — with no identity configured, fall back to an ad-hoc signature.
//      This lets the binary run on the machine that built it, but it will be
//      quarantined and blocked if distributed.

if (platform === "darwin") {
	const identity = process.env.APPLE_SIGNING_IDENTITY;

	if (!identity) {
		console.log("[SEA] No APPLE_SIGNING_IDENTITY set — ad-hoc signing (local use only).");
		execSync(`codesign --sign - "${outBin}"`, { cwd: root, stdio: "inherit" });
	} else {
		const entitlements = path.join(__dirname, "entitlements.mac.plist");
		console.log(`[SEA] Signing with Developer ID: ${identity}`);
		execSync(
			`codesign --force --timestamp --options runtime ` +
				`--entitlements "${entitlements}" --sign "${identity}" "${outBin}"`,
			{ cwd: root, stdio: "inherit" },
		);
		execSync(`codesign --verify --strict --verbose=2 "${outBin}"`, { cwd: root, stdio: "inherit" });

		// ── 8b. Notarize ──────────────────────────────────────────────────────
		//
		// notarytool cannot ingest a bare Mach-O binary — it must be wrapped in a
		// zip, .dmg, or .pkg. We zip the binary, submit, and wait for the ticket.
		//
		// A bare executable also cannot be stapled (stapler only supports .app,
		// .dmg, .pkg), so Gatekeeper performs an online notarization check on
		// first launch. That is sufficient for a downloaded CLI binary.
		//
		// Provide EITHER App Store Connect API key credentials:
		//   APPLE_API_KEY_ID, APPLE_API_ISSUER_ID, APPLE_API_KEY_PATH (.p8 file)
		// OR Apple ID credentials:
		//   APPLE_ID, APPLE_TEAM_ID, APPLE_APP_PASSWORD (app-specific password)

		let notaryArgs = null;
		if (process.env.APPLE_API_KEY_ID && process.env.APPLE_API_ISSUER_ID && process.env.APPLE_API_KEY_PATH) {
			notaryArgs =
				`--key "${process.env.APPLE_API_KEY_PATH}" ` +
				`--key-id "${process.env.APPLE_API_KEY_ID}" ` +
				`--issuer "${process.env.APPLE_API_ISSUER_ID}"`;
		} else if (process.env.APPLE_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_APP_PASSWORD) {
			notaryArgs =
				`--apple-id "${process.env.APPLE_ID}" ` +
				`--team-id "${process.env.APPLE_TEAM_ID}" ` +
				`--password "${process.env.APPLE_APP_PASSWORD}"`;
		}

		if (!notaryArgs) {
			console.warn("[SEA] WARNING: no notarization credentials set — binary is signed but NOT notarized.");
			console.warn("[SEA]          Downloaded copies will still be blocked by Gatekeeper.");
		} else {
			const zipPath = path.join(outDir, `${outputName}.zip`);
			console.log("[SEA] Zipping for notarization...");
			execSync(`ditto -c -k --keepParent "${outBin}" "${zipPath}"`, { cwd: root, stdio: "inherit" });

			console.log("[SEA] Submitting to Apple notary service (this can take a few minutes)...");
			execSync(`xcrun notarytool submit "${zipPath}" ${notaryArgs} --wait`, { cwd: root, stdio: "inherit" });

			fs.rmSync(zipPath, { force: true });
			console.log("[SEA] Notarization accepted.");
		}
	}
}

const sizeMB = (fs.statSync(outBin).size / 1024 / 1024).toFixed(1);
console.log(`\n[SEA] Done!`);
console.log(`      Output: ${outBin}`);
console.log(`      Size:   ${sizeMB} MB`);
