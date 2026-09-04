// PROTO cot-live — one-line viewport with paced flips. Now used only for the
// running-tool name inside a live tool step; thinking no longer pages.

import { useEffect, useRef, useState, type ReactNode } from "react";

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type Page = { key: string; node: ReactNode };

/**
 * A new pageKey flips immediately if the current page has been shown for at
 * least `dwellMs`; otherwise it waits out the remainder and then flips straight
 * to whatever is latest, dropping pages that arrived in between. Same-key
 * updates always land in place.
 */
export function ProtoLive({
  children,
  className = "",
  pageKey = "",
  dwellMs,
}: {
  children: ReactNode;
  className?: string;
  pageKey?: string;
  dwellMs: number;
}) {
  const [shown, setShown] = useState<Page>({ key: pageKey, node: children });
  const [outgoing, setOutgoing] = useState<ReactNode>(null);
  const shownRef = useRef<Page>({ key: pageKey, node: children });
  const latestRef = useRef<Page>({ key: pageKey, node: children });
  const shownAtRef = useRef(performance.now());
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    latestRef.current = { key: pageKey, node: children };

    if (pageKey === shownRef.current.key) {
      shownRef.current = { key: pageKey, node: children };
      setShown(shownRef.current);
      return;
    }

    const flip = () => {
      const previous = shownRef.current;
      const next = latestRef.current;
      shownRef.current = next;
      shownAtRef.current = performance.now();
      setShown(next);
      // animation: none under reduced motion, so onAnimationEnd never fires.
      setOutgoing(prefersReducedMotion() ? null : previous.node);
    };

    if (timerRef.current !== null) {
      return;
    }
    const remaining = dwellMs - (performance.now() - shownAtRef.current);
    if (remaining <= 0) {
      flip();
      return;
    }
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      if (latestRef.current.key !== shownRef.current.key) {
        flip();
      }
    }, remaining);
  }, [pageKey, children, dwellMs]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  return (
    <span className={`chain-of-thought__live proto-live ${className}`.trim()} data-slot="chain-of-thought-live">
      <span className="chain-of-thought__flip proto-live__flip">
        {outgoing ? (
          <span
            className="chain-of-thought__flip-page proto-live__page"
            data-motion="out"
            onAnimationEnd={() => setOutgoing(null)}
          >
            {outgoing}
          </span>
        ) : null}
        <span className="chain-of-thought__flip-page proto-live__page" data-motion={outgoing ? "in" : undefined}>
          {shown.node}
        </span>
      </span>
    </span>
  );
}
