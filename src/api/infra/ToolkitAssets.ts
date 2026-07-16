// src/api/infra/ToolkitAssets.ts
//
// Resolves files shipped in the repo's `toolkit/` folder (the two headset
// provisioning APKs and the custom scrcpy server binary) to a real on-disk
// path at runtime.
//
//   - In a packaged (SEA) build there is no `toolkit/` folder on disk: the files
//     are embedded in the executable's asset store by the build scripts
//     (scripts/build-sea-*.mjs) under the keys `toolkit/<name>`. On first use we
//     extract the requested file to a temp directory and return that path.
//   - In dev (tsx/vite) the files are read straight from `./toolkit`.
//
//   import { resolveToolkitAsset } from "./infra/ToolkitAssets.js";
//   const apkPath = resolveToolkitAsset("tdg.oculuswirelessadb.apk");

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

interface SeaApi {
	isSea(): boolean;
	getAsset(key: string): ArrayBuffer;
}

// Mirror of index.ts::_isSea — process.execPath is a valid createRequire base on
// every platform, whereas import.meta.url is not in Vite's CJS bundle output.
function getSea(): SeaApi | null {
	try {
		const req = createRequire(process.execPath);
		const sea = req("node:sea") as SeaApi;
		return sea.isSea() ? sea : null;
	} catch (_) {
		return null;
	}
}

// Extracted files are cached here for the lifetime of the process so we only
// write each asset to disk once.
let extractedDir: string | null = null;

/**
 * Resolve a bundled toolkit file to an absolute on-disk path.
 *
 * Throws if the file cannot be produced (missing from both the SEA asset store
 * and the on-disk `toolkit/` folder), so callers can decide how to degrade.
 */
export function resolveToolkitAsset(name: string): string {
	const sea = getSea();

	// Dev / unpackaged: read straight from the repo's toolkit folder.
	if (!sea) {
		return path.resolve(process.cwd(), "toolkit", name);
	}

	// Packaged: extract the embedded asset to a temp file (once).
	if (!extractedDir) {
		extractedDir = path.join(os.tmpdir(), `swp-toolkit-${process.versions.modules}`);
		mkdirSync(extractedDir, { recursive: true });
	}

	const dest = path.join(extractedDir, name);
	if (!existsSync(dest)) {
		// getAsset throws if the key was never bundled — let it propagate.
		const data = sea.getAsset(`toolkit/${name}`);
		writeFileSync(dest, Buffer.from(data));
	}
	return dest;
}
