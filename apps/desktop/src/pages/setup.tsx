import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Switch } from "@astryxdesign/core/Switch";
import { HStack } from "@astryxdesign/core/HStack";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { createContext, useContext, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AppFrame } from "@/app/app-shell";
import { Box, Palette, Puzzle, RefreshCw, Settings2, Sparkles, Wrench } from "@/shared/ui/icons";
import { useRefreshOnWindowFocus } from "@/shared/refresh";
import { invoke } from "@/shared/runtime";

import type { ConfigInventory, ResourceInfo, PackageInfo, PackageProgressEvent, PackageActionResult, AddLocalResourceResult } from "@pace/core";

export type { ConfigInventory, ResourceInfo, PackageInfo } from "@pace/core";

export type SetupCategory = "models" | "packages" | "extensions" | "skills" | "templates" | "themes";

const categoryMeta = {
  models: { label: "Models", icon: Settings2 },
  packages: { label: "Packages", icon: Box },
  extensions: { label: "Extensions", icon: Wrench },
  skills: { label: "Skills", icon: Puzzle },
  templates: { label: "Prompt Templates", icon: Sparkles },
  themes: { label: "Themes", icon: Palette },
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
          <p className="mt-1 text-xs text-muted">Manage Pi packages and resources</p>
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

const ActionsContext = createContext<{ pending: boolean; packages: PackageInfo[]; run: (command: string, args: Record<string, unknown>) => Promise<boolean> } | null>(null);
const nextSessionCopy = "将在下一个新 Session 生效，运行中的 Session 不受影响";

function ResourceControls({ resource }: { resource: ResourceInfo }) {
  const actions = useContext(ActionsContext);
  if (!actions) return null;
  if (resource.origin === "drop-in") return <HStack gap={2}>
    <Button label="Reveal in Finder" size="sm" variant="ghost" onClick={() => void actions.run("reveal_project_in_finder", { path: resource.path })} />
    <Button label={`Delete ${resource.name}`} size="sm" variant="destructive" isDisabled={actions.pending} onClick={() => {
      if (window.confirm(`删除 ${resource.path}？移除文件即禁用。Skill 将删除整个目录。`)) void actions.run("remove_local_resource", { path: resource.path });
    }} />
  </HStack>;
  const pkg = actions.packages.find(pkg => pkg.source === resource.packageSource);
  const reason = resource.kind === "theme" ? "仅影响 Pi 终端" : !resource.packageSource || resource.packageSource === "auto" || resource.origin === "top-level"
    ? "Drop-in and top-level resources have no package filter; remove the resource file instead"
    : pkg?.installedPath === resource.path ? "Pi ignores Resource Filter toggles for local file or bare-directory packages. Remove the registration or move the resource into a convention directory." : undefined;
  return <Switch label={`Enable ${resource.name}`} isLabelHidden value={resource.enabled} isDisabled={actions.pending || !!reason} disabledMessage={reason} onChange={enabled => void actions.run("set_resource_enabled", { path: resource.path, kind: resource.kind, packageSource: resource.packageSource, enabled })} />;
}

export function ResourceManagement({ inventory, selected }: { inventory: ConfigInventory; selected: SetupCategory }) {
  const client = useQueryClient();
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [source, setSource] = useState("");
  const [progress, setProgress] = useState<PackageProgressEvent[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const run = async (command: string, args: Record<string, unknown>) => {
    if (busy.current) return false;
    busy.current = true;
    setPending(true); setError(""); setMessage(""); setProgress([]);
    try {
      if (command === "select_local_resource") {
        const path = await invoke<string | null>(command);
        if (!path) return false;
        const imported = await invoke<AddLocalResourceResult>("add_local_resource", { path });
        if (imported.conflict) {
          if (!window.confirm(`覆盖 ${imported.path}？同名资源将被替换。`)) return false;
          await invoke("add_local_resource", { path, overwrite: true });
        }
      }
      const result = command === "select_local_resource" ? undefined : await invoke<PackageActionResult>(command, args);
      setProgress(result?.progress ?? []);
      await client.invalidateQueries({ queryKey: ["config-inventory"] });
      setMessage(command === "reveal_project_in_finder" ? "已在 Finder 中显示" : nextSessionCopy);
      return true;
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); return false; }
    finally { busy.current = false; setPending(false); }
  };
  return <ActionsContext.Provider value={{ pending, packages: inventory.packages, run }}><VStack gap={3}>
    <HStack gap={2}>
      <Button label="Install package" variant="primary" isDisabled={pending} onClick={() => setInstallOpen(true)} />
      <Button label="Add local resource" variant="secondary" isDisabled={pending} onClick={() => void run("select_local_resource", {})} />
    </HStack>
    {installOpen && <Dialog isOpen={installOpen} onOpenChange={open => { if (!pending) setInstallOpen(open); }} purpose="form">
      <Layout header={<DialogHeader title="Install package" onOpenChange={open => { if (!pending) setInstallOpen(open); }} />} content={<LayoutContent><VStack gap={3}>
        <TextInput label="npm package or git URL" description="npm:, git:, https:// — 本地文件请使用 Add local resource" value={source} onChange={setSource} isDisabled={pending} />
        <Text type="supporting">{nextSessionCopy}</Text>
        {error && <Text role="alert" style={{ color: "var(--danger)" }}>{error}</Text>}
        <Button label={pending ? "安装中…" : "Install"} variant="primary" isDisabled={pending || !/^(npm:|git:|https:\/\/)/.test(source.trim())} onClick={() => void run("install_package", { source: source.trim() }).then(ok => { if (ok) { setInstallOpen(false); setSource(""); } })} />
      </VStack></LayoutContent>} />
    </Dialog>}
    {pending && <Text role="status">Working…</Text>}
    {progress.length > 0 && <List hasDividers>{progress.map((event, index) => <ListItem key={index} label={`${event.action}: ${event.type}`} description={`${event.source} ${event.message ?? ""}`} />)}</List>}
    {error && !installOpen && <Text role="alert" style={{ color: "var(--danger)" }}>{error}</Text>}
    {message && <Text role="status">{message}</Text>}
    <ConfigInventoryView inventory={inventory} selected={selected} />
  </VStack></ActionsContext.Provider>;
}

function ResourceList({ resources }: { resources: ResourceInfo[] }) {
  if (resources.length === 0) return <EmptyState>No resources loaded</EmptyState>;
  return (
    <List hasDividers>
      {resources.map(resource => (
        <ListItem
          key={`${resource.kind}:${resource.path}`}
          endContent={<ResourceControls resource={resource} />}
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
  const actions = useContext(ActionsContext);
  if (packages.length === 0) return <EmptyState>Not installed</EmptyState>;
  return (
    <VStack gap={6}>
      {packages.map(pkg => (
        <VStack key={`${pkg.scope}:${pkg.source}`} gap={3}>
          <HStack gap={3} vAlign="center">
            <Heading level={3}>{pkg.source}</Heading>
            {actions && <>
              <Button label={`Update ${pkg.source}`} variant="ghost" size="sm" isDisabled={actions.pending} onClick={() => void actions.run("update_package", { source: pkg.source })} />
              <Button label={`Remove ${pkg.source}`} variant="destructive" size="sm" isDisabled={actions.pending} onClick={() => {
                if (window.confirm(`移除 ${pkg.source}？npm / git 安装目录由 Pi 清理；CLI 登记的本地 Package 只移除登记，不删源文件。`)) void actions.run("remove_package", { source: pkg.source });
              }} />
            </>}
          </HStack>
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
        <p className="mt-1 text-sm text-muted">Resources from PI_CODING_AGENT_DIR.</p>
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
              User resources from PI_CODING_AGENT_DIR, falling back to ~/.pi/agent.
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
            <ResourceManagement inventory={sortedInventory} selected={selected} />
          )}
        </div>
      </article>
    </AppFrame>
  );
}
