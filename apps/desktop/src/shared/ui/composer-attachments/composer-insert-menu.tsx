import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import {
  Command,
  ImageIcon,
  Plus,
  Puzzle,
  Sparkles,
} from "@/shared/ui/icons";

export const DEFAULT_COMPOSER_COMMANDS = [
  { label: "/compact", insert: "/compact " },
  { label: "/clear", insert: "/clear " },
] as const;

function menuIcon(Icon: typeof ImageIcon) {
  return <Icon aria-hidden="true" size={16} />;
}

export function ComposerInsertMenu({
  commands = DEFAULT_COMPOSER_COMMANDS,
  skills = [],
  plugins = [],
  onAttach,
  onInsert,
}: {
  commands?: readonly { label: string; insert: string }[];
  skills?: readonly { name: string }[];
  plugins?: readonly { name: string }[];
  onAttach: () => void;
  onInsert: (text: string) => void;
}) {
  return (
    <DropdownMenu
      alignment="start"
      hasChevron={false}
      menuWidth={260}
      placement="above"
      button={{
        icon: <Plus aria-hidden="true" />,
        isIconOnly: true,
        label: "Add to prompt",
        size: "sm",
        tooltip: "Add to prompt",
        variant: "ghost",
      }}
      items={[
        {
          type: "section",
          title: "Files",
          items: [
            {
              icon: menuIcon(ImageIcon),
              label: "Images or text files",
              onClick: onAttach,
            },
          ],
        },
        {
          type: "section",
          title: "Commands",
          items: commands.map((command) => ({
            icon: menuIcon(Command),
            label: command.label,
            onClick: () => onInsert(command.insert),
          })),
        },
        ...(skills.length
          ? [
              {
                type: "section" as const,
                title: "Skills",
                items: skills.map((skill) => ({
                  icon: menuIcon(Sparkles),
                  label: skill.name,
                  onClick: () => onInsert(`/${skill.name} `),
                })),
              },
            ]
          : []),
        ...(plugins.length
          ? [
              {
                type: "section" as const,
                title: "Plugins",
                items: plugins.map((plugin) => ({
                  icon: menuIcon(Puzzle),
                  label: plugin.name,
                  onClick: () => onInsert(`@${plugin.name} `),
                })),
              },
            ]
          : []),
      ]}
    />
  );
}
