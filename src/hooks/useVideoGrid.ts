import { useEffect, useRef, useState } from "react";

interface GridLayout {
	cols: number;
	rows: number;
	cellWidth: number;
	cellHeight: number;
}

const GAP_PX = 8; // matches Tailwind gap-2 (0.5rem)

/**
 * Computes a dynamic grid layout for N video tiles, replacing the old hardcoded
 * per-count / per-orientation switch. It measures the container with a
 * ResizeObserver and picks the column count that maximizes the displayed tile
 * area for the given tile aspect ratio — adapting to any number of streams and
 * any container shape.
 *
 * Returns the chosen `cols`/`rows` plus the measured `cellWidth`/`cellHeight`
 * (px). Callers letterbox each tile into a cell (`min(cellW, cellH * aspect)`),
 * which fits the aspect box exactly regardless of cell shape — something pure
 * CSS cannot do for an arbitrary container.
 *
 * @param count  number of tiles to lay out (values < 1 are treated as 1)
 * @param aspect tile content aspect ratio (width / height)
 */
export const useVideoGrid = (count: number, aspect: number = 1) => {
	const containerRef = useRef<HTMLDivElement>(null);
	const [size, setSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (entry) {
				const { width, height } = entry.contentRect;
				setSize({ width, height });
			}
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	const layout = ((): GridLayout => {
		const n = Math.max(1, count);
		const { width, height } = size;

		// Before the container has been measured, fall back to a roughly square grid.
		if (width <= 0 || height <= 0) {
			const c = Math.ceil(Math.sqrt(n));
			return { cols: c, rows: Math.ceil(n / c), cellWidth: 0, cellHeight: 0 };
		}

		// Try every column count and keep the one that yields the largest tile.
		let best = { cols: 1, rows: n, area: -1 };
		for (let c = 1; c <= n; c++) {
			const r = Math.ceil(n / c);
			const cellW = (width - GAP_PX * (c - 1)) / c;
			const cellH = (height - GAP_PX * (r - 1)) / r;
			// Letterbox the tile's aspect ratio inside the cell.
			const tileW = Math.min(cellW, cellH * aspect);
			const tileH = tileW / aspect;
			const area = tileW * tileH;
			if (area > best.area) {
				best = { cols: c, rows: r, area };
			}
		}

		const cellWidth = (width - GAP_PX * (best.cols - 1)) / best.cols;
		const cellHeight = (height - GAP_PX * (best.rows - 1)) / best.rows;
		return { cols: best.cols, rows: best.rows, cellWidth, cellHeight };
	})();

	return { containerRef, ...layout };
};
