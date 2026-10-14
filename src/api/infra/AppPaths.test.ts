import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { APP_DIR_ENV, resolveAppDir } from "./AppPaths.ts";

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
