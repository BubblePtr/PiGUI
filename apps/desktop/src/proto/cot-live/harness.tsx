// PROTO cot-live — /proto/cot-live. Replays a scripted Active Run through the
// ADR-0030 CoT block with a virtual clock. Throwaway; deleted in Phase 7.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppFrame } from "@/app/app-shell";
import { ChatConversation } from "@/shared/ui/chat/chat-conversation";
import { ChatMarkdown, ChatStreamMarkdown } from "@/shared/ui/chat/chat-markdown";
import { ChatMessage, ChatMessageActions } from "@/shared/ui/chat/chat-message";
import { ProtoCotBlock, type RunLayout } from "./cot-block";
import { deriveCot, foldEvents } from "./model";
import { buildScript } from "./script";
import "./proto.css";

const SPEEDS = [0.5, 1, 2, 4, 8] as const;

function useVirtualClock(durationMs: number) {
  const [nowMs, setNowMs] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(2);
  const frame = useRef<number | null>(null);
  const last = useRef<number | null>(null);
  const nowRef = useRef(0);

  useEffect(() => {
    if (!playing) {
      last.current = null;
      return;
    }
    const tick = (wall: number) => {
      if (last.current !== null) {
        const next = Math.min(durationMs, nowRef.current + (wall - last.current) * speed);
        nowRef.current = next;
        setNowMs(next);
        if (next >= durationMs) {
          setPlaying(false);
          return;
        }
      }
      last.current = wall;
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [playing, speed, durationMs]);

  const seek = useCallback((ms: number) => {
    nowRef.current = ms;
    setNowMs(ms);
  }, []);

  const restart = useCallback(() => {
    seek(0);
    setPlaying(true);
  }, [seek]);

  return { nowMs, playing, setPlaying, speed, setSpeed, seek, restart };
}

export function CotLiveProtoPage() {
  const script = useMemo(() => buildScript(), []);
  const clock = useVirtualClock(script.durationMs);
  const [runLayout, setRunLayout] = useState<RunLayout>("flat");
  const [flipMs, setFlipMs] = useState(300);
  const [dwellMs, setDwellMs] = useState(700);
  const [pixelMs, setPixelMs] = useState(650);
  const [copied, setCopied] = useState(false);

  const state = useMemo(() => foldEvents(script.events, clock.nowMs), [script.events, clock.nowMs]);
  const view = useMemo(() => deriveCot(state, clock.nowMs), [state, clock.nowMs]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && /INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
      if (event.key === " ") {
        event.preventDefault();
        clock.setPlaying((p) => !p);
      } else if (event.key === "r" || event.key === "R") {
        clock.restart();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clock]);

  const config = `flip: ${flipMs}ms · dwell: ${dwellMs}ms · pixel: ${pixelMs}ms · during run: ${runLayout}`;

  const isStreaming = view.phase !== "settled" && view.phase !== "hidden";

  return (
    <AppFrame showSidebar={false}>
      <div
        className="flex h-full min-h-0 flex-col"
        style={
          {
            // Keep the centered chat column clear of the fixed control panel
            // (inline: this dir is outside Tailwind's source scan).
            paddingRight: 300,
            "--proto-flip-ms": `${flipMs}ms`,
            "--proto-pixel-ms": `${pixelMs}ms`,
          } as React.CSSProperties
        }
      >
        <ChatConversation aria-label="Prototype chat" className="min-h-0 flex-1" isStreaming={isStreaming}>
          <ChatConversation.Content className="mx-auto flex w-full max-w-[44rem] flex-col gap-8 px-4 pb-24 pt-6">
            <ChatMessage.User>
              <ChatMessage.Bubble>
                <ChatMessage.Content>
                  把「Thought for Ns」的口径改成到回答开始为止的等待时间，包含工具执行，不含写回答的时间。改完把相关测试跑一遍。
                </ChatMessage.Content>
              </ChatMessage.Bubble>
            </ChatMessage.User>
            <ChatMessage.Assistant>
              <ChatMessage.Body>
                <ProtoCotBlock
                  view={view}
                  runLayout={runLayout}
                  // A page must stay at least as long as the flip takes, or
                  // flips would interrupt each other again.
                  dwellMs={Math.max(dwellMs, flipMs)}
                />
                {view.answer ? (
                  <ChatMessage.Content className="proto-answer">
                    {view.answer.streaming ? (
                      <ChatStreamMarkdown isStreaming>{view.answer.text}</ChatStreamMarkdown>
                    ) : (
                      <ChatMarkdown>{view.answer.text}</ChatMarkdown>
                    )}
                  </ChatMessage.Content>
                ) : null}
                {view.phase === "settled" ? (
                  <ChatMessageActions className="chat-message__actions--persist">
                    <ChatMessageActions.Copy aria-label="Copy" tooltip="Copy" />
                    <ChatMessageActions.ThumbsUp aria-label="Good response" tooltip="Good response" />
                    <ChatMessageActions.ThumbsDown aria-label="Bad response" tooltip="Bad response" />
                  </ChatMessageActions>
                ) : null}
              </ChatMessage.Body>
            </ChatMessage.Assistant>
          </ChatConversation.Content>
        </ChatConversation>
      </div>

      <aside className="proto-panel" aria-label="Prototype controls">
        <h2>cot-live</h2>
        <div className="proto-panel__row">
          <span>
            phase <span className="proto-panel__phase" data-phase={view.phase}>{view.phase}</span>
          </span>
          <output>{(clock.nowMs / 1000).toFixed(1)}s</output>
        </div>
        <input
          aria-label="Scrub"
          className="proto-panel__scrub"
          max={script.durationMs}
          min={0}
          step={50}
          type="range"
          value={clock.nowMs}
          onChange={(event) => {
            clock.setPlaying(false);
            clock.seek(Number(event.target.value));
          }}
        />
        <div className="proto-panel__row">
          <button type="button" onClick={() => clock.setPlaying((p) => !p)}>
            {clock.playing ? "Pause" : "Play"} <span aria-hidden="true">(space)</span>
          </button>
          <button type="button" onClick={clock.restart}>
            Restart <span aria-hidden="true">(R)</span>
          </button>
          <select
            aria-label="Speed"
            value={clock.speed}
            onChange={(event) => clock.setSpeed(Number(event.target.value) as (typeof SPEEDS)[number])}
          >
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </div>
        <div className="proto-panel__row">
          <label htmlFor="proto-flip">flip</label>
          <input
            id="proto-flip"
            max={600}
            min={120}
            step={10}
            type="range"
            value={flipMs}
            onChange={(event) => setFlipMs(Number(event.target.value))}
          />
          <output>{flipMs}ms</output>
        </div>
        <div className="proto-panel__row">
          <label htmlFor="proto-dwell">dwell</label>
          <input
            id="proto-dwell"
            max={1500}
            min={0}
            step={50}
            type="range"
            value={dwellMs}
            onChange={(event) => setDwellMs(Number(event.target.value))}
          />
          <output>{dwellMs}ms</output>
        </div>
        <div className="proto-panel__row">
          <label htmlFor="proto-pixel">pixel</label>
          <input
            id="proto-pixel"
            max={1400}
            min={300}
            step={10}
            type="range"
            value={pixelMs}
            onChange={(event) => setPixelMs(Number(event.target.value))}
          />
          <output>{pixelMs}ms</output>
        </div>
        <div className="proto-panel__row">
          <span>during run</span>
          <span>
            <button aria-pressed={runLayout === "flat"} type="button" onClick={() => setRunLayout("flat")}>
              flat
            </button>{" "}
            <button
              aria-pressed={runLayout === "collapsed"}
              type="button"
              onClick={() => setRunLayout("collapsed")}
            >
              collapsed
            </button>
          </span>
        </div>
        <pre className="proto-panel__config">{config}</pre>
        <div className="proto-panel__row">
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(config);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? "Copied ✓" : "Copy config"}
          </button>
        </div>
      </aside>
    </AppFrame>
  );
}
