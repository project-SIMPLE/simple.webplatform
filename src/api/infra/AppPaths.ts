// src/api/infra/AppPaths.ts
//
// Single definition of the "application folder": where the `.env` lives and
// what relative paths from it (e.g. LEARNING_PACKAGE_PATH) resolve against.
//
//   - Dev (tsx/vite): the current working directory.
//   - Packaged (SEA) on Linux/macOS: the folder holding the executable.
//   - Packaged on Windows: the folder holding `simple-win.exe`. That launcher
//     extracts the real node.exe to %TEMP% and runs it from there, so
//     process.execPath points into the temp folder; the launcher passes its own
//     folder in SIMPLE_APP_DIR instead (see scripts/launcher-win.go).

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

/** Env var set by the Windows launcher to the folder containing the launcher exe. */
export const APP_DIR_ENV = "SIMPLE_APP_DIR";

// Mirror of index.ts::_isSea — kept local so this module stays import-cycle free.
function isSea(): boolean {
	try {
		const req = createRequire(process.execPath);
		return (req("node:sea") as { isSea(): boolean }).isSea();
	} catch (_) {
		return false;
	}
}

/** Pure decision behind APP_DIR, extracted so it can be unit tested across platforms. */
export function resolveAppDir(opts: {
	launcherDir?: string;
	packaged: boolean;
	execPath: string;
	cwd: string;
}): string {
	if (opts.launcherDir) return opts.launcherDir;
	return opts.packaged ? path.dirname(opts.execPath) : opts.cwd;
}

export const APP_DIR = resolveAppDir({
	launcherDir: process.env[APP_DIR_ENV],
	// `process.pkg` is injected by @yao-pkg/pkg at runtime.
	packaged: isSea() || typeof (process as typeof process & { pkg?: unknown }).pkg !== "undefined",
	execPath: process.execPath,
	cwd: process.cwd(),
});

/**
 * Resolve a path coming from the `.env` (e.g. LEARNING_PACKAGE_PATH).
 *
 * A relative path is looked up next to the `.env` first (the application folder),
 * then in the working directory: a binary launched from a project root — as CI and
 * `./bin/simple-linux` do — keeps finding `./learning-packages` there. When it
 * exists in neither, the application-folder location is returned so the caller
 * reports (or creates) the path next to the `.env`.
 */
export function resolveAppPath(p: string, appDir: string = APP_DIR, cwd: string = process.cwd()): string {
	if (path.isAbsolute(p)) return p;
	const nextToEnv = path.join(appDir, p);
	if (existsSync(nextToEnv)) return nextToEnv;
	const inCwd = path.join(cwd, p);
	return existsSync(inCwd) ? inCwd : nextToEnv;
}
