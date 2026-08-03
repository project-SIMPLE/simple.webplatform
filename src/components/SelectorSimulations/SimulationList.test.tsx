import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { GamaState, VU_CATALOG_SETTING_JSON, VU_MODEL_SETTING_JSON } from "../../common/types.ts";
import SimulationList from "./SimulationList.tsx";

const GAMA: GamaState = {
	connected: true,
	loading: false,
	experiment_state: "NONE",
	experiment_id: "",
	experiment_name: "",
	content_error: "",
};

const model: VU_MODEL_SETTING_JSON = {
	type: "json_settings",
	name: "Alpha",
	splashscreen: "",
	model_file_path: "",
	experiment_name: "vr_xp",
	minimal_players: "0",
	maximal_players: "4",
};
const catalog: VU_CATALOG_SETTING_JSON = { type: "catalog", name: "Folder", entries: [] };

describe("SimulationList", () => {
	it("renders a tile per simulation and calls handleSimulation on click", async () => {
		const handle = vi.fn();
		render(<SimulationList list={[model, catalog]} handleSimulation={handle} gama={GAMA} />);
		expect(screen.getByText("Alpha")).toBeInTheDocument();
		expect(screen.getByText("Folder")).toBeInTheDocument();

		await userEvent.click(screen.getAllByRole("button")[0]);
		expect(handle).toHaveBeenCalledWith(0);
	});

	it("disables the tiles while GAMA is disconnected", () => {
		render(<SimulationList list={[model]} handleSimulation={vi.fn()} gama={{ ...GAMA, connected: false }} />);
		expect(screen.getByRole("button")).toBeDisabled();
	});

	it("renders nothing for a non-array list", () => {
		const { container } = render(
			<SimulationList list={null as unknown as VU_MODEL_SETTING_JSON[]} handleSimulation={vi.fn()} gama={GAMA} />,
		);
		expect(container).toBeEmptyDOMElement();
	});
});
