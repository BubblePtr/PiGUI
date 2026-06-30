import { HugeiconsIcon, type HugeiconsIconProps, type IconSvgElement } from "@hugeicons/react";
import {
  ActivityIcon,
  AddIcon,
  ArchiveIcon,
  ArrowLeftIcon,
  BarChartIcon,
  BotIcon,
  BoxIcon,
  ChatAddIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleIcon,
  CommandIcon,
  Delete02Icon,
  Folder01Icon,
  Folder02Icon,
  FolderOpenIcon,
  GitBranchIcon,
  ImageIcon as HugeImageIcon,
  LayoutAlignLeftIcon,
  ListTreeIcon,
  Loading03Icon,
  MoreHorizontalIcon,
  PencilEdit01Icon,
  PuzzleIcon,
  RefreshIcon,
  RobotIcon,
  Settings01Icon,
  Settings02Icon,
  SidebarLeftIcon,
  SparklesIcon,
  TerminalIcon,
  UserIcon,
  WrenchIcon,
} from "@hugeicons/core-free-icons";

type PiGUIIconProps = Omit<HugeiconsIconProps, "icon" | "altIcon">;

const piguiIconStrokeWidth = 1.5;

function iconComponent(icon: IconSvgElement) {
  return function PiGUIIcon(props: PiGUIIconProps) {
    return (
      <HugeiconsIcon
        color="currentColor"
        icon={icon}
        strokeWidth={piguiIconStrokeWidth}
        {...props}
      />
    );
  };
}

export const Activity = iconComponent(ActivityIcon);
export const Archive = iconComponent(ArchiveIcon);
export const ArrowLeft = iconComponent(ArrowLeftIcon);
export const BarChart3 = iconComponent(BarChartIcon);
export const Bot = iconComponent(RobotIcon);
export const Box = iconComponent(BoxIcon);
export const ChatAdd = iconComponent(ChatAddIcon);
export const ChevronDown = iconComponent(ChevronDownIcon);
export const ChevronRight = iconComponent(ChevronRightIcon);
export const Circle = iconComponent(CircleIcon);
export const Command = iconComponent(CommandIcon);
export const FolderClosed = iconComponent(Folder01Icon);
export const FolderOpen = iconComponent(FolderOpenIcon);
export const FolderOpenState = iconComponent(Folder02Icon);
export const GitBranch = iconComponent(GitBranchIcon);
export const ImageIcon = iconComponent(HugeImageIcon);
export const LayoutAlignLeft = iconComponent(LayoutAlignLeftIcon);
export const ListTree = iconComponent(ListTreeIcon);
export const LoaderCircle = iconComponent(Loading03Icon);
export const MoreHorizontal = iconComponent(MoreHorizontalIcon);
export const Pencil = iconComponent(PencilEdit01Icon);
export const Plus = iconComponent(AddIcon);
export const Puzzle = iconComponent(PuzzleIcon);
export const RefreshCw = iconComponent(RefreshIcon);
export const Settings = iconComponent(Settings01Icon);
export const Settings2 = iconComponent(Settings02Icon);
export const SidebarLeft = iconComponent(SidebarLeftIcon);
export const Sparkles = iconComponent(SparklesIcon);
export const Terminal = iconComponent(TerminalIcon);
export const Trash2 = iconComponent(Delete02Icon);
export const User = iconComponent(UserIcon);
export const Wrench = iconComponent(WrenchIcon);

// Keep the plain bot glyph available for places that need a chat-specific robot icon.
export const BotMessage = iconComponent(BotIcon);
