import type { ComponentType, CSSProperties } from "react";
import { Anthropic, DeepSeek, Grok, OpenAI } from "@lobehub/icons";
import type { ProviderAuthId } from "@pigui/core";

type GlyphIcon = ComponentType<{
  size?: number | string;
  className?: string;
  style?: CSSProperties;
}>;

type ProviderBrand = {
  /** Mono mark (currentColor). */
  Mono: GlyphIcon;
  /** Optional multi-color SVG when LobeHub ships one. */
  Color?: GlyphIcon;
  /** Badge background (brand surface). */
  background: string;
  /** Glyph color when using Mono (ignored for Color). */
  foreground: string;
  /** Optional hairline so light badges read on white cards. */
  ring?: string;
};

/**
 * Brand treatment from @lobehub/icons constants / Color variants.
 * Mono alone is flat black — wrap in brand surface + tint (or Color path).
 */
const providerBrands: Record<ProviderAuthId, ProviderBrand> = {
  openai: {
    Mono: OpenAI,
    // Official OpenAI: light surface + black mark (#000) — not inverted black badge.
    background: "#ffffff",
    foreground: OpenAI.colorPrimary || "#000000",
    ring: "0 0 0 1px rgba(0,0,0,0.12)",
  },
  "openai-codex": {
    Mono: OpenAI,
    background: "#ffffff",
    foreground: OpenAI.colorPrimary || "#000000",
    ring: "0 0 0 1px rgba(0,0,0,0.12)",
  },
  anthropic: {
    Mono: Anthropic,
    // LobeHub Anthropic avatar pair: cream surface + near-black mark.
    background: Anthropic.colorPrimary || "#F1F0E8",
    foreground: "#141413",
  },
  deepseek: {
    Mono: DeepSeek,
    Color: DeepSeek.Color,
    background: "color-mix(in srgb, #4D6BFE 14%, transparent)",
    foreground: DeepSeek.colorPrimary || "#4D6BFE",
  },
  xai: {
    // Grok mark for xAI/Grok provider.
    Mono: Grok,
    background: Grok.colorPrimary === "#000" || !Grok.colorPrimary ? "#111111" : Grok.colorPrimary,
    foreground: "#ffffff",
  },
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
  const brand = providerBrands[providerId];

  if (!brand) {
    return null;
  }

  const Icon = brand.Color ?? brand.Mono;
  const usesColorSvg = Boolean(brand.Color);

  return (
    <span
      aria-hidden
      data-testid={`provider-icon-${providerId}`}
      data-provider-brand={providerId}
      className={
        className ??
        "inline-flex size-9 shrink-0 items-center justify-center rounded-lg"
      }
      style={{
        backgroundColor: brand.background,
        color: usesColorSvg ? undefined : brand.foreground,
        boxShadow: brand.ring,
      }}
    >
      <Icon size={size} />
    </span>
  );
}
