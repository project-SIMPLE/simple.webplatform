import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import PlayerScreenCanvas from "./PlayerScreenCanvas.tsx";

describe("PlayerScreenCanvas", () => {
	it("renders nothing without an id", () => {
		const canvas = document.createElement("canvas");
		const { container } = render(<PlayerScreenCanvas id={undefined} canvas={canvas} />);
		expect(container).toBeEmptyDOMElement();
	});

	it("attaches the externally-managed canvas into the DOM", () => {
		const canvas = document.createElement("canvas");
		render(<PlayerScreenCanvas id="192.168.1.101:5555" canvas={canvas} />);

		expect(canvas.isConnected).toBe(true);
		// The effect strips prior classes and applies object-contain sizing.
		expect(canvas.classList.contains("object-contain")).toBe(true);
	});

	it("detaches the canvas when the tile unmounts", () => {
		const canvas = document.createElement("canvas");
		const { unmount } = render(<PlayerScreenCanvas id="192.168.1.101:5555" canvas={canvas} />);
		expect(canvas.isConnected).toBe(true);

		unmount();
		expect(canvas.isConnected).toBe(false);
	});

	it("renders a placeholder (no canvas) when isPlaceholder is set", () => {
		const canvas = document.createElement("canvas");
		render(<PlayerScreenCanvas id="192.168.1.101:5555" canvas={canvas} isPlaceholder />);
		expect(canvas.isConnected).toBe(false);
	});

	it("opens a fullscreen popup with the player label when interactive and clicked", async () => {
		const canvas = document.createElement("canvas");
		render(<PlayerScreenCanvas id="192.168.1.101:5555" canvas={canvas} needsInteractivity />);

		// No popup label before interaction.
		expect(screen.queryByText(/Player:/)).not.toBeInTheDocument();

		await userEvent.click(screen.getByRole("button"));

		expect(screen.getByText(/Player: 192\.168\.1\.101:5555/)).toBeInTheDocument();
	});
});
