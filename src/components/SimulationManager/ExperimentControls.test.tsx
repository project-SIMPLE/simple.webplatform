import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import ExperimentControls from "./ExperimentControls.tsx";

function renderControls(props: Partial<React.ComponentProps<typeof ExperimentControls>> = {}) {
	const onPlayPause = vi.fn();
	const onEnd = vi.fn();
	const utils = render(
		<MemoryRouter>
			<ExperimentControls
				experimentState="NONE"
				playerCount={0}
				minPlayers={1}
				maxPlayers={4}
				onPlayPause={onPlayPause}
				onEnd={onEnd}
				{...props}
			/>
		</MemoryRouter>,
	);
	return { ...utils, onPlayPause, onEnd };
}

describe("ExperimentControls pre-launch", () => {
	it("renders nothing below the minimum player count", () => {
		const { container } = renderControls({ experimentState: "NONE", playerCount: 0, minPlayers: 1 });
		expect(container).toBeEmptyDOMElement();
	});

	it("offers a manual play button once the minimum is reached", async () => {
		const { onPlayPause } = renderControls({ experimentState: "NONE", playerCount: 2, minPlayers: 1, maxPlayers: 4 });
		const play = screen.getByRole("button", { name: "Play" });
		await userEvent.click(play);
		expect(onPlayPause).toHaveBeenCalledOnce();
	});

	it("renders nothing once the maximum is reached (auto-start territory)", () => {
		const { container } = renderControls({ experimentState: "NONE", playerCount: 4, minPlayers: 1, maxPlayers: 4 });
		expect(container).toBeEmptyDOMElement();
	});
});

describe("ExperimentControls running", () => {
	it("shows Pause + Stop while RUNNING", () => {
		renderControls({ experimentState: "RUNNING" });
		expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Play" })).not.toBeInTheDocument();
	});

	it("shows Play + Stop while PAUSED", () => {
		renderControls({ experimentState: "PAUSED" });
		expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument();
	});

	it("fires onEnd when Stop is clicked", async () => {
		const { onEnd } = renderControls({ experimentState: "RUNNING" });
		await userEvent.click(screen.getByRole("button", { name: "Stop" }));
		expect(onEnd).toHaveBeenCalledOnce();
	});
});
