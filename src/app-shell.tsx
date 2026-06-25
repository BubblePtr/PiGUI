import { useRouter, useRouterState } from "@tanstack/react-router";
import { AppLayout, Navbar, Sidebar } from "@heroui-pro/react";
import { BarChart3, ListTree, Settings } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

type AppFrameProps = {
  sidebar?: ReactNode;
  children: ReactNode;
};

const tabs = [
  {
    label: "Trace",
    to: "/",
    icon: ListTree,
    isActive: (pathname: string) => pathname === "/" || pathname.startsWith("/sessions/"),
  },
  {
    label: "用量",
    to: "/usage",
    icon: BarChart3,
    isActive: (pathname: string) => pathname === "/usage",
  },
  {
    label: "配置",
    to: "/setup",
    icon: Settings,
    isActive: (pathname: string) => pathname === "/setup",
  },
] as const;

const sidebarStyle = {
  "--sidebar-width": "15rem",
} as CSSProperties;

function PrimaryNavigation({ pathname }: { pathname: string }) {
  return (
    <Sidebar.Menu aria-label="Primary navigation" showGuideLines={false}>
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = tab.isActive(pathname);

        return (
          <Sidebar.MenuItem
            key={tab.to}
            href={tab.to}
            id={tab.to}
            isCurrent={active}
            textValue={tab.label}
          >
            <Sidebar.MenuIcon>
              <Icon className="size-4" />
            </Sidebar.MenuIcon>
            <Sidebar.MenuLabel>{tab.label}</Sidebar.MenuLabel>
          </Sidebar.MenuItem>
        );
      })}
    </Sidebar.Menu>
  );
}

function SidebarPanelContent({ pathname }: { pathname: string }) {
  return (
    <>
      <Sidebar.Header>
        <div className="flex min-w-0 flex-col px-1 py-2" data-sidebar="label">
          <h1 className="truncate text-xl font-semibold tracking-normal text-foreground">Pig</h1>
          <p className="mt-1 truncate text-sm text-muted">Pi flight recorder</p>
        </div>
      </Sidebar.Header>
      <Sidebar.Content>
        <Sidebar.Group>
          <PrimaryNavigation pathname={pathname} />
        </Sidebar.Group>
      </Sidebar.Content>
    </>
  );
}

export function AppFrame({ children }: AppFrameProps) {
  const router = useRouter();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <AppLayout
      className="bg-background text-foreground"
      navigate={(href) => void router.navigate({ to: href as "/" | "/usage" | "/setup" })}
      navbar={
        <Navbar className="border-b border-border" height="3.5rem" maxWidth="full" size="sm">
          <Navbar.Header>
            <AppLayout.MenuToggle />
            <Sidebar.Trigger aria-label="Toggle sidebar" />
            <Navbar.Brand>
              <span className="text-sm font-semibold text-foreground">Pig</span>
              <span className="hidden text-xs text-muted sm:inline">Pi flight recorder</span>
            </Navbar.Brand>
          </Navbar.Header>
        </Navbar>
      }
      scrollMode="content"
      sidebar={
        <>
          <Sidebar style={sidebarStyle}>
            <SidebarPanelContent pathname={pathname} />
          </Sidebar>
          <Sidebar.Mobile>
            <SidebarPanelContent pathname={pathname} />
          </Sidebar.Mobile>
        </>
      }
      sidebarCollapsible="offcanvas"
      sidebarVariant="inset"
    >
      <div className="h-full min-h-0 min-w-0 bg-background" data-testid="app-frame-content">
        {children}
      </div>
    </AppLayout>
  );
}
