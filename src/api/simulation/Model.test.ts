import path from "node:path";
import { describe, expect, it } from "vitest";
import type { VU_MODEL_SETTING_JSON } from "../../common/types.ts";
import Model from "./Model.ts";

function settings(overrides: Partial<VU_MODEL_SETTING_JSON> = {}): VU_MODEL_SETTING_JSON {
	return {
		type: "json_settings",
		name: "Demo",
		splashscreen: "splash.png",
		model_file_path: "./Models/Demo.gaml",
		experiment_name: "vr_xp",
		minimal_players: "0",
		maximal_players: "4",
		...overrides,
	};
}

describe("Model", () => {
	it("resolves a relative model path against the settings.json directory", () => {
		const model = new Model("/pkg/demo/settings.json", settings({ model_file_path: "./Models/Demo.gaml" }));
		expect(model.getModelFilePath()).toBe(path.join("/pkg/demo", "Models/Demo.gaml"));
	});

	it("keeps an absolute model path unchanged", () => {
		const abs = path.resolve("/opt/models/Demo.gaml");
		const model = new Model("/pkg/demo/settings.json", settings({ model_file_path: abs }));
		expect(model.getModelFilePath()).toBe(abs);
	});

	it("exposes experiment name and raw settings", () => {
		const model = new Model("/pkg/demo/settings.json", settings());
		expect(model.getExperimentName()).toBe("vr_xp");
		expect(model.getJsonSettings().name).toBe("Demo");
	});

	it("toJSON carries the resolved path and a json_simulation_list type", () => {
		const model = new Model("/pkg/demo/settings.json", settings());
		const json = model.toJSON();
		expect(json.type).toBe("json_simulation_list");
		expect(json.modelFilePath).toBe(model.getModelFilePath());
	});

	it("toString returns the resolved model file path", () => {
		const model = new Model("/pkg/demo/settings.json", settings());
		expect(model.toString()).toBe(model.getModelFilePath());
	});
});

describe("Model — adversarial inputs", () => {
	it("does not throw for a nonexistent model file (only logs a warning)", () => {
		expect(
			() => new Model("/pkg/demo/settings.json", settings({ model_file_path: "./does/not/exist.gaml" })),
		).not.toThrow();
	});

	it("resolves a '..' relative path against the settings directory", () => {
		const model = new Model("/pkg/demo/settings.json", settings({ model_file_path: "../shared/M.gaml" }));
		expect(model.getModelFilePath()).toBe(path.join("/pkg/shared", "M.gaml"));
	});

	it("surfaces a missing experiment_name as undefined rather than crashing", () => {
		const model = new Model("/pkg/demo/settings.json", settings({ experiment_name: undefined as unknown as string }));
		expect(model.getExperimentName()).toBeUndefined();
	});
});
