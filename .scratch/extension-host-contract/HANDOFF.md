# Handoff：Pace 对扩展的宿主契约（Extension Host Contract）

- 日期：2026-09-12
- 状态：待讨论（本文档是交接材料，不是决策记录）
- 关联：issue #287（重新打开）、PR #288（已通过 #292 回退）、ADR-0031、ADR-0018
- 目的：把一次失败的修复中查明的事实、被否决的方案和新的方向交给下一位讨论者，避免重新踩一遍。

## 1. 一句话结论

第三方 Pi 扩展（以 pi-subagents 为例）需要"在宿主之外再起一个 Pi 会话"时，只能靠猜宿主的文件布局和可执行文件。Pace 作为 Electron 宿主猜不中。正确的修法不是改造 Pace 的打包去迎合这些猜测，而是让宿主向扩展暴露一个明确的能力接口：SDK 在哪、如何起子会话、子会话如何被观测。Pace 目前还没有这样一套面向扩展的对外接口。

## 2. 触发问题

用户在 Pace 中使用 pi-subagents（0.67.0，安装在 `~/.pi/agent/npm/node_modules/pi-subagents`）启动后台子代理，报错：

```
Background children require a supported standalone Pi host or the installed npm package (@earendil-works/pi-coding-agent); neither is available.
```

同一扩展在终端的 npm 版 `pi`（0.85.1）中正常。用户看到的中文提示是模型转述，原文如上。

## 3. 已核实的事实（不必重查）

### 3.1 pi-subagents 的三条执行路径

| 路径 | 机制 | 在 Pace 里的状态 |
|---|---|---|
| 前台子代理 | 宿主进程内 `createAgentSession`，共享父进程模型运行时 | 可用（SDK 通过 Pi 加载器的虚拟模块供给） |
| 后台子代理 | 起独立 Node 进程跑 `src/runs/background/subagent-runner.ts`（jiti），进程内用 SDK 建会话，父子之间用文件通道（`status.json` 原子写 + `fs.watch` inbox）做 steer / stop / resume | **失败**，见 3.2 |
| 二进制兜底 | 仅当宿主是官方 Bun 编译的单文件 `pi`（`process.versions.bun` 且 `argv[1]` 以 `/$bunfs/` 开头）时，用 `--mode rpc --extension binary-bootstrap.ts` 借宿主嵌入的 SDK | 不适用 |

关键源码位置（pi-subagents 包内）：
- `src/runs/background/async-execution.ts:553` 报错处；`spawnRunner` 的前置检查。
- `src/runs/shared/pi-spawn.ts`：`resolveBunPiExecutable`、`resolvePiPackageRoot`（`argv[1]` 真实路径向上找 `package.json.name === "@earendil-works/pi-coding-agent"`）、`resolveInstalledPiPackageRoot`（扩展文件内 `import.meta.resolve` 再向上找）。
- `src/runs/background/runner-aliases.ts`：`resolveHostPeerAliases`，要求包根能按目录解析到 `pi-agent-core` / `pi-ai` / `pi-tui`（0.85+ 还要 `pi-server`、`chord`）。
- `src/shared/node-executable.ts`：`resolveNodeExecutable`，`process.execPath` 文件名是 `node` 才用它，否则退回 PATH 上的 `node`。
- `src/shared/utils.ts`：`PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT` 环境变量**只用于**推导配置目录名，不影响包根定位。

### 3.2 为什么 Pace 里失败

1. Pace 后端跑在 Electron `utilityProcess` 里，`argv[1]` 是 `out/main/backend.js`，向上找不到 Pi 的 `package.json`。
2. Pace 用 electron-vite 把 SDK 内联进后端 bundle（`apps/desktop/electron.vite.config.ts`，`define: { PI_BUNDLED_NODE: "true" }`）。Pi 的扩展加载器 `dist/core/extensions/loader.js` 在该模式下用 jiti `virtualModules` + `tryNative: false` 供给 SDK，扩展里的 `import.meta.resolve` 得不到真实文件路径。
3. 即使包根能找到，`process.execPath` 是 Electron 二进制，后台 runner 会退回 PATH 上的 `node`，即要求用户全局安装 Node.js。

### 3.3 pi-subagents 现有的宿主集成点

- `registerBackgroundWorkProvider`（`pi-subagents/background-work`）：让其他扩展把自己的任务报给 `bg_wait`，**不是**让宿主接管子代理执行。
- `registerExternalJobProvider`（`pi-subagents/external-job-provider`）：接外部 advisor 任务。
- **pi-web 宿主集成**（`docs/extension-api.md` 末尾）：pi-subagents 通过 `Symbol.for("@agegr/pi-web/session-liveness/v1")` 发现 pi-web 这个 GUI 宿主的注册表并注册 provider。这证明作者接受"宿主通过进程内 Symbol 注册表暴露能力"的模式。
- 没有任何接口允许宿主决定"后台子代理怎么起"。

### 3.4 Pace 侧的相关现状

- Pi 依赖精确固定 `0.84.3`（`packages/backend/package.json`）；用户终端 `pi` 是 0.85.1。
- ADR-0031 的核心承诺：Pace 内置验证过的 Pi 引擎，且**原生扩展兼容是核心产品承诺**。其"对齐状态"第 2 条（内联 + 虚拟模块）只覆盖进程内扩展。
- ADR-0018 定义了 Runtime Gateway / Driver 分层，Extension UI 协议是路线图，尚未冻结 API。
- 扩展与 Pace 后端在同一个 Node 进程中运行（Pi 的加载器在 Pace 后端进程内执行扩展工厂函数），所以进程内注册表对 Pace 可行。

## 4. 被否决的方案：#288（已回退）

做法：后端 bundle 把 `@earendil-works/*` 设为 external，用 `scripts/stage-pi-runtime.mjs` 按 lockfile 依赖图把 Pi 及其完整生产依赖以真实文件放到 `resources/pi-runtime`（asar 外，按目标 os/cpu 过滤），主进程通过 `PACE_PI_RUNTIME_DIR` 下发包根，后端动态导入。独立审阅确认 pi-subagents 的包根与 peer 解析在新布局下成功，签名构建通过。

否决理由（用户决策）：
1. 安装包新增约 149 MB、约 1.3 万个文件进入签名范围，只为命中一个扩展的目录启发式。
2. 这是在迎合扩展对文件布局的假设，不是宿主契约；换一个扩展可能是另一套假设。
3. 修完后打包版的后台子代理仍依赖全局 Node.js，Pace"无全局依赖"的承诺并未成立。
4. 扩展自起的后台进程绕开 Pace 的 driver，token 与成本对 Pace 不可见，而这是 Pace 的核心价值。

如果将来需要参考实现细节，可 `git show c54bbca`（合并提交）查看。

## 5. 新方向：宿主向扩展提供能力

### 5.1 原则

- 扩展不猜宿主的文件布局与可执行文件，而是向宿主提问。
- 接口定义在扩展本来就会碰到的契约层上，而不是 Pace 专属；否则扩展作者不会适配。
- 由宿主起的子会话必须回到宿主的观测管道（Pace：Runtime Gateway → 事件 → 持久化 → replay 与成本）。

### 5.2 两个可选落点

| 落点 | 做法 | 优点 | 代价 |
|---|---|---|---|
| A. Pi ExtensionAPI 层 | Pi 在 `pi` / `ctx` 上暴露宿主能力（如 `host.spawnSession`、`host.sdkRoot`、`host.capabilities`），所有宿主一致 | 最正，扩展只写一次 | 要推 Pi 上游，周期长，Pace 无法独立推进 |
| B. 进程内 Symbol 注册表 | 参照 pi-web 先例，约定如 `Symbol.for("pi-host/runner/v1")`（命名待定）。Pace 后端启动时把"宿主 runner 提供者"放进 `globalThis` 注册表；pi-subagents 起后台子代理前先查注册表，有则调用，无则退回现有路径 | 不需要动 Pi；pi-subagents 已有同类集成；Pace 可先实现并配合上游 PR | 是 pi-subagents 与宿主之间的双边约定，其他扩展需各自采纳；需版本协商 |

建议先走 B 验证价值，同时把 A 作为向 Pi 上游提议的长期形态。

### 5.3 提供者接口草案（供讨论，未定稿）

```ts
// Registered by the host on globalThis[Symbol.for("pi-host/runner/v1")]
interface HostRunnerProvider {
  name: string;                 // e.g. "pace"
  version: 1;
  capabilities: {
    spawnChild: true;           // host can run a child session
    observe: true;              // host streams child events / usage
    steer: boolean; stop: boolean; resume: boolean;
  };
  spawnChild(input: {
    parentSessionId: string;
    cwd: string;
    runConfig: unknown;         // pi-subagents' existing SubagentRunConfig
    asyncDir: string;           // keep the existing file protocol for status/inbox
  }): Promise<{ childId: string; sessionId: string }>;
  stop(childId: string): Promise<void>;
  // Optional: host-side usage/cost summary per child
  usage?(childId: string): Promise<{ tokens: ...; costUsd?: number }>;
}
```

要点：
- 复用 pi-subagents 现有的 `asyncDir` 文件协议（`status.json`、control inbox、result files），这样 `bg_wait`、steer、stop、resume 与 fleet 视图不用改。
- Pace 的实现用现有 driver 创建子会话（等价于 Pace 自己新建一个 workspace/session），子会话事件走现有管道，成本天然可见。
- 需要处理：子会话与父会话的关联（parent/child 关系怎么在 Pace 会话模型里表达）、父会话结束后子会话的生命周期归属、`--no-extensions` 等子会话隔离参数的映射。

### 5.4 与 Pace 内部架构的接缝

- 注册时机：`packages/backend/src/service.ts`（组合根）在创建 Pi SDK 会话之前把提供者挂到 `globalThis`。
- 子会话创建：走 `packages/backend/src/workspace/` 与 `drivers/pi-sdk-runtime-adapter.ts` 的现有路径，不新开一条。
- 会话模型：需要在 CONTEXT.md 的 Session 相关术语里补 parent/child 关系；ADR-0021 的分叉/恢复持久化层可能需要扩展。
- Extension UI：ADR-0018 提到的扩展面板协议可以在同一注册表命名空间下演进，但不要求本期落地。

### 5.5 过渡期的现实

- 在契约落地前，Pace 中 pi-subagents 的前台子代理可用，后台子代理不可用。建议在环境预检或扩展诊断中把这个边界说清楚，而不是让用户看到裸错误。
- 不建议用 `ELECTRON_RUN_AS_NODE` 造假 `node` 或其他方式绕过，那只会叠加更多对扩展内部实现的耦合。

## 6. 建议的下一步

1. 讨论并定稿 5.2 的落点与 5.3 的接口形状，写成 ADR（`docs/adr/`，中文）。
2. 向 pi-subagents 提 issue，用 pi-web 集成作为先例，附接口草案，先探作者态度；作者接受后再同步做 Pace 侧实现与上游 PR。
3. 视情况向 Pi 上游提出 ExtensionAPI 层的宿主能力提案（落点 A）。
4. #287 保持打开，标题可改为"扩展宿主契约"，并链接本文档。

## 7. 参考

- pi-subagents：`~/.pi/agent/npm/node_modules/pi-subagents/`（`README.md`、`docs/extension-api.md`、`docs/standalone-background.md`、`src/runs/`、`src/shared/`）
- Pi 加载器：`packages/backend/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/loader.js`
- Pace：`apps/desktop/electron.vite.config.ts`、`apps/desktop/electron/main.ts`、`packages/backend/src/service.ts`、`packages/backend/src/drivers/pi-runtime-info.ts`、`docs/adr/0031-bundled-pi-runtime-and-extension-compatibility.md`、`docs/adr/0018-runtime-gateway-api-and-pi-drivers.md`
- 记录：issue #287、PR #288（回退于 #292）、Nowledge Mem 条目 `2898f651`（方向）与 `12190650`（#288 实现细节）
