import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { APP_DIR_ENV, resolveAppDir, resolveAppPath } from "./AppPaths.ts";

describe("resolveAppDir", () => {
	const linux = { execPath: "/opt/simple/simple-linux", cwd: "/home/user" };

	it("uses the working directory in dev", () => {
		expect(resolveAppDir({ ...linux, packaged: false })).toBe("/home/user");
	});

	it("uses the executable's folder when packaged", () => {
		expect(resolveAppDir({ ...linux, packaged: true })).toBe("/opt/simple");
	});

	// Windows: node.exe is extracted to %TEMP% by the launcher, so execPath is not
	// where the user's .env sits. The launcher's own folder must win.
	it("prefers the folder passed by the Windows launcher over execPath", () => {
		expect(
			resolveAppDir({
				launcherDir: "D:\\SIMPLE",
				packaged: true,
				execPath: "C:\\Users\\me\\AppData\\Local\\Temp\\swp-node-4f2a\\node.exe",
				cwd: "C:\\Windows\\System32",
			}),
		).toBe("D:\\SIMPLE");
	});

	it("ignores an empty launcher folder", () => {
		expect(resolveAppDir({ ...linux, launcherDir: "", packaged: true })).toBe("/opt/simple");
	});
});

// The Go launcher and the backend agree on the variable's name by hand.
describe("Windows launcher contract", () => {
	it("exports its own folder under the variable the backend reads", () => {
		const launcher = readFileSync("scripts/launcher-win.go", "utf8");
		expect(launcher).toContain(`"${APP_DIR_ENV}="+filepath.Dir(selfPath)`);
	});
});

describe("resolveAppPath", () => {
	let appDir: string;
	let cwd: string;

	beforeEach(() => {
		appDir = mkdtempSync(path.join(tmpdir(), "apppaths-app-"));
		cwd = mkdtempSync(path.join(tmpdir(), "apppaths-cwd-"));
	});

	afterEach(() => {
		rmSync(appDir, { recursive: true, force: true });
		rmSync(cwd, { recursive: true, force: true });
	});

	it("returns an absolute path untouched", () => {
		const abs = path.join(cwd, "anywhere");
		expect(resolveAppPath(abs, appDir, cwd)).toBe(abs);
	});

	it("prefers the application folder when the path exists in both places", () => {
		mkdirSync(path.join(appDir, "learning-packages"));
		mkdirSync(path.join(cwd, "learning-packages"));
		expect(resolveAppPath("./learning-packages", appDir, cwd)).toBe(path.join(appDir, "learning-packages"));
	});

	// The packaged binary launched from a project root (CI full-stack lanes).
	it("falls back to the working directory when only that one has it", () => {
		mkdirSync(path.join(cwd, "learning-packages"));
		expect(resolveAppPath("./learning-packages", appDir, cwd)).toBe(path.join(cwd, "learning-packages"));
	});

	it("points next to the .env when the path exists nowhere", () => {
		expect(resolveAppPath("learning-packages", appDir, cwd)).toBe(path.join(appDir, "learning-packages"));
	});
});
