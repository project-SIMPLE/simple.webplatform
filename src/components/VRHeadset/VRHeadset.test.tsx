import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import VRHeadset from "./VRHeadset.tsx";

describe("VRHeadset", () => {
	it("renders a headset image whether or not a player is present", () => {
		const { rerender } = render(<VRHeadset />);
		expect(screen.getByAltText("VR Headset")).toBeInTheDocument();

		rerender(
			<VRHeadset playerId="headset_1" selectedPlayer={{ connected: true, in_game: false, date_connection: "10:00" }} />,
		);
		expect(screen.getByAltText("VR Headset")).toBeInTheDocument();
	});

	it("does not crash on a playerId without an underscore segment", () => {
		expect(() =>
			render(<VRHeadset playerId="weird" selectedPlayer={{ connected: true, in_game: false, date_connection: "" }} />),
		).not.toThrow();
	});
});
