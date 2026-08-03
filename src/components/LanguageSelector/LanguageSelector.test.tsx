import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "i18next";
import { afterEach, describe, expect, it } from "vitest";
import LanguageSelector from "./LanguageSelector.tsx";

describe("LanguageSelector", () => {
	afterEach(async () => {
		await i18n.changeLanguage("en");
	});

	it("opens the popup and switches the real i18n language", async () => {
		render(<LanguageSelector />);
		// Popup closed initially — language options not shown.
		expect(screen.queryByAltText("French")).not.toBeInTheDocument();

		await userEvent.click(screen.getByAltText("language selection"));
		await userEvent.click(screen.getByAltText("French"));

		expect(i18n.language).toBe("fr");
		// Popup closes after a selection.
		expect(screen.queryByAltText("French")).not.toBeInTheDocument();
	});
});
