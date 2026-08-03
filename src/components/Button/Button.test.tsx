import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import Button from "./Button.tsx";

describe("Button", () => {
	it("renders its text and fires onClick", async () => {
		const onClick = vi.fn();
		render(<Button text="Go" bgColor="bg-red-500" onClick={onClick} />);
		await userEvent.click(screen.getByRole("button", { name: "Go" }));
		expect(onClick).toHaveBeenCalledOnce();
	});

	it("applies the bgColor class", () => {
		render(<Button text="X" bgColor="bg-green-500" />);
		expect(screen.getByRole("button")).toHaveClass("bg-green-500");
	});
});
