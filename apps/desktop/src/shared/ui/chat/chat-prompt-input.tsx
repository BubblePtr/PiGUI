import {
  createContext,
  type KeyboardEvent,
  type ReactNode,
  useContext,
  useRef,
} from "react";
import { ArrowUp, Stop } from "@/shared/ui/icons";

export type PromptInputStatus = "ready" | "submitted" | "streaming" | "error";

type PromptInputContextValue = {
  value: string;
  status: PromptInputStatus;
  isRunning: boolean;
  allowSubmitWhileRunning: boolean;
  lockInputOnRun: boolean;
  submit: () => void;
  stop?: () => void;
  onValueChange?: (value: string) => void;
};

const PromptInputContext = createContext<PromptInputContextValue | null>(null);

function usePromptInputContext(component: string) {
  const context = useContext(PromptInputContext);

  if (!context) {
    throw new Error(`${component} must be used inside <ChatPromptInput>.`);
  }

  return context;
}

/**
 * Compound prompt composer. The root owns submit/stop semantics; slots render
 * the shell, autosizing textarea, toolbar regions, send button, and footer.
 */
export function ChatPromptInput({
  children,
  className = "",
  value,
  status = "ready",
  variant = "primary",
  allowSubmitWhileRunning = false,
  lockInputOnRun = false,
  onSubmit,
  onStop,
  onValueChange,
}: {
  children: ReactNode;
  className?: string;
  value: string;
  status?: PromptInputStatus;
  variant?: "primary";
  allowSubmitWhileRunning?: boolean;
  lockInputOnRun?: boolean;
  onSubmit?: () => void;
  onStop?: () => void;
  onValueChange?: (value: string) => void;
}) {
  const isRunning = status === "streaming" || status === "submitted";
  const submit = () => {
    if (!value.trim()) {
      return;
    }

    if (isRunning && !allowSubmitWhileRunning) {
      return;
    }

    onSubmit?.();
  };

  return (
    <div
      className={`prompt-input prompt-input--${variant} ${className}`.trim()}
      data-slot="prompt-input"
      data-status={status}
    >
      <PromptInputContext.Provider
        value={{
          value,
          status,
          isRunning,
          allowSubmitWhileRunning,
          lockInputOnRun,
          submit,
          stop: onStop,
          onValueChange,
        }}
      >
        {children}
      </PromptInputContext.Provider>
    </div>
  );
}

function PromptInputShell({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`prompt-input__shell ${className}`.trim()} data-slot="prompt-input-shell">
      {children}
    </div>
  );
}

function PromptInputContent({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`prompt-input__content ${className}`.trim()}
      data-slot="prompt-input-content"
    >
      {children}
    </div>
  );
}

function PromptInputTextArea({
  placeholder,
  className = "",
}: {
  placeholder?: string;
  className?: string;
}) {
  const context = usePromptInputContext("ChatPromptInput.TextArea");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const autosize = () => {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";

    if (textarea.scrollHeight > 0) {
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter") {
      return;
    }

    // Shift+Enter inserts a newline; Enter and Cmd/Ctrl+Enter submit.
    if (event.shiftKey) {
      return;
    }

    event.preventDefault();
    context.submit();
  };

  return (
    <textarea
      ref={textareaRef}
      className={`prompt-input__textarea ${className}`.trim()}
      data-slot="prompt-input-textarea"
      disabled={context.lockInputOnRun && context.isRunning}
      placeholder={placeholder}
      rows={1}
      value={context.value}
      onChange={(event) => {
        context.onValueChange?.(event.target.value);
        autosize();
      }}
      onKeyDown={handleKeyDown}
    />
  );
}

function PromptInputToolbar({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`prompt-input__toolbar ${className}`.trim()}
      data-slot="prompt-input-toolbar"
    >
      {children}
    </div>
  );
}

function PromptInputToolbarStart({
  children,
  className = "",
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`prompt-input__toolbar-start ${className}`.trim()}
      data-slot="prompt-input-toolbar-start"
    >
      {children}
    </div>
  );
}

function PromptInputToolbarEnd({
  children,
  className = "",
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`prompt-input__toolbar-end ${className}`.trim()}
      data-slot="prompt-input-toolbar-end"
    >
      {children}
    </div>
  );
}

function PromptInputSend({
  "aria-label": ariaLabel = "Send",
  className = "",
}: {
  "aria-label"?: string;
  className?: string;
}) {
  const context = usePromptInputContext("ChatPromptInput.Send");
  const isStopAction =
    context.isRunning && !context.value.trim() && Boolean(context.stop);
  const canSubmit =
    Boolean(context.value.trim()) &&
    (!context.isRunning || context.allowSubmitWhileRunning);

  return (
    <button
      aria-label={ariaLabel}
      className={`prompt-input__send ${className}`.trim()}
      data-slot="prompt-input-send"
      disabled={!isStopAction && !canSubmit}
      type="button"
      onClick={() => {
        if (isStopAction) {
          context.stop?.();
          return;
        }

        context.submit();
      }}
    >
      {isStopAction ? (
        <Stop aria-hidden="true" size={16} />
      ) : (
        <ArrowUp aria-hidden="true" size={16} />
      )}
    </button>
  );
}

function PromptInputFooter({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`prompt-input__footer ${className}`.trim()} data-slot="prompt-input-footer">
      {children}
    </div>
  );
}

ChatPromptInput.Shell = PromptInputShell;
ChatPromptInput.Content = PromptInputContent;
ChatPromptInput.TextArea = PromptInputTextArea;
ChatPromptInput.Toolbar = PromptInputToolbar;
ChatPromptInput.ToolbarStart = PromptInputToolbarStart;
ChatPromptInput.ToolbarEnd = PromptInputToolbarEnd;
ChatPromptInput.Send = PromptInputSend;
ChatPromptInput.Footer = PromptInputFooter;
