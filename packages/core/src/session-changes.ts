export type SessionChangesState = "ready" | "clean" | "non-git";

export type SessionChangedFileKind =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "untracked"
  | "conflicted"
  | "type-changed";

export type SessionChangedFile = {
  path: string;
  previousPath?: string;
  kind: SessionChangedFileKind;
  staged: boolean;
  unstaged: boolean;
  additions: number | null;
  deletions: number | null;
  binary: boolean;
  patch?: string;
  patchTruncated: boolean;
};

export type SessionChanges = {
  sessionId: string;
  state: SessionChangesState;
  checkoutRoot: string;
  repositoryRoot: string | null;
  generatedAt: string;
  head?: {
    oid: string | null;
    branch: string | null;
    detached: boolean;
  };
  files: SessionChangedFile[];
  totals: {
    files: number;
    additions: number;
    deletions: number;
    binaryFiles: number;
    conflictedFiles: number;
  };
  truncated: boolean;
  omittedFileCount: number;
};
