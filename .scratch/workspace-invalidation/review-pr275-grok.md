# PR #275 独立审查（Grok）

- 对象：https://github.com/BubblePtr/pace/pull/275，分支 `feat/workspace-invalidation-phase-2`（HEAD `39113f7`，相对 `origin/main` 两提交：`7002baa` 边界硬化 + `39113f7` Git 元数据监听）
- Spec：Issue #274、`docs/adr/0038-workspace-invalidation-signals.md` 第 3、4、8 条（旁证 2、5、7、9）
- 第一期基线：PR #273 已在 main；对照 `.scratch/workspace-invalidation/review-pr273-grok.md` 可选项
- 范围：只读。未改产品代码、未提交；未复用实现者判断。独立跑了 `bun run typecheck`（通过）以及 watcher / scheduler / service / gateway-client 共 4 个文件 56 个测试（通过）。未复跑全量 `bun run test` / `bun run build` / Electron e2e

## 结论：可合并

第二期事实监听层按 ADR 第 8 条落地：路径由 `git rev-parse --git-path` 解析，linked worktree 与 packed-refs 有真实仓库测试，rename / 无 filename / error 会重建监听并失效，按 checkout 引用计数 close，symlink 根在调度器键上合并，`workspace.invalidated` 在 gateway client 入 states 之前被丢掉，没有递归 `fs.watch` 整个 `.git`，没有用户 Pi 配置写入。第一期审查的四个可选项（realpath 键、client 显式忽略、composer 排除 Chat、workspace.md 文案）均已处理。无必改项。

## Spec 对照表

### ADR-0038 第 3、4、8 条（本期核心）

| # | 决策 | 判定 | 证据 |
| --- | --- | --- | --- |
| 3 | 事实监听层：后端 `fs.watch` Git 元数据（HEAD / index / refs / packed-refs）；`source` 为 `git-watch`；不做轮询；不承诺工作树文件内容实时同步 | **满足** | Watcher 解析这四类路径（`git-metadata-watcher.ts:134-135`）。触发走既有调度器且 `source: "git-watch"`（`service.ts:157`）。Git 与 tool 共用 500ms trailing / 2000ms deadline（`workspace-invalidation.ts:44-54`；测试 `workspace-invalidation.test.ts:80-98`）。diff 无 `setInterval` / 工作树文件监听。 |
| 4 | 按规范化 checkout 分发；读取结果不跨 session 复用；UI checkout 成功仍通知兄弟 | **满足** | 键改为存在则 `realpathSync`、否则 `resolve`（`workspace-invalidation.ts:58-64`）。symlink fixture 把真实根与 alias 合成一次 fan-out（`workspace-invalidation.test.ts:59-78`）。service 把 linked worktree 与指向它的 symlink 识别为同一 checkout，Chat 不进名单（`service.test.ts:1780-1807`）。`SessionChangesReader.read` 仍不被通知路径调用（同测试 `1807`）。 |
| 8 | 监听路径由 `git rev-parse --git-path` 解析为绝对路径，不得手写 `.git/HEAD`；监听父目录并过滤文件名；处理 rename、无 filename、watcher error，恢复时重建并失效一次；按 checkout 引用计数，归零释放；不递归监听整个 `.git` | **满足** | 产品代码无字面 `.git/HEAD`。本机核对 linked worktree 的 `rev-parse --git-path` 四行分别落在 worktree gitdir 的 HEAD/index 与 common dir 的 refs/packed-refs，`resolve(root, path)` 对绝对路径保持原样。`fs.watch(directory, { persistent: false })`（`:117`），按 filename / 整目录（refs）过滤（`:118`）。error 关闭句柄、移出 map、走 `changed()`（`:121-125`）；`changed()` 先 `reconcile()` 再 `invalidate()`（`:59-67`）。无 `{ recursive: true }`。refs 用 `readdirSync` 显式挂各层目录，不是递归 watch `.git`。引用归零 `close()`（`:14-23`；测试 `:87-106`）。 |

### ADR 旁证（本期不得破坏）

| # | 决策 | 判定 | 证据 |
| --- | --- | --- | --- |
| 2 | 不写用户 Pi 配置 / `~/.pi` / extension | **满足** | diff 只触及 scheduler、新 watcher、service 接线、gateway client、composer 门闩、design 文案与 e2e。无 hook / agentDir 写入。 |
| 5 | 后端 trailing debounce + 最大等待；不另起一套 | **满足** | Watcher 侧只有同 tick 的 `queueMicrotask` 合并（`:59-67`），通知仍进第一期调度器。 |
| 7 | 复用临时 envelope；不进 journal；不改 runtime projection | **满足** | 出口仍是 `service.ts:141-156` 的 `type: "event"` / `seq: 0`。client 在入 states 前直接 return（`runtime-gateway-client.ts:622-625`）。第一期 journal 断言仍在（`service.test.ts:1774-1775`）；本期 service 测试额外断言 `read` 不被调用。 |
| 9 | Files 面板不在本期 | **满足** | 无 Files 失效接线。 |

### Issue #274 验收 checklist

| 验收项 | 判定 | 证据 |
| --- | --- | --- |
| 外部 `git checkout` / `commit` / `add` 后 Changes、分支 chip、badge 在 debounce 内刷新，窗口保持前台无需重新激活 | **满足**（分层） | Watcher 对 regular / linked 的 checkout、stage、commit 用真实仓库 + 原生 `fs.watch` + `vi.waitFor`（`git-metadata-watcher.test.ts:24-42`）。e2e 在 `PACE_E2E=1` 的 `showInactive()` 窗口里改外部 Git，chip 变为 `phase2-external`、dock 从 `2 files` 变为 `No changes yet`（`e2e/smoke/workspace-invalidation.spec.ts:25-30`）。badge 与 dock 计数同源 `useSessionChanges`；hook 仍只认 `workspace.invalidated` + `sessionIds`（`use-session-changes.ts:118-126`），不读 `source`，因此不必改渲染层。 |
| linked worktree（`git worktree add --detach`）上同样成立，含 `packed-refs` | **满足** | `git-metadata-watcher.test.ts:44-62`：只改共享 nested ref、`pack-refs --all`、再从 linked checkout 该 ref。本机 `rev-parse --git-path` 证实 linked 的 refs/packed-refs 在 common dir。 |
| 目标被 rename 重建后监听仍有效 | **满足** | 架构上 watch 的是父目录 inode，HEAD.lock→HEAD 这种原子替换不必重绑文件。目录被整体替换时用 `dev:ino` 比较重绑（`:109-116`）。测试替换 refs 目录后 `update-ref` / 新建 nested ref 仍能观察到（`:64-85`）。无 filename 的 rename 事件会失效（`:118`，测试 `:122-124`）。 |
| symlink 根的两个 session 视为同一 checkout | **满足** | `realpathSync` 键（`workspace-invalidation.ts:58-64`）+ symlink fixture（`workspace-invalidation.test.ts:59-78`）。service 用 linked 与其 dir symlink，期望 `sessionIds: ["a", "b"]`（`service.test.ts:1789-1806`）。 |
| session 全部移除后 watcher 释放，断言 close | **满足** | 第二 session 加入不新增 `fs.watch`；只移除一个时 close 未调用；两个都移除后每个 handle `close` 一次；pending discovery 在 ready 前 remove 不会再 watch（`git-metadata-watcher.test.ts:87-106`）。 |
| `workspace.invalidated` 不进入 runtime-gateway-client 的 states / seen | **满足** | 在 payload 分流之前按 envelope `type` return（`runtime-gateway-client.ts:622-625`）。测试用真实 `piSessionId`（不再靠空串死信）：listener 不触发、`getSessionState` 不变、同一 `id` 的后续 `message_update` 仍能进 seen（`runtime-gateway-client.test.ts:1100-1118`）。顺带覆盖 `terminal_output` / `terminal_exit`。 |
| typecheck / test / build；watcher 用真实临时 git 仓库，不 mock `fs.watch` 语义 | **部分**（命令） / **满足**（测试方法） | 本审查独立确认 typecheck 通过，以及上述 4 个文件 56 测试通过。全量 `bun run test` / `build` / Electron e2e 未复跑。Watcher 测试 `spyOn(fs, "watch")` 只计数/注入 error 与 null filename，不替换实现；filesystem 事件仍走原生句柄（测试注释 `:117-118`）。等待全是 `vi.waitFor(..., { timeout: 2000\|3000, interval: 20 })`，无固定 `sleep`。 |

### 第一期审查可选项核对

| # | PR #273 可选项 | 判定 | 证据 |
| --- | --- | --- | --- |
| 1 | checkout 键路径存在则 `realpath`，symlink fixture | **已处理** | `workspace-invalidation.ts:58-64`，`workspace-invalidation.test.ts:59-78`；service 的 linked+alias 再锁一次。 |
| 2 | gateway client 显式忽略临时 envelope，断言 states / listener / seen | **已处理** | `runtime-gateway-client.ts:622-625` 与 `runtime-gateway-client.test.ts:1100-1118`。 |
| 3 | composer 本地回退 `enabled` 排除 Chat | **已处理** | `agent-workspace.tsx:670-675`（`isChatProjectId` 已在文件顶部导入）。 |
| 4 | 不要为 UI 展示扩展 `source` union | **未误扩** | 仍用既有 `git-watch`；渲染层继续不读 `source`。 |
| 5 | `docs/design/workspace.md` 补 refreshing 等待 | **已处理** | `docs/design/workspace.md:58`。CONTEXT.md 仍无 Changes 词条，#274 未要求。 |

## Standards 问题清单

审查轴：真实临时 git 仓库、有上限条件轮询、无 macOS 特化产品代码、`fs.watch` error/close 生命周期、复用第一期调度器、注释英文先 why、多余抽象、e2e CI 稳定性。Fowler 基线气味标为判断，不是硬违规。

### 低：`targets[2]` 用参数顺序充当 refs 身份（判断：Mysterious Name）

`git-metadata-watcher.ts:102` 的 `addRefs(targets[2]!)` 依赖 `rev-parse` 参数顺序（HEAD、index、refs、packed-refs）。本机输出确认第 3 行确是 refs，测试也会在顺序错时失败，所以不是当前功能缺口。以后若在前面插入另一个 `--git-path`，refs 树监听会静默挂到错误路径（`addRefs` 的 `readdirSync` 失败被吞掉）。建议按路径名识别 `refs`（例如对 `targets` 做 `basename` / 与 `rev-parse --git-path refs` 对齐），不要用下标。

### 低：e2e 把「focus/visibility 数组为空」写成硬失败

`e2e/smoke/workspace-invalidation.spec.ts:18-31` 在 UI 就绪后才挂 listener，随后只做窗口外 `git` 与 Playwright 轮询/截图。`PACE_E2E=1` 走 `showInactive()` + opacity 0（`apps/desktop/electron/main.ts:161-167`），本来就不会激活窗口，因此这条用例**不能**靠第一期 focus 兜底混过，设计是对的。`playwright.config.ts` `retries: 0`、手动 macOS workflow 会跑全部 smoke（`.github/workflows/ci.yml:52`）。若 CI 或本机在轮询期间偶发 `focus`/`visibilitychange`，产品已刷新也会红。当前没有复现；不阻塞。若出现误伤，把空数组改成诊断输出，真正的断言留 chip / Changes。

### 低：discovery 的 `git` 没有超时

`git-metadata-watcher.ts:134` 的 `execFile` 无 timeout。`rev-parse` 挂死时 `associate` / `save` / `handleRequest`（`service.ts:268` 等待 `associationsReady`）会一直等。现有 Git 调用也多半没有超时，属病理环境。可选：给 discovery 加 timeout，失败走已有 `discoveryFailed` 重试。

### 未发现问题（对照审查轴）

- Watcher 测试用 `mkdtemp` + 真实 `git init` / `worktree add --detach`，等待是有上限的 `vi.waitFor`，不是 `sleep`。
- 产品代码无 `darwin` / `fsevents` / `kqueue` / `{ recursive: true }`。
- error：关句柄、从 map 删除、`changed()` 重建并失效；`close()` 把 `closed` 置位并关掉剩余句柄。测试覆盖 error、null filename、error 之后真实 checkout 仍能观察。`persistent: false` 避免测试进程被 watch 拖住。
- service 接线是 `invalidateCheckout(root, "git-watch")`，没有第二套 debounce。
- 注释英文、先写 why（如 `workspace-invalidation.ts:51-52`、`:62-63`；`git-metadata-watcher.ts:75-76`、`:99`、`:123`、`:137`；`runtime-gateway-client.ts:622`）。
- 无多余抽象：ADR 指定的 watcher 模块 + 第一期调度器；`queueMicrotask` 只合并同 tick 的 fs 事件。
- 跑 watcher 测试时出现过 `process` exit 的 `MaxListenersExceededWarning`（11>10）。更像 vitest 与多 `fs.watch` 叠加，测试仍全部通过，且归零路径断言了 `close`。不构成泄漏证据。

## 必改项

无。

## 可选项

1. **用路径名识别 refs，去掉 `targets[2]`**（Standards 低）。
2. **e2e 空 focus 数组改为诊断**：chip / dock 断言已经证明不靠窗口激活；空数组只用来防误伤时再收紧。
3. **discovery `git` timeout**：挂死时落入 `discoveryFailed`，与「缺失 checkout 恢复」同一通道。
4. CONTEXT.md 仍无 Changes / 失效词条（第一期就没有），#274 未要求，不阻塞。
