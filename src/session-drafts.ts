export type SessionDraft = {
  projectId: string;
  prompt: string;
  updatedAt: string;
};

const storageKey = "pig.sessionDrafts.v1";
const draftsChangedEvent = "pig:session-drafts-changed";

type SessionDraftMap = Record<string, SessionDraft>;

function nowIso() {
  return new Date().toISOString();
}

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function readDrafts(): SessionDraftMap {
  const storage = getStorage();

  if (!storage) {
    return {};
  }

  const rawDrafts = storage.getItem(storageKey);

  if (!rawDrafts) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawDrafts) as SessionDraftMap;

    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([projectId, draft]) =>
          draft?.projectId === projectId && typeof draft.prompt === "string",
      ),
    );
  } catch {
    return {};
  }
}

function writeDrafts(drafts: SessionDraftMap) {
  const storage = getStorage();

  if (!storage) {
    return;
  }

  storage.setItem(storageKey, JSON.stringify(drafts));
}

function emitDraftsChanged(projectId: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(draftsChangedEvent, { detail: { projectId } }));
}

export function getSessionDraft(projectId: string) {
  return readDrafts()[projectId] ?? null;
}

export function hasSessionDraft(projectId: string) {
  return getSessionDraft(projectId) !== null;
}

export function ensureSessionDraft(projectId: string) {
  const drafts = readDrafts();
  const existingDraft = drafts[projectId];

  if (existingDraft) {
    emitDraftsChanged(projectId);

    return existingDraft;
  }

  const draft = {
    projectId,
    prompt: "",
    updatedAt: nowIso(),
  };

  writeDrafts({
    ...drafts,
    [projectId]: draft,
  });
  emitDraftsChanged(projectId);

  return draft;
}

export function saveSessionDraft(projectId: string, prompt: string) {
  const drafts = readDrafts();
  const draft = {
    projectId,
    prompt,
    updatedAt: nowIso(),
  };

  writeDrafts({
    ...drafts,
    [projectId]: draft,
  });
  emitDraftsChanged(projectId);

  return draft;
}

export function clearSessionDraft(projectId: string) {
  const drafts = readDrafts();

  if (!(projectId in drafts)) {
    return;
  }

  const { [projectId]: _removedDraft, ...remainingDrafts } = drafts;

  writeDrafts(remainingDrafts);
  emitDraftsChanged(projectId);
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
