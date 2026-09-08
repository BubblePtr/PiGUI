import type { ComponentProps } from "react";

export function PaceWordmark({ className = "h-6", ...rest }: ComponentProps<"svg">) {
  return (
    <svg
      aria-label="Pace"
      role="img"
      viewBox="0 0 824 180"
      fill="currentColor"
      className={`block w-auto shrink-0 ${className}`}
      {...rest}
    >
      <path d="M0 0H132L160 28V84L132 112H28V180H0V84H28H120L132 72V40L120 28H0V0Z" />
      <path d="M216 180L284 0H316L384 180H352L300 44L248 180H216Z" />
      <path d="M608 0H476L448 28V152L476 180H608V152H488L476 140V40L488 28H608V0Z" />
      <path d="M824 0H664V28H824V0Z" />
      <path d="M796 76H664V104H796V76Z" />
      <path d="M824 152H664V180H824V152Z" />
    </svg>
  );
}
