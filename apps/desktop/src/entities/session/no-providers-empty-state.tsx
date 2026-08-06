import { Button, Card } from "@heroui/react";
import { useNavigate } from "@tanstack/react-router";

/**
 * Post-preflight empty state when no provider credentials exist.
 * Not a full-screen preflight gate — only an in-app CTA to /settings.
 */
export function NoProvidersEmptyState({
  testId = "no-providers-empty-state",
}: {
  testId?: string;
}) {
  const navigate = useNavigate();

  return (
    <div
      className="flex h-full min-h-0 w-full items-center justify-center px-6 py-10"
      data-testid={testId}
    >
      <Card className="w-full max-w-xl">
        <Card.Header className="block">
          <div className="text-sm font-semibold uppercase text-muted">Providers</div>
          <Card.Title className="mt-3 text-2xl font-semibold tracking-normal text-foreground">
            No models available
          </Card.Title>
        </Card.Header>
        <Card.Content className="flex flex-col gap-4">
          <p className="text-sm leading-6 text-muted">
            No provider credentials are set. Add an API key or subscription login in Settings to
            create chats and pick models. First-run preflight will not show again — only this
            empty state.
          </p>
          <div>
            <Button
              variant="primary"
              onPress={() => {
                void navigate({ to: "/settings" });
              }}
            >
              Open Provider Settings →
            </Button>
          </div>
        </Card.Content>
      </Card>
    </div>
  );
}
