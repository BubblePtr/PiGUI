import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChatPromptInput } from "@/shared/ui/chat/chat-prompt-input";

function renderPromptInput({
  value = "",
  status,
  allowSubmitWhileRunning,
  lockInputOnRun,
  onSubmit = () => {},
  onStop,
  onValueChange = () => {},
  sendLabel = "Send",
}: {
  value?: string;
  status?: "ready" | "submitted" | "streaming" | "error";
  allowSubmitWhileRunning?: boolean;
  lockInputOnRun?: boolean;
  onSubmit?: () => void;
  onStop?: () => void;
  onValueChange?: (value: string) => void;
  sendLabel?: string;
} = {}) {
  return render(
    <ChatPromptInput
      allowSubmitWhileRunning={allowSubmitWhileRunning}
      lockInputOnRun={lockInputOnRun}
      status={status}
      value={value}
      variant="primary"
      onStop={onStop}
      onSubmit={onSubmit}
      onValueChange={onValueChange}
    >
      <ChatPromptInput.Shell>
        <ChatPromptInput.Content>
          <ChatPromptInput.TextArea placeholder="Type here" />
        </ChatPromptInput.Content>
        <ChatPromptInput.Toolbar>
          <ChatPromptInput.ToolbarStart>start</ChatPromptInput.ToolbarStart>
          <ChatPromptInput.ToolbarEnd>
            <ChatPromptInput.Send aria-label={sendLabel} />
          </ChatPromptInput.ToolbarEnd>
        </ChatPromptInput.Toolbar>
      </ChatPromptInput.Shell>
      <ChatPromptInput.Footer>footer text</ChatPromptInput.Footer>
    </ChatPromptInput>,
  );
}

describe("ChatPromptInput", () => {
  it("renders the compound slots and mirrors the status on the root", () => {
    const { container } = renderPromptInput({ status: "streaming" });

    const root = container.querySelector('[data-slot="prompt-input"]');

    expect(root).toBeInTheDocument();
    expect(root).toHaveAttribute("data-status", "streaming");
    expect(container.querySelector('[data-slot="prompt-input-shell"]')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="prompt-input-textarea"]')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="prompt-input-send"]')).toBeInTheDocument();
    expect(screen.getByText("footer text")).toBeInTheDocument();
  });

  it("submits on Enter and inserts a newline on Shift+Enter", async () => {
    const onSubmit = vi.fn();
    const onValueChange = vi.fn();
    const user = userEvent.setup();

    renderPromptInput({ value: "hello", onSubmit, onValueChange });

    const textarea = screen.getByPlaceholderText("Type here");

    await user.type(textarea, "{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(1);

    await user.type(textarea, "{Shift>}{Enter}{/Shift}");
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("submits on Cmd+Enter", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    renderPromptInput({ value: "hello", onSubmit });

    await user.type(screen.getByPlaceholderText("Type here"), "{Meta>}{Enter}{/Meta}");

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("does not submit an empty value", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    renderPromptInput({ value: "   ", onSubmit });

    await user.type(screen.getByPlaceholderText("Type here"), "{Enter}");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("locks the textarea while running when lockInputOnRun is set", () => {
    renderPromptInput({ status: "streaming", lockInputOnRun: true });

    expect(screen.getByPlaceholderText("Type here")).toBeDisabled();
  });

  it("keeps the textarea editable while running when submits are allowed", () => {
    renderPromptInput({
      status: "streaming",
      allowSubmitWhileRunning: true,
      lockInputOnRun: false,
    });

    expect(screen.getByPlaceholderText("Type here")).not.toBeDisabled();
  });

  it("calls onStop instead of onSubmit when running with an empty value", async () => {
    const onStop = vi.fn();
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    renderPromptInput({
      value: "",
      status: "streaming",
      allowSubmitWhileRunning: true,
      lockInputOnRun: false,
      sendLabel: "Stop",
      onStop,
      onSubmit,
    });

    await user.click(screen.getByRole("button", { name: "Stop" }));

    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits while running when a value is present and submits are allowed", async () => {
    const onStop = vi.fn();
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    renderPromptInput({
      value: "queued follow-up",
      status: "streaming",
      allowSubmitWhileRunning: true,
      lockInputOnRun: false,
      onStop,
      onSubmit,
    });

    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onStop).not.toHaveBeenCalled();
  });

  it("forwards text edits through onValueChange", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();

    renderPromptInput({ onValueChange });

    await user.type(screen.getByPlaceholderText("Type here"), "a");

    expect(onValueChange).toHaveBeenCalledWith("a");
  });
});
