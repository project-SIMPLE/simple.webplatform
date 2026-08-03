import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({ spawnSync: vi.fn() }));

import { spawnSync } from "node:child_process";
import { isMacMini } from "./DeviceDetector.ts";

const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
function setPlatform(platform: NodeJS.Platform) {
	Object.defineProperty(process, "platform", { value: platform, configurable: true });
}

afterEach(() => {
	if (originalPlatform) Object.defineProperty(process, "platform", originalPlatform);
	vi.clearAllMocks();
});

describe("isMacMini", () => {
	it("returns false on non-macOS platforms without probing sysctl", () => {
		setPlatform("linux");
		expect(isMacMini()).toBe(false);
		expect(spawnSync).not.toHaveBeenCalled();
	});

	it("returns true for a Mac Mini hw.model", () => {
		setPlatform("darwin");
		vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: "Macmini9,1\n" } as never);
		expect(isMacMini()).toBe(true);
	});

	it("returns false for a non-Mac-Mini Mac", () => {
		setPlatform("darwin");
		vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: "MacBookPro18,3\n" } as never);
		expect(isMacMini()).toBe(false);
	});

	it("returns false when sysctl fails", () => {
		setPlatform("darwin");
		vi.mocked(spawnSync).mockReturnValue({ status: 1, stdout: "" } as never);
		expect(isMacMini()).toBe(false);
	});
});
