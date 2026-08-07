import type { ComponentType, CSSProperties } from "react";
import { Anthropic, DeepSeek, OpenAI, XAI } from "@lobehub/icons";
import type { ProviderAuthId } from "@pigui/core";

type MonoIcon = ComponentType<{
  size?: number | string;
  className?: string;
  style?: CSSProperties;
}>;

const providerIcons: Record<ProviderAuthId, MonoIcon> = {
  openai: OpenAI,
  anthropic: Anthropic,
  deepseek: DeepSeek,
  // Grok is xAI — brand mark from lobe-icons XAI set.
  xai: XAI,
};

export function ProviderIcon({
  providerId,
  size = 20,
  className,
}: {
  providerId: ProviderAuthId;
  size?: number;
  className?: string;
}) {
  const Icon = providerIcons[providerId];

  if (!Icon) {
    return null;
  }

  return (
    <span
      aria-hidden
      data-testid={`provider-icon-${providerId}`}
      className={
        className ??
        "inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-secondary text-foreground"
      }
    >
      <Icon size={size} />
    </span>
  );
}
