import { describe, expect, it } from "vitest";
import {
	buildEnv,
	defaultEnv,
	HOSTNAME_RE,
	isIpv4,
	validateHeadsetsIp,
	validateHost,
	validatePort,
	validatePortUnique,
	type WizardResult,
} from "./TuiConfig.ts";

describe("validatePort", () => {
	it("accepts ports in range", () => {
		expect(validatePort("1")).toBeUndefined();
		expect(validatePort("8080")).toBeUndefined();
		expect(validatePort("65535")).toBeUndefined();
	});

	it("rejects empty, non-numeric and out-of-range values", () => {
		expect(validatePort(undefined)).toMatch(/required/i);
		expect(validatePort("")).toMatch(/required/i);
		expect(validatePort("80a")).toMatch(/number/i);
		expect(validatePort("0")).toMatch(/between/i);
		expect(validatePort("70000")).toMatch(/between/i);
	});
});

describe("validatePortUnique", () => {
	it("passes when the port is valid and unused", () => {
		expect(validatePortUnique("8080", ["1000", "8001"])).toBeUndefined();
	});

	it("flags a collision with an already-chosen port", () => {
		expect(validatePortUnique("1000", ["1000"])).toMatch(/already used/i);
	});

	it("still surfaces basic validation errors first", () => {
		expect(validatePortUnique("nope", ["1000"])).toMatch(/number/i);
	});
});

describe("isIpv4", () => {
	it("accepts well-formed addresses", () => {
		expect(isIpv4("192.168.68.1")).toBe(true);
		expect(isIpv4("0.0.0.0")).toBe(true);
		expect(isIpv4("255.255.255.255")).toBe(true);
	});

	it("rejects malformed or out-of-range addresses", () => {
		expect(isIpv4("256.0.0.1")).toBe(false);
		expect(isIpv4("1.2.3")).toBe(false);
		expect(isIpv4("1.2.3.4.5")).toBe(false);
		expect(isIpv4("localhost")).toBe(false);
	});
});

describe("validateHost", () => {
	it("accepts hostnames and valid IPv4 literals", () => {
		expect(validateHost("localhost")).toBeUndefined();
		expect(validateHost("gama.example.com")).toBeUndefined();
		expect(validateHost("10.0.0.1")).toBeUndefined();
	});

	it("rejects empty input and malformed IPv4-looking values", () => {
		expect(validateHost("")).toMatch(/required/i);
		expect(validateHost("1992.22..22")).toMatch(/IPv4/i);
		expect(validateHost("256.1.1.1")).toMatch(/IPv4/i);
	});

	it("HOSTNAME_RE rejects leading/trailing hyphens and empty labels", () => {
		expect(HOSTNAME_RE.test("valid-host")).toBe(true);
		expect(HOSTNAME_RE.test("-bad")).toBe(false);
		expect(HOSTNAME_RE.test("bad-")).toBe(false);
		expect(HOSTNAME_RE.test("a..b")).toBe(false);
	});
});

describe("validateHeadsetsIp", () => {
	it("treats empty as valid (the field is optional)", () => {
		expect(validateHeadsetsIp("")).toBeUndefined();
		expect(validateHeadsetsIp(undefined)).toBeUndefined();
	});

	it("accepts a ;-separated list of valid IPs", () => {
		expect(validateHeadsetsIp("192.168.68.101;192.168.68.102")).toBeUndefined();
	});

	it("names the invalid entries", () => {
		expect(validateHeadsetsIp("192.168.68.101;999.0.0.1")).toMatch(/999\.0\.0\.1/);
	});
});

describe("buildEnv / defaultEnv", () => {
	const base: WizardResult = {
		useGama: true,
		gamaIp: "localhost",
		gamaWsPort: "1000",
		learningPath: "./learning-packages",
		useExtraLearningPath: false,
		extraLearningPath: "",
		autoDetectHeadsets: true,
		verbose: false,
		extraVerbose: false,
		aggressiveDisconnect: false,
		advanced: false,
	};

	it("emits GAMA settings and ENV_GAMALESS=false in GAMA mode", () => {
		const env = buildEnv(base);
		expect(env).toContain("GAMA_WS_PORT=1000");
		expect(env).toContain("GAMA_IP_ADDRESS=localhost");
		expect(env).toContain("ENV_GAMALESS=false");
		expect(env).toContain('LEARNING_PACKAGE_PATH="./learning-packages"');
	});

	it("omits GAMA settings and sets ENV_GAMALESS=true in GAMA-less mode", () => {
		const env = buildEnv({ ...base, useGama: false });
		expect(env).not.toContain("GAMA_IP_ADDRESS=");
		expect(env).not.toContain("LEARNING_PACKAGE_PATH=");
		expect(env).toContain("ENV_GAMALESS=true");
	});

	it("includes the extra learning path only when provided", () => {
		const env = buildEnv({ ...base, extraLearningPath: "/models/extra" });
		expect(env).toContain('EXTRA_LEARNING_PACKAGE_PATH="/models/extra"');
	});

	it("defaultEnv is a sensible non-interactive fallback", () => {
		const env = defaultEnv();
		expect(env).toContain("GAMA_WS_PORT=1000");
		expect(env).toContain("HEADSET_WS_PORT=8080");
		expect(env).toContain("ENV_GAMALESS=false");
	});
});
