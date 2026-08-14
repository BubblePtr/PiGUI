import { ChatComposerDrawer } from "@astryxdesign/core/Chat";
import { Carousel } from "@astryxdesign/core/Carousel";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Token } from "@astryxdesign/core/Token";
import { Thumbnail } from "@astryxdesign/core/Thumbnail";
import type { ComposerAttachment } from "./composer-attachment-logic";

export type ComposerAttachmentView = Pick<
  ComposerAttachment,
  "id" | "kind" | "name" | "src"
>;

export function ComposerAttachmentDrawer({
  items,
  onRemove,
}: {
  items: ComposerAttachmentView[];
  onRemove: (id: string) => void;
}) {
  if (items.length === 0) {
    return null;
  }

  const images = items.filter((item) => item.kind === "image");
  const files = items.filter((item) => item.kind === "text");

  return (
    <ChatComposerDrawer count={items.length} label="Attachments">
      <VStack gap={1} width="100%">
        {images.length ? (
          <Carousel aria-label="Image attachments" gap={1}>
            {images.map((item) => (
              <Thumbnail
                key={item.id}
                alt={item.name}
                label={item.name}
                src={item.src}
                onRemove={() => onRemove(item.id)}
              />
            ))}
          </Carousel>
        ) : null}
        {files.length ? (
          <HStack gap={1} wrap="wrap">
            {files.map((item) => (
              <Token
                key={item.id}
                label={item.name}
                size="sm"
                onRemove={() => onRemove(item.id)}
              />
            ))}
          </HStack>
        ) : null}
      </VStack>
    </ChatComposerDrawer>
  );
}
