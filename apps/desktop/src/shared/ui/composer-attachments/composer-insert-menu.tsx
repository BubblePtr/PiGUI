import { useMemo, useState, type ComponentProps } from "react";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import { CommandPalette, CommandPaletteInput } from "@astryxdesign/core/CommandPalette";
import { createStaticSource } from "@astryxdesign/core/Typeahead";
import { VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Command, ImageIcon, Plus, Puzzle, Sparkles } from "@/shared/ui/icons";

export const DEFAULT_COMPOSER_COMMANDS = [
  { label: "/compact", insert: "/compact " },
  { label: "/clear", insert: "/clear " },
] as const;

type CatalogEntry = { name: string; description?: string };

function pluginLabel(name: string) {
  const parts = name.replace(/\\/g, "/").split("/").filter(Boolean);
  const file = parts.pop() ?? name;
  const stem = file.replace(/\.(?:[cm]?[jt]sx?)$/, "");
  const label = (/^(?:index|main|extension)$/.test(stem) ? parts.pop() ?? stem : stem)
    .replace(/[-_]+/g, " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

type ComposerInsertMenuOwnProps = {
  commands?: readonly { label: string; insert: string }[];
  skills?: readonly CatalogEntry[];
  plugins?: readonly CatalogEntry[];
  onAttach: () => void;
  onInsert: (text: string) => void;
};

export type ComposerInsertMenuProps = Omit<
  ComponentProps<typeof DropdownMenu>,
  keyof ComposerInsertMenuOwnProps | "items" | "button" | "children"
> &
  ComposerInsertMenuOwnProps;

export function ComposerInsertMenu({
  commands = DEFAULT_COMPOSER_COMMANDS,
  skills = [],
  plugins = [],
  onAttach,
  onInsert,
  className,
  ...rest
}: ComposerInsertMenuProps) {
  const [catalog, setCatalog] = useState<"skills" | "plugins" | null>(null);
  const source = useMemo(() => createStaticSource(
    (catalog === "skills" ? skills : plugins).map((entry) => ({
      id: entry.name,
      label: catalog === "skills" ? entry.name : pluginLabel(entry.name),
      auxiliaryData: { description: entry.description, identifier: entry.name },
    })),
    { keywords: (item) => [item.auxiliaryData.description ?? "", item.auxiliaryData.identifier] },
  ), [catalog, skills, plugins]);

  return (
    <>
      <DropdownMenu
        alignment="start"
        hasChevron={false}
        placement="above"
        button={{ icon: <Plus aria-hidden="true" />, isIconOnly: true,
          className, label: "Add to prompt", size: "sm", tooltip: "Add to prompt", variant: "ghost" }}
        {...rest}
        items={[
          { icon: <ImageIcon />, label: "Add files", onClick: onAttach },
          { icon: <Sparkles />, label: "Use skill", onClick: () => setCatalog("skills") },
          { icon: <Command />, label: "Chat commands", items: commands.map((command) => ({
            label: command.label, onClick: () => onInsert(command.insert),
          })) },
          ...(plugins.length ? [{ icon: <Puzzle />, label: "Use plugin", onClick: () => setCatalog("plugins") }] : []),
        ]}
      />
      {catalog ? (
        <CommandPalette
          isOpen
          label={catalog === "skills" ? "Use skill" : "Use plugin"}
          input={<CommandPaletteInput label={`Search ${catalog}`} placeholder={`Search ${catalog}…`} />}
          searchSource={source}
          emptySearchText={`No matching ${catalog}`}
          emptyBootstrapText={`No ${catalog} available`}
          renderItem={(item) => (
            <VStack gap={0.5}>
              <Text>{item.label}</Text>
              {item.auxiliaryData.description ? (
                <Text color="secondary" type="body" size="sm" maxLines={2}>
                  {item.auxiliaryData.description}
                </Text>
              ) : null}
            </VStack>
          )}
          onOpenChange={(open) => { if (!open) setCatalog(null); }}
          onValueChange={(name) => onInsert(`${catalog === "skills" ? "/" : "@"}${name} `)}
        />
      ) : null}
    </>
  );
}
