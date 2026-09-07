import type { ComponentProps, ReactNode } from "react";

/**
 * CSS-only shimmer for short loading/brand text. The gradient sweep lives in
 * chat.css so the component stays a single styled span.
 */
export type TextShimmerProps = ComponentProps<"span"> & {
  children: ReactNode;
};

export function TextShimmer({
  children,
  className = "",
  ...rest
}: TextShimmerProps) {
  return (
    <span className={`text-shimmer ${className}`.trim()} data-slot="text-shimmer" {...rest}>
      {children}
    </span>
  );
}
