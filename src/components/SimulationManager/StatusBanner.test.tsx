import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import english from "../../languages/english.json";
import StatusBanner from "./StatusBanner.tsx";

function renderBanner(props: Partial<React.ComponentProps<typeof StatusBanner>> = {}) {
	return render(
		<StatusBanner gamaless={false} experimentState="NONE" playerCount={0} minPlayers={1} maxPlayers={4} {...props} />,
	);
}

describe("StatusBanner", () => {
	it("shows the GAMALESS banner when gamaless is set", () => {
		renderBanner({ gamaless: true });
		expect(screen.getByText(english.gamaless_banner)).toBeInTheDocument();
	});

	// Issue #156: GAMA runs an experiment opened from its own interface that the platform cannot use
	it("warns when GAMA runs an experiment the platform cannot control", () => {
		renderBanner({ foreignExperimentDetected: true, playerCount: 4 });
		expect(screen.getByText(english.foreign_experiment_banner)).toBeInTheDocument();
		expect(screen.queryByText(english.all_players_connected)).not.toBeInTheDocument();
	});

	it("keeps the GAMALESS banner over the foreign-experiment warning", () => {
		renderBanner({ gamaless: true, foreignExperimentDetected: true });
		expect(screen.getByText(english.gamaless_banner)).toBeInTheDocument();
		expect(screen.queryByText(english.foreign_experiment_banner)).not.toBeInTheDocument();
	});

	it("renders nothing once the experiment is running", () => {
		const { container } = renderBanner({ experimentState: "RUNNING" });
		expect(container).toBeEmptyDOMElement();
	});

	it("counts down remaining players toward the minimum", () => {
		renderBanner({ playerCount: 0, minPlayers: 2, maxPlayers: 4 });
		// "wait for N more" — the number is minPlayers - playerCount = 2
		expect(screen.getByText(/2/)).toBeInTheDocument();
		expect(screen.getByText(new RegExp(english.wait_minim_players_1))).toBeInTheDocument();
	});

	it("announces when all players are connected", () => {
		const { container } = renderBanner({ playerCount: 4, minPlayers: 1, maxPlayers: 4 });
		expect(screen.getByText(english.all_players_connected)).toBeInTheDocument();
		expect(container.querySelector('img[src*="Headset_condition_connected"]')).toBeInTheDocument();
	});
});
