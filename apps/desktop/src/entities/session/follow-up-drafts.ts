export type FollowUpDraft = {
  sessionId: string;
  message: string;
  updatedAt: string;
};

const storageKey = "pigui.followUpDrafts.v1";
const followUpDraftsChangedEvent = "pigui:follow-up-drafts-changed";

type FollowUpDraftMap = Record<string, FollowUpDraft>;

function nowIso() {
  return new Date().toISOString();
}

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function readDrafts(): FollowUpDraftMap {
  const storage = getStorage();

  if (!storage) {
    return {};
  }

  const rawDrafts = storage.getItem(storageKey);

  if (!rawDrafts) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawDrafts) as FollowUpDraftMap;

    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([sessionId, draft]) =>
          draft?.sessionId === sessionId &&
          typeof draft.message === "string" &&
          typeof draft.updatedAt === "string",
      ),
    );
  } catch {
    return {};
  }
}

function writeDrafts(drafts: FollowUpDraftMap) {
  const storage = getStorage();

  if (!storage) {
    return;
  }

  storage.setItem(storageKey, JSON.stringify(drafts));
}

function emitFollowUpDraftsChanged(sessionId: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(followUpDraftsChangedEvent, { detail: { sessionId } }),
  );
}

export function getFollowUpDraft(sessionId: string) {
  return readDrafts()[sessionId] ?? null;
}

export function hasFollowUpDraft(sessionId: string) {
  return getFollowUpDraft(sessionId) !== null;
}

export function saveFollowUpDraft(sessionId: string, message: string) {
  const draft: FollowUpDraft = {
    sessionId,
    message,
    updatedAt: nowIso(),
  };

  writeDrafts({
    ...readDrafts(),
    [sessionId]: draft,
  });
  emitFollowUpDraftsChanged(sessionId);

  return draft;
}

export function clearFollowUpDraft(sessionId: string) {
  const drafts = readDrafts();

  if (!(sessionId in drafts)) {
    return;
  }

  const { [sessionId]: _removedDraft, ...remainingDrafts } = drafts;

  writeDrafts(remainingDrafts);
  emitFollowUpDraftsChanged(sessionId);
}

export function subscribeFollowUpDrafts(listener: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === storageKey) {
      listener();
    }
  };

  window.addEventListener(followUpDraftsChangedEvent, listener);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(followUpDraftsChangedEvent, listener);
    window.removeEventListener("storage", handleStorage);
  };
}
