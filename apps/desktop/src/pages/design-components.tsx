import { useState, type ReactNode } from "react";
import { GallerySection } from "@/pages/design";
import { DotMatrix } from "@/shared/ui/dot-matrix";
import { PiBarChart } from "@/shared/ui/pi-bar-chart";
import { PiKpi } from "@/shared/ui/pi-kpi";
import { PiSheet } from "@/shared/ui/pi-sheet";
import { ChatChainOfThought } from "@/shared/ui/chat/chat-chain-of-thought";
import { ChatCodeBlock } from "@/shared/ui/chat/chat-code-block";
import { ChatConversation } from "@/shared/ui/chat/chat-conversation";
import { ChatMarkdown, ChatStreamMarkdown } from "@/shared/ui/chat/chat-markdown";
import { ChatMessage, ChatMessageActions } from "@/shared/ui/chat/chat-message";
import { ChatPromptInput } from "@/shared/ui/chat/chat-prompt-input";
import { ChatPromptSuggestion } from "@/shared/ui/chat/chat-prompt-suggestion";
import { ChatTool, type ToolPartState } from "@/shared/ui/chat/chat-tool";
import { TextShimmer } from "@/shared/ui/chat/text-shimmer";
import { Button } from "@astryxdesign/core/Button";
import * as Icons from "@/shared/ui/icons";

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
      </VariantRow>
    </GallerySection>
  );
}

function PiSheetGallery() {
  const [isOpen, setIsOpen] = useState(false);

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
        <Variant caption="Assistant with actions">
          <ChatMessage.Assistant>
            <ChatMessage.Body>
              <ChatMessage.Content>
                The session spent most of its budget in the planning turn.
              </ChatMessage.Content>
              <ChatMessageActions>
                <ChatMessageActions.Copy aria-label="Copy message" />
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

function ChatMarkdownGallery() {
  return (
    <GallerySection title="ChatMarkdown">
      <div className="flex max-w-xl flex-col gap-4">
        <Variant caption="static GFM">
          <ChatMarkdown>{markdownFixture}</ChatMarkdown>
        </Variant>
        <Variant caption="streaming with caret">
          <ChatStreamMarkdown caret="block" isStreaming>
            Streaming tokens arrive here
          </ChatStreamMarkdown>
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

function PromptInputDemo({
  caption,
  initialValue = "",
  ...promptProps
}: {
  caption: string;
  initialValue?: string;
  status?: "ready" | "submitted" | "streaming" | "error";
  lockInputOnRun?: boolean;
}) {
  const [value, setValue] = useState(initialValue);

  return (
    <Variant caption={caption}>
      <div className="w-96">
        <ChatPromptInput
          value={value}
          onStop={() => {}}
          onSubmit={() => setValue("")}
          onValueChange={setValue}
          {...promptProps}
        >
          <ChatPromptInput.Shell>
            <ChatPromptInput.Content>
              <ChatPromptInput.TextArea placeholder="Ask anything" />
            </ChatPromptInput.Content>
            <ChatPromptInput.Toolbar>
              <ChatPromptInput.ToolbarStart />
              <ChatPromptInput.ToolbarEnd>
                <ChatPromptInput.Send />
              </ChatPromptInput.ToolbarEnd>
            </ChatPromptInput.Toolbar>
          </ChatPromptInput.Shell>
        </ChatPromptInput>
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
        <PromptInputDemo caption="status=error" status="error" />
      </VariantRow>
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
        <Variant caption="expanded, settled">
          <ChatChainOfThought defaultExpanded>
            <ChatChainOfThought.Trigger>Thought for 8s</ChatChainOfThought.Trigger>
            <ChatChainOfThought.Content>
              <ChatChainOfThought.Steps>
                <ChatChainOfThought.Step label="Reading the trace">
                  Scanned 14 runtime events.
                </ChatChainOfThought.Step>
                <ChatChainOfThought.Step label="Comparing token budgets" />
              </ChatChainOfThought.Steps>
            </ChatChainOfThought.Content>
          </ChatChainOfThought>
        </Variant>
        <Variant caption="collapsed, streaming">
          <ChatChainOfThought isStreaming>
            <ChatChainOfThought.Trigger>
              <TextShimmer>Thinking…</TextShimmer>
            </ChatChainOfThought.Trigger>
            <ChatChainOfThought.Content>
              <ChatChainOfThought.Steps>
                <ChatChainOfThought.Step label="Working" />
              </ChatChainOfThought.Steps>
            </ChatChainOfThought.Content>
          </ChatChainOfThought>
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
            <ChatConversation.ScrollAnchor />
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

export function DesignComponentsLayer() {
  return (
    <>
      <PiKpiGallery />
      <PiBarChartGallery />
      <PiSheetGallery />
      <DotMatrixGallery />
      <IconsGallery />
      <ChatMessageGallery />
      <ChatMarkdownGallery />
      <ChatCodeBlockGallery />
      <ChatToolGallery />
      <ChatPromptInputGallery />
      <ChatPromptSuggestionGallery />
      <ChatChainOfThoughtGallery />
      <ChatConversationGallery />
      <TextShimmerGallery />
    </>
  );
}
