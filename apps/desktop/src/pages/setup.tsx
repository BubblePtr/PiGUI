import { useQuery } from "@tanstack/react-query";
import { Button } from "@astryxdesign/core/Button";
import { VStack } from "@astryxdesign/core/VStack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState as AstryxEmptyState } from "@astryxdesign/core/EmptyState";
import { IconButton } from "@astryxdesign/core/IconButton";
import { List, ListItem } from "@astryxdesign/core/List";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AppFrame } from "@/app/app-shell";
import { Box, Puzzle, RefreshCw, Settings2, Sparkles, Wrench } from "@/shared/ui/icons";
import { useRefreshOnWindowFocus } from "@/shared/refresh";
import { invoke } from "@/shared/runtime";

import type { ConfigInventory, ResourceInfo, PackageInfo } from "@pace/core";

export type { ConfigInventory, ResourceInfo, PackageInfo } from "@pace/core";

type SetupCategory = "models" | "packages" | "extensions" | "skills" | "templates" | "themes";

const categoryMeta = {
  models: { label: "Models", icon: Settings2 },
  packages: { label: "Packages", icon: Box },
  extensions: { label: "Extensions", icon: Wrench },
  skills: { label: "Skills", icon: Puzzle },
  templates: { label: "Prompt Templates", icon: Sparkles },
  themes: { label: "Themes", icon: Sparkles },
} as const;

async function getConfigInventory() {
  return invoke<ConfigInventory>("get_config_inventory");
}

function valueOrMissing(value?: string) {
  return value && value.trim().length > 0 ? value : "Not set";
}

function categoryCount(category: SetupCategory, inventory?: ConfigInventory) {
  if (!inventory) {
    return "";
  }

  switch (category) {
    case "models":
      return "4";
    case "packages":
      return String(inventory.packages.length);
    case "extensions":
      return String(inventory.extensions.length);
    case "skills":
      return String(inventory.skills.length);
    case "themes":
      return String(inventory.themes.length);
    case "templates":
      return String(inventory.promptTemplates.length);
  }
}

export function SetupInventoryControls({
  selected,
  onSelect,
  inventory,
  isFetching,
  onRefresh,
}: {
  selected: SetupCategory;
  onSelect: (category: SetupCategory) => void;
  inventory?: ConfigInventory;
  isFetching: boolean;
  onRefresh: () => void;
}) {
  const categories = Object.keys(categoryMeta) as SetupCategory[];

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Inventory sections</h2>
          <p className="mt-1 text-xs text-muted">Read-only Pi inventory</p>
        </div>
        <IconButton
          className="pigui-pressable"
          label="Refresh setup"
          icon={<RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />}
          isDisabled={isFetching}
          size="sm"
          variant="secondary"
          onClick={onRefresh}
        />
      </div>

      <div className="w-full max-w-full overflow-x-auto">
        <SegmentedControl
          label="Configuration sections"
          size="sm"
          value={selected}
          onChange={(value) => onSelect(value as SetupCategory)}
        >
          {categories.map((category) => {
            const meta = categoryMeta[category];
            const Icon = meta.icon;
            const count = categoryCount(category, inventory);

            return (
              <SegmentedControlItem
                key={category}
                value={category}
                label={count ? `${meta.label} · ${count}` : meta.label}
                icon={<Icon className="size-4 shrink-0" />}
              />
            );
          })}
        </SegmentedControl>
      </div>
    </Card>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-surface-muted p-4">
      <div className="text-xs font-medium uppercase text-muted">{label}</div>
      <div className="mt-2 break-words text-base font-semibold text-foreground">{value}</div>
    </div>
  );
}

function EmptyState({ children }: { children: string }) {
  return <AstryxEmptyState isCompact title={children} />;
}

const resourceGroups = [
  { kind: "extension", label: "Extensions" },
  { kind: "skill", label: "Skills" },
  { kind: "prompt", label: "Prompt Templates" },
  { kind: "theme", label: "Themes" },
] as const;

function ResourceList({ resources }: { resources: ResourceInfo[] }) {
  if (resources.length === 0) return <EmptyState>Not installed</EmptyState>;
  return (
    <List hasDividers>
      {resources.map(resource => (
        <ListItem
          key={`${resource.kind}:${resource.path}`}
          label={resource.name}
          description={[
            resource.enabled ? "enabled" : "disabled",
            resource.scope,
            resource.origin,
            resource.packageSource,
            resource.origin === "drop-in" ? "由约定目录自动加载" : undefined,
            resource.kind === "theme" ? "仅影响 Pi 终端" : undefined,
            resource.path,
          ].filter(Boolean).join(" · ")}
        />
      ))}
    </List>
  );
}

function PackageList({ packages }: { packages: PackageInfo[] }) {
  if (packages.length === 0) return <EmptyState>Not installed</EmptyState>;
  return (
    <VStack gap={6}>
      {packages.map(pkg => (
        <VStack key={`${pkg.scope}:${pkg.source}`} gap={3}>
          <Heading level={3}>{pkg.source}</Heading>
          <Text type="supporting">{pkg.scope} · {pkg.filtered ? "Filtered" : "Unfiltered"} · {pkg.installedPath ?? "Not installed"}</Text>
          {resourceGroups.map(group => (
            <VStack key={group.kind} gap={1}>
              <Heading level={4}>{group.label}</Heading>
              <ResourceList resources={pkg.resources.filter(resource => resource.kind === group.kind)} />
            </VStack>
          ))}
        </VStack>
      ))}
    </VStack>
  );
}

export function ConfigInventoryView({
  inventory,
  selected,
}: {
  inventory: ConfigInventory;
  selected: SetupCategory;
}) {
  const title = categoryMeta[selected].label;

  return (
    <Card>
      <div className="border-b border-border pb-4">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted">Read-only view from PI_CODING_AGENT_DIR.</p>
      </div>

      <div className="mt-4">
        {selected === "models" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <KeyValue label="Default model" value={valueOrMissing(inventory.defaultModel)} />
            <KeyValue label="Default provider" value={valueOrMissing(inventory.defaultProvider)} />
            <KeyValue
              label="Thinking level"
              value={valueOrMissing(inventory.defaultThinkingLevel)}
            />
            <KeyValue label="Theme" value={valueOrMissing(inventory.theme)} />
          </div>
        ) : selected === "packages" ? (
          <PackageList packages={inventory.packages} />
        ) : selected === "extensions" ? (
          <ResourceList resources={inventory.extensions} />
        ) : selected === "skills" ? (
          <ResourceList resources={inventory.skills} />
        ) : selected === "themes" ? (
          <ResourceList resources={inventory.themes} />
        ) : (
          <ResourceList resources={inventory.promptTemplates} />
        )}
      </div>
    </Card>
  );
}

export function SetupPage() {
  const [selected, setSelected] = useState<SetupCategory>("models");
  const inventory = useQuery({
    queryKey: ["config-inventory"],
    queryFn: getConfigInventory,
  });
  const sortedInventory = useMemo(() => {
    if (!inventory.data) {
      return undefined;
    }

    return {
      ...inventory.data,
      packages: [...inventory.data.packages].sort((a, b) => a.source.localeCompare(b.source)),
      themes: [...inventory.data.themes].sort((a, b) => a.name.localeCompare(b.name)),
      extensions: [...inventory.data.extensions].sort((a, b) => a.name.localeCompare(b.name)),
      skills: [...inventory.data.skills].sort((a, b) => a.name.localeCompare(b.name)),
      promptTemplates: [...inventory.data.promptTemplates].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    };
  }, [inventory.data]);

  useRefreshOnWindowFocus(() => inventory.refetch());
  const navigate = useNavigate();

  return (
    <AppFrame>
      <article className="min-h-full px-6 py-6">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
          <header className="border-b border-border pb-4">
            <div className="text-sm font-semibold uppercase text-muted">Setup</div>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal text-foreground">
              Pi configuration inventory
            </h1>
            <p className="mt-2 text-sm text-muted">
              Read-only inventory from PI_CODING_AGENT_DIR, falling back to ~/.pi/agent.
            </p>
            <div className="mt-4">
              <Button
                label="Run environment check"
                size="sm"
                variant="secondary"
                onClick={() => {
                  void navigate({ to: "/preflight" });
                }}
              />
            </div>
          </header>

          <SetupInventoryControls
            selected={selected}
            onSelect={setSelected}
            inventory={sortedInventory}
            isFetching={inventory.isFetching}
            onRefresh={() => inventory.refetch()}
          />

          {inventory.isError ? (
            <div className="rounded-md border border-border bg-surface px-4 py-12 text-sm text-danger">
              Could not read Pi configuration.
            </div>
          ) : inventory.isLoading || !sortedInventory ? (
            <div className="rounded-md border border-border bg-surface px-4 py-12 text-sm text-muted">
              Loading setup...
            </div>
          ) : (
            <ConfigInventoryView inventory={sortedInventory} selected={selected} />
          )}
        </div>
      </article>
    </AppFrame>
  );
}
