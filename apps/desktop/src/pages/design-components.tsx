import { useEffect, useRef, useState, type ReactNode } from "react";
import { GallerySection } from "@/pages/design";
import { DotMatrix } from "@/shared/ui/dot-matrix";
import { PiBarChart } from "@/shared/ui/pi-bar-chart";
import { PiKpi } from "@/shared/ui/pi-kpi";
import { PiSheet } from "@/shared/ui/pi-sheet";
import {
  SessionInspector,
  SessionInspectorTrigger,
} from "@/shared/ui/session-inspector/session-inspector";
import {
  sessionSurfaces,
  type SessionSurfaceId,
} from "@/shared/ui/session-inspector/surface-registry";
import { PiTraceLedger } from "@/shared/ui/pi-trace-ledger";
import {
  PiTraceInspector,
  type TraceInspectorTab,
} from "@/shared/ui/pi-trace-inspector";
import {
  PiTraceStrip,
  stripSegmentsFromTurns,
  type SegmentRange,
  type StripWidthMode,
} from "@/shared/ui/pi-trace-strip";
import { buildTraceRuns, buildTraceTurns } from "@/entities/session/trace-model";
import type { SessionTurn } from "@pigui/core";
import { ChatChainOfThought } from "@/shared/ui/chat/chat-chain-of-thought";
import { ChatInlinePager } from "@/shared/ui/chat/chat-inline-pager";
import { ChatPixelLoader } from "@/shared/ui/chat/chat-pixel-loader";
import { ChatStatusLine } from "@/shared/ui/chat/chat-status-line";
import { ChatThoughtStep, type ChatThoughtStepItem } from "@/shared/ui/chat/chat-thought-step";
import { ChatToolStep, type ChatToolStepItem } from "@/shared/ui/chat/chat-tool-step";
import { ChatThoughtMarkdown } from "@/shared/ui/chat/chat-thought-markdown";
import {
  ChatChainOfThoughtRail,
  type ChainOfThoughtRailPart,
} from "@/shared/ui/chat/chat-chain-of-thought-rail";
import { ChatCodeBlock } from "@/shared/ui/chat/chat-code-block";
import { ChatConversation } from "@/shared/ui/chat/chat-conversation";
import { ChatMarkdown, ChatStreamMarkdown } from "@/shared/ui/chat/chat-markdown";
import { ChatMessage, ChatMessageActions } from "@/shared/ui/chat/chat-message";
import { ChatPromptInput } from "@/shared/ui/chat/chat-prompt-input";
import { ChatPromptSuggestion } from "@/shared/ui/chat/chat-prompt-suggestion";
import { ChatQueuedMessage } from "@/shared/ui/chat/chat-queued-message";
import {
  ChatTool,
  ChatToolGroup,
  type ToolPartState,
} from "@/shared/ui/chat/chat-tool";
import { TextShimmer } from "@/shared/ui/chat/text-shimmer";
import { BrowserSurface } from "@/shared/ui/browser/browser-surface";
import { ContextUsageMeter } from "@/shared/ui/context-usage-meter";
import {
  TerminalView,
  type TerminalViewHandle,
} from "@/shared/ui/terminal/terminal-view";
import { ModelSelectorControl } from "@/shared/ui/model-selector/model-selector-control";
import { ComposerAttachmentDrawer } from "@/shared/ui/composer-attachments/composer-attachment-drawer";
import { ComposerInsertMenu } from "@/shared/ui/composer-attachments/composer-insert-menu";
import { Button } from "@astryxdesign/core/Button";
import * as Icons from "@/shared/ui/icons";
import type { RuntimeModelControls } from "@pigui/core";

/**
 * Layer 3 of the design gallery: every reusable PiGUI component in
 * shared/ui, all variants and typical states, fed with inline fixtures.
 * AGENTS.md requires every new shared/ui component to register here.
 */

function Variant({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {children}
      <span className="text-[10px] text-muted">{caption}</span>
    </div>
  );
}

function VariantRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-start gap-6">{children}</div>;
}

function PiKpiGallery() {
  return (
    <GallerySection title="PiKpi">
      <VariantRow>
        <Variant caption="layout=stacked">
          <PiKpi
            formatOptions={{ style: "currency", currency: "USD" }}
            label="Total cost"
            value={0.042137}
          />
        </Variant>
        <Variant caption="layout=inline">
          <PiKpi
            formatOptions={{ notation: "compact" }}
            label="Tokens"
            layout="inline"
            value={18_420}
          />
        </Variant>
        <Variant caption="with delta">
          <PiKpi
            delta={<span className="text-xs text-success">+12%</span>}
            label="Sessions"
            value={42}
          />
        </Variant>
        <Variant caption="no value">
          <PiKpi label="Pending metric" />
        </Variant>
      </VariantRow>
    </GallerySection>
  );
}

const barChartSeries = [
  { key: "input", label: "Input", color: "var(--pigui-data-blue)" },
  { key: "output", label: "Output", color: "var(--pigui-data-orange)" },
];

const barChartData = ["Mon", "Tue", "Wed", "Thu", "Fri"].map((label, index) => ({
  key: label.toLowerCase(),
  label,
  values: { input: (index + 1) * 8, output: (index + 1) * 3 },
}));

function PiBarChartGallery() {
  return (
    <GallerySection title="PiBarChart">
      <VariantRow>
        <Variant caption="stacked multi-series">
          <div className="w-80">
            <PiBarChart
              aria-label="Stacked demo chart"
              data={barChartData}
              series={barChartSeries}
            />
          </div>
        </Variant>
        <Variant caption="single series, empty bucket">
          <div className="w-80">
            <PiBarChart
              aria-label="Single series demo chart"
              data={[
                { key: "a", label: "A", values: { input: 12 } },
                { key: "b", label: "B", values: { input: 0 } },
                { key: "c", label: "C", values: { input: 7 } },
              ]}
              series={[barChartSeries[0]]}
            />
          </div>
        </Variant>
        <Variant caption="empty (no data), default and custom label">
          <div className="flex w-80 flex-col gap-2">
            <PiBarChart aria-label="Empty demo chart" data={[]} height={96} series={[]} />
            <PiBarChart
              aria-label="Empty demo chart with custom label"
              data={[]}
              emptyLabel="No usage in this range"
              height={96}
              series={[]}
            />
          </div>
        </Variant>
      </VariantRow>
    </GallerySection>
  );
}

function PiSheetGallery() {
  const [isOpen, setIsOpen] = useState(false);
  const [isLongOpen, setIsLongOpen] = useState(false);

  return (
    <GallerySection title="PiSheet">
      <VariantRow>
        <Variant caption="right-side sheet with header + close">
          <Button label="Open sheet" variant="secondary" onClick={() => setIsOpen(true)} />
          <PiSheet isOpen={isOpen} onOpenChange={setIsOpen}>
            <PiSheet.Content>
              <PiSheet.Header>
                <PiSheet.Heading>Sheet demo</PiSheet.Heading>
                <PiSheet.CloseTrigger />
              </PiSheet.Header>
              <PiSheet.Body>
                <p className="text-sm text-muted">
                  Slide-in panel body. Escape and backdrop click close it.
                </p>
              </PiSheet.Body>
            </PiSheet.Content>
          </PiSheet>
        </Variant>
        <Variant caption="long content — body scrolls, header stays">
          <Button
            label="Open long sheet"
            variant="secondary"
            onClick={() => setIsLongOpen(true)}
          />
          <PiSheet isOpen={isLongOpen} onOpenChange={setIsLongOpen}>
            <PiSheet.Content>
              <PiSheet.Header>
                <PiSheet.Heading>Long content</PiSheet.Heading>
                <PiSheet.CloseTrigger />
              </PiSheet.Header>
              <PiSheet.Body>
                {Array.from({ length: 40 }, (_, index) => (
                  <p className="text-sm text-muted" key={index}>
                    Row {index + 1} — enough copy to force the body to scroll while
                    the header stays pinned.
                  </p>
                ))}
              </PiSheet.Body>
            </PiSheet.Content>
          </PiSheet>
        </Variant>
      </VariantRow>
    </GallerySection>
  );
}

function SessionInspectorGallery() {
  const [activeSurfaceId, setActiveSurfaceId] =
    useState<SessionSurfaceId>("changes");
  const [isOpen, setIsOpen] = useState(false);

  return (
    <GallerySection title="SessionInspector">
      <VariantRow>
        <Variant caption="Changes active — rail badge carries the file count">
          <div className="h-72 w-[30rem] overflow-hidden rounded-md border border-separator">
            <SessionInspector
              activeSurfaceId={activeSurfaceId}
              badges={{ changes: "3" }}
              onActiveSurfaceChange={setActiveSurfaceId}
            >
              <p className="text-sm text-muted">
                {sessionSurfaces[activeSurfaceId].title} surface content — the
                panel hosts whichever surface the rail selects.
              </p>
            </SessionInspector>
          </div>
        </Variant>
        <Variant caption="Terminal active — same panel, rail switches the surface; flushContent drops the header/content padding">
          <div className="h-72 w-[30rem] overflow-hidden rounded-md border border-separator">
            <SessionInspector
              activeSurfaceId="terminal"
              onActiveSurfaceChange={() => {}}
            >
              <p className="text-sm text-muted">
                Session-scoped shells, edge-to-edge.
              </p>
            </SessionInspector>
          </div>
        </Variant>
        <Variant caption="collapsed — panel and rail are both gone; only this toolbar toggle remains">
          <SessionInspectorTrigger isOpen={isOpen} onOpenChange={setIsOpen} />
        </Variant>
        <Variant caption="docked toggle — alignToRail seats it on the 44px rail axis (slot cancels the header's 1rem inset)">
          <div className="flex w-40 justify-end border-r border-separator pr-4">
            <SessionInspectorTrigger
              alignToRail
              isOpen={isOpen}
              onOpenChange={setIsOpen}
            />
          </div>
        </Variant>
      </VariantRow>
    </GallerySection>
  );
}

/** Inline 2x2 PNG: the gallery needs a real image source, not a live view. */
const gallerySnapshot =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAF0lEQVR4nGP8//8/AwwwMSAB7BwmJIUQDgB7pgMBfxRcVAAAAABJRU5ErkJggg==";

function BrowserSurfaceGallery() {
  const [address, setAddress] = useState("localhost:5173");

  return (
    <GallerySection title="BrowserSurface">
      <VariantRow>
        <Variant caption="live, nothing marked — the body is the placeholder the native WebContentsView paints behind, and Send to composer has nothing to send">
          <div className="h-56 w-[30rem] overflow-hidden rounded-md border border-separator px-2">
            <BrowserSurface
              address={address}
              annotationCount={0}
              canGoBack
              canGoForward={false}
              designMode={false}
              state={{ kind: "live" }}
              onAddressChange={setAddress}
              onAddressSubmit={() => {}}
              onBack={() => {}}
              onClearAnnotations={() => {}}
              onDesignModeChange={() => {}}
              onForward={() => {}}
              onOpenExternal={() => {}}
              onReload={() => {}}
              onSendToComposer={() => {}}
            />
          </div>
        </Variant>
        <Variant caption="design mode on, two elements marked — the marks live in the page's own overlay, and Send to composer drops them plus a screenshot into the chat draft">
          <div className="h-56 w-[30rem] overflow-hidden rounded-md border border-separator px-2">
            <BrowserSurface
              address="http://localhost:5173/"
              annotationCount={2}
              canGoBack={false}
              canGoForward={false}
              designMode
              state={{ kind: "live" }}
              onAddressChange={() => {}}
              onAddressSubmit={() => {}}
              onBack={() => {}}
              onClearAnnotations={() => {}}
              onDesignModeChange={() => {}}
              onForward={() => {}}
              onOpenExternal={() => {}}
              onReload={() => {}}
              onSendToComposer={() => {}}
            />
          </div>
        </Variant>
        <Variant caption="sending — the page is settling its overlay for the shot, so the action is out of reach until it answers">
          <div className="h-56 w-[30rem] overflow-hidden rounded-md border border-separator px-2">
            <BrowserSurface
              address="http://localhost:5173/"
              annotationCount={2}
              canGoBack={false}
              canGoForward={false}
              designMode
              isSending
              state={{ kind: "live" }}
              onAddressChange={() => {}}
              onAddressSubmit={() => {}}
              onBack={() => {}}
              onClearAnnotations={() => {}}
              onDesignModeChange={() => {}}
              onForward={() => {}}
              onOpenExternal={() => {}}
              onReload={() => {}}
              onSendToComposer={() => {}}
            />
          </div>
        </Variant>
        <Variant caption="notice — one line about the last send, in plain text: a layer here would swap the live page for a still">
          <div className="h-56 w-[30rem] overflow-hidden rounded-md border border-separator px-2">
            <BrowserSurface
              address="http://localhost:5173/"
              annotationCount={2}
              canGoBack={false}
              canGoForward={false}
              designMode
              notice="Sent without a screenshot — the page could not be photographed."
              state={{ kind: "live" }}
              onAddressChange={() => {}}
              onAddressSubmit={() => {}}
              onBack={() => {}}
              onClearAnnotations={() => {}}
              onDesignModeChange={() => {}}
              onForward={() => {}}
              onOpenExternal={() => {}}
              onReload={() => {}}
              onSendToComposer={() => {}}
            />
          </div>
        </Variant>
        <Variant caption="live + snapshot — a DOM overlay is open, so a still of the page stands in for the native view">
          <div className="h-56 w-[30rem] overflow-hidden rounded-md border border-separator px-2">
            <BrowserSurface
              address="http://localhost:5173/"
              annotationCount={0}
              canGoBack
              canGoForward={false}
              designMode={false}
              snapshot={gallerySnapshot}
              state={{ kind: "live" }}
              onAddressChange={() => {}}
              onAddressSubmit={() => {}}
              onBack={() => {}}
              onClearAnnotations={() => {}}
              onDesignModeChange={() => {}}
              onForward={() => {}}
              onOpenExternal={() => {}}
              onReload={() => {}}
              onSendToComposer={() => {}}
            />
          </div>
        </Variant>
        <Variant caption="empty — no URL remembered for this Project yet">
          <div className="h-56 w-[30rem] overflow-hidden rounded-md border border-separator px-2">
            <BrowserSurface
              address=""
              annotationCount={0}
              canGoBack={false}
              canGoForward={false}
              designMode={false}
              state={{ kind: "empty" }}
              onAddressChange={() => {}}
              onAddressSubmit={() => {}}
              onBack={() => {}}
              onClearAnnotations={() => {}}
              onDesignModeChange={() => {}}
              onForward={() => {}}
              onOpenExternal={() => {}}
              onReload={() => {}}
              onSendToComposer={() => {}}
            />
          </div>
        </Variant>
        <Variant caption="error — our own state, never Chromium's error page">
          <div className="h-56 w-[30rem] overflow-hidden rounded-md border border-separator px-2">
            <BrowserSurface
              address="http://localhost:5173/"
              annotationCount={0}
              canGoBack={false}
              canGoForward={false}
              designMode={false}
              state={{ kind: "error", message: "ERR_CONNECTION_REFUSED" }}
              onAddressChange={() => {}}
              onAddressSubmit={() => {}}
              onBack={() => {}}
              onClearAnnotations={() => {}}
              onDesignModeChange={() => {}}
              onForward={() => {}}
              onOpenExternal={() => {}}
              onReload={() => {}}
              onSendToComposer={() => {}}
            />
          </div>
        </Variant>
        <Variant caption="narrow — below 1280px the inspector is a Dialog portal, so the chrome goes away with the view">
          <div className="h-56 w-[30rem] overflow-hidden rounded-md border border-separator px-2">
            <BrowserSurface
              address=""
              annotationCount={0}
              canGoBack={false}
              canGoForward={false}
              designMode={false}
              state={{ kind: "narrow" }}
              onAddressChange={() => {}}
              onAddressSubmit={() => {}}
              onBack={() => {}}
              onClearAnnotations={() => {}}
              onDesignModeChange={() => {}}
              onForward={() => {}}
              onOpenExternal={() => {}}
              onReload={() => {}}
              onSendToComposer={() => {}}
            />
          </div>
        </Variant>
        <Variant caption="unsupported — browser-only dev, no Electron main process to host a view">
          <div className="h-56 w-[30rem] overflow-hidden rounded-md border border-separator px-2">
            <BrowserSurface
              address=""
              annotationCount={0}
              canGoBack={false}
              canGoForward={false}
              designMode={false}
              state={{ kind: "unsupported" }}
              onAddressChange={() => {}}
              onAddressSubmit={() => {}}
              onBack={() => {}}
              onClearAnnotations={() => {}}
              onDesignModeChange={() => {}}
              onForward={() => {}}
              onOpenExternal={() => {}}
              onReload={() => {}}
              onSendToComposer={() => {}}
            />
          </div>
        </Variant>
      </VariantRow>
    </GallerySection>
  );
}

function TerminalViewGallery() {
  const terminalRef = useRef<TerminalViewHandle>(null);

  useEffect(() => {
    // Child effects run first, so the xterm instance is already open and the
    // handle is live by the time this writes.
    terminalRef.current?.write(
      [
        "\x1b[32m$\x1b[0m bun run typecheck",
        "tsc --noEmit — clean",
        "\x1b[31mfatal:\x1b[0m not a git repository (sample output, not a live shell)",
        "",
      ].join("\r\n"),
    );
  }, []);

  return (
    <GallerySection title="TerminalView">
      <VariantRow>
        <Variant caption="live xterm mount — output written via the ref handle, chrome colors from the token bridge">
          <div className="h-48 w-[30rem] overflow-hidden rounded-md border border-separator">
            <TerminalView ref={terminalRef} className="h-full" />
          </div>
        </Variant>
      </VariantRow>
    </GallerySection>
  );
}

function galleryUsage(inputTokens: number, outputTokens: number) {
  return {
    inputTokens,
    outputTokens,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: inputTokens + outputTokens,
  };
}

function galleryCost(totalUsd: number) {
  return {
    inputUsd: totalUsd * 0.6,
    outputUsd: totalUsd * 0.4,
    cacheReadUsd: 0,
    cacheWriteUsd: 0,
    totalUsd,
  };
}

// Shared trace fixture for the Cockpit trio (Strip / Ledger / Inspector):
// four Active Runs plus an annotation — enough columns that focusing one
// swimlane block makes the outside dimming obvious. The first assistant turn
// deliberately carries no measured model duration, so the Strip has both a
// an estimated model span to show in Time mode.
const traceSessionTurns: SessionTurn[] = [
  {
    kind: "message",
    role: "user",
    timestamp: "2026-03-22T14:41:00.000Z",
    parts: [{ partType: "text", text: "Fix the failing formatter test.", payload: {} }],
  },
  {
    kind: "message",
    role: "assistant",
    timestamp: "2026-03-22T14:41:42.000Z",
    model: "gpt-5-codex",
    usage: {
      inputTokens: 40_000,
      outputTokens: 3_800,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 43_800,
    },
    cost: { inputUsd: 0.2, outputUsd: 0.13, cacheReadUsd: 0, cacheWriteUsd: 0, totalUsd: 0.3301 },
    parts: [
      {
        partType: "thinking",
        text: "The failing assertion says the projection dropped the tool_call part after a fork.",
        payload: {},
      },
      {
        partType: "toolCall",
        name: "bash",
        payload: { id: "c1", arguments: { command: "git diff --stat" } },
      },
      {
        partType: "toolResult",
        name: "bash",
        text: "3 files changed",
        isError: false,
        durationMs: 340,
        payload: { toolCallId: "c1" },
      },
      {
        partType: "toolCall",
        name: "edit",
        payload: { id: "c2", arguments: { path: "src/utils/formatDate.ts" } },
      },
      {
        partType: "toolResult",
        name: "edit",
        text: "patch failed to apply",
        isError: true,
        durationMs: 12_400,
        payload: { toolCallId: "c2" },
      },
      { partType: "text", text: "Patch conflict — retrying with a narrower edit.", payload: {} },
    ],
  },
  {
    kind: "annotation",
    title: "Model changed",
    timestamp: "2026-03-22T14:42:00.000Z",
    model: "claude-fable-5",
    parts: [{ partType: "model_change", payload: { model: "claude-fable-5" } }],
  },
  {
    kind: "message",
    role: "user",
    timestamp: "2026-03-22T14:42:30.000Z",
    parts: [{ partType: "text", text: "继续，把格式化函数的回归测试补上。", payload: {} }],
  },
  {
    kind: "message",
    role: "assistant",
    timestamp: "2026-03-22T14:43:03.000Z",
    model: "claude-fable-5",
    usage: {
      inputTokens: 51_000,
      outputTokens: 900,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 51_900,
    },
    cost: { inputUsd: 0.24, outputUsd: 0.04, cacheReadUsd: 0, cacheWriteUsd: 0, totalUsd: 0.28 },
    parts: [
      {
        partType: "toolCall",
        name: "grep",
        payload: { id: "c3", arguments: { pattern: "remapToolCallId" } },
      },
    ],
  },
  {
    kind: "message",
    role: "user",
    timestamp: "2026-03-22T14:44:00.000Z",
    parts: [{ partType: "text", text: "也把日期 helper 的时区边界补上。", payload: {} }],
  },
  {
    kind: "message",
    role: "assistant",
    modelDurationMs: 16_000,
    timestamp: "2026-03-22T14:44:28.000Z",
    model: "claude-fable-5",
    usage: galleryUsage(62_000, 1_400),
    cost: galleryCost(0.31),
    parts: [
      { partType: "thinking", text: "Need the existing helper and its tests first.", payload: {} },
      {
        partType: "toolCall",
        name: "read_file",
        payload: { id: "c4", arguments: { path: "src/utils/formatDate.ts" } },
      },
      {
        partType: "toolResult",
        name: "read_file",
        text: "export function formatDate(value: Date) { return value.toISOString(); }",
        isError: false,
        durationMs: 180,
        payload: { toolCallId: "c4" },
      },
      {
        partType: "toolCall",
        name: "read_file",
        payload: { id: "c5", arguments: { path: "src/utils/formatDate.test.ts" } },
      },
      {
        partType: "toolResult",
        name: "read_file",
        text: "it('formats UTC', () => { expect(formatDate(d)).toBe('…'); });",
        isError: false,
        durationMs: 90,
        payload: { toolCallId: "c5" },
      },
      { partType: "text", text: "Helper is UTC-only. Adding an explicit timezone argument.", payload: {} },
    ],
  },
  {
    kind: "message",
    role: "user",
    timestamp: "2026-03-22T14:45:10.000Z",
    parts: [{ partType: "text", text: "跑一下测试，确认没把旧调用方弄坏。", payload: {} }],
  },
  {
    kind: "message",
    role: "assistant",
    modelDurationMs: 14_000,
    timestamp: "2026-03-22T14:45:40.000Z",
    model: "claude-fable-5",
    usage: galleryUsage(64_200, 2_100),
    cost: galleryCost(0.36),
    parts: [
      { partType: "thinking", text: "Patch the helper, then run the focused test file.", payload: {} },
      {
        partType: "toolCall",
        name: "edit",
        payload: { id: "c6", arguments: { path: "src/utils/formatDate.ts" } },
      },
      {
        partType: "toolResult",
        name: "edit",
        text: "updated formatDate to accept timeZone",
        isError: false,
        durationMs: 40,
        payload: { toolCallId: "c6" },
      },
      {
        partType: "toolCall",
        name: "bash",
        payload: { id: "c7", arguments: { command: "bun test src/utils/formatDate.test.ts" } },
      },
      {
        partType: "toolResult",
        name: "bash",
        text: "4 pass, 0 fail",
        isError: false,
        durationMs: 2_800,
        payload: { toolCallId: "c7" },
      },
      { partType: "text", text: "Tests are green. Ready to ship the helper + the original formatter fix.", payload: {} },
    ],
  },
];

const traceTurns = buildTraceTurns(traceSessionTurns);
const traceRuns = buildTraceRuns(traceTurns);

function PiTraceLedgerGallery() {
  const [selectedStepId, setSelectedStepId] = useState<string | undefined>("t1-s1");

  return (
    <GallerySection title="PiTraceLedger">
      <div className="flex max-w-3xl flex-col gap-4">
        <Variant caption="Run headers + Turn boundary dots + badge rows (request → result); click moves the Playhead, rows never expand">
          <div className="rounded-md border border-separator">
            <PiTraceLedger
              runs={traceRuns}
              selectedStepId={selectedStepId}
              onSelectStep={setSelectedStepId}
            />
          </div>
        </Variant>
        <Variant caption="focus-dimmed rows outside a tools block (same Run stays, other steps grey)">
          <div className="rounded-md border border-separator">
            <PiTraceLedger
              runs={traceRuns}
              isStepDimmed={(step) => step.kind !== "tool"}
            />
          </div>
        </Variant>
        <Variant caption="empty">
          <div className="rounded-md border border-separator">
            <PiTraceLedger emptyLabel="No trace entries." runs={[]} />
          </div>
        </Variant>
      </div>
    </GallerySection>
  );
}

const galleryStripSegments = stripSegmentsFromTurns(traceTurns);
const defaultGalleryFocus: SegmentRange = (() => {
  const midTools = galleryStripSegments.findIndex(
    (segment, index) => segment.lane === "tools" && index > 3,
  );
  return midTools >= 0 ? [midTools, midTools] : [1, 1];
})();

// Two runs sized so the Time-mode encoding is readable at a glance: Run 1's
// model call is bracketed by Pi's stamps, Run 2's is not. The shared Cockpit
// fixture also mixes both, but its estimated spans collapse to slivers.
const stripTimingTurns: SessionTurn[] = [
  {
    kind: "message",
    role: "user",
    timestamp: "2026-03-22T10:00:00.000Z",
    parts: [{ partType: "text", text: "Recorded model call.", payload: {} }],
  },
  {
    kind: "message",
    role: "assistant",
    modelDurationMs: 12_000,
    timestamp: "2026-03-22T10:00:14.000Z",
    model: "claude-fable-5",
    parts: [
      { partType: "thinking", text: "Read the helper first.", payload: {} },
      { partType: "toolCall", name: "bash", payload: { id: "s1", arguments: { command: "ls" } } },
      {
        partType: "toolResult",
        name: "bash",
        text: "src",
        isError: false,
        durationMs: 4_000,
        payload: { toolCallId: "s1" },
      },
    ],
  },
  {
    kind: "message",
    role: "user",
    timestamp: "2026-03-22T10:00:20.000Z",
    parts: [{ partType: "text", text: "Session without model stamps.", payload: {} }],
  },
  {
    kind: "message",
    role: "assistant",
    timestamp: "2026-03-22T10:00:38.000Z",
    model: "claude-fable-5",
    parts: [
      { partType: "thinking", text: "Same shape, older session.", payload: {} },
      { partType: "toolCall", name: "bash", payload: { id: "s2", arguments: { command: "ls" } } },
      {
        partType: "toolResult",
        name: "bash",
        text: "src",
        isError: false,
        durationMs: 4_000,
        payload: { toolCallId: "s2" },
      },
    ],
  },
  {
    kind: "message",
    role: "user",
    timestamp: "2026-03-22T10:00:52.000Z",
    parts: [{ partType: "text", text: "Thanks.", payload: {} }],
  },
];

const stripTimingTraceTurns = buildTraceTurns(stripTimingTurns);

function PiTraceStripTimeVariant() {
  const [widthMode, setWidthMode] = useState<StripWidthMode>("duration");

  return (
    <Variant caption="Time mode · mixed truth: solid = span Pi recorded — Run 1's model call, and the input wait up to it opening; hatched = estimated (Run 2: older session, unbracketed call, so neither its model span nor the wait before it can be measured)">
      <div className="rounded-md border border-separator bg-surface-muted/25 px-3 py-2">
        <PiTraceStrip
          turns={stripTimingTraceTurns}
          widthMode={widthMode}
          onSelect={() => {}}
          onWidthModeChange={setWidthMode}
        />
      </div>
    </Variant>
  );
}

function PiTraceStripGallery() {
  const [widthMode, setWidthMode] = useState<StripWidthMode>("steps");
  const [range, setRange] = useState<SegmentRange | undefined>(defaultGalleryFocus);
  const [activeStepId, setActiveStepId] = useState<string | undefined>(
    galleryStripSegments[defaultGalleryFocus[0]]?.stepIds[0],
  );
  const focusedStepIds = new Set(
    (range ? galleryStripSegments.slice(range[0], range[1] + 1) : []).flatMap(
      (segment) => segment.stepIds,
    ),
  );

  return (
    <GallerySection title="PiTraceStrip">
      <div className="flex max-w-3xl flex-col gap-4">
        <Variant caption="Input / Model / Tools swimlanes · hover = scrub cursor · click = one block · drag = contiguous blocks · columns outside the box dim">
          <div className="rounded-md border border-separator bg-surface-muted/25 px-3 py-2">
            <PiTraceStrip
              activeStepId={activeStepId}
              selectedRange={range}
              turns={traceTurns}
              widthMode={widthMode}
              onBrush={setRange}
              onSelect={(_, stepId) => setActiveStepId(stepId)}
              onWidthModeChange={setWidthMode}
            />
          </div>
          <div className="mt-3 max-h-64 overflow-y-auto rounded-md border border-separator">
            <PiTraceLedger
              runs={traceRuns}
              selectedStepId={activeStepId}
              isStepDimmed={range ? (step) => !focusedStepIds.has(step.id) : undefined}
              onSelectStep={setActiveStepId}
            />
          </div>
        </Variant>
        <PiTraceStripTimeVariant />
      </div>
    </GallerySection>
  );
}

function PiTraceInspectorGallery() {
  const errorStep = traceTurns[1].steps.find((step) => step.isError);
  const [tab, setTab] = useState<TraceInspectorTab>("Summary");

  return (
    <GallerySection title="PiTraceInspector">
      <VariantRow>
        <Variant caption="error tool step — Summary/Payload/Result tabs; Schema shows the honest unavailable state">
          <div className="h-96 w-96 overflow-hidden rounded-md border border-separator">
            {errorStep ? (
              <PiTraceInspector
                step={errorStep}
                tab={tab}
                turn={traceTurns[1]}
                onClose={() => {}}
                onTabChange={setTab}
              />
            ) : null}
          </div>
        </Variant>
        <Variant caption="tool step with a resolved Schema (Gateway capability)">
          <div className="h-96 w-96 overflow-hidden rounded-md border border-separator">
            <PiTraceInspector
              schema={{
                description: "Run a shell command inside the execution checkout.",
                parameters: {
                  type: "object",
                  properties: { command: { type: "string" } },
                  required: ["command"],
                },
              }}
              step={traceTurns[1].steps[1]}
              tab="Schema"
              turn={traceTurns[1]}
              onClose={() => {}}
              onTabChange={() => {}}
            />
          </div>
        </Variant>
      </VariantRow>
    </GallerySection>
  );
}

function DotMatrixGallery() {
  return (
    <GallerySection title="DotMatrix">
      <VariantRow>
        <Variant caption="size-4 (default)">
          <DotMatrix />
        </Variant>
        <Variant caption="size-6, primary">
          <DotMatrix className="size-6 text-primary" />
        </Variant>
        <Variant caption="size-8, danger">
          <DotMatrix className="size-8 text-danger" />
        </Variant>
      </VariantRow>
    </GallerySection>
  );
}

function IconsGallery() {
  return (
    <GallerySection title="Icons">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-2">
        {Object.entries(Icons).map(([name, Icon]) => (
          <div
            key={name}
            className="flex flex-col items-center gap-1 rounded-md border border-separator bg-surface p-2"
          >
            <Icon aria-hidden="true" className="size-4" />
            <span className="text-[10px] text-muted">{name}</span>
          </div>
        ))}
      </div>
    </GallerySection>
  );
}

function ChatMessageGallery() {
  return (
    <GallerySection title="ChatMessage">
      <div className="flex max-w-xl flex-col gap-4">
        <Variant caption="User bubble">
          <ChatMessage.User>
            <ChatMessage.Bubble>Explain this trace, please.</ChatMessage.Bubble>
          </ChatMessage.User>
        </Variant>
        <Variant caption="streaming, no action bar">
          <ChatMessage.Assistant>
            <ChatMessage.Body>
              <ChatMessage.Content>
                The session spent most of its budget in the planning turn.
              </ChatMessage.Content>
            </ChatMessage.Body>
          </ChatMessage.Assistant>
        </Variant>
        <Variant caption="Assistant with persist actions">
          <ChatMessage.Assistant>
            <ChatMessage.Body>
              <ChatMessage.Content>Actions stay visible after the turn settles.</ChatMessage.Content>
              <ChatMessageActions className="chat-message__actions--persist">
                <ChatMessageActions.Copy aria-label="Copy settled message" />
                <ChatMessageActions.ThumbsUp aria-label="Good response" />
                <ChatMessageActions.ThumbsDown aria-label="Bad response" />
              </ChatMessageActions>
            </ChatMessage.Body>
          </ChatMessage.Assistant>
        </Variant>
      </div>
    </GallerySection>
  );
}

const markdownFixture = [
  "**Bold**, `inline code`, and a [link](https://example.com).",
  "",
  "| Col A | Col B |",
  "| ----- | ----- |",
  "| 1     | 2     |",
].join("\n");

const headingScaleFixture = [
  "# First-level heading",
  "",
  "Body copy under `#`, for size, weight, and gap.",
  "",
  "## Second-level heading",
  "",
  "Same column, one step down.",
  "",
  "### Third-level heading",
  "",
  "#### Fourth-level heading",
  "",
  "Lower levels stay at body size so they do not shrink below the paragraph.",
].join("\n");

const streamingMarkdownFixture = [
  "### Streaming across syntaxes",
  "",
  "Chunks arrive with **bold**, _italic_, ~~strikethrough~~, `inline code`,",
  "and a [link](https://example.com) mid-sentence.",
  "",
  "1. Ordered steps reveal one by one",
  "2. While the parser keeps earlier blocks stable",
  "",
  "- [x] Task list item, already done",
  "- [ ] Still being typed out",
  "",
  "> A blockquote lands late enough to watch the incremental fade-in.",
  "",
  "```ts",
  "export function greet(name: string) {",
  "  return `hi ${name}`;",
  "}",
  "```",
  "",
  "| Stage | State |",
  "| ----- | ----- |",
  "| parse | incremental |",
  "| paint | fade-in |",
].join("\n");

const STREAM_CHUNK_CHARS = 24;
const STREAM_CHUNK_INTERVAL_MS = 60;

/**
 * Feeds the fixture to ChatStreamMarkdown in timed chunks so the gallery
 * exercises the real incremental-parse path, with a replay control because
 * the initial run is usually over before anyone scrolls here.
 */
function StreamingMarkdownDemo() {
  const [run, setRun] = useState(0);
  const [visibleChars, setVisibleChars] = useState(0);
  const isStreaming = visibleChars < streamingMarkdownFixture.length;

  useEffect(() => {
    setVisibleChars(0);
    const timer = setInterval(() => {
      setVisibleChars((chars) => {
        const next = chars + STREAM_CHUNK_CHARS;
        if (next >= streamingMarkdownFixture.length) {
          clearInterval(timer);
          return streamingMarkdownFixture.length;
        }
        return next;
      });
    }, STREAM_CHUNK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [run]);

  return (
    <div className="flex min-w-0 flex-col items-start gap-2">
      <Button
        label="Replay"
        size="sm"
        variant="secondary"
        onClick={() => setRun((current) => current + 1)}
      />
      <ChatStreamMarkdown isStreaming={isStreaming}>
        {streamingMarkdownFixture.slice(0, visibleChars)}
      </ChatStreamMarkdown>
    </div>
  );
}

function ChatMarkdownGallery() {
  return (
    <GallerySection title="ChatMarkdown">
      <div className="flex max-w-xl flex-col gap-4">
        <Variant caption="static GFM">
          <ChatMarkdown>{markdownFixture}</ChatMarkdown>
        </Variant>
        <Variant caption="heading scale">
          <ChatMarkdown>{headingScaleFixture}</ChatMarkdown>
        </Variant>
        <Variant caption="streaming (chunked delivery, Astryx incremental fade-in)">
          <StreamingMarkdownDemo />
        </Variant>
      </div>
    </GallerySection>
  );
}

function ChatCodeBlockGallery() {
  return (
    <GallerySection title="ChatCodeBlock">
      <div className="flex max-w-xl flex-col gap-4">
        <Variant caption="highlighted (typescript)">
          <ChatCodeBlock
            code={'export function greet(name: string) {\n  return `hi ${name}`;\n}'}
            language="typescript"
          />
        </Variant>
        <Variant caption="plaintext fallback">
          <ChatCodeBlock code="plain output, no language" />
        </Variant>
      </div>
    </GallerySection>
  );
}

const toolStates: ToolPartState[] = [
  "input-streaming",
  "input-available",
  "output-available",
  "output-error",
];

function ChatToolGallery() {
  return (
    <GallerySection title="ChatTool">
      <div className="flex max-w-xl flex-col gap-2">
        {toolStates.map((state) => (
          <Variant key={state} caption={`state=${state}`}>
            <ChatTool
              argsText={'{"path":"src/index.ts"}'}
              output={state === "output-error" ? "ENOENT: file not found" : "ok"}
              state={state}
              toolName="read_file"
            />
          </Variant>
        ))}
      </div>
    </GallerySection>
  );
}

function ChatToolGroupGallery() {
  return (
    <GallerySection title="ChatToolGroup">
      <div className="flex max-w-xl flex-col gap-2">
        <Variant caption="single call (inline row with target + duration)">
          <ChatToolGroup
            tools={[
              {
                toolCallId: "g1",
                toolName: "read_file",
                state: "output-available",
                argsText: '{"path":"src/index.ts"}',
                output: "ok",
                durationMs: 45,
              },
            ]}
          />
        </Variant>
        <Variant caption="multiple calls (collapsed into a group summary)">
          <ChatToolGroup
            tools={[
              {
                toolCallId: "g2",
                toolName: "bash",
                state: "output-available",
                argsText: '{"command":"git diff --stat"}',
                output: "3 files changed",
                durationMs: 340,
              },
              {
                toolCallId: "g3",
                toolName: "read_file",
                state: "output-available",
                argsText: '{"path":"src/utils/formatDate.ts"}',
                output: "ok",
                durationMs: 45,
              },
              {
                toolCallId: "g4",
                toolName: "edit",
                state: "output-error",
                argsText: '{"path":"src/utils/formatDate.ts"}',
                output: "patch failed to apply",
              },
              {
                toolCallId: "g5",
                toolName: "shell",
                state: "input-streaming",
                argsText: '{"command":"yarn test"}',
              },
            ]}
          />
        </Variant>
      </div>
    </GallerySection>
  );
}

function PromptInputDemo({
  caption,
  initialValue = "",
  ...promptProps
}: {
  caption: string;
  initialValue?: string;
  status?: "ready" | "submitted" | "streaming" | "error";
  lockInputOnRun?: boolean;
  error?: string;
}) {
  const [value, setValue] = useState(initialValue);

  return (
    <Variant caption={caption}>
      <div className="w-96">
        <ChatPromptInput
          placeholder="Ask anything"
          value={value}
          onStop={() => {}}
          onSubmit={() => setValue("")}
          onValueChange={setValue}
          {...promptProps}
        />
      </div>
    </Variant>
  );
}

function ChatPromptInputGallery() {
  return (
    <GallerySection title="ChatPromptInput">
      <VariantRow>
        <PromptInputDemo caption="status=ready (empty)" />
        <PromptInputDemo
          caption="status=ready (with text)"
          initialValue="Summarize the last run"
        />
        <PromptInputDemo caption="status=streaming" status="streaming" lockInputOnRun />
        <PromptInputDemo
          caption="status=error"
          error="Runtime rejected the prompt"
          status="error"
        />
      </VariantRow>
    </GallerySection>
  );
}

const queuedMessageLongBody =
  "顺便把 usage 页面上那个 KPI 卡片的 loading 骨架也统一一下,现在三个卡片的骨架高度不一致,切换 tab 的时候会跳。另外如果这次改动涉及 chat.css,记得同步更新 /design 页的注册项。";

function ChatQueuedMessageGallery() {
  return (
    <GallerySection title="ChatQueuedMessage">
      <div className="flex max-w-xl flex-col gap-2">
        <Variant caption="pending while a run is active (Steer + Withdraw)">
          <ChatQueuedMessage
            body="Also add a regression test for the reconnect path."
            onSteer={() => {}}
            onWithdraw={() => {}}
          />
        </Variant>
        <Variant caption="pending while idle (no Steer)">
          <ChatQueuedMessage
            body="Also add a regression test for the reconnect path."
            onWithdraw={() => {}}
          />
        </Variant>
        <Variant caption="long body truncates to one line (hover for full text)">
          <ChatQueuedMessage
            body={queuedMessageLongBody}
            onSteer={() => {}}
            onWithdraw={() => {}}
          />
        </Variant>
        <Variant caption="withdrawn">
          <ChatQueuedMessage body="An earlier follow-up." isWithdrawn />
        </Variant>
      </div>
    </GallerySection>
  );
}

function ChatPromptSuggestionGallery() {
  return (
    <GallerySection title="ChatPromptSuggestion">
      <VariantRow>
        <Variant caption="pills with end icon">
          <ChatPromptSuggestion>
            <ChatPromptSuggestion.Items>
              <ChatPromptSuggestion.Item onPress={() => {}}>
                Explain the cost spike
              </ChatPromptSuggestion.Item>
              <ChatPromptSuggestion.Item onPress={() => {}}>
                What did the agent read?
              </ChatPromptSuggestion.Item>
            </ChatPromptSuggestion.Items>
          </ChatPromptSuggestion>
        </Variant>
        <Variant caption="showEndIcon=false">
          <ChatPromptSuggestion>
            <ChatPromptSuggestion.Items>
              <ChatPromptSuggestion.Item showEndIcon={false} onPress={() => {}}>
                Plain pill
              </ChatPromptSuggestion.Item>
            </ChatPromptSuggestion.Items>
          </ChatPromptSuggestion>
        </Variant>
      </VariantRow>
    </GallerySection>
  );
}

function ChatChainOfThoughtGallery() {
  return (
    <GallerySection title="ChatChainOfThought">
      <div className="flex max-w-xl flex-col gap-4">
        <Variant caption='phase="thinking" (flat, status line)'>
          <ChatChainOfThought elapsedMs={3_200} phase="thinking">
            <ChatChainOfThought.Steps>
              <ChatChainOfThought.Step>
                <ChatThoughtStep step={liveThought} />
              </ChatChainOfThought.Step>
            </ChatChainOfThought.Steps>
          </ChatChainOfThought>
        </Variant>
        <Variant caption='phase="acting" (flat, status line)'>
          <ChatChainOfThought elapsedMs={26_400} phase="acting">
            <ChatChainOfThought.Steps>
              <ChatChainOfThought.Step>
                <ChatThoughtStep step={settledThought} />
              </ChatChainOfThought.Step>
              <ChatChainOfThought.Step>
                <ChatToolStep step={settledToolBurst} />
              </ChatChainOfThought.Step>
              <ChatChainOfThought.Step>
                <ChatToolStep step={liveToolStep} />
              </ChatChainOfThought.Step>
            </ChatChainOfThought.Steps>
          </ChatChainOfThought>
        </Variant>
        <Variant caption='phase="answering" (heartbeat gone, Interim Output in the list)'>
          <ChatChainOfThought elapsedMs={26_400} phase="answering">
            <ChatChainOfThought.Steps>
              <ChatChainOfThought.Step>
                <ChatThoughtStep step={settledThought} />
              </ChatChainOfThought.Step>
              <ChatChainOfThought.Step>
                <div className="chain-of-thought__interim">
                  <ChatThoughtMarkdown text="Let me read the ADR before answering." />
                </div>
              </ChatChainOfThought.Step>
              <ChatChainOfThought.Step>
                <ChatToolStep step={settledToolBurst} />
              </ChatChainOfThought.Step>
            </ChatChainOfThought.Steps>
          </ChatChainOfThought>
        </Variant>
        <Variant caption='phase="settled" (folded into the header)'>
          <ChatChainOfThought elapsedMs={16_400} phase="settled">
            <ChatChainOfThought.Steps>
              <ChatChainOfThought.Step>
                <ChatThoughtStep step={settledThought} />
              </ChatChainOfThought.Step>
              <ChatChainOfThought.Step>
                <ChatToolStep step={settledToolBurst} />
              </ChatChainOfThought.Step>
            </ChatChainOfThought.Steps>
          </ChatChainOfThought>
        </Variant>
        <Variant caption='phase="settled", expanded'>
          <ChatChainOfThought defaultExpanded elapsedMs={16_400} phase="settled">
            <ChatChainOfThought.Steps>
              <ChatChainOfThought.Step>
                <ChatThoughtStep step={settledThought} />
              </ChatChainOfThought.Step>
              <ChatChainOfThought.Step>
                <ChatToolStep step={settledToolBurst} />
              </ChatChainOfThought.Step>
            </ChatChainOfThought.Steps>
          </ChatChainOfThought>
        </Variant>
        <Variant caption='phase="settled", nothing to disclose'>
          <ChatChainOfThought elapsedMs={2_400} hasSteps={false} phase="settled" />
        </Variant>
      </div>
    </GallerySection>
  );
}

const liveThought: ChatThoughtStepItem = {
  kind: "thinking",
  id: "design-thought-live",
  live: true,
  text: "The fork remap never rewrites toolCallId, so the replay projection",
};

const settledThought: ChatThoughtStepItem = {
  kind: "thinking",
  id: "design-thought-settled",
  live: false,
  durationMs: 2400,
  text: "Looking at `remapEntryId` — **toolCallId is never remapped**.",
};

const liveToolStep: ChatToolStepItem = {
  kind: "tools",
  id: "design-tools-live",
  live: true,
  activeToolCallId: "design-live-2",
  tools: [
    {
      toolCallId: "design-live-1",
      toolName: "read",
      state: "output-available",
      durationMs: 180,
      argsText: JSON.stringify({ path: "packages/backend/src/workspace/fork.ts" }),
    },
    { toolCallId: "design-live-2", toolName: "bash", state: "input-available" },
  ],
};

const unnamedToolStep: ChatToolStepItem = {
  kind: "tools",
  id: "design-tools-unnamed",
  live: true,
  activeToolCallId: "design-unnamed-1",
  tools: [{ toolCallId: "design-unnamed-1", state: "input-streaming", argsText: '{"path":"pack' }],
};

const singleToolStep: ChatToolStepItem = {
  kind: "tools",
  id: "design-tools-single",
  live: false,
  tools: [
    {
      toolCallId: "design-single-1",
      toolName: "read",
      state: "output-available",
      durationMs: 320,
      argsText: JSON.stringify({ path: "packages/backend/src/workspace/fork.ts" }),
      output: "part.toolCallId  // never remapped",
    },
  ],
};

const settledToolBurst: ChatToolStepItem = {
  kind: "tools",
  id: "design-tools-burst",
  live: false,
  tools: [
    {
      toolCallId: "design-burst-1",
      toolName: "bash",
      state: "output-available",
      durationMs: 1240,
      argsText: JSON.stringify({ command: "bun vitest run apps/desktop/src/shared/ui/chat" }),
      output: "17 passed",
    },
    {
      toolCallId: "design-burst-2",
      toolName: "bash",
      state: "output-available",
      durationMs: 3100,
      argsText: JSON.stringify({ command: "bun run typecheck" }),
    },
    {
      toolCallId: "design-burst-3",
      toolName: "edit",
      state: "output-available",
      durationMs: 90,
      argsText: JSON.stringify({ path: "apps/desktop/src/shared/ui/chat/chat.css" }),
    },
    {
      toolCallId: "design-burst-4",
      toolName: "edit",
      state: "output-available",
      durationMs: 120,
      argsText: JSON.stringify({ path: "apps/desktop/src/shared/ui/chat/chat-tool-step.tsx" }),
    },
    {
      toolCallId: "design-burst-5",
      toolName: "edit",
      state: "output-available",
      durationMs: 110,
      argsText: JSON.stringify({ path: "apps/desktop/src/shared/ui/chat/chat-thought-step.tsx" }),
    },
  ],
};

const failedToolStep: ChatToolStepItem = {
  kind: "tools",
  id: "design-tools-failed",
  live: false,
  tools: [
    {
      toolCallId: "design-failed-1",
      toolName: "grep",
      state: "output-available",
      durationMs: 40,
      argsText: JSON.stringify({ pattern: "remapToolCallId" }),
    },
    {
      toolCallId: "design-failed-2",
      toolName: "bash",
      state: "output-error",
      durationMs: 210,
      argsText: JSON.stringify({ command: "bun run typecheck" }),
      output: "error TS2339: Property 'toolCallId' does not exist",
    },
  ],
};

function ChatPixelLoaderGallery() {
  return (
    <GallerySection title="ChatPixelLoader">
      <VariantRow>
        <Variant caption="periodMs=860 (default)">
          <span className="text-lg text-muted">
            <ChatPixelLoader />
          </span>
        </Variant>
        <Variant caption="periodMs=1600 (slowed)">
          <span className="text-lg text-muted">
            <ChatPixelLoader periodMs={1600} />
          </span>
        </Variant>
        <Variant caption="reduced motion: cells hold at rest (OS setting)">
          <span className="text-lg text-muted">
            <ChatPixelLoader />
          </span>
        </Variant>
      </VariantRow>
    </GallerySection>
  );
}

const PAGER_PAGES = ["Running read…", "Running bash…", "Ran a command, read a file"];

function ChatInlinePagerGallery() {
  const [page, setPage] = useState(0);

  return (
    <GallerySection title="ChatInlinePager">
      <VariantRow>
        <Variant caption="flips on demand, 700ms minimum dwell">
          <span className="inline-flex items-center gap-3 text-muted">
            <ChatInlinePager pageKey={`design-page-${page}`}>
              {PAGER_PAGES[page % PAGER_PAGES.length]}
            </ChatInlinePager>
            <Button
              label="Flip"
              size="sm"
              variant="secondary"
              onClick={() => setPage((current) => current + 1)}
            />
          </span>
        </Variant>
        <Variant caption="reduced motion: pages swap without a flip (OS setting)">
          <span className="text-muted">
            <ChatInlinePager pageKey="design-static">Ran a command, read a file</ChatInlinePager>
          </span>
        </Variant>
      </VariantRow>
    </GallerySection>
  );
}

function ChatThoughtStepGallery() {
  return (
    <GallerySection title="ChatThoughtStep">
      <div className="flex max-w-xl flex-col gap-3">
        <Variant caption="live">
          <ChatThoughtStep step={liveThought} />
        </Variant>
        <Variant caption="settled, with a body">
          <ChatThoughtStep step={settledThought} />
        </Variant>
        <Variant caption="settled, no body">
          <ChatThoughtStep step={{ ...settledThought, id: "design-thought-bare", text: "" }} />
        </Variant>
        <Variant caption="settled, under a second">
          <ChatThoughtStep
            step={{
              ...settledThought,
              id: "design-thought-brief",
              durationMs: 400,
              text: "",
            }}
          />
        </Variant>
        <Variant caption="settled, duration never measured">
          <ChatThoughtStep
            step={{
              kind: "thinking",
              id: "design-thought-unmeasured",
              live: false,
              text: "",
            }}
          />
        </Variant>
      </div>
    </GallerySection>
  );
}

function ChatToolStepGallery() {
  return (
    <GallerySection title="ChatToolStep">
      <div className="flex max-w-xl flex-col gap-3">
        <Variant caption="live, call named">
          <ChatToolStep step={liveToolStep} />
        </Variant>
        <Variant caption="live, name not known yet">
          <ChatToolStep step={unnamedToolStep} />
        </Variant>
        <Variant caption="settled, one call">
          <ChatToolStep step={singleToolStep} />
        </Variant>
        <Variant caption="settled, a burst">
          <ChatToolStep step={settledToolBurst} />
        </Variant>
        <Variant caption="settled, with a failure">
          <ChatToolStep step={failedToolStep} />
        </Variant>
      </div>
    </GallerySection>
  );
}

function ChatStatusLineGallery() {
  return (
    <GallerySection title="ChatStatusLine">
      <div className="flex max-w-xl flex-col gap-3">
        <Variant caption='phase="thinking"'>
          <ChatStatusLine elapsedMs={8200} phase="thinking" />
        </Variant>
        <Variant caption='phase="acting"'>
          <ChatStatusLine elapsedMs={26_400} phase="acting" />
        </Variant>
        <Variant caption="no anchor yet (retry gap)">
          <ChatStatusLine phase="thinking" />
        </Variant>
        <Variant caption="reduced motion: shimmer and heartbeat hold still (OS setting)">
          <ChatStatusLine elapsedMs={62_100} phase="acting" />
        </Variant>
      </div>
    </GallerySection>
  );
}

function ChatThoughtMarkdownGallery() {
  return (
    <GallerySection title="ChatThoughtMarkdown">
      <div className="flex max-w-xl flex-col gap-3">
        <Variant caption="inline emphasis and code">
          <p className="text-muted">
            <ChatThoughtMarkdown text="Looking at `remapEntryId` — **toolCallId is never remapped**." />
          </p>
        </Variant>
        <Variant caption="unclosed marker hidden">
          <p className="text-muted">
            <ChatThoughtMarkdown text="Decision: confirm by reading **" />
          </p>
        </Variant>
        <Variant caption="unwrap whole-line emphasis">
          <p className="text-muted">
            <ChatThoughtMarkdown unwrapLines text="**The failing assertion is in the test.**" />
          </p>
        </Variant>
      </div>
    </GallerySection>
  );
}

const railParts: ChainOfThoughtRailPart[] = [
  {
    kind: "thinking",
    id: "rail-t1",
    durationMs: 8200,
    text: "The failing assertion says the replay projection dropped the tool_call part after a fork — reading the projection code first.",
  },
  {
    kind: "tool",
    id: "rail-c1",
    tool: {
      toolName: "Read",
      toolCallId: "rail-call-1",
      state: "output-available",
      durationMs: 320,
      argsText: JSON.stringify({ path: "packages/backend/src/workspace/fork.ts" }),
      output: "77  remapEntryId(part.piEntryId)\n81  part.toolCallId  // never remapped",
    },
  },
  {
    kind: "tool",
    id: "rail-c2",
    tool: {
      toolName: "Bash",
      toolCallId: "rail-call-2",
      state: "output-error",
      durationMs: 12400,
      argsText: JSON.stringify({ command: "bun test packages/backend/src/workspace" }),
      output: "1 tests failed:\n  ✗ replays forked session [4012ms]",
    },
  },
  {
    kind: "thinking",
    id: "rail-t2",
    durationMs: 2100,
    text: "Root cause confirmed: toolCallId is never remapped on fork. Fixing.",
  },
  {
    kind: "tool",
    id: "rail-c3",
    tool: {
      toolName: "Grep",
      toolCallId: "rail-call-3",
      state: "input-streaming",
      argsText: JSON.stringify({ pattern: "remapToolCallId" }),
    },
  },
];

function ChatChainOfThoughtRailGallery() {
  return (
    <GallerySection title="ChatChainOfThoughtRail">
      <div className="flex max-w-xl flex-col gap-4">
        <Variant caption="expanded, settled — rounds with done/failed tools">
          <ChatChainOfThoughtRail
            defaultExpanded
            parts={railParts.slice(0, 4)}
            summary="Thought for 23s · 2 tool calls"
          />
        </Variant>
        <Variant caption="streaming — expanded by default, running tool pulses">
          <ChatChainOfThoughtRail
            isStreaming
            parts={railParts}
            summary="Thinking…"
          />
        </Variant>
        <Variant caption="collapsed, settled">
          <ChatChainOfThoughtRail
            parts={railParts.slice(0, 4)}
            summary="Thought for 23s · 2 tool calls"
          />
        </Variant>
      </div>
    </GallerySection>
  );
}

function ChatConversationGallery() {
  return (
    <GallerySection title="ChatConversation">
      <Variant caption="scrollable log, pinned to bottom">
        <div className="h-48 w-96 overflow-hidden rounded-md border border-separator">
          <ChatConversation aria-label="Demo conversation" className="h-full">
            <ChatConversation.Content>
              {Array.from({ length: 8 }, (_, index) => (
                <p key={index} className="px-3 py-1 text-sm text-foreground">
                  Message {index + 1} — enough copy to overflow the container.
                </p>
              ))}
            </ChatConversation.Content>
          </ChatConversation>
        </div>
      </Variant>
    </GallerySection>
  );
}

function TextShimmerGallery() {
  return (
    <GallerySection title="TextShimmer">
      <Variant caption="loading placeholder text">
        <TextShimmer>Waiting for the runtime…</TextShimmer>
      </Variant>
    </GallerySection>
  );
}

const modelSelectorControls: RuntimeModelControls = {
  models: [
    {
      provider: "anthropic",
      modelId: "claude-fable-5-thinking",
      name: "Claude Fable 5 Thinking (Extended Context Preview 2026-07)",
      thinkingLevels: ["off", "low", "medium", "high", "xhigh"],
      contextWindow: 1_000_000,
      maxTokens: 64_000,
      input: ["text", "image"],
    },
    {
      provider: "xai",
      modelId: "grok-4",
      name: "Grok 4",
      thinkingLevels: ["off", "medium", "high", "xhigh"],
      contextWindow: 256_000,
      maxTokens: 32_000,
      input: ["text", "image"],
    },
    {
      provider: "xai",
      modelId: "grok-4-fast",
      name: "Grok 4 Fast",
      thinkingLevels: ["off", "medium", "high"],
      contextWindow: 256_000,
      maxTokens: 32_000,
      input: ["text", "image"],
    },
    {
      provider: "moonshot",
      modelId: "kimi-k3",
      name: "Kimi K3",
      thinkingLevels: ["off"],
      contextWindow: 256_000,
      maxTokens: 32_000,
      input: ["text"],
    },
  ],
  selected: {
    provider: "xai",
    modelId: "grok-4",
    thinkingLevel: "high",
  },
};

const galleryThumb =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function ComposerInsertMenuGallery() {
  return (
    <GallerySection title="ComposerInsertMenu">
      <VariantRow>
        <Variant caption="files and commands">
          <ComposerInsertMenu onAttach={() => {}} onInsert={() => {}} />
        </Variant>
        <Variant caption="with skills and plugins">
          <ComposerInsertMenu
            plugins={[{ name: "browser" }]}
            skills={[{ name: "review-pr" }]}
            onAttach={() => {}}
            onInsert={() => {}}
          />
        </Variant>
      </VariantRow>
    </GallerySection>
  );
}

function ComposerAttachmentDrawerGallery() {
  return (
    <GallerySection title="ComposerAttachmentDrawer">
      <VariantRow>
        <Variant caption="images and text files">
          <div className="w-96">
            <ChatPromptInput
              drawer={
                <ComposerAttachmentDrawer
                  items={[
                    {
                      id: "img",
                      kind: "image",
                      name: "shot.png",
                      src: galleryThumb,
                    },
                    {
                      id: "txt",
                      kind: "text",
                      name: "notes.md",
                    },
                  ]}
                  onRemove={() => {}}
                />
              }
              hasAttachments
              placeholder="Ask anything"
              value=""
              onSubmit={() => {}}
              onValueChange={() => {}}
            />
          </div>
        </Variant>
        <Variant caption="text files only">
          <div className="w-96">
            <ChatPromptInput
              drawer={
                <ComposerAttachmentDrawer
                  items={[
                    { id: "a", kind: "text", name: "chat-prompt-input.tsx" },
                    { id: "b", kind: "text", name: "very-long-path-name.md" },
                  ]}
                  onRemove={() => {}}
                />
              }
              hasAttachments
              placeholder="Ask anything"
              value=""
              onSubmit={() => {}}
              onValueChange={() => {}}
            />
          </div>
        </Variant>
      </VariantRow>
    </GallerySection>
  );
}

function ContextUsageMeterGallery() {
  return (
    <GallerySection title="ContextUsageMeter">
      <VariantRow>
        <Variant caption="loading — runtime bound, nothing reported yet">
          <ContextUsageMeter usage={null} />
        </Variant>
        <Variant caption="normal (≤70%)">
          <ContextUsageMeter
            usage={{ tokens: 90_000, contextWindow: 200_000, percent: 45 }}
          />
        </Variant>
        <Variant caption="warning — past Pi's 70% threshold">
          <ContextUsageMeter
            usage={{ tokens: 156_000, contextWindow: 200_000, percent: 78 }}
          />
        </Variant>
        <Variant caption="critical — past 90%, compaction is imminent">
          <ContextUsageMeter
            usage={{ tokens: 188_000, contextWindow: 200_000, percent: 94 }}
          />
        </Variant>
        <Variant caption="tokens null — just compacted, count unknown, never a fake 0">
          <ContextUsageMeter
            usage={{ tokens: null, contextWindow: 200_000, percent: null }}
          />
        </Variant>
        <Variant caption="compacting — says so instead of a share it no longer holds">
          <ContextUsageMeter
            isCompacting
            usage={{ tokens: 188_000, contextWindow: 200_000, percent: 94 }}
          />
        </Variant>
      </VariantRow>
      <VariantRow>
        <Variant caption="on the composer footer line (its production placement)">
          <div className="w-[32rem]">
            <ChatPromptInput
              footer={
                <span className="flex items-center justify-end">
                  <ContextUsageMeter
                    usage={{ tokens: 156_000, contextWindow: 200_000, percent: 78 }}
                  />
                </span>
              }
              placeholder="Ask anything"
              value=""
              onSubmit={() => {}}
              onValueChange={() => {}}
            />
          </div>
        </Variant>
      </VariantRow>
    </GallerySection>
  );
}

function ModelSelectorControlGallery() {
  return (
    <GallerySection title="ModelSelectorControl">
      <VariantRow>
        <Variant caption="default — open for search, flyout, Fast Mode">
          <ModelSelectorControl
            controls={modelSelectorControls}
            isLocked={false}
            onChange={() => {}}
          />
        </Variant>
        <Variant caption="locked while a run is active">
          <ModelSelectorControl
            controls={modelSelectorControls}
            isLocked
            onChange={() => {}}
          />
        </Variant>
        <Variant caption="fast variant selected — bolt in the trigger">
          <ModelSelectorControl
            controls={{
              ...modelSelectorControls,
              selected: {
                provider: "xai",
                modelId: "grok-4-fast",
                thinkingLevel: "medium",
              },
            }}
            isLocked={false}
            onChange={() => {}}
          />
        </Variant>
        <Variant caption="Settings visibility — hidden selection marked, Add Models live">
          <ModelSelectorControl
            controls={modelSelectorControls}
            isLocked={false}
            visibleModels={[{ provider: "moonshot", modelId: "kimi-k3" }]}
            onChange={() => {}}
            onManageModels={() => {}}
          />
        </Variant>
      </VariantRow>
    </GallerySection>
  );
}

export function DesignComponentsLayer() {
  return (
    <>
      <PiKpiGallery />
      <PiBarChartGallery />
      <PiSheetGallery />
      <SessionInspectorGallery />
      <BrowserSurfaceGallery />
      <TerminalViewGallery />
      <PiTraceLedgerGallery />
      <PiTraceStripGallery />
      <PiTraceInspectorGallery />
      <DotMatrixGallery />
      <IconsGallery />
      <ChatMessageGallery />
      <ChatMarkdownGallery />
      <ChatCodeBlockGallery />
      <ChatToolGallery />
      <ChatToolGroupGallery />
      <ChatPromptInputGallery />
      <ChatQueuedMessageGallery />
      <ChatPromptSuggestionGallery />
      <ChatChainOfThoughtGallery />
      <ChatPixelLoaderGallery />
      <ChatInlinePagerGallery />
      <ChatThoughtStepGallery />
      <ChatToolStepGallery />
      <ChatStatusLineGallery />
      <ChatThoughtMarkdownGallery />
      <ChatChainOfThoughtRailGallery />
      <ChatConversationGallery />
      <TextShimmerGallery />
      <ContextUsageMeterGallery />
      <ModelSelectorControlGallery />
      <ComposerInsertMenuGallery />
      <ComposerAttachmentDrawerGallery />
    </>
  );
}
