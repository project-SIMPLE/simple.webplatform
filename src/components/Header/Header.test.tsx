import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import Header from "./Header.tsx";

describe("Header", () => {
	it("renders the logo and fires onLogoClick when provided", async () => {
		const onLogoClick = vi.fn();
		render(
			<MemoryRouter>
				<Header onLogoClick={onLogoClick} />
			</MemoryRouter>,
		);
		await userEvent.click(screen.getByAltText("Logo"));
		expect(onLogoClick).toHaveBeenCalledOnce();
	});

	it("renders the logo (as a home link) and the language selector without a handler", () => {
		render(
			<MemoryRouter>
				<Header />
			</MemoryRouter>,
		);
		expect(screen.getByAltText("Logo")).toBeInTheDocument();
		expect(screen.getByAltText("language selection")).toBeInTheDocument();
	});
});
