import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ComposerInsertMenu } from "./composer-insert-menu";

describe("ComposerInsertMenu", () => {
  it("lists files, commands, skills, and plugins", async () => {
    const onAttach = vi.fn();
    const onInsert = vi.fn();
    const user = userEvent.setup();

    render(
      <ComposerInsertMenu
        plugins={[{ name: "browser" }]}
        skills={[{ name: "review-pr" }]}
        onAttach={onAttach}
        onInsert={onInsert}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add to prompt" }));

    expect(
      await screen.findByRole("menuitem", { name: /Images or text files/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /\/compact/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /review-pr/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /browser/ })).toBeInTheDocument();

    await user.click(screen.getByRole("menuitem", { name: /Images or text files/ }));
    expect(onAttach).toHaveBeenCalledTimes(1);
  });

  it("inserts a slash command into the draft", async () => {
    const onInsert = vi.fn();
    const user = userEvent.setup();

    render(<ComposerInsertMenu onAttach={() => {}} onInsert={onInsert} />);

    await user.click(screen.getByRole("button", { name: "Add to prompt" }));
    await user.click(await screen.findByRole("menuitem", { name: /\/compact/ }));

    expect(onInsert).toHaveBeenCalledWith("/compact ");
  });
});
