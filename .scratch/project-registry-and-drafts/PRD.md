# PRD: Project Registry、Project Sidebar 与 Draft 模型

Status: ready-for-agent
Feature: project-registry-and-drafts
Created: 2026-06-30

> 本 PRD 修正并扩展 `.scratch/agent-workspace-control-plane/PRD.md` 中旧的 Project-scoped Session Draft 模型。当前领域真相以 [CONTEXT.md](../../CONTEXT.md) 与 [ADR-0019](../../docs/adr/0019-project-registry-and-draft-model.md) 为准。

## Problem Statement

PiGUI 现在的 Project / Session 入口仍像单 Project fixture：sidebar 里硬编码一个 Project，New Session 只围绕当前 Project 运行，composer 也没有明确的新 Session 目标选择。用户需要能手动添加本地目录作为 Project，在 sidebar 同时看到多个 Project 及其 Sessions，并在创建新聊天时明确选择目标 Project。

同时，草稿模型需要更贴近实际工作流：创建新 Session 的 prompt 只有一份全局草稿，切换 Project 不应清空文本；已有 Session 的 follow-up 输入则应按 Session 保留，避免用户在不同 Session 间切换时丢失未提交输入。

## Solution

实现一个手动维护的 Project Registry，并以它驱动 Project Sidebar 和 Session Draft composer：

1. Project Registry 只包含用户手动添加的本地目录，不自动扫描 session logs、历史 cwd 或文件系统。
2. Project 不要求是 Git repo；非 Git Project 可以运行 Session，但 Git-only 的 diff、managed worktree、commit、push、PR 能力不可用。
3. Project Sidebar 按添加时间倒序展示所有 Project。每个 Project 可独立展开/收起 Sessions，展开状态作为 PiGUI 本地 UI state 持久化。
4. Project 行点击只展开/收起，不切换主内容；Session 子项、Project 行 New Session、composer Project 选择才改变主内容或创建目标。
5. Empty Workspace State 只提供 Add Project，不允许无 Project 归属的 prompt 输入。
6. New Session 使用全局唯一 Session Draft，保存一份 initial prompt 和可选目标 Project；切换 Project 保留文本。
7. 已有 Session 的 composer 使用 Follow-up Draft，按 Session 持久化，不允许切 Project。
8. Remove Project 是 dangerous action，需要二次确认；它从 registry/sidebar 移除 Project，但不删除本地目录或历史 Session。

## User Stories

1. As a Pi user, I want to add a local directory manually as a Project, so that PiGUI only works on directories I explicitly choose.
2. As a Pi user, I want Projects to persist across app restarts, so that my workspace list stays stable.
3. As a Pi user, I want non-Git directories to be valid Projects, so that I can run Pi on notes, experiments, or repos before Git init.
4. As a Pi user, I want sidebar to show all Projects, so that I can move between codebases without losing context.
5. As a Pi user, I want each Project row to expand and collapse its Sessions, so that the sidebar stays compact.
6. As a Pi user, I want Project order to be stable by add time, so that switching Sessions does not reshuffle the sidebar.
7. As a Pi user, I want Add Project on an existing path to select the existing Project, so that I do not create duplicates.
8. As a Pi user, I want New Session from a Project row to target that Project, so that starting a chat in a Project is direct.
9. As a Pi user, I want the New Session composer to show and allow changing its target Project, so that I can choose where the new Session will run.
10. As a Pi user, I want switching the target Project to keep my draft text, so that I do not lose an unfinished prompt.
11. As a Pi user, I want the app to keep one global Session Draft across restarts, so that new-session writing survives app closure.
12. As a Pi user, I want existing Session follow-up text to be preserved per Session, so that switching Sessions does not discard half-written replies.
13. As a Pi user, I want unsent follow-up indicators in the sidebar, so that I can see which existing Sessions have unfinished input.
14. As a Pi user, I want removing a Project to require confirmation, so that I do not accidentally hide a workspace.
15. As a Pi user, I want Project removal to leave local files and historical Sessions intact, so that registry cleanup is not destructive.

## Decisions

- User-visible copy uses `Project`, not `Workspace`, for selector and add actions.
- Project Registry is PiGUI local app state and the only source for Project Selector, Project Sidebar, and composer target Project choices.
- Project identity is normalized absolute path. Display name defaults to directory basename. Rename is out of scope.
- Project list is sorted by `addedAt` descending and does not change when Projects are opened or used.
- Adding an already registered path selects the existing Project and opens the global Session Draft.
- Empty Workspace State cannot create a prompt before a Project exists.
- New Project defaults to expanded and becomes Current Project after add.
- Project Sidebar expand/collapse state persists across app restarts. Opening a Session from an external entry auto-expands that Session's Project.
- Project row click toggles expand/collapse. Project row New Session sets Current Project and opens the global Session Draft.
- Project Removal lives only in the Project row more menu, not in Project Selector.
- Removing a Project requires confirmation that the Project is removed from PiGUI, local files are not deleted, and historical Sessions remain.
- If the removed Project is the global Session Draft target, PiGUI keeps draft text and clears the target Project.
- If the current screen is a Session under the removed Project, PiGUI navigates to new-session empty state. If not, current screen is unchanged.
- Session Draft is global and persists one prompt plus optional target Project. If restored target no longer exists in Project Registry, keep text and clear target.
- Follow-up Draft is per Session and persists by Session id. Submit, Queue, or Steer success clears it; failure keeps text and shows error.
- The global Session Draft does not show a sidebar indicator. A Session row shows an unsent follow-up indicator when that Session has a Follow-up Draft; a Project row only aggregates that indicator when the Project is collapsed and hides Sessions with Follow-up Drafts.
- Non-Git Projects use foreground local directory. Git-only actions are disabled or hidden with clear state rather than blocking Session creation.

## Testing Decisions

- Use TDD for implementation: write failing tests for registry, sidebar, draft persistence, removal, and composer behavior before production code.
- Registry tests should cover add, duplicate add, remove, sorting by `addedAt`, display name basename, target restoration, and non-Git paths.
- Sidebar tests should cover multiple Projects, expand/collapse persistence, Project row click behavior, New Session target behavior, draft indicators, and auto-expand on external Session open.
- Composer tests should cover Empty Workspace State, target selection, target switching with text preserved, missing target submit blocking, successful clear, and failure preservation.
- Follow-up Draft tests should cover per-session persistence, switching Sessions, success clear, failure retention, Queue, and Steer.
- Non-Git Project tests should cover Session creation with foreground local directory and Git-only action disabled state.
- UI/CSS changes require a dev-server screenshot before claiming done.

## Out of Scope

- Automatic discovery from Pi session logs, historical cwd, recent directories, Git repos, or file-system scans.
- Project rename or custom icon.
- Sub-repo / monorepo package Project UI redesign.
- Multiple simultaneous new-session drafts.
- Moving Sessions between Projects.
- Deleting local directories, deleting historical Session Projection, or deleting Session Trace as part of Project Removal.
- Git branch management, commit, push, PR implementation for this feature.
- Terminal emulator or file tree.

## Open Notes

- Future sub-repo support likely needs a redesigned Project identity and UI. Do not bake subdirectory Project assumptions into this feature.
- Existing `agent-workspace-control-plane` docs may mention Project-scoped Session Drafts for historical context; this PRD supersedes that model.
