export {
  ATTACHMENT_REJECT_COPY,
  FILE_ACCEPT,
  IMAGE_ATTACHMENT_LIMIT_BYTES,
  IMAGE_TOO_LARGE_COPY,
  TEXT_ATTACHMENT_LIMIT_BYTES,
  TEXT_TOO_LARGE_COPY,
  buildPromptWithAttachments,
  classifyFile,
  insertIntoDraft,
  type ComposerAttachment,
} from "./composer-attachment-logic";
export { ComposerAttachmentDrawer } from "./composer-attachment-drawer";
export { ComposerInsertMenu } from "./composer-insert-menu";
export {
  useComposerAttachments,
  useComposerInsertCatalog,
  useFilePicker,
} from "./use-composer-attachments";
