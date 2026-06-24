import { useQuery } from "@tanstack/react-query";
import { Box, Puzzle, RefreshCw, Settings2, Sparkles, Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import { AppFrame } from "./app-shell";
import { useRefreshOnWindowFocus } from "./refresh";
import { invoke } from "./tauri-runtime";

export type ConfigInventory = {
  defaultModel?: string;
  defaultProvider?: string;
  defaultThinkingLevel?: string;
  theme?: string;
  packages: string[];
  extensions: ExtensionInfo[];
  skills: SkillInfo[];
  promptTemplates: TemplateInfo[];
};

export type ExtensionInfo = {
  name: string;
  source: string;
  enabled: boolean;
};

export type SkillInfo = {
  name: string;
  source: string;
};

export type TemplateInfo = {
  name: string;
};

type SetupCategory = "models" | "packages" | "extensions" | "skills" | "templates";

const categoryMeta = {
  models: { label: "模型", icon: Settings2 },
  packages: { label: "包", icon: Box },
  extensions: { label: "Extensions", icon: Wrench },
  skills: { label: "Skills", icon: Puzzle },
  templates: { label: "Prompt Templates", icon: Sparkles },
} as const;

async function getConfigInventory() {
  return invoke<ConfigInventory>("get_config_inventory");
}

function valueOrMissing(value?: string) {
  return value && value.trim().length > 0 ? value : "未设置";
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
    case "templates":
      return String(inventory.promptTemplates.length);
  }
}

function SetupSidebar({
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
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border px-4 py-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase text-muted">配置</h2>
            <p className="mt-1 text-xs text-muted">Read-only Pi inventory</p>
          </div>
          <button
            type="button"
            className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-surface text-foreground shadow-sm transition hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onRefresh}
            disabled={isFetching}
            title="Refresh setup"
            aria-label="Refresh setup"
          >
            <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <nav className="grid gap-1 px-3 py-3">
        {categories.map((category) => {
          const meta = categoryMeta[category];
          const Icon = meta.icon;
          const active = category === selected;

          return (
            <button
              key={category}
              type="button"
              className={`flex min-h-11 items-center justify-between gap-3 rounded-md px-3 text-left text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-inset focus:ring-foreground/20 ${
                active
                  ? "bg-surface-muted text-foreground"
                  : "text-muted hover:bg-surface-hover hover:text-foreground"
              }`}
              onClick={() => onSelect(category)}
            >
              <span className="flex min-w-0 items-center gap-2">
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{meta.label}</span>
              </span>
              <span className="shrink-0 text-xs text-muted">{categoryCount(category, inventory)}</span>
            </button>
          );
        })}
      </nav>
    </div>
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
  return (
    <div className="rounded-md border border-border bg-surface-muted px-4 py-10 text-sm text-muted">
      {children}
    </div>
  );
}

function NameList({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <EmptyState>未安装</EmptyState>;
  }

  return (
    <ul className="grid gap-2">
      {items.map((item) => (
        <li
          key={item}
          className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm font-medium text-foreground"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

function ExtensionList({ extensions }: { extensions: ExtensionInfo[] }) {
  if (extensions.length === 0) {
    return <EmptyState>未安装</EmptyState>;
  }

  return (
    <ul className="grid gap-2">
      {extensions.map((extension) => (
        <li
          key={extension.name}
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface-muted px-3 py-2"
        >
          <span className="text-sm font-medium text-foreground">{extension.name}</span>
          <span className="text-xs text-muted">
            {extension.enabled ? "enabled" : "disabled"} · {extension.source}
          </span>
        </li>
      ))}
    </ul>
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
    <section className="rounded-md border border-border bg-surface p-4 shadow-sm">
      <div className="mb-4 border-b border-border pb-3">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted">Read-only view from PI_CODING_AGENT_DIR.</p>
      </div>

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
        <NameList items={inventory.packages} />
      ) : selected === "extensions" ? (
        <ExtensionList extensions={inventory.extensions} />
      ) : selected === "skills" ? (
        <NameList items={inventory.skills.map((skill) => skill.name)} />
      ) : (
        <NameList items={inventory.promptTemplates.map((template) => template.name)} />
      )}
    </section>
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
      packages: [...inventory.data.packages].sort((a, b) => a.localeCompare(b)),
      extensions: [...inventory.data.extensions].sort((a, b) => a.name.localeCompare(b.name)),
      skills: [...inventory.data.skills].sort((a, b) => a.name.localeCompare(b.name)),
      promptTemplates: [...inventory.data.promptTemplates].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    };
  }, [inventory.data]);

  useRefreshOnWindowFocus(() => inventory.refetch());

  return (
    <AppFrame
      sidebar={
        <SetupSidebar
          selected={selected}
          onSelect={setSelected}
          inventory={sortedInventory}
          isFetching={inventory.isFetching}
          onRefresh={() => inventory.refetch()}
        />
      }
    >
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
          </header>

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
