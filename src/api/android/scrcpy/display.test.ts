import type { Adb } from "@yume-chan/adb";
import { describe, expect, it } from "vitest";
import { parseDisplaySizeOverride, resetDisplaySizeOverride } from "./display.ts";

/** A headset answering `wm size` / `wm size reset` the way Android does. */
function fakeHeadset(override: string | null, { sticky = false } = {}) {
	const commands: string[] = [];
	const adb = {
		subprocess: {
			noneProtocol: {
				spawn: (command: string) => {
					commands.push(command);
					let output = "";
					if (command === "wm size reset") {
						if (!sticky) override = null;
					} else if (command === "wm size") {
						output = `Physical size: 4128x2208\n${override ? `Override size: ${override}\n` : ""}`;
					}
					return { wait: () => ({ toString: async () => output }) };
				},
			},
		},
	} as unknown as Adb;
	return { adb, commands, override: () => override };
}

describe("parseDisplaySizeOverride", () => {
	it("returns null when the device runs at its physical size", () => {
		expect(parseDisplaySizeOverride("Physical size: 4128x2208\n")).toBeNull();
	});

	// Output captured on the Quest 3 (v2.7) of issue #192
	it("extracts the override size", () => {
		expect(parseDisplaySizeOverride("Physical size: 4128x2208\nOverride size: 12384x2208\n")).toBe("12384x2208");
	});

	it("returns null on empty or unexpected output", () => {
		expect(parseDisplaySizeOverride("")).toBeNull();
		expect(parseDisplaySizeOverride("/system/bin/sh: wm: not found\n")).toBeNull();
	});
});

describe("resetDisplaySizeOverride", () => {
	it("leaves a device running at its physical size alone", async () => {
		const headset = fakeHeadset(null);

		await resetDisplaySizeOverride(headset.adb, "test");

		expect(headset.commands).toEqual(["wm size"]);
	});

	it("resets an override and checks it is gone", async () => {
		const headset = fakeHeadset("12384x2208");

		await resetDisplaySizeOverride(headset.adb, "test");

		expect(headset.override()).toBeNull();
		expect(headset.commands).toEqual(["wm size", "wm size reset", "wm size"]);
	});

	it("does not throw nor loop when the override comes back", async () => {
		const headset = fakeHeadset("12384x2208", { sticky: true });

		await resetDisplaySizeOverride(headset.adb, "test");

		expect(headset.commands.filter((c) => c === "wm size reset")).toHaveLength(1);
	});
});
