import { Divider } from "@astryxdesign/core/Divider";
import { Link } from "@astryxdesign/core/Link";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { useState } from "react";
import {
  changelogReleases,
  type ChangelogRelease,
} from "@/entities/release/changelog";
import { invoke, isElectronRuntime } from "@/shared/runtime";
import { Circle } from "@/shared/ui/icons";

const changeGroups = [
  { kind: "added", label: "New features" },
  { kind: "improved", label: "Improvements" },
  { kind: "fixed", label: "Fixes" },
] as const;

const releaseDateFormat = new Intl.DateTimeFormat("en", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export function ChangelogSection({
  releases = changelogReleases,
}: {
  releases?: readonly ChangelogRelease[];
}) {
  const [failedVersion, setFailedVersion] = useState<string | null>(null);
  const sortedReleases = [...releases].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <VStack as="section" aria-labelledby="settings-changelog-heading" gap={6}>
      <VStack gap={2}>
        <Heading level={2} id="settings-changelog-heading">
          Changelog
        </Heading>
        <Text as="p" type="supporting">
          What’s new in PiGUI, release by release.
        </Text>
      </VStack>
      <VStack as="ol" aria-label="Release history" gap={0} style={{ listStyle: "none" }}>
        {sortedReleases.map((release, index) => (
          <HStack as="li" key={release.version} gap={4} vAlign="stretch">
            <VStack
              aria-hidden="true"
              gap={2}
              hAlign="center"
              width="var(--spacing-4)"
              style={{ flexShrink: 0, paddingBlockStart: "var(--spacing-1)" }}
            >
              <Circle
                fill={index === 0 ? "currentColor" : "none"}
                style={{
                  width: "var(--spacing-3)",
                  height: "var(--spacing-3)",
                  flexShrink: 0,
                  color: index === 0 ? "var(--primary)" : "var(--muted)",
                }}
              />
              <Divider orientation="vertical" style={{ flex: 1 }} />
            </VStack>
            <VStack
              as="article"
              aria-labelledby={`release-${release.version}`}
              gap={5}
              style={{ minWidth: 0, flex: 1, paddingBlockEnd: "var(--spacing-8)" }}
            >
              <VStack gap={2}>
                <Text type="supporting" hasTabularNumbers>
                  <time dateTime={release.date}>
                    {releaseDateFormat.format(new Date(release.date))}
                  </time>
                </Text>
                <HStack gap={3} vAlign="center" wrap="wrap">
                  <Heading level={3} id={`release-${release.version}`}>
                    v{release.version}
                  </Heading>
                  {index === 0 ? <Token label="Latest" size="sm" /> : null}
                </HStack>
                <Text as="p" weight="semibold">{release.title}</Text>
                <Text as="p" type="supporting">{release.summary}</Text>
              </VStack>
              {changeGroups.map(({ kind, label }) => {
                const changes = release.changes.filter((change) => change.kind === kind);
                if (changes.length === 0) return null;
                return (
                  <VStack key={kind} gap={3}>
                    <Heading level={4}>{label}</Heading>
                    <VStack as="ul" gap={3} aria-label={label} style={{ listStyle: "none" }}>
                      {changes.map((change) => (
                        <VStack as="li" key={change.title} gap={1}>
                          <Text as="p" weight="medium">{change.title}</Text>
                          <Text as="p" type="supporting">{change.description}</Text>
                        </VStack>
                      ))}
                    </VStack>
                  </VStack>
                );
              })}
              <VStack gap={2} hAlign="start">
                <Link
                  href={release.url}
                  isExternalLink
                  isStandalone
                  newTabLabel={isElectronRuntime() ? "(opens in your browser)" : undefined}
                  onClick={(event) => {
                    if (!isElectronRuntime()) return;
                    event.preventDefault();
                    setFailedVersion(null);
                    void invoke("browser_open_external", { url: release.url })
                      .catch(() => setFailedVersion(release.version));
                  }}
                >
                  View release on GitHub
                </Link>
                {failedVersion === release.version ? (
                  <Text as="p" type="supporting" role="alert" style={{ color: "var(--danger)" }}>
                    Could not open the release. Try again.
                  </Text>
                ) : null}
              </VStack>
            </VStack>
          </HStack>
        ))}
      </VStack>
    </VStack>
  );
}
