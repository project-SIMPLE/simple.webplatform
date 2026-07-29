import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { VU_CATALOG_SETTING_JSON, VU_MODEL_SETTING_JSON } from "../../common/types.ts";
import type Controller from "../core/Controller.ts";
import ModelManager from "./ModelManager.ts";

// The ModelManager constructor scans LEARNING_PACKAGE_PATH (and the optional
// EXTRA_LEARNING_PACKAGE_PATH) off disk. `ModelManager.test.ts` covers the pure
// catalog-parsing half against in-memory objects; this file covers the scan
// itself against real temporary directories — the code path that decides which
// packages ever reach the web interface.
//
// Everything here is hermetic: a fresh tmpdir per test, no GAMA, no network.

function modelSettings(name: string, gamlFile: string): VU_MODEL_SETTING_JSON {
	return {
		type: "json_settings",
		name,
		splashscreen: `${name}.png`,
		model_file_path: gamlFile,
		experiment_name: "vr_xp",
		minimal_players: "0",
		maximal_players: "4",
	};
}

/** Writes `<root>/<folder>/settings.json` plus any referenced .gaml files. */
function writePackage(root: string, folder: string, settings: unknown, gamlFiles: string[] = []) {
	const dir = folder === "." ? root : path.join(root, folder);
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(path.join(dir, "settings.json"), JSON.stringify(settings, null, 2));
	for (const f of gamlFiles) fs.writeFileSync(path.join(dir, f), "// gaml stub\n");
	return dir;
}

/** The constructor only stores the controller; nothing here touches it. */
const fakeController = {} as Controller;

/** Model names in `monitorNestedModels`, whatever the nesting. */
function entryNames(entries: unknown[]): string[] {
	const names: string[] = [];
	for (const e of entries as { type?: string; name?: string; entries?: unknown[] }[]) {
		if (e.type === "catalog") names.push(...entryNames(e.entries ?? []));
		else if (e.name) names.push(e.name);
	}
	return names;
}

describe("ModelManager package discovery (real filesystem)", () => {
	let tmp: string;
	const savedEnv = { ...process.env };

	beforeEach(() => {
		tmp = fs.mkdtempSync(path.join(os.tmpdir(), "simple-mm-"));
		// index.ts normalises EXTRA_LEARNING_PACKAGE_PATH to "" at startup;
		// ModelManager relies on it being a string, never undefined.
		process.env.EXTRA_LEARNING_PACKAGE_PATH = "";
	});

	afterEach(() => {
		fs.rmSync(tmp, { recursive: true, force: true });
		process.env = { ...savedEnv };
	});

	it("discovers a single json_settings package in a sub-folder", () => {
		writePackage(tmp, "pkgA", modelSettings("Alpha", "./alpha.gaml"), ["alpha.gaml"]);
		process.env.LEARNING_PACKAGE_PATH = tmp;

		const mm = new ModelManager(fakeController);

		expect(mm.getModelList()).toHaveLength(1);
		expect(mm.getModelList()[0].getJsonSettings().name).toBe("Alpha");
		expect(entryNames(mm.monitorNestedModels)).toEqual(["Alpha"]);
	});

	it("resolves a model's relative model_file_path against its own settings.json", () => {
		const pkgDir = writePackage(tmp, "pkgA", modelSettings("Alpha", "./alpha.gaml"), ["alpha.gaml"]);
		process.env.LEARNING_PACKAGE_PATH = tmp;

		const mm = new ModelManager(fakeController);

		const resolved = mm.getModelList()[0].getModelFilePath();
		expect(path.isAbsolute(resolved)).toBe(true);
		expect(fs.existsSync(resolved)).toBe(true);
		expect(resolved).toBe(path.join(pkgDir, "alpha.gaml"));
	});

	it("also picks up a settings.json sitting at the learning-package root itself", () => {
		// The scan prepends "." to the directory listing, so the root counts as a
		// package folder too.
		writePackage(tmp, ".", modelSettings("RootModel", "./root.gaml"), ["root.gaml"]);
		process.env.LEARNING_PACKAGE_PATH = tmp;

		const mm = new ModelManager(fakeController);

		expect(entryNames(mm.monitorNestedModels)).toEqual(["RootModel"]);
	});

	it("flattens a catalog package, keeping nested catalogs as their own entries", () => {
		const catalog: VU_CATALOG_SETTING_JSON = {
			type: "catalog",
			name: "Course",
			entries: [
				modelSettings("Lesson1", "./l1.gaml"),
				{
					type: "catalog",
					name: "Advanced",
					entries: [modelSettings("Lesson2", "./l2.gaml")],
				} as unknown as VU_MODEL_SETTING_JSON,
			],
		};
		writePackage(tmp, "course", catalog, ["l1.gaml", "l2.gaml"]);
		process.env.LEARNING_PACKAGE_PATH = tmp;

		const mm = new ModelManager(fakeController);

		expect(mm.getModelList().map((m) => m.getJsonSettings().name)).toEqual(["Lesson1", "Lesson2"]);
		const nested = mm.monitorNestedModels as { type: string; name: string; entries: unknown[] }[];
		expect(nested).toHaveLength(1);
		expect(nested[0].type).toBe("catalog");
		expect(nested[0].name).toBe("Course");
		expect(entryNames(nested[0].entries)).toEqual(["Lesson1", "Lesson2"]);
	});

	it("indexes every discovered model sequentially across packages", () => {
		writePackage(tmp, "a-pkg", modelSettings("A", "./a.gaml"), ["a.gaml"]);
		writePackage(tmp, "b-pkg", modelSettings("B", "./b.gaml"), ["b.gaml"]);
		process.env.LEARNING_PACKAGE_PATH = tmp;

		const mm = new ModelManager(fakeController);

		expect(mm.getModelList()).toHaveLength(2);
		// Every model_index must address its own model in the flat list.
		const indexed = JSON.parse(mm.getCatalogListJSON()) as { name: string; model_index: number }[];
		for (const entry of indexed) {
			expect(mm.getModelList()[entry.model_index].getJsonSettings().name).toBe(entry.name);
		}
	});

	it("ignores folders without a settings.json and loose files at the root", () => {
		writePackage(tmp, "pkgA", modelSettings("Alpha", "./alpha.gaml"), ["alpha.gaml"]);
		fs.mkdirSync(path.join(tmp, "not-a-package"), { recursive: true });
		fs.writeFileSync(path.join(tmp, "not-a-package", "README.txt"), "no settings here");
		fs.writeFileSync(path.join(tmp, "stray.txt"), "loose file");
		process.env.LEARNING_PACKAGE_PATH = tmp;

		const mm = new ModelManager(fakeController);

		expect(mm.getModelList()).toHaveLength(1);
	});

	it("merges packages from EXTRA_LEARNING_PACKAGE_PATH into the same list", () => {
		const extra = fs.mkdtempSync(path.join(os.tmpdir(), "simple-mm-extra-"));
		try {
			writePackage(tmp, "main-pkg", modelSettings("Main", "./m.gaml"), ["m.gaml"]);
			writePackage(extra, "extra-pkg", modelSettings("Extra", "./e.gaml"), ["e.gaml"]);
			process.env.LEARNING_PACKAGE_PATH = tmp;
			process.env.EXTRA_LEARNING_PACKAGE_PATH = extra;

			const mm = new ModelManager(fakeController);

			expect(entryNames(mm.monitorNestedModels).sort()).toEqual(["Extra", "Main"]);
		} finally {
			fs.rmSync(extra, { recursive: true, force: true });
		}
	});

	it("resolves a relative LEARNING_PACKAGE_PATH against the working directory", () => {
		// Place the fixture under cwd so the relative branch of the path logic runs.
		const rel = path.relative(process.cwd(), tmp);
		writePackage(tmp, "pkgA", modelSettings("Alpha", "./alpha.gaml"), ["alpha.gaml"]);
		process.env.LEARNING_PACKAGE_PATH = rel;

		// A tmpdir outside cwd cannot be expressed as a usable relative path on
		// every platform; only assert when it round-trips.
		if (path.join(process.cwd(), rel) !== tmp) return;

		const mm = new ModelManager(fakeController);
		expect(mm.getModelList()).toHaveLength(1);
	});

	it("survives a missing learning-package folder with an empty model list", () => {
		process.env.LEARNING_PACKAGE_PATH = path.join(tmp, "does-not-exist");

		// Unpackaged builds log and carry on rather than exiting the process.
		const mm = new ModelManager(fakeController);

		expect(mm.getModelList()).toEqual([]);
		expect(mm.monitorNestedModels).toEqual([]);
	});

	it("logs and skips a settings.json whose type is unrecognised", () => {
		writePackage(tmp, "weird", { type: "something_else", name: "Weird" });
		writePackage(tmp, "good", modelSettings("Good", "./g.gaml"), ["g.gaml"]);
		process.env.LEARNING_PACKAGE_PATH = tmp;

		const mm = new ModelManager(fakeController);

		// The unknown package contributes nothing, but it must not block the valid one.
		expect(entryNames(mm.monitorNestedModels)).toEqual(["Good"]);
	});

	it("getActiveModel defaults to the first discovered model", () => {
		writePackage(tmp, "a-pkg", modelSettings("A", "./a.gaml"), ["a.gaml"]);
		writePackage(tmp, "b-pkg", modelSettings("B", "./b.gaml"), ["b.gaml"]);
		process.env.LEARNING_PACKAGE_PATH = tmp;

		const mm = new ModelManager(fakeController);

		expect(mm.getActiveModel()).toBe(mm.getModelList()[0]);
		mm.setActiveModelByIndex(1);
		expect(mm.getActiveModel()).toBe(mm.getModelList()[1]);
	});
});
