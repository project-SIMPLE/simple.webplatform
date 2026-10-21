import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Where the scrcpy server binary is looked up. `bin` stands for the file the
// postinstall script downloads into node_modules; `asset` for what a packaged
// executable extracts from its embedded store (see ToolkitAssets.ts).
const dir = mkdtempSync(join(tmpdir(), "scrcpy-server-"));
const paths = vi.hoisted(() => ({ bin: "", asset: "", assetKey: "" }));

vi.mock("@yume-chan/fetch-scrcpy-server", () => ({
	VERSION: "0.0.0-test",
	get BIN() {
		return new URL(paths.bin);
	},
}));

vi.mock("../../infra/ToolkitAssets.ts", () => ({
	resolveToolkitAsset: (name: string) => {
		paths.assetKey = name;
		return paths.asset;
	},
}));

import { buildScrcpyOptions, deviceCrop, SCRCPY_SERVER_ASSET, ScrcpyServer } from "./ScrcpyServer.ts";

type Loader = { loadScrcpyServer(): Promise<void>; server: Buffer | null };

// Bare instance: the constructor would start a uWS server, irrelevant here.
function bareServer(): Loader {
	return Object.create(ScrcpyServer.prototype) as Loader;
}

beforeEach(() => {
	paths.bin = pathToFileURL(join(dir, "missing-server.bin")).href;
	paths.asset = join(dir, "missing-asset");
	paths.assetKey = "";
});

afterAll(() => {
	rmSync(dir, { recursive: true, force: true });
});

describe("ScrcpyServer.loadScrcpyServer", () => {
	it("reads the binary downloaded in node_modules (dev)", async () => {
		const bin = join(dir, "server.bin");
		writeFileSync(bin, "DEV-BINARY");
		paths.bin = pathToFileURL(bin).href;

		const server = bareServer();
		await server.loadScrcpyServer();

		expect(server.server?.toString()).toBe("DEV-BINARY");
		expect(paths.assetKey).toBe(""); // the embedded copy is not touched
	});

	// A packaged executable has no node_modules next to it: without this fallback
	// the release binaries cannot stream at all.
	it("falls back to the asset embedded in the packaged executable", async () => {
		writeFileSync(join(dir, "asset"), "EMBEDDED-BINARY");
		paths.asset = join(dir, "asset");

		const server = bareServer();
		await server.loadScrcpyServer();

		expect(server.server?.toString()).toBe("EMBEDDED-BINARY");
		expect(paths.assetKey).toBe(SCRCPY_SERVER_ASSET);
	});

	it("rejects when the binary is in neither place, so the caller can stop retrying", async () => {
		await expect(bareServer().loadScrcpyServer()).rejects.toThrow();
	});
});

// The build scripts embed the binary; the runtime reads it back. Both sides spell
// the asset key by hand, in different languages of the toolchain.
describe("scrcpy server asset key", () => {
	it.each(["scripts/build-sea-unix.mjs", "scripts/build-sea-win.mjs"])("is the one %s embeds", (script) => {
		expect(readFileSync(script, "utf8")).toContain(`toolkitAssets["toolkit/${SCRCPY_SERVER_ASSET}"]`);
	});
});

describe("deviceCrop", () => {
	it("isolates one eye on a Quest 3S", () => {
		expect(deviceCrop("Quest_3S", false)).toEqual({ crop: "1482:1570:170:150" });
	});

	it("also rotates the picture on a Quest 3", () => {
		expect(deviceCrop("Quest_3", false)).toEqual({ crop: "1482:1570:300:250", angle: 21 });
	});

	it("swaps width and height, not the offsets, when flipped", () => {
		expect(deviceCrop("Quest_3S", true)?.crop).toBe("1570:1482:170:150");
		expect(deviceCrop("Quest_3", true)?.crop).toBe("1570:1482:300:250");
	});

	it("leaves unknown devices uncropped", () => {
		expect(deviceCrop("Pixel_7", false)).toBeUndefined();
		expect(deviceCrop("Quest_2", false)).toBeUndefined();
	});
});

describe("buildScrcpyOptions", () => {
	it("announces the version of the downloaded server binary", () => {
		expect(buildScrcpyOptions(true, undefined).version).toBe("0.0.0-test");
	});

	it("selects the codec negotiated with the browsers", () => {
		expect(buildScrcpyOptions(true, undefined).value.videoCodec).toBe("h265");
		expect(buildScrcpyOptions(false, undefined).value.videoCodec).toBe("h264");
	});

	it("asks for video and control only, and keeps the headset awake", () => {
		expect(buildScrcpyOptions(true, undefined).value).toMatchObject({
			video: true,
			audio: false,
			control: true,
			stayAwake: true,
			keepActive: true,
		});
	});

	it("sends the device crop to the server as scrcpy arguments", () => {
		const args = buildScrcpyOptions(false, deviceCrop("Quest_3", false)).serialize();
		expect(args).toContain("crop=1482:1570:300:250");
		expect(args).toContain("angle=21");
		// No crop means no crop argument at all, not an empty one.
		expect(
			buildScrcpyOptions(false, undefined)
				.serialize()
				.some((a) => a.startsWith("crop=")),
		).toBe(false);
	});
});
