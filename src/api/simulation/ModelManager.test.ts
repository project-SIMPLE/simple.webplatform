import { beforeEach, describe, expect, it } from "vitest";
import type { VU_CATALOG_SETTING_JSON, VU_MODEL_SETTING_JSON } from "../../common/types.ts";
import type Model from "./Model.ts";
import ModelManager from "./ModelManager.ts";

function model(name: string, file: string): VU_MODEL_SETTING_JSON {
	return {
		type: "json_settings",
		name,
		splashscreen: `${name}.png`,
		model_file_path: file,
		experiment_name: "vr_xp",
		minimal_players: "0",
		maximal_players: "4",
	};
}

// Build a ModelManager without running the fs-scanning constructor.
function bareManager() {
	const mm = Object.create(ModelManager.prototype) as ModelManager;
	mm.models = [];
	mm.monitorNestedModels = [];
	return mm;
}

describe("ModelManager.parseCatalog", () => {
	let mm: ModelManager;

	beforeEach(() => {
		mm = bareManager();
	});

	it("flattens a flat catalog into model entries with sequential indices", () => {
		const catalog: VU_CATALOG_SETTING_JSON = {
			type: "catalog",
			name: "root",
			entries: [model("A", "./A.gaml"), model("B", "./B.gaml")],
		};

		const entries = mm.parseCatalog(catalog, "/pkg/settings.json");

		expect(entries).toHaveLength(2);
		expect(entries.map((e) => (e as { name: string }).name)).toEqual(["A", "B"]);
		expect(entries.map((e) => (e as { model_index: number }).model_index)).toEqual([0, 1]);
		expect(mm.getModelList()).toHaveLength(2);
	});

	it("recurses into nested catalogs, keeping models and sub-catalogs separate", () => {
		const catalog: VU_CATALOG_SETTING_JSON = {
			type: "catalog",
			name: "root",
			entries: [
				model("Top", "./Top.gaml"),
				{
					type: "catalog",
					name: "sub",
					entries: [model("Nested", "./Nested.gaml")],
				},
			],
		};

		const entries = mm.parseCatalog(catalog, "/pkg/settings.json");

		// One model entry, then one catalog entry (models first, catalogs appended).
		expect(entries).toHaveLength(2);
		const sub = entries.find((e) => (e as { type: string }).type === "catalog") as { entries: unknown[] };
		expect(sub.entries).toHaveLength(1);
		// Both leaf models are registered in the flat models list.
		expect(mm.getModelList()).toHaveLength(2);
	});
});

describe("ModelManager active model", () => {
	it("getActiveModel falls back to the first model when none is selected", () => {
		const mm = bareManager();
		mm.models = ["first", "second"] as unknown as Model[];
		expect(mm.getActiveModel()).toBe("first");
		mm.setActiveModelByIndex(1);
		expect(mm.getActiveModel()).toBe("second");
	});

	it("getActiveModel falls back to models[0] when the active index is out of range", () => {
		const mm = bareManager();
		mm.models = ["only", "second"] as unknown as Model[];
		mm.setActiveModelByIndex(99); // activeModel = models[99] = undefined → fallback
		expect(mm.getActiveModel()).toBe("only");
	});
});

// Regression: issue #112 — "Games mixed with two settings files".
// With a second (EXTRA) learning package configured, selecting one game pulled
// another game's player counts: the single-player game (max 1) waited for 4
// players because it picked up the LinkToUnity default settings. `model_index`
// must be globally unique across every package/catalog so setActiveModelByIndex
// always resolves back to that game's own settings.
describe("ModelManager cross-package selection (issue #112)", () => {
	function game(name: string, file: string, min: string, max: string): VU_MODEL_SETTING_JSON {
		return { ...model(name, file), minimal_players: min, maximal_players: max };
	}

	it("resolves each game's index to its own settings, never another package's", () => {
		const mm = bareManager();

		// Main package: a catalog holding the single-player game (waits for 1 player).
		const mainEntries = mm.parseCatalog(
			{ type: "catalog", name: "Demos", entries: [game("Single Player Game", "./Single.gaml", "1", "1")] },
			"/pkg-main/settings.json",
		);
		// EXTRA package: the LinkToUnity default game (waits for up to 4 players).
		const linkEntry = mm.saveNewModel("/pkg-extra/settings.json", game("LinkToUnity", "./Link.gaml", "0", "4"));

		const singleIndex = (mainEntries[0] as { model_index: number }).model_index;

		// Indices are globally distinct across the two packages.
		expect(singleIndex).not.toBe(linkEntry.model_index);

		// Selecting the single-player game yields *its* player counts, not LinkToUnity's.
		mm.setActiveModelByIndex(singleIndex);
		expect(mm.getActiveModel().getJsonSettings().name).toBe("Single Player Game");
		expect(mm.getActiveModel().getJsonSettings().maximal_players).toBe("1");

		// And selecting LinkToUnity yields the max-4 config.
		mm.setActiveModelByIndex(linkEntry.model_index);
		expect(mm.getActiveModel().getJsonSettings().name).toBe("LinkToUnity");
		expect(mm.getActiveModel().getJsonSettings().maximal_players).toBe("4");
	});
});

describe("ModelManager.parseCatalog — malformed catalogs", () => {
	it("returns [] for an empty catalog", () => {
		const mm = bareManager();
		expect(mm.parseCatalog({ type: "catalog", name: "empty", entries: [] }, "/pkg/settings.json")).toEqual([]);
	});

	it("skips an entry that fails to build (bad settings) without throwing", () => {
		const mm = bareManager();
		const catalog: VU_CATALOG_SETTING_JSON = {
			type: "catalog",
			name: "root",
			entries: [
				model("Good", "./Good.gaml"),
				// Missing model_file_path → Model constructor throws → caught per-entry.
				{ type: "json_settings", name: "Bad" } as unknown as VU_MODEL_SETTING_JSON,
			],
		};
		let entries: unknown[] = [];
		expect(() => {
			entries = mm.parseCatalog(catalog, "/pkg/settings.json");
		}).not.toThrow();
		expect(entries).toHaveLength(1); // only "Good" survived
		expect(mm.getModelList()).toHaveLength(1);
	});

	it("treats an unknown entry type as a legacy json_settings (fallthrough)", () => {
		const mm = bareManager();
		const weird = { ...model("W", "./W.gaml"), type: "mystery" } as unknown as VU_MODEL_SETTING_JSON;
		const entries = mm.parseCatalog({ type: "catalog", name: "root", entries: [weird] }, "/pkg/settings.json");
		expect(entries).toHaveLength(1);
		expect(mm.getModelList()).toHaveLength(1);
	});
});
