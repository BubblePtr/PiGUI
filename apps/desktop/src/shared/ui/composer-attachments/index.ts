export {
  ATTACHMENT_REJECT_COPY,
  FILE_ACCEPT,
  IMAGE_SEND_COPY,
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
