export type SessionDraft = {
  projectId: string | null;
  prompt: string;
  updatedAt: string;
};

export type GetSessionDraftOptions = {
  projectIds?: string[];
};

const storageKey = "pigui.sessionDraft.v2";
const draftsChangedEvent = "pigui:session-drafts-changed";

function nowIso() {
  return new Date().toISOString();
}

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function isSessionDraft(value: unknown): value is SessionDraft {
  return (
    typeof value === "object" &&
    value !== null &&
    ((value as { projectId?: unknown }).projectId === null ||
      typeof (value as { projectId?: unknown }).projectId === "string") &&
    typeof (value as { prompt?: unknown }).prompt === "string" &&
    typeof (value as { updatedAt?: unknown }).updatedAt === "string"
  );
}

function readDraft(): SessionDraft | null {
  const storage = getStorage();

  if (!storage) {
    return null;
  }

  const rawDraft = storage.getItem(storageKey);

  if (!rawDraft) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawDraft) as SessionDraft;

    return isSessionDraft(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeDraft(draft: SessionDraft | null) {
  const storage = getStorage();

  if (!storage) {
    return;
  }

  if (!draft) {
    storage.removeItem(storageKey);
    return;
  }

  storage.setItem(storageKey, JSON.stringify(draft));
}

function emitDraftsChanged(projectId: string | null) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(draftsChangedEvent, { detail: { projectId } }));
}

function clearMissingTarget(
  draft: SessionDraft,
  options: GetSessionDraftOptions | undefined,
) {
  if (!draft.projectId || !options?.projectIds) {
    return draft;
  }

  if (options.projectIds.includes(draft.projectId)) {
    return draft;
  }

  const nextDraft = {
    ...draft,
    projectId: null,
    updatedAt: nowIso(),
  };

  writeDraft(nextDraft);
  emitDraftsChanged(draft.projectId);

  return nextDraft;
}

export function getSessionDraft(
  options?: GetSessionDraftOptions | string,
): SessionDraft | null {
  const draft = readDraft();

  if (!draft) {
    return null;
  }

  return clearMissingTarget(draft, typeof options === "string" ? undefined : options);
}

export function hasSessionDraft(projectId: string) {
  const draft = getSessionDraft();

  return draft !== null && draft.projectId === projectId;
}

export function ensureSessionDraft(projectId: string | null = null) {
  const existingDraft = getSessionDraft();
  const draft: SessionDraft = {
    projectId,
    prompt: existingDraft?.prompt ?? "",
    updatedAt: nowIso(),
  };

  writeDraft(draft);
  emitDraftsChanged(projectId);

  return draft;
}

export function saveSessionDraft(projectId: string | null, prompt: string) {
  const draft: SessionDraft = {
    projectId,
    prompt,
    updatedAt: nowIso(),
  };

  writeDraft(draft);
  emitDraftsChanged(projectId);

  return draft;
}

export function setSessionDraftTarget(projectId: string | null) {
  const existingDraft = getSessionDraft();
  const draft: SessionDraft = {
    projectId,
    prompt: existingDraft?.prompt ?? "",
    updatedAt: nowIso(),
  };

  writeDraft(draft);
  emitDraftsChanged(projectId);

  return draft;
}

export function clearSessionDraft(projectId?: string | null) {
  const draft = getSessionDraft();

  if (!draft) {
    return;
  }

  if (projectId !== undefined && draft.projectId !== projectId) {
    return;
  }

  writeDraft(null);
  emitDraftsChanged(draft.projectId);
}

export function subscribeSessionDrafts(listener: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === storageKey) {
      listener();
    }
  };

  window.addEventListener(draftsChangedEvent, listener);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(draftsChangedEvent, listener);
    window.removeEventListener("storage", handleStorage);
  };
}
