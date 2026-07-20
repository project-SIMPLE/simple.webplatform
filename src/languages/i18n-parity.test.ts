import { describe, expect, it } from "vitest";
import english from "./english.json";
import french from "./french.json";
import khmer from "./khmer.json";
import lao from "./lao.json";
import thai from "./thai.json";
import vietnamese from "./vietnamese.json";

// Flatten nested keys into dotted paths so the comparison is structural,
// not just top-level.
function flatKeys(obj: Record<string, unknown>, prefix = ""): string[] {
	return Object.entries(obj).flatMap(([key, value]) => {
		const path = prefix ? `${prefix}.${key}` : key;
		return value !== null && typeof value === "object" && !Array.isArray(value)
			? flatKeys(value as Record<string, unknown>, path)
			: [path];
	});
}

const englishKeys = new Set(flatKeys(english));

const languages = {
	french,
	vietnamese,
	thai,
	lao,
	khmer,
} as const;

describe("i18n translation parity", () => {
	it("english is non-empty (baseline)", () => {
		expect(englishKeys.size).toBeGreaterThan(0);
	});

	for (const [name, resource] of Object.entries(languages)) {
		describe(name, () => {
			const keys = new Set(flatKeys(resource as Record<string, unknown>));

			it("has no keys missing relative to english", () => {
				const missing = [...englishKeys].filter((k) => !keys.has(k));
				expect(missing, `${name} is missing: ${missing.join(", ")}`).toEqual([]);
			});

			it("has no extra keys not present in english", () => {
				const extra = [...keys].filter((k) => !englishKeys.has(k));
				expect(extra, `${name} has unexpected keys: ${extra.join(", ")}`).toEqual([]);
			});
		});
	}
});
