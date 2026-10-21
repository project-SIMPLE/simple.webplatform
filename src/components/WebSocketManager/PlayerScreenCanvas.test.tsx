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

	it("moves the stream into a fullscreen popup when clicked, and back to the tile on close", async () => {
		const canvas = document.createElement("canvas");
		const { container } = render(<PlayerScreenCanvas id="192.168.1.101:5555" canvas={canvas} needsInteractivity />);
		const tileHolder = canvas.parentElement;

		await userEvent.click(screen.getByRole("button"));

		// The stream alone fills the popup: viewport-capped, no player label on top.
		expect(canvas.parentElement).not.toBe(tileHolder);
		expect(canvas.classList.contains("max-h-[95dvh]")).toBe(true);
		expect(screen.queryByText(/Player:/)).not.toBeInTheDocument();

		const closeButton = container.querySelector('img[src="/images/Buttons/Button_stop.png"]')?.closest("button");
		if (!closeButton) throw new Error("popup close button not rendered");
		await userEvent.click(closeButton);

		expect(canvas.parentElement).toBe(tileHolder);
	});
});
