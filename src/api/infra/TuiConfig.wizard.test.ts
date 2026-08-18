// Wizard-level tests for ensureConfig(). The pure validators live in
// TuiConfig.test.ts; this file drives the whole prompt flow with @clack/prompts
// stubbed out, so it can assert what gets asked, what the prompts are
// configured with, and what lands in .env.
//
// The real `group` and `isCancel` are kept (only the individual prompt
// primitives are replaced), so branching and cancellation go through the same
// code paths as production.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

interface PromptOptions {
	message?: string;
	initialValue?: unknown;
	defaultValue?: unknown;
	root?: string;
	validate?: (value: string | undefined) => string | undefined;
}

const h = vi.hoisted(() => {
	const calls: Array<{ kind: string; opts: Record<string, unknown> }> = [];
	// [message substring, answer] pairs; the last match wins, so a test can
	// queue a set of defaults and then override individual answers.
	const answers: Array<[string, unknown]> = [];
	const cancels: string[] = [];
	const net: { value: Record<string, Array<Record<string, unknown>>> } = { value: {} };

	const record = (kind: string) => (opts: Record<string, unknown>) => {
		calls.push({ kind, opts });
		const message = String(opts.message ?? "");
		const hit = answers.findLast(([needle]) => message.includes(needle));
		// Unscripted prompts answer with their own default: "the user hit enter".
		return Promise.resolve(hit ? hit[1] : (opts.initialValue ?? opts.defaultValue ?? ""));
	};

	return { calls, answers, cancels, net, record };
});

vi.mock("@clack/prompts", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@clack/prompts")>();
	return {
		...actual,
		intro: vi.fn(),
		outro: vi.fn(),
		note: vi.fn(),
		cancel: vi.fn((msg?: string) => {
			h.cancels.push(String(msg ?? ""));
		}),
		confirm: h.record("confirm"),
		text: h.record("text"),
		path: h.record("path"),
	};
});

vi.mock("node:os", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:os")>();
	return { ...actual, default: actual, networkInterfaces: () => h.net.value };
});

class ExitError extends Error {
	constructor(readonly code: number) {
		super(`process.exit(${code})`);
	}
}

const ORIGINAL_ARGV = [...process.argv];
const PLATFORM_DESCRIPTOR = Object.getOwnPropertyDescriptor(process, "platform");

/** The genuine @clack cancel symbol, obtained by aborting a real prompt. */
let CANCEL: unknown;

/** Queue answers, keyed by a distinctive substring of the prompt message. */
function answer(map: Record<string, unknown>): void {
	for (const [needle, value] of Object.entries(map)) h.answers.push([needle, value]);
}

/** The recorded prompt whose message contains `needle`, if it was asked. */
function promptFor(needle: string): { kind: string; opts: PromptOptions } | undefined {
	return h.calls.find((c) => String(c.opts.message ?? "").includes(needle)) as
		| { kind: string; opts: PromptOptions }
		| undefined;
}

function iface(address: string, extra: Record<string, unknown> = {}) {
	return { family: "IPv4", internal: false, address, ...extra };
}

/** Full set of answers for a normal GAMA run that accepts every default. */
function answerGamaDefaults(learningPath = "./packages"): void {
	answer({
		"use the webplatform with GAMA?": true,
		"Learning packages folder (relative": learningPath,
		"[Finished]": true,
	});
}

let dir: string;
let cwd: string;
let previousCwd: string;
let previousTTY: boolean | undefined;

async function loadTui(extraArgv: string[] = []) {
	process.argv = [...ORIGINAL_ARGV, ...extraArgv];
	vi.resetModules();
	return await import("./TuiConfig.ts");
}

beforeAll(async () => {
	const actual = await vi.importActual<typeof import("@clack/prompts")>("@clack/prompts");
	CANCEL = await actual.text({ message: "unused", signal: AbortSignal.abort() });
});

beforeEach(() => {
	h.calls.length = 0;
	h.answers.length = 0;
	h.cancels.length = 0;
	// Default: on the headset subnet, so auto-detection is offered.
	h.net.value = { eth0: [iface("192.168.68.10")] };

	previousCwd = process.cwd();
	dir = mkdtempSync(join(tmpdir(), "tuiconfig-"));
	process.chdir(dir);
	cwd = process.cwd(); // resolved form (macOS /var -> /private/var)

	previousTTY = process.stdin.isTTY;
	process.stdin.isTTY = true;
	vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
		throw new ExitError(Number(code ?? 0));
	}) as never);
});

afterEach(() => {
	process.chdir(previousCwd);
	rmSync(dir, { recursive: true, force: true });
	process.stdin.isTTY = previousTTY;
	process.argv = [...ORIGINAL_ARGV];
	if (PLATFORM_DESCRIPTOR) Object.defineProperty(process, "platform", PLATFORM_DESCRIPTOR);
	vi.restoreAllMocks();
});

describe("ensureConfig — when it runs at all", () => {
	it("is a no-op when a .env already exists", async () => {
		writeFileSync(join(cwd, ".env"), "EXISTING=1\n", "utf8");
		const { ensureConfig } = await loadTui();

		await ensureConfig();

		expect(readFileSync(join(cwd, ".env"), "utf8")).toBe("EXISTING=1\n");
		expect(h.calls).toHaveLength(0);
	});

	it("re-runs the wizard over an existing .env when --configure is passed", async () => {
		writeFileSync(join(cwd, ".env"), "EXISTING=1\n", "utf8");
		answerGamaDefaults();
		const { ensureConfig } = await loadTui(["--configure"]);

		await ensureConfig();

		const env = readFileSync(join(cwd, ".env"), "utf8");
		expect(env).not.toContain("EXISTING=1");
		expect(env).toContain("ENV_GAMALESS=false");
	});

	it("writes defaults without prompting when there is no TTY", async () => {
		process.stdin.isTTY = undefined;
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const { defaultEnv, ensureConfig } = await loadTui();

		await ensureConfig();

		expect(readFileSync(join(cwd, ".env"), "utf8")).toBe(defaultEnv());
		expect(h.calls).toHaveLength(0);
		expect(warn).toHaveBeenCalledOnce();
	});

	it("does not overwrite an existing .env with defaults when there is no TTY", async () => {
		process.stdin.isTTY = undefined;
		writeFileSync(join(cwd, ".env"), "EXISTING=1\n", "utf8");
		const { ensureConfig } = await loadTui(["--configure"]);

		await ensureConfig();

		expect(readFileSync(join(cwd, ".env"), "utf8")).toBe("EXISTING=1\n");
	});
});

describe("ensureConfig — learning-package pickers", () => {
	it("roots both pickers at the working directory with the platform separator", async () => {
		answerGamaDefaults();
		answer({ "extra path to learning packages": true });
		const { ensureConfig } = await loadTui();

		await ensureConfig();

		for (const needle of ["Learning packages folder (relative", "Extra learning packages folder"]) {
			const prompt = promptFor(needle);
			expect(prompt?.kind).toBe("path");
			expect(prompt?.opts.root).toBe(`${cwd}/`);
		}
	});

	it("uses a backslash separator for the picker root on Windows", async () => {
		Object.defineProperty(process, "platform", { value: "win32", configurable: true });
		answerGamaDefaults();
		answer({ "extra path to learning packages": true });
		const { ensureConfig } = await loadTui();

		await ensureConfig();

		for (const needle of ["Learning packages folder (relative", "Extra learning packages folder"]) {
			expect(promptFor(needle)?.opts.root).toBe(`${cwd}\\`);
		}
	});

	it("validates the learning path against the filesystem", async () => {
		mkdirSync(join(cwd, "packages"));
		answerGamaDefaults();
		const { ensureConfig } = await loadTui();

		await ensureConfig();
		const validate = promptFor("Learning packages folder (relative")?.opts.validate;

		expect(validate?.("./packages")).toBeUndefined();
		expect(validate?.(cwd)).toBeUndefined(); // absolute paths work too
		expect(validate?.("./nope")).toMatch(/not found/i);
		expect(validate?.("  ")).toMatch(/required/i);
		expect(validate?.(undefined)).toMatch(/required/i);
	});

	it("rejects an extra learning path that duplicates the main one", async () => {
		mkdirSync(join(cwd, "packages"));
		mkdirSync(join(cwd, "extra"));
		answerGamaDefaults();
		answer({ "extra path to learning packages": true });
		const { ensureConfig } = await loadTui();

		await ensureConfig();
		const validate = promptFor("Extra learning packages folder")?.opts.validate;

		expect(validate?.("")).toBeUndefined(); // optional
		expect(validate?.("./extra")).toBeUndefined();
		expect(validate?.("./packages")).toMatch(/should not be the same/i);
		expect(validate?.(join(cwd, "packages"))).toMatch(/should not be the same/i);
		expect(validate?.("./nope")).toMatch(/not found/i);
	});
});

describe("ensureConfig — headset auto-detection gate", () => {
	it("offers auto-detection on the headset subnet and leaves HEADSETS_IP unset", async () => {
		answerGamaDefaults();
		const { ensureConfig } = await loadTui();

		await ensureConfig();

		expect(promptFor("Auto-detect headsets")).toBeDefined();
		expect(promptFor("Headset IPs to scrcpy")).toBeUndefined();
		expect(readFileSync(join(cwd, ".env"), "utf8")).not.toContain("HEADSETS_IP");
	});

	it("falls back to manual entry when the machine is off the headset subnet", async () => {
		h.net.value = { eth0: [iface("10.0.0.5")] };
		answerGamaDefaults();
		answer({ "Headset IPs to scrcpy": "192.168.68.101;192.168.68.102" });
		const { ensureConfig } = await loadTui();

		await ensureConfig();

		expect(promptFor("Auto-detect headsets")).toBeUndefined();
		expect(readFileSync(join(cwd, ".env"), "utf8")).toContain('HEADSETS_IP="192.168.68.101;192.168.68.102"');
	});

	it("ignores loopback and tailscale interfaces when deciding", async () => {
		h.net.value = {
			lo: [iface("192.168.68.1", { internal: true })],
			tailscale0: [iface("192.168.68.2")],
		};
		answerGamaDefaults();
		const { ensureConfig } = await loadTui();

		await ensureConfig();

		expect(promptFor("Auto-detect headsets")).toBeUndefined();
	});

	it("asks manually when auto-detection is offered but declined", async () => {
		answerGamaDefaults();
		answer({ "Auto-detect headsets": false, "Headset IPs to scrcpy": "192.168.68.101" });
		const { ensureConfig } = await loadTui();

		await ensureConfig();

		expect(readFileSync(join(cwd, ".env"), "utf8")).toContain('HEADSETS_IP="192.168.68.101"');
	});
});

describe("ensureConfig — written .env", () => {
	it("writes GAMA settings and network defaults when the advanced step is skipped", async () => {
		answerGamaDefaults();
		const { ensureConfig } = await loadTui();

		await ensureConfig();
		const env = readFileSync(join(cwd, ".env"), "utf8");

		expect(env).toContain("GAMA_WS_PORT=1000");
		expect(env).toContain("GAMA_IP_ADDRESS=localhost");
		expect(env).toContain("HEADSET_WS_PORT=8080");
		expect(env).toContain("MONITOR_WS_PORT=8001");
		expect(env).toContain("WEB_APPLICATION_HOST=0.0.0.0");
		expect(env).toContain("WEB_APPLICATION_PORT=8000");
		expect(env).toContain("VERBOSE=false");
		expect(env).toContain("ENV_GAMALESS=false");
		expect(env).toContain('LEARNING_PACKAGE_PATH="./packages"');
		expect(env).toContain("AGGRESSIVE_DISCONNECT=false");
		expect(env).not.toContain("EXTRA_VERBOSE");
		expect(env).not.toContain("EXTRA_LEARNING_PACKAGE_PATH");
	});

	it("skips every GAMA question in GAMA-less mode", async () => {
		answer({ "use the webplatform with GAMA?": false, "[Finished]": true });
		const { ensureConfig } = await loadTui();

		await ensureConfig();
		const env = readFileSync(join(cwd, ".env"), "utf8");

		expect(promptFor("GAMA server IP address")).toBeUndefined();
		expect(promptFor("GAMA WebSocket port")).toBeUndefined();
		expect(promptFor("Learning packages folder (relative")).toBeUndefined();
		expect(promptFor("Aggressively remove players")).toBeUndefined();
		expect(env).toContain("ENV_GAMALESS=true");
		expect(env).not.toContain("GAMA_IP_ADDRESS");
		expect(env).not.toContain("LEARNING_PACKAGE_PATH");
	});

	it("writes the advanced network answers when the advanced step is taken", async () => {
		answerGamaDefaults();
		answer({
			"advanced network settings": true,
			"Web application host": "127.0.0.1",
			"Web application port": "9000",
			"Monitor WebSocket port": "9001",
			"Headset WebSocket port": "9002",
			"*EXTRA* verbose": true,
			"Enable verbose logging": true,
		});
		const { ensureConfig } = await loadTui();

		await ensureConfig();
		const env = readFileSync(join(cwd, ".env"), "utf8");

		expect(env).toContain("WEB_APPLICATION_HOST=127.0.0.1");
		expect(env).toContain("WEB_APPLICATION_PORT=9000");
		expect(env).toContain("MONITOR_WS_PORT=9001");
		expect(env).toContain("HEADSET_WS_PORT=9002");
		expect(env).toContain("VERBOSE=true");
		expect(env).toContain("EXTRA_VERBOSE=true");
	});

	it("skips the advanced prompts when the gate is declined", async () => {
		answerGamaDefaults();
		const { ensureConfig } = await loadTui();

		await ensureConfig();

		expect(promptFor("Web application host")).toBeUndefined();
		expect(promptFor("Monitor WebSocket port")).toBeUndefined();
		expect(promptFor("*EXTRA* verbose")).toBeUndefined();
	});

	it("writes the extra learning path when one is given", async () => {
		answerGamaDefaults();
		answer({
			"extra path to learning packages": true,
			"Extra learning packages folder": "  /models/extra  ",
		});
		const { ensureConfig } = await loadTui();

		await ensureConfig();

		expect(readFileSync(join(cwd, ".env"), "utf8")).toContain('EXTRA_LEARNING_PACKAGE_PATH="/models/extra"');
	});
});

describe("ensureConfig — advanced port validators", () => {
	it("rejects a port already taken by an earlier answer", async () => {
		answerGamaDefaults();
		answer({ "advanced network settings": true, "GAMA WebSocket port": "1000" });
		const { ensureConfig } = await loadTui();

		await ensureConfig();

		// Advanced prompts are asked in order, each seeing the previous answers.
		expect(promptFor("Web application port")?.opts.validate?.("1000")).toMatch(/already used/i);
		expect(promptFor("Web application port")?.opts.validate?.("9000")).toBeUndefined();
		expect(promptFor("Monitor WebSocket port")?.opts.validate?.("8000")).toMatch(/already used/i);
		expect(promptFor("Headset WebSocket port")?.opts.validate?.("8001")).toMatch(/already used/i);
		expect(promptFor("Headset WebSocket port")?.opts.validate?.("70000")).toMatch(/between/i);
	});
});

describe("ensureConfig — refusal paths", () => {
	it("exits without writing when a port collides across the wizard", async () => {
		// 8000 is the default WEB_APPLICATION_PORT, never shown to this user.
		answerGamaDefaults();
		answer({ "GAMA WebSocket port": "8000" });
		const { ensureConfig } = await loadTui();

		await expect(ensureConfig()).rejects.toMatchObject({ code: 1 });

		expect(existsSync(join(cwd, ".env"))).toBe(false);
		expect(h.cancels.join("\n")).toMatch(/WEB_APPLICATION_PORT.*GAMA_WS_PORT|GAMA_WS_PORT.*WEB_APPLICATION_PORT/);
	});

	it("exits without writing when the final confirmation is declined", async () => {
		answerGamaDefaults();
		answer({ "[Finished]": false });
		const { ensureConfig } = await loadTui();

		await expect(ensureConfig()).rejects.toMatchObject({ code: 0 });

		expect(existsSync(join(cwd, ".env"))).toBe(false);
		expect(h.cancels.join("\n")).toMatch(/cancelled/i);
	});

	it("exits without writing when the final confirmation is cancelled (Ctrl-C)", async () => {
		answerGamaDefaults();
		answer({ "[Finished]": CANCEL });
		const { ensureConfig } = await loadTui();

		// The cancel symbol is truthy, so this only passes because the code
		// checks isCancel() rather than the truthiness of the answer.
		await expect(ensureConfig()).rejects.toMatchObject({ code: 0 });

		expect(existsSync(join(cwd, ".env"))).toBe(false);
	});

	it("exits without writing when a wizard step is cancelled", async () => {
		answerGamaDefaults();
		answer({ "GAMA server IP address": CANCEL });
		const { ensureConfig } = await loadTui();

		await expect(ensureConfig()).rejects.toMatchObject({ code: 0 });

		expect(existsSync(join(cwd, ".env"))).toBe(false);
		expect(h.cancels.join("\n")).toMatch(/cancelled/i);
	});
});
