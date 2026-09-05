import { Button } from "@astryxdesign/core/Button";

/**
 * One waiting-area row under a running session: a queued follow-up rendered on
 * a single truncating line, carrying its own routing actions. Steer promotes
 * the message into the current run (only offered while a run is active);
 * Withdraw removes it. Order is expressed by position, not numbering.
 * Decision record: .scratch/composer-redesign/PRD.md
 */
export function ChatQueuedMessage({
  body,
  isWithdrawn = false,
  onSteer,
  onWithdraw,
}: {
  body: string;
  isWithdrawn?: boolean;
  /** Omit when no run is active: Steer must not render as a dead action. */
  onSteer?: () => void;
  onWithdraw?: () => void;
}) {
  if (isWithdrawn) {
    return (
      <div
        className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
        data-testid="chat-queued-message"
        data-withdrawn=""
      >
        <p
          className="min-w-0 flex-1 truncate text-muted"
          data-slot="queued-message-body"
          title={body}
        >
          {body}
        </p>
        <span className="shrink-0 text-xs font-medium text-muted">Withdrawn</span>
      </div>
    );
  }

  return (
    <div
      className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-surface py-1.5 pl-3 pr-2 text-sm"
      data-testid="chat-queued-message"
    >
      <p
        className="min-w-0 flex-1 truncate text-foreground"
        data-slot="queued-message-body"
        title={body}
      >
        {body}
      </p>
      <div className="flex shrink-0 items-center gap-1">
        {onSteer ? (
          <Button
            label="Steer the run with this message"
            size="sm"
            variant="secondary"
            onClick={onSteer}
          >
            Steer
          </Button>
        ) : null}
        {onWithdraw ? (
          <Button
            label="Withdraw queued message"
            size="sm"
            variant="ghost"
            onClick={onWithdraw}
          >
            Withdraw
          </Button>
        ) : null}
      </div>
    </div>
  );
}
