import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { useSettingsDialog } from "@/shared/settings-navigation";

/**
 * Post-preflight empty state when no provider credentials exist.
 * Not a full-screen preflight gate — an in-app CTA that opens the settings dialog.
 */
export function NoProvidersEmptyState({
  testId = "no-providers-empty-state",
}: {
  testId?: string;
}) {
  const { openSettings } = useSettingsDialog();

  return (
    <div
      className="flex h-full min-h-0 w-full items-center justify-center px-6 py-10"
      data-testid={testId}
    >
      <Card className="w-full max-w-xl">
        <div className="text-sm font-semibold uppercase text-muted">Providers</div>
        <h2 className="mt-3 text-2xl font-semibold tracking-normal text-foreground">
          No models available
        </h2>
        <p className="mt-4 text-sm leading-6 text-muted">
          No provider credentials are set. Add an API key or subscription login in Settings to
          create chats and pick models. First-run preflight will not show again — only this
          empty state.
        </p>
        <div className="mt-4">
          <Button
            label="Open Provider Settings →"
            variant="primary"
            onClick={() => {
              openSettings();
            }}
          />
        </div>
      </Card>
    </div>
  );
}
