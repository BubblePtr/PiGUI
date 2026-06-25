import { useRouter, useRouterState } from "@tanstack/react-router";
import { AppLayout, Navbar, Sidebar } from "@heroui-pro/react";
import { BarChart3, ListTree, Settings } from "lucide-react";
import { useState, type CSSProperties, type ReactNode } from "react";

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
    label: "Usage",
    to: "/usage",
    icon: BarChart3,
    isActive: (pathname: string) => pathname === "/usage",
  },
  {
    label: "Settings",
    to: "/setup",
    icon: Settings,
    isActive: (pathname: string) => pathname === "/setup",
  },
] as const;

const sidebarStyle = {
  "--sidebar-width": "15rem",
} as CSSProperties;

const titlebarHeight = "40px";
const titlebarControlStyle = {
  width: "28px",
  height: "28px",
} as CSSProperties;
const trafficWidth = "88px";
const titlebarGap = "16px";

function getActiveTab(pathname: string) {
  return tabs.find((tab) => tab.isActive(pathname)) ?? tabs[0];
}

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
      <Sidebar.Header
        className="flex shrink-0 items-center select-none"
        style={{ height: titlebarHeight }}
      >
        <div
          aria-hidden="true"
          className="h-full shrink-0"
          data-tauri-drag-region
          data-testid="mac-traffic-space"
          style={{ width: trafficWidth }}
        />
        <div aria-hidden="true" className="h-full min-w-0 flex-1" data-tauri-drag-region />
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
  const activeTab = getActiveTab(pathname);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const collapsedTrafficSpaceStyle = {
    width: sidebarOpen ? "0px" : trafficWidth,
    marginRight: sidebarOpen ? `-${titlebarGap}` : "0px",
    transition: "width 0.2s ease, margin-right 0.2s ease",
  } as CSSProperties;

  return (
    <AppLayout
      className="pig-app-layout bg-background text-foreground"
      navigate={(href) => void router.navigate({ to: href as "/" | "/usage" | "/setup" })}
      navbar={
        <Navbar
          className="border-b border-border bg-surface"
          height={titlebarHeight}
          maxWidth="full"
        >
          <Navbar.Header className="h-full items-center">
            <div
              aria-hidden="true"
              className="h-full shrink-0 overflow-hidden"
              data-state={sidebarOpen ? "expanded" : "collapsed"}
              data-testid="collapsed-traffic-space"
              style={collapsedTrafficSpaceStyle}
            />
            <Sidebar.Trigger
              aria-label="Toggle sidebar"
              className="shrink-0"
              style={titlebarControlStyle}
            />
            <Navbar.Brand className="h-7 select-none items-center">
              <h1 className="select-none text-sm font-semibold leading-7 tracking-normal text-foreground">
                {activeTab.label}
              </h1>
            </Navbar.Brand>
            <Navbar.Spacer className="h-full min-w-0 flex-1 select-none" data-tauri-drag-region />
          </Navbar.Header>
        </Navbar>
      }
      scrollMode="content"
      sidebar={
        <Sidebar style={sidebarStyle}>
          <SidebarPanelContent pathname={pathname} />
        </Sidebar>
      }
      sidebarCollapsible="offcanvas"
      sidebarOpen={sidebarOpen}
      sidebarVariant="inset"
      onSidebarOpenChange={setSidebarOpen}
    >
      <div className="h-full min-h-0 min-w-0" data-testid="app-frame-content">
        {children}
      </div>
    </AppLayout>
  );
}
