# 内置运行时发布验证

本文记录 [ADR-0031](adr/0031-bundled-pi-runtime-and-extension-compatibility.md) 已有实现的验证入口。GUI 扩展交互、专属面板与 CLI 会话交接仍按各自功能范围推进。

## 构建约束

- `packages/backend/package.json` 精确声明 Pi 引擎依赖，`bun.lock` 固定依赖树。
- 所有 `package:*`、`dist:*` 发布入口先执行 `build:release`：冻结安装、类型检查与构建、独立产物冒烟。
- 构建读取实际安装的 Pi 包版本和 App 包版本，预检显示这两个版本及 `SDK` 模式。
- `bun run build` 执行 `scripts/stage-pi-runtime.mjs`，从当前安装图复制 SDK、生产依赖、已安装的可选／peer 依赖及原包资源，生成无符号链接的 `apps/desktop/pi-runtime`。选择复制 Bun 安装图而非临时 npm 安装，避免传递依赖重新解析；发布前的冻结安装保证与 lockfile 一致。
- electron-builder 的源路径直接选择 staged `node_modules`（其过滤器会跳过源目录直属的同名子目录），将包树复制为 asar 外的 `resources/pi-runtime`，裸 Node 子进程可以读取 SDK 包根、peer 与 Photon WASM。现有 node-pty staging 不变。
- 主进程设置 `PACE_PI_RUNTIME_DIR`：开发指向仓库 Pi 包的 realpath，安装包指向上述 resources 内的包根；后端导入统一经过 `packages/backend/src/drivers/pi-runtime.ts` 的文件 URL。预检检查实际 SDK 版本与构建版本一致，错误包含定位信息，不使用 `NODE_PATH`。
- 调试独立后端时可显式指定同一变量；未指定时源码运行解析工作区安装。

## 自动化入口

```sh
bun run test
bun run typecheck
bun run build:release
find apps/desktop/pi-runtime -type l | wc -l # 必须为 0
du -sh apps/desktop/pi-runtime # PR 记录体积
bun run package:mac:unsigned
bun run test:e2e:packaged:mac e2e/smoke/m5-2-preflight.spec.ts
```

`build:release` 的 `scripts/test-bundled-runtime.mjs` 将后端构建产物和 staged npm 包树复制到临时目录，隔离仓库依赖、全局 Pi 目录和 `PATH`，通过实际后端消息入口验证：

- 内置引擎可通过预检，诊断版本与安装依赖一致。
- 原生 TypeScript 扩展可导入 `typebox` 并注册工具、命令。
- 扩展内 `import.meta.resolve("@earendil-works/pi-coding-agent")` 返回真实 `file:` URL，向上找到名称正确的包根，并能定位 `pi-agent-core`、`pi-ai`、`pi-tui` 的入口；另起裸 Node 子进程逐一 `import()` 验证可加载。Pi 0.84.3 使用仅含 `import` 条件的 exports，测试与 pi-subagents 一样从包目录读取真实 ESM 入口，再用 `require.resolve(入口绝对路径)` 检查文件，而非要求不存在的 CommonJS 裸包名导出。Pi 0.84.3 的生产依赖树没有 pi-server。
- `session_start` 和原生命令处理器实际执行。
- 故意损坏的扩展产生加载诊断，首次创建响应及后续历史读取都能看到错误。

单元与集成测试另外覆盖创建／恢复／分叉的扩展绑定、初始化失败清理、分叉历史与启动事件的顺序、非致命错误在后端投影和前端状态中的处理，以及原生包清单、禁用规则、包内技能和只读查询。

安装包预检 E2E 在 `PATH` 为空时打开真实 Electron App，检查内置版本展示、继续进入主界面，以及缺少认证时阻断、缺少可选 Git 时放行。

## 验收边界

测试使用临时认证占位，不登录真实账号、不调用付费模型。真实 OAuth 登录、模型工具执行、运行中停止与跨版本旧会话恢复／分叉，需要在引擎升级时使用对应账号和历史数据进一步验收。上述自动化验证不代表任意第三方扩展均已兼容。


## 2026-09-12：真实 npm 宿主验收（#287）

环境为 macOS arm64，App 0.0.6，Pi 0.84.3；未升级引擎。

| 命令／验证 | 输出 |
| --- | --- |
| `bun run build` | 退出 0；staging 126 个生产包 |
| `find apps/desktop/pi-runtime -type l \| wc -l` | `0` |
| `node --test scripts/test-bundled-runtime.mjs` | `tests 2, pass 2, fail 0`，含扩展真实包根与裸 Node peer 导入 |
| `bun run test` | `Test Files 133 passed (133)`；`Tests 1397 passed (1397)` |
| `bun run stage:node-pty` 后执行 `bunx electron-builder --config electron-builder.yml --mac dir --arm64 --publish never -c.forceCodeSigning=false -c.mac.identity=null -c.mac.notarize=false` | 退出 0，生成未签名目录包 |
| `du -sh dist/mac-arm64/Pace.app/Contents/Resources/pi-runtime` | `149M`；该目录符号链接数为 `0` |
| `PACE_E2E_EXECUTABLE=dist/mac-arm64/Pace.app/Contents/MacOS/Pace bun run test:e2e e2e/smoke/m5-2-preflight.spec.ts --grep 'gates first launch'` | `1 passed (4.3s)`，空 PATH 的安装包预检及 Continue 通过 |

先红后绿：仅添加扩展探针后，原内联构建无法生成 `host.json`，输出 `pass 1, fail 1`；切换真实 npm 包树后通过。

另以临时 `PACE_DATA_DIR`、`PI_CODING_AGENT_DIR` 和独立 Electron profile 启动 `bun run dev`，经真实 renderer → IPC → utilityProcess 创建会话成功，返回 Pi session ID；预检 RPC 与截图显示 `Pace 0.0.6 · Pi 0.84.3 · SDK`，`canContinue: true`。认证使用占位数据，未执行真实模型请求、OAuth 或 pi-subagents 的完整后台任务；探针只保证其所需的宿主包定位与子进程加载能力。
