import { Dropdown, Label } from "@heroui/react";
import type { ComponentProps, ReactNode } from "react";

type SidebarActionKey = string | number;

type SidebarActionDropdownProps = {
  ariaLabel: string;
  children: ReactNode;
  icon: ReactNode;
  onAction?: (key: SidebarActionKey) => void;
  placement?: ComponentProps<typeof Dropdown.Popover>["placement"];
};

type SidebarActionDropdownItemProps = {
  children: ReactNode;
  icon?: ReactNode;
  id: SidebarActionKey;
  textValue: string;
  variant?: ComponentProps<typeof Dropdown.Item>["variant"];
};

export function SidebarActionDropdown({
  ariaLabel,
  children,
  icon,
  onAction,
  placement = "bottom end",
}: SidebarActionDropdownProps) {
  return (
    <Dropdown>
      <Dropdown.Trigger
        aria-label={ariaLabel}
        className="sidebar__menu-action pigui-sidebar-action-dropdown__trigger"
        data-slot="sidebar-menu-action"
      >
        {icon}
      </Dropdown.Trigger>
      <Dropdown.Popover
        className="pigui-sidebar-action-dropdown__popover pigui-compact-menu-popover"
        placement={placement}
      >
        <Dropdown.Menu
          className="pigui-sidebar-action-dropdown__menu pigui-compact-menu-surface"
          onAction={onAction}
        >
          {children}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

export function SidebarActionDropdownItem({
  children,
  icon,
  id,
  textValue,
  variant,
}: SidebarActionDropdownItemProps) {
  return (
    <Dropdown.Item
      className="pigui-sidebar-action-dropdown__item pigui-compact-menu-item"
      id={id}
      textValue={textValue}
      variant={variant}
    >
      <div className="pigui-sidebar-action-dropdown__item-content">
        {icon ? (
          <span className="pigui-sidebar-action-dropdown__item-icon">
            {icon}
          </span>
        ) : null}
        <Label className="min-w-0 truncate">{children}</Label>
      </div>
    </Dropdown.Item>
  );
}
