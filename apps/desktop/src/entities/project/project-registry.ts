export type ProjectRegistryEntry = {
  id: string;
  path: string;
  displayName: string;
  addedAt: string;
};

export type AddProjectResult = {
  added: boolean;
  project: ProjectRegistryEntry;
};

export type AddProjectOptions = {
  now?: () => string;
};

const storageKey = "pigui.projectRegistry.v1";
const registryChangedEvent = "pigui:project-registry-changed";

function nowIso() {
  return new Date().toISOString();
}

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

export function normalizeProjectPath(path: string) {
  const candidate = path.trim().replace(/\\/g, "/");

  if (!candidate.startsWith("/")) {
    throw new Error("Project path must be an absolute local path.");
  }

  const parts = candidate.split("/").filter(Boolean);
  const normalizedParts: string[] = [];

  for (const part of parts) {
    if (part === ".") {
      continue;
    }

    if (part === "..") {
      normalizedParts.pop();
      continue;
    }

    normalizedParts.push(part);
  }

  return `/${normalizedParts.join("/")}` || "/";
}

function basename(path: string) {
  const normalized = normalizeProjectPath(path);

  if (normalized === "/") {
    return "/";
  }

  return normalized.slice(normalized.lastIndexOf("/") + 1);
}

function sortProjects(projects: ProjectRegistryEntry[]) {
  return [...projects].sort((left, right) => right.addedAt.localeCompare(left.addedAt));
}

function parseRegistry(rawRegistry: string | null): ProjectRegistryEntry[] {
  if (!rawRegistry) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawRegistry) as ProjectRegistryEntry[];

    if (!Array.isArray(parsed)) {
      return [];
    }

    return sortProjects(
      parsed
        .filter(
          (project) =>
            typeof project?.id === "string" &&
            typeof project.path === "string" &&
            typeof project.displayName === "string" &&
            typeof project.addedAt === "string",
        )
        .map((project) => {
          const path = normalizeProjectPath(project.path);

          return {
            ...project,
            id: path,
            path,
          };
        }),
    );
  } catch {
    return [];
  }
}

function writeRegistry(projects: ProjectRegistryEntry[]) {
  const storage = getStorage();

  if (!storage) {
    return;
  }

  storage.setItem(storageKey, JSON.stringify(sortProjects(projects)));
}

function emitRegistryChanged(projectId: string | null) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(registryChangedEvent, { detail: { projectId } }),
  );
}

export function getProjectRegistry() {
  return parseRegistry(getStorage()?.getItem(storageKey) ?? null);
}

export function getProjectFromRegistry(projectId: string) {
  const normalizedProjectId = normalizeProjectPath(projectId);

  return getProjectRegistry().find((project) => project.id === normalizedProjectId) ?? null;
}

export function addProjectToRegistry(
  path: string,
  options: AddProjectOptions = {},
): AddProjectResult {
  const normalizedPath = normalizeProjectPath(path);
  const projects = getProjectRegistry();
  const existingProject = projects.find((project) => project.id === normalizedPath);

  if (existingProject) {
    emitRegistryChanged(existingProject.id);

    return {
      added: false,
      project: existingProject,
    };
  }

  const project: ProjectRegistryEntry = {
    id: normalizedPath,
    path: normalizedPath,
    displayName: basename(normalizedPath),
    addedAt: (options.now ?? nowIso)(),
  };

  writeRegistry([...projects, project]);
  emitRegistryChanged(project.id);

  return {
    added: true,
    project,
  };
}

export function removeProjectFromRegistry(projectId: string) {
  const normalizedProjectId = normalizeProjectPath(projectId);
  const remainingProjects = getProjectRegistry().filter(
    (project) => project.id !== normalizedProjectId,
  );

  writeRegistry(remainingProjects);
  emitRegistryChanged(normalizedProjectId);
}

export function renameProjectInRegistry(projectId: string, displayName: string) {
  const normalizedProjectId = normalizeProjectPath(projectId);
  const nextDisplayName = displayName.trim();

  if (!nextDisplayName) {
    return null;
  }

  let renamedProject: ProjectRegistryEntry | null = null;
  const projects = getProjectRegistry().map((project) => {
    if (project.id !== normalizedProjectId) {
      return project;
    }

    renamedProject = {
      ...project,
      displayName: nextDisplayName,
    };

    return renamedProject;
  });

  if (!renamedProject) {
    return null;
  }

  writeRegistry(projects);
  emitRegistryChanged(normalizedProjectId);

  return renamedProject;
}

export function subscribeProjectRegistry(listener: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === storageKey) {
      listener();
    }
  };

  window.addEventListener(registryChangedEvent, listener);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(registryChangedEvent, listener);
    window.removeEventListener("storage", handleStorage);
  };
}
