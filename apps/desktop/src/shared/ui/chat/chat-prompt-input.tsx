import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
} from "react";
import {
  ChatComposer,
  ChatSendButton,
  useChatComposerContext,
} from "@astryxdesign/core/Chat";

export type PromptInputStatus = "ready" | "submitted" | "streaming" | "error";

/**
 * Native textarea wired into the Astryx composer context. Kept native (not
 * the contentEditable ChatComposerInput) for the platform textarea behavior
 * and the placeholder/value test surface, per issue 09.
 */
function PromptTextArea({
  disabled = false,
  onSubmitRequest,
}: {
  disabled?: boolean;
  onSubmitRequest: () => void;
}) {
  const context = useChatComposerContext();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const control = context?.inputControlRef;

    if (!control) {
      return;
    }

    control.current = { focus: () => textareaRef.current?.focus() };
    return () => {
      control.current = null;
    };
  }, [context?.inputControlRef]);

  if (!context) {
    return null;
  }

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
    // Submit through our own path: the composer's context.onSubmit eagerly
    // clears the value via onChange("") even in controlled mode, but the
    // caller owns clearing (a failed submit must keep the draft).
    onSubmitRequest();
  };

  return (
    <textarea
      ref={textareaRef}
      className="prompt-input__textarea"
      data-slot="prompt-input-textarea"
      disabled={disabled}
      placeholder={context.placeholder}
      rows={1}
      value={context.value}
      onChange={(event) => {
        context.onChange(event.target.value);
        autosize();
      }}
      onKeyDown={handleKeyDown}
    />
  );
}

/**
 * Prompt composer over Astryx ChatComposer. The shell, slot layout, send/stop
 * button, and error status are Astryx; the textarea stays native and the
 * neutral footer hint is ours (Astryx status only carries error/warning).
 */
export function ChatPromptInput({
  value,
  status = "ready",
  className = "",
  placeholder,
  allowSubmitWhileRunning = false,
  lockInputOnRun = false,
  startActions,
  endActions,
  footer,
  error,
  onSubmit,
  onStop,
  onValueChange,
}: {
  value: string;
  status?: PromptInputStatus;
  className?: string;
  placeholder?: string;
  allowSubmitWhileRunning?: boolean;
  lockInputOnRun?: boolean;
  startActions?: ReactNode;
  endActions?: ReactNode;
  footer?: ReactNode;
  error?: string | null;
  onSubmit?: () => void;
  onStop?: () => void;
  onValueChange?: (value: string) => void;
}) {
  const isRunning = status === "streaming" || status === "submitted";
  const isStopShown = isRunning && !value.trim() && Boolean(onStop);
  const canSubmit =
    Boolean(value.trim()) && (!isRunning || allowSubmitWhileRunning);

  const handleSubmit = () => {
    if (!canSubmit) {
      return;
    }

    onSubmit?.();
  };

  return (
    <div
      className={`prompt-input ${className}`.trim()}
      data-slot="prompt-input"
      data-status={status}
    >
      <ChatComposer
        elevation="none"
        footerActions={startActions}
        input={
          <PromptTextArea
            disabled={lockInputOnRun && isRunning}
            onSubmitRequest={handleSubmit}
          />
        }
        isStopShown={isStopShown}
        placeholder={placeholder}
        sendActions={endActions}
        sendButton={
          <ChatSendButton
            isDisabled={!isStopShown && !canSubmit}
            // Bypass the composer's submit path, which force-clears the value.
            onSend={handleSubmit}
          />
        }
        status={error ? { type: "error", message: error } : undefined}
        value={value}
        onChange={(next) => onValueChange?.(next)}
        onStop={onStop}
        onSubmit={handleSubmit}
      />
      {footer ? (
        <div className="prompt-input__footer" data-slot="prompt-input-footer">
          {footer}
        </div>
      ) : null}
    </div>
  );
}
