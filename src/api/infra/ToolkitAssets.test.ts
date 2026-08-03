import { readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Control whether the process looks like a packaged SEA build and what the asset
// store returns, by faking node:module's createRequire -> node:sea lookup.
const seaState = vi.hoisted(() => ({ isSea: false, getAsset: vi.fn() }));

vi.mock("node:module", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:module")>();
	return {
		...actual,
		createRequire: () =>
			((id: string) => {
				if (id === "node:sea") return { isSea: () => seaState.isSea, getAsset: seaState.getAsset };
				throw new Error(`unexpected require: ${id}`);
			}) as unknown as NodeRequire,
	};
});

import { resolveToolkitAsset } from "./ToolkitAssets.ts";

beforeEach(() => {
	seaState.isSea = false;
	seaState.getAsset.mockReset();
});

describe("resolveToolkitAsset (dev / unpackaged)", () => {
	it("resolves straight to the on-disk toolkit folder", () => {
		expect(resolveToolkitAsset("some.apk")).toBe(path.resolve(process.cwd(), "toolkit", "some.apk"));
	});
});

describe("resolveToolkitAsset (packaged SEA)", () => {
	const assetName = "swp-unit-test-asset.bin";

	afterAll(() => {
		try {
			rmSync(path.join(os.tmpdir(), `swp-toolkit-${process.versions.modules}`, assetName), { force: true });
		} catch {
			/* best effort */
		}
	});

	it("extracts the embedded asset to a temp file and caches it", () => {
		seaState.isSea = true;
		seaState.getAsset.mockReturnValue(new TextEncoder().encode("HELLOAPK").buffer);

		const first = resolveToolkitAsset(assetName);
		expect(first).toContain(os.tmpdir());
		expect(readFileSync(first, "utf8")).toBe("HELLOAPK");
		expect(seaState.getAsset).toHaveBeenCalledWith(`toolkit/${assetName}`);

		// Second call for the same asset reuses the extracted file (no re-fetch).
		seaState.getAsset.mockClear();
		const second = resolveToolkitAsset(assetName);
		expect(second).toBe(first);
		expect(seaState.getAsset).not.toHaveBeenCalled();
	});
});
