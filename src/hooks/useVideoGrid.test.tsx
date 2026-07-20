import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useVideoGrid } from "./useVideoGrid.ts";

// Capture the ResizeObserver callback so tests can push a container size.
let resizeCb: ResizeObserverCallback | null = null;
class MockResizeObserver {
	constructor(cb: ResizeObserverCallback) {
		resizeCb = cb;
	}
	observe() {}
	unobserve() {}
	disconnect() {}
}

function resizeTo(width: number, height: number) {
	act(() => {
		resizeCb?.([{ contentRect: { width, height } }] as unknown as ResizeObserverEntry[], {} as ResizeObserver);
	});
}

type Grid = ReturnType<typeof useVideoGrid>;
let grid: Grid;

function Harness({ count, aspect }: { count: number; aspect: number }) {
	grid = useVideoGrid(count, aspect);
	return <div ref={grid.containerRef} />;
}

beforeEach(() => {
	resizeCb = null;
	vi.stubGlobal("ResizeObserver", MockResizeObserver);
});

describe("useVideoGrid — pre-measurement fallback", () => {
	it.each([
		[1, 1, 1],
		[3, 2, 2],
		[4, 2, 2],
		[5, 3, 2],
	])("count %i falls back to a ~square %ix%i grid before measurement", (count, cols, rows) => {
		render(<Harness count={count} aspect={1} />);
		expect(grid.cols).toBe(cols);
		expect(grid.rows).toBe(rows);
	});

	it("treats a count below 1 as a single tile", () => {
		render(<Harness count={0} aspect={1} />);
		expect(grid.cols).toBe(1);
		expect(grid.rows).toBe(1);
	});
});

describe("useVideoGrid — measured layout", () => {
	it("favours a single row of columns in a very wide container", () => {
		render(<Harness count={4} aspect={1} />);
		resizeTo(1000, 200);
		expect(grid.cols).toBe(4);
		expect(grid.rows).toBe(1);
	});

	it("favours a single column in a very tall container", () => {
		render(<Harness count={4} aspect={1} />);
		resizeTo(200, 1000);
		expect(grid.cols).toBe(1);
		expect(grid.rows).toBe(4);
	});

	it("computes cell dimensions accounting for the inter-tile gap", () => {
		render(<Harness count={4} aspect={1} />);
		resizeTo(1000, 200);
		// 4 columns, 1 row, 8px gaps between the 4 columns => (1000 - 3*8) / 4 = 244
		expect(grid.cellWidth).toBeCloseTo(244, 5);
		expect(grid.cellHeight).toBeCloseTo(200, 5);
	});
});
