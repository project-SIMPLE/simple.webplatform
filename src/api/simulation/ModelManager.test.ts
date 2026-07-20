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
