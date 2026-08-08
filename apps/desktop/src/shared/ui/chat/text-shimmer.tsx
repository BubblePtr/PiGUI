import type { ReactNode } from "react";

/**
 * CSS-only shimmer for short loading/brand text. The gradient sweep lives in
 * chat.css so the component stays a single styled span.
 */
export function TextShimmer({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`text-shimmer ${className}`.trim()} data-slot="text-shimmer">
      {children}
    </span>
  );
}
