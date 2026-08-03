#!/usr/bin/env node
/**
 * Fail a CI lane when the tests it was supposed to run silently skipped.
 *
 * Most of this suite self-gates: the GAMA integration tests, the ADB tests and
 * two E2E specs `describe.skipIf(...)` / `test.skip(...)` themselves when their
 * dependency is unreachable. That is the right behaviour for a developer laptop,
 * but in a lane that *provisions* the dependency it makes a green run
 * indistinguishable from a run where nothing executed at all.
 *
 * This script reads a machine-readable report and asserts what actually ran.
 * It understands both formats the suite emits:
 *   - Vitest  `--reporter=json`  (jest-shaped: numPassedTests / assertionResults)
 *   - Playwright `--reporter=json` (stats + nested suites/specs/tests)
 *
 * Usage:
 *   node scripts/assert-tests-ran.mjs <report.json> --min-passed=N [--allow-skip=<substring>]...
 *
 *   --min-passed=N     fail if fewer than N tests passed.
 *   --allow-skip=TEXT  a skipped test whose name contains TEXT is expected in
 *                      this lane (e.g. the emulator-only streaming spec on the
 *                      macOS/Windows runners). Repeatable. Any skipped test that
 *                      matches no --allow-skip is treated as a failure.
 */

import { readFileSync } from "node:fs";

const [reportPath, ...flags] = process.argv.slice(2);

if (!reportPath) {
	console.error("usage: assert-tests-ran.mjs <report.json> --min-passed=N [--allow-skip=<substring>]...");
	process.exit(2);
}

const flagValue = (name) => flags.filter((f) => f.startsWith(`--${name}=`)).map((f) => f.slice(name.length + 3));

const minPassed = Number(flagValue("min-passed")[0] ?? 0);
const allowedSkips = flagValue("allow-skip");

let report;
try {
	report = JSON.parse(readFileSync(reportPath, "utf-8"));
} catch (err) {
	// A missing or truncated report is itself a failure: the lane produced no
	// evidence that anything ran.
	console.error(`✗ could not read the test report at ${reportPath}: ${err.message}`);
	process.exit(1);
}

/** @returns {{ passed: number, failed: number, skipped: string[] }} */
function normalise(r) {
	// Playwright: has a `stats` block and a `suites` tree.
	if (r.stats && Array.isArray(r.suites)) {
		const skipped = [];
		const walk = (suite, trail) => {
			const path = [...trail, suite.title].filter(Boolean);
			for (const spec of suite.specs ?? []) {
				const status = spec.tests?.[0]?.results?.[0]?.status ?? (spec.ok ? "passed" : "unknown");
				if (status === "skipped") skipped.push([...path, spec.title].join(" › "));
			}
			for (const child of suite.suites ?? []) walk(child, path);
		};
		for (const suite of r.suites) walk(suite, []);
		return { passed: r.stats.expected ?? 0, failed: r.stats.unexpected ?? 0, skipped };
	}

	// Vitest (jest-shaped).
	if (typeof r.numTotalTests === "number") {
		const skipped = [];
		for (const file of r.testResults ?? []) {
			for (const assertion of file.assertionResults ?? []) {
				if (assertion.status === "pending" || assertion.status === "skipped" || assertion.status === "todo") {
					skipped.push(assertion.fullName || assertion.title);
				}
			}
		}
		return { passed: r.numPassedTests ?? 0, failed: r.numFailedTests ?? 0, skipped };
	}

	console.error(`✗ unrecognised report format in ${reportPath} (neither Vitest nor Playwright JSON)`);
	process.exit(1);
}

const { passed, failed, skipped } = normalise(report);
const unexpectedSkips = skipped.filter((name) => !allowedSkips.some((allowed) => name.includes(allowed)));

console.log(`report: ${reportPath}`);
console.log(`  passed=${passed} failed=${failed} skipped=${skipped.length} (min-passed=${minPassed})`);
for (const name of skipped) {
	const expected = unexpectedSkips.includes(name) ? "UNEXPECTED" : "allowed";
	console.log(`  skipped [${expected}]: ${name}`);
}

const problems = [];
if (passed < minPassed) {
	problems.push(
		`only ${passed} test(s) passed, expected at least ${minPassed}. ` +
			`Either tests failed (see above), or the lane's dependency ` +
			`(GAMA / adb / built frontend) never came up and everything self-skipped.`,
	);
}
if (unexpectedSkips.length > 0) {
	problems.push(
		`${unexpectedSkips.length} test(s) skipped that this lane provisions a dependency for:\n` +
			unexpectedSkips.map((n) => `      - ${n}`).join("\n"),
	);
}

if (problems.length > 0) {
	console.error("\n✗ test-coverage guard failed:");
	for (const p of problems) console.error(`    ${p}`);
	process.exit(1);
}

console.log("✓ test-coverage guard passed");
