import type { ComponentProps } from "react";
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

type ComposerAttachmentDrawerOwnProps = {
  items: ComposerAttachmentView[];
  onRemove: (id: string) => void;
};

export type ComposerAttachmentDrawerProps = Omit<
  ComponentProps<typeof ChatComposerDrawer>,
  keyof ComposerAttachmentDrawerOwnProps | "children" | "count" | "label"
> &
  ComposerAttachmentDrawerOwnProps;

export function ComposerAttachmentDrawer({
  items,
  onRemove,
  className,
  ...rest
}: ComposerAttachmentDrawerProps) {
  if (items.length === 0) {
    return null;
  }

  const images = items.filter((item) => item.kind === "image");
  const files = items.filter((item) => item.kind === "text");

  return (
    <ChatComposerDrawer className={className} count={items.length} label="Attachments" {...rest}>
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
