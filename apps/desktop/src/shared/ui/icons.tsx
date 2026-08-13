import { HugeiconsIcon, type HugeiconsIconProps, type IconSvgElement } from "@hugeicons/react";
import {
  ActivityIcon,
  AddIcon,
  ArchiveIcon,
  ArrowLeftIcon,
  ArrowUp02Icon,
  BarChartIcon,
  BotIcon,
  BoxIcon,
  Cancel01Icon,
  ChatAddIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleIcon,
  CommandIcon,
  ComputerIcon,
  Copy01Icon,
  Delete02Icon,
  FileDiffIcon,
  FlashIcon,
  Folder01Icon,
  Folder02Icon,
  FolderOpenIcon,
  GitBranchIcon,
  ImageIcon as HugeImageIcon,
  LayoutAlignLeftIcon,
  ListTreeIcon,
  Loading03Icon,
  MoreHorizontalIcon,
  PaintBoardIcon,
  PencilEdit01Icon,
  PuzzleIcon,
  RefreshIcon,
  RobotIcon,
  Settings01Icon,
  Settings02Icon,
  SidebarLeftIcon,
  SparklesIcon,
  StopIcon as HugeStopIcon,
  TerminalIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
  Tick02Icon,
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
export const ArrowUp = iconComponent(ArrowUp02Icon);
export const BarChart3 = iconComponent(BarChartIcon);
export const Bot = iconComponent(RobotIcon);
export const Box = iconComponent(BoxIcon);
export const Cancel = iconComponent(Cancel01Icon);
export const ChatAdd = iconComponent(ChatAddIcon);
export const ChevronDown = iconComponent(ChevronDownIcon);
export const ChevronRight = iconComponent(ChevronRightIcon);
export const Check = iconComponent(Tick02Icon);
export const Circle = iconComponent(CircleIcon);
export const Command = iconComponent(CommandIcon);
export const Computer = iconComponent(ComputerIcon);
export const Copy = iconComponent(Copy01Icon);
export const FileDiff = iconComponent(FileDiffIcon);
export const Flash = iconComponent(FlashIcon);
export const FolderClosed = iconComponent(Folder01Icon);
export const FolderOpen = iconComponent(FolderOpenIcon);
export const FolderOpenState = iconComponent(Folder02Icon);
export const GitBranch = iconComponent(GitBranchIcon);
export const ImageIcon = iconComponent(HugeImageIcon);
export const LayoutAlignLeft = iconComponent(LayoutAlignLeftIcon);
export const ListTree = iconComponent(ListTreeIcon);
export const LoaderCircle = iconComponent(Loading03Icon);
export const MoreHorizontal = iconComponent(MoreHorizontalIcon);
export const Palette = iconComponent(PaintBoardIcon);
export const Pencil = iconComponent(PencilEdit01Icon);
export const Plus = iconComponent(AddIcon);
export const Puzzle = iconComponent(PuzzleIcon);
export const RefreshCw = iconComponent(RefreshIcon);
export const Settings = iconComponent(Settings01Icon);
export const Settings2 = iconComponent(Settings02Icon);
export const SidebarLeft = iconComponent(SidebarLeftIcon);
export const Sparkles = iconComponent(SparklesIcon);
export const Stop = iconComponent(HugeStopIcon);
export const Terminal = iconComponent(TerminalIcon);
export const ThumbsDown = iconComponent(ThumbsDownIcon);
export const ThumbsUp = iconComponent(ThumbsUpIcon);
export const Trash2 = iconComponent(Delete02Icon);
export const User = iconComponent(UserIcon);
export const Wrench = iconComponent(WrenchIcon);

// Keep the plain bot glyph available for places that need a chat-specific robot icon.
export const BotMessage = iconComponent(BotIcon);
