import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useMemo, useState } from "react";
import { AppFrame } from "@/app/app-shell";
import { ProviderIcon } from "@/entities/provider/provider-icon";
import { invoke } from "@/shared/runtime";
import type {
  ProviderAuthId,
  ProviderAuthStatusItem,
  ProviderAuthStatusReport,
} from "@pigui/core";

export const providerAuthStatusQueryKey = ["provider-auth-status"] as const;

type AuthTab = "subscription" | "api_key";

async function listProviderAuthStatus() {
  return invoke<ProviderAuthStatusReport>("list_provider_auth_status");
}

function statusSummary(provider: ProviderAuthStatusItem) {
  if (!provider.configured || provider.mode === "none") {
    return "Not configured";
  }

  if (provider.mode === "oauth") {
    return provider.statusLabel
      ? `Subscription · ${provider.statusLabel}`
      : "Subscription connected";
  }

  if (provider.mode === "api_key") {
    return provider.keyHint ? `API key · ${provider.keyHint}` : "API key configured";
  }

  return "Configured";
}

function ProviderApiKeyCard({
  provider,
  onSaved,
}: {
  provider: ProviderAuthStatusItem;
  onSaved: () => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const saveMutation = useMutation({
    mutationFn: () =>
      invoke<ProviderAuthStatusReport>("set_provider_api_key", {
        providerId: provider.id,
        apiKey,
      }),
    onSuccess: () => {
      setApiKey("");
      setError(null);
      onSaved();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : String(err));
    },
  });
  const removeMutation = useMutation({
    mutationFn: () =>
      invoke<ProviderAuthStatusReport>("remove_provider_auth", {
        providerId: provider.id,
      }),
    onSuccess: () => {
      setError(null);
      onSaved();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : String(err));
    },
  });

  return (
    <Card data-testid={`provider-api-key-${provider.id}`}>
      <div className="flex flex-row items-start gap-3">
        <ProviderIcon providerId={provider.id} />
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="text-base font-semibold text-foreground">{provider.label}</h3>
          <p className="text-sm text-muted">{statusSummary(provider)}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-3">
        <TextInput
          label={`${provider.label} API key`}
          isLabelHidden
          placeholder="Paste API key"
          type="password"
          value={apiKey}
          onChange={(value) => setApiKey(value)}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            label={
              provider.configured && provider.mode === "api_key" ? "Replace key" : "Save key"
            }
            isDisabled={!apiKey.trim() || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          />
          {provider.configured ? (
            <Button
              variant="destructive"
              label="Remove"
              isDisabled={removeMutation.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    `Remove credentials for ${provider.label}? This cannot be undone from the UI.`,
                  )
                ) {
                  removeMutation.mutate();
                }
              }}
            />
          ) : null}
        </div>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
      </div>
    </Card>
  );
}

function ProviderSubscriptionCard({
  provider,
  onSaved,
}: {
  provider: ProviderAuthStatusItem;
  onSaved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const loginMutation = useMutation({
    mutationFn: () =>
      invoke<ProviderAuthStatusReport>("login_provider_oauth", {
        providerId: provider.id,
      }),
    onSuccess: () => {
      setError(null);
      onSaved();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : String(err));
    },
  });
  const logoutMutation = useMutation({
    mutationFn: () =>
      invoke<ProviderAuthStatusReport>("logout_provider_auth", {
        providerId: provider.id,
      }),
    onSuccess: () => {
      setError(null);
      onSaved();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : String(err));
    },
  });

  return (
    <Card data-testid={`provider-subscription-${provider.id}`}>
      <div className="flex flex-row items-start gap-3">
        <ProviderIcon providerId={provider.id} />
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="text-base font-semibold text-foreground">{provider.label}</h3>
          <p className="text-sm text-muted">{statusSummary(provider)}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {provider.mode === "oauth" ? (
            <Button
              variant="destructive"
              label="Logout"
              isDisabled={logoutMutation.isPending}
              onClick={() => {
                if (window.confirm(`Log out of ${provider.label} subscription?`)) {
                  logoutMutation.mutate();
                }
              }}
            />
          ) : (
            <Button
              variant="primary"
              label={
                loginMutation.isPending ? "Waiting for browser…" : "Login with subscription"
              }
              isDisabled={loginMutation.isPending}
              onClick={() => loginMutation.mutate()}
            />
          )}
        </div>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
      </div>
    </Card>
  );
}

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<AuthTab>("subscription");
  const statusQuery = useQuery({
    queryKey: providerAuthStatusQueryKey,
    queryFn: listProviderAuthStatus,
  });

  const providers = statusQuery.data?.providers ?? [];
  const subscriptionProviders = useMemo(
    () => providers.filter((provider) => provider.supportsOAuth),
    [providers],
  );
  const apiKeyProviders = useMemo(
    () => providers.filter((provider) => provider.supportsApiKey),
    [providers],
  );

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: providerAuthStatusQueryKey });
    void queryClient.invalidateQueries({ queryKey: ["environment-preflight-report"] });
  };

  return (
    <AppFrame>
      <main className="h-full min-h-0 overflow-y-auto bg-surface px-6 py-10 text-foreground">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
          <header className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">
              Settings
            </div>
            <h1 className="text-2xl font-semibold tracking-normal">Providers</h1>
            <p className="text-sm text-muted">
              Configure model credentials. Keys are stored in Pi{" "}
              <code className="text-xs">auth.json</code> and never shown in full after save.
            </p>
            {statusQuery.data ? (
              <p className="text-xs text-muted">
                {statusQuery.data.configuredCount} provider
                {statusQuery.data.configuredCount === 1 ? "" : "s"} configured
              </p>
            ) : null}
          </header>

          <div className="flex flex-col">
            <TabList
              hasDivider
              value={tab}
              onChange={(value) => {
                if (value === "subscription" || value === "api_key") {
                  setTab(value);
                }
              }}
            >
              <Tab value="subscription" label="Subscription" />
              <Tab value="api_key" label="API Key" />
            </TabList>
            {tab === "subscription" ? (
              <div className="mt-4 flex flex-col gap-3">
                <p className="text-xs text-muted">
                  OpenAI and Anthropic subscription login via Pi OAuth (browser).
                </p>
                {statusQuery.isLoading ? (
                  <p className="text-sm text-muted">Loading…</p>
                ) : (
                  subscriptionProviders.map((provider) => (
                    <ProviderSubscriptionCard
                      key={provider.id}
                      provider={provider}
                      onSaved={refresh}
                    />
                  ))
                )}
              </div>
            ) : (
              <div className="mt-4 flex flex-col gap-3">
                <p className="text-xs text-muted">
                  Paste API keys for OpenAI, Anthropic, DeepSeek, or Grok (xAI).
                </p>
                {statusQuery.isLoading ? (
                  <p className="text-sm text-muted">Loading…</p>
                ) : (
                  apiKeyProviders.map((provider) => (
                    <ProviderApiKeyCard
                      key={provider.id}
                      provider={provider}
                      onSaved={refresh}
                    />
                  ))
                )}
              </div>
            )}
          </div>

          {statusQuery.isError ? (
            <p className="text-sm text-danger">
              {statusQuery.error instanceof Error
                ? statusQuery.error.message
                : "Could not load provider status."}
            </p>
          ) : null}
        </div>
      </main>
    </AppFrame>
  );
}

export type { ProviderAuthId };
