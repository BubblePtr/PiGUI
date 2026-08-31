import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { CheckboxList, CheckboxListItem } from "@astryxdesign/core/CheckboxList";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useEffect, useMemo, useState } from "react";
import { AppFrame } from "@/app/app-shell";
import { ProviderIcon } from "@/entities/provider/provider-icon";
import { getVisibleModels, saveVisibleModels } from "@/entities/model/visible-models";
import { invoke } from "@/shared/runtime";
import type {
  ProviderAuthId,
  ProviderAuthStatusItem,
  ProviderAuthStatusReport,
  RuntimeModelCapability,
  RuntimeModelControls,
} from "@pigui/core";

export const providerAuthStatusQueryKey = ["provider-auth-status"] as const;
const availableModelControlsQueryKey = ["available-model-controls"] as const;

/** Link target for the selector's "Add Models" row (issue #102). */
export const settingsModelsSectionId = "models";

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

function groupModelsByProvider(models: RuntimeModelCapability[]) {
  const groups = new Map<string, RuntimeModelCapability[]>();

  for (const model of models) {
    const group = groups.get(model.provider);

    if (group) {
      group.push(model);
    } else {
      groups.set(model.provider, [model]);
    }
  }

  return Array.from(groups, ([provider, providerModels]) => ({
    provider,
    models: providerModels,
  }));
}

/**
 * Which catalog models the composer selector may offer (issue #102). Stored
 * per install, read by the selector; an empty set means "not configured" and
 * lists everything, which is also what unchecking the last model falls back to.
 */
function ModelVisibilitySection({
  models,
  isLoading,
  errorMessage,
  providerLabels,
}: {
  models: RuntimeModelCapability[];
  isLoading: boolean;
  errorMessage?: string;
  providerLabels: Record<string, string>;
}) {
  const [visibleModels, setVisibleModels] = useState(getVisibleModels);

  // Render the unconfigured set as all-checked so the checkboxes always
  // describe what the selector will actually list.
  const checkedModels =
    visibleModels.length > 0
      ? visibleModels
      : models.map(({ provider, modelId }) => ({ provider, modelId }));

  const replaceProviderSelection = (provider: string, modelIds: string[]) => {
    const next = [
      ...checkedModels.filter((model) => model.provider !== provider),
      ...modelIds.map((modelId) => ({ provider, modelId })),
    ];

    setVisibleModels(next);
    saveVisibleModels(next);
  };

  return (
    <section
      aria-labelledby="settings-models-heading"
      className="flex flex-col gap-3"
      id={settingsModelsSectionId}
    >
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground" id="settings-models-heading">
          Models
        </h2>
        <p className="text-sm text-muted">
          Choose which models the composer model selector offers. With none
          selected, every available model is shown.
        </p>
      </div>

      {isLoading ? <p className="text-sm text-muted">Loading…</p> : null}
      {errorMessage ? <p className="text-sm text-danger">{errorMessage}</p> : null}
      {!isLoading && !errorMessage && models.length === 0 ? (
        <p className="text-sm text-muted">
          No models are available yet. Configure a provider above first.
        </p>
      ) : null}

      {groupModelsByProvider(models).map((group) => {
        const label = providerLabels[group.provider] ?? group.provider;

        return (
          <Card data-testid={`model-visibility-${group.provider}`} key={group.provider}>
            <div className="flex flex-row items-center gap-3">
              {/* Model providers are a superset of the auth providers; the icon
                  renders nothing for the ones without a brand mark. */}
              <ProviderIcon providerId={group.provider as ProviderAuthId} />
              <h3 className="text-base font-semibold text-foreground">{label}</h3>
            </div>
            <div className="mt-4">
              <CheckboxList
                hasDividers
                isLabelHidden
                label={`${label} models`}
                width="100%"
                value={group.models
                  .filter((model) =>
                    checkedModels.some(
                      (checked) =>
                        checked.provider === model.provider &&
                        checked.modelId === model.modelId,
                    ),
                  )
                  .map((model) => model.modelId)}
                onChange={(modelIds) =>
                  replaceProviderSelection(group.provider, modelIds)
                }
              >
                {group.models.map((model) => (
                  <CheckboxListItem
                    description={model.modelId}
                    key={model.modelId}
                    label={model.name}
                    value={model.modelId}
                  />
                ))}
              </CheckboxList>
            </div>
          </Card>
        );
      })}
    </section>
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

  const providerLabels = useMemo(
    () =>
      Object.fromEntries(providers.map((provider) => [provider.id, provider.label])),
    [providers],
  );
  const modelsQuery = useQuery({
    queryKey: availableModelControlsQueryKey,
    queryFn: () => invoke<RuntimeModelControls>("list_available_model_controls"),
  });
  const modelCatalogError = !modelsQuery.isError
    ? undefined
    : modelsQuery.error instanceof Error
      ? modelsQuery.error.message
      : "Could not load the model catalog.";
  const locationHash = useRouterState({ select: (state) => state.location.hash });

  useEffect(() => {
    // Both sections have to hold their data before the section offset is
    // final, otherwise the jump lands short of the Models section.
    if (
      locationHash !== settingsModelsSectionId ||
      statusQuery.isPending ||
      modelsQuery.isPending
    ) {
      return;
    }

    document
      .getElementById(settingsModelsSectionId)
      ?.scrollIntoView({ block: "start" });
  }, [locationHash, statusQuery.isPending, modelsQuery.isPending]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: providerAuthStatusQueryKey });
    void queryClient.invalidateQueries({ queryKey: ["environment-preflight-report"] });
  };

  return (
    <AppFrame>
      <main className="h-full min-h-0 overflow-y-auto bg-surface px-6 py-10 text-foreground">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-10">
          <h1 className="text-2xl font-semibold tracking-normal">Settings</h1>

          <section
            aria-labelledby="settings-providers-heading"
            className="flex flex-col gap-3"
          >
            <div className="space-y-2">
              <h2
                className="text-lg font-semibold text-foreground"
                id="settings-providers-heading"
              >
                Providers
              </h2>
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
            </div>

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
                    ChatGPT/Codex, Anthropic, and Grok (xAI) subscription login via
                    Pi OAuth (browser). Uses the same Pi{" "}
                    <code className="text-xs">auth.json</code> as the local TUI.
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
          </section>

          <ModelVisibilitySection
            errorMessage={modelCatalogError}
            isLoading={modelsQuery.isPending}
            models={modelsQuery.data?.models ?? []}
            providerLabels={providerLabels}
          />
        </div>
      </main>
    </AppFrame>
  );
}

export type { ProviderAuthId };
