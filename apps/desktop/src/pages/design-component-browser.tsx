import { useState, type ComponentType } from "react";
import { Layout, LayoutContent, LayoutPanel } from "@astryxdesign/core/Layout";
import { SideNav, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Button } from "@astryxdesign/core/Button";
import { useMediaQuery } from "@astryxdesign/core/hooks";

export type ComponentCategory =
  | "Data & metrics"
  | "Conversation"
  | "Composer"
  | "Reasoning & tools"
  | "Workspace & trace"
  | "Visual primitives";

export interface ComponentExample {
  name: string;
  category: ComponentCategory;
  description: string;
  Preview: ComponentType;
}

const categories: ComponentCategory[] = [
  "Data & metrics", "Conversation", "Composer", "Reasoning & tools",
  "Workspace & trace", "Visual primitives",
];

export function DesignComponentBrowser({ entries }: { entries: ComponentExample[] }) {
  const [query, setQuery] = useState("");
  const [selectedName, setSelectedName] = useState(entries[0]?.name);
  const isNarrow = useMediaQuery("(max-width: 56rem)");
  const words = query.trim().toLowerCase().split(/\s+/);
  const matches = entries.filter((entry) => {
    const text = `${entry.name} ${entry.category} ${entry.description}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
  // Search always exposes a matching preview, without losing the prior selection.
  const selected = matches.find((entry) => entry.name === selectedName) ?? matches[0];

  const directory = (
    <VStack gap={4} style={{ minHeight: 0, height: "100%" }}>
      <TextInput
        label="Search components"
        placeholder="Name, purpose, or category…"
        value={query}
        onChange={setQuery}
        hasClear
      />
      <Text type="supporting" role="status">
        {query.trim() ? `${matches.length} of ${entries.length} components` : `${entries.length} components · ${categories.length} categories`}
      </Text>
      <SideNav aria-label="Component catalog" style={{ width: "100%", minHeight: 0, flex: 1 }}>
        {categories.map((category) => {
          const items = matches.filter((entry) => entry.category === category);
          return items.length ? (
            <SideNavSection key={category} title={category} endContent={<Text type="supporting" hasTabularNumbers>{items.length}</Text>}>
              {items.map((entry) => (
                <SideNavItem
                  key={entry.name}
                  label={entry.name}
                  isSelected={entry.name === selected?.name}
                  onClick={() => setSelectedName(entry.name)}
                />
              ))}
            </SideNavSection>
          ) : null;
        })}
      </SideNav>
    </VStack>
  );

  return (
    <VStack gap={4} data-testid="component-browser" style={{ minWidth: 0 }}>
      <HStack gap={4} hAlign="between" vAlign="center" wrap="wrap">
        <VStack gap={1}>
          <Heading level={2}>Component library</Heading>
          <Text type="supporting">Browse by purpose. Select a component to explore its variants and states.</Text>
        </VStack>
      </HStack>
      <Layout
        height={isNarrow ? "auto" : "fill"}
        style={{
          height: isNarrow ? "auto" : "max(calc(var(--spacing-12) * 12), calc(100dvh - var(--spacing-12) * 5))",
          minWidth: 0,
          border: "var(--border-width-1, thin) solid var(--separator)",
          borderRadius: "var(--radius-container)",
          overflow: "hidden",
          background: "var(--surface)",
        }}
        start={isNarrow ? undefined : (
          <LayoutPanel width="calc(var(--spacing-12) * 5 + var(--spacing-5))" padding={4} hasDivider isScrollable={false}>
            {directory}
          </LayoutPanel>
        )}
        header={isNarrow ? (
          <VStack padding={4} height="calc(var(--spacing-12) * 7)">{directory}</VStack>
        ) : undefined}
      >
        <LayoutContent padding={isNarrow ? 3 : 6} key={selected?.name ?? "empty"}>
          {selected ? (
            <VStack gap={6} style={{ minWidth: 0 }}>
              <VStack gap={2}>
                <Text type="supporting">{selected.category}</Text>
                <Text type="large">{selected.description}</Text>
                <Text type="supporting">Live examples · interact with each preview below</Text>
              </VStack>
              <selected.Preview />
            </VStack>
          ) : (
            <VStack gap={3} padding={6} hAlign="start">
              <Heading level={3}>No components found</Heading>
              <Text type="supporting">Try a component name or a purpose such as composer, tools, or metrics.</Text>
              <Button label="Clear search" variant="secondary" onClick={() => setQuery("")} />
            </VStack>
          )}
        </LayoutContent>
      </Layout>
    </VStack>
  );
}
