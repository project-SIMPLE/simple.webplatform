import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Footer from "./Footer.tsx";

describe("Footer", () => {
	it("renders the funder/partner logos", () => {
		render(<Footer />);
		for (const alt of ["UE", "GlobalGateway", "NSTDA", "IRD", "CTU"]) {
			expect(screen.getByAltText(alt)).toBeInTheDocument();
		}
	});
});
