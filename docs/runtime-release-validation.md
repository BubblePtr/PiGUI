# 内置运行时发布验证

## 分发与定位契约

- Pi 依赖精确固定为 `0.84.3`，发布先冻结 lockfile 安装；不重新解析 npm 版本、不修改 pi-subagents、不 patch node_modules，node-pty 原处理不变。
- 后端外置 `@earendil-works/*` 并移除 `PI_BUNDLED_NODE`，所有运行时导入经过 `drivers/pi-runtime.ts`，开发与发布均加载真实 npm 包树。
- `resolveBackendEnvironment` 统一设置 `PACE_PI_RUNTIME_DIR`：开发从 `appPath` 找到工作区安装的 realpath；打包从 `resourcesPath/pi-runtime/node_modules/@earendil-works/pi-coding-agent` 加载。Electron 覆盖继承的旧运行时变量，独立后端可自行显式指定；源码未设置变量时解析工作区安装。主进程转发 backend stdout/stderr 到现有 console 日志，启动期定位错误不再仅剩 exit code 1。
- staging 复制当前安装图的生产依赖、已安装 optional／peer 依赖与原包资源，校验每条依赖边，生成无符号链接的 `apps/desktop/pi-runtime`。`--platform`／`--arch` 优先于 `PACE_TARGET_PLATFORM`／`PACE_TARGET_ARCH`，默认当前主机；包的 `os`／`cpu` 不匹配时 optional 包跳过、required 包报错。打包脚本与 macOS CI 显式传入目标。
- electron-builder 从 staged `node_modules` 直接复制到 asar 外的 `resources/pi-runtime`，避免其过滤器跳过源目录直属的同名子目录。Photon WASM 随原包保留。
- 包级过滤不会补装主机安装图缺少的目标 optional 依赖，也不会删除 Pi TUI 原包内没有独立 package.json 的跨平台 prebuild。跨平台 staging 成功不等于目标平台原生能力可用，发布应使用目标平台冻结安装并完成目标机验收。

## 自动化入口与覆盖

```sh
bun run build
find apps/desktop/pi-runtime -type l | wc -l
env -u PACE_PI_RUNTIME_DIR bun run test
PACE_PI_RUNTIME_DIR=$(realpath apps/desktop/pi-runtime/node_modules/@earendil-works/pi-coding-agent) bun run test
bun run typecheck
node --test scripts/test-stage-pi-runtime.mjs scripts/test-bundled-runtime.mjs
bun run build:release
```

独立产物探针复制后端构建及包树到临时目录，隔离仓库 node_modules、全局 Pi 与 PATH，通过实际后端消息入口验证预检、扩展注册、`session_start`、原生命令及加载错误的持久化。扩展位置的 `import.meta.resolve()` 必须返回真实 `file:` URL，SDK 包根名称必须匹配；裸 Node 再从包根按裸包名导入，并逐一导入扩展解析出的真实入口，不再手写 exports 解析器。

探针覆盖 `@earendil-works/pi-coding-agent`、`pi-agent-core`、`pi-ai`、`pi-tui`，以及 `@earendil-works/pi-ai/oauth`、`@earendil-works/pi-ai/providers/all`、`@earendil-works/pi-ai/compat`、`typebox`、`typebox/compile`、`typebox/value`。Pi 0.84.3 的生产图不含 pi-server。

## 2026-09-12：PR #288 修订验收

本机 macOS arm64，App 0.0.6，Pi 0.84.3。

| 命令 | 输出 |
| --- | --- |
| `bun run build` | 退出 0；`darwin/arm64: 126 packages, Pi 0.84.3` |
| `find apps/desktop/pi-runtime -type l \| wc -l` | `0` |
| `env -u PACE_PI_RUNTIME_DIR bun run test` | `133 passed (133)` 文件；`1399 passed (1399)` 测试 |
| `PACE_PI_RUNTIME_DIR=$(realpath apps/desktop/pi-runtime/node_modules/@earendil-works/pi-coding-agent) bun run test` | `133 passed (133)` 文件；`1399 passed (1399)` 测试 |
| `bun run test:release` | `tests 14 / pass 14 / fail 0` |
| `bun run typecheck` | `tsc --noEmit`，退出 0 |
| `node --test scripts/test-bundled-runtime.mjs` | `tests 2 / pass 2 / fail 0` |
| `node --test scripts/test-stage-pi-runtime.mjs scripts/test-bundled-runtime.mjs` | `tests 4 / pass 4 / fail 0`（staging 2，独立产物 2） |

先红后绿：staging 两项回归最初分别发现错误 optional 包仍存在、required 包未抛错；修复后 2/2 通过。环境解析测试最初 2 failed / 27 passed，修复后 29/29 通过。`service.test.ts` 在 staged 运行时变量下原为 5 failed / 22 passed，mock 改到 `drivers/pi-runtime.ts` 后 27/27 通过，避免真实文件 URL 绕过裸包名 mock；资源管理 queued-write 回归的 SettingsManager spy 同样改为运行时边界，原失败用例随后通过。

### 两个目标的 staging

```sh
node scripts/stage-pi-runtime.mjs --platform linux --arch x64 --target /tmp/pace-pi-runtime-linux-x64
bun run stage:pi-runtime --platform darwin --arch arm64
du -sh /tmp/pace-pi-runtime-linux-x64 apps/desktop/pi-runtime
find /tmp/pace-pi-runtime-linux-x64 -type f | wc -l
find apps/desktop/pi-runtime -type f | wc -l
find /tmp/pace-pi-runtime-linux-x64 -name '*.node'
find apps/desktop/pi-runtime -name '*.node'
```

| 目标 | staged 包数 | `du -sh` | 文件数 | `.node` 数 |
| --- | --- | --- | --- | --- |
| Linux x64 | 124 | 144M | 13249 | 4 |
| darwin arm64 | 126 | 149M | 13255 | 6 |

以下路径相对于各自 `node_modules/`；前四项在两个目标均存在，后两项仅 darwin arm64 存在。这是包级过滤后的原包内容清单，并非六个文件均为 SDK／后台子代理必需：

| `.node` 路径 | 来源与是否必需 |
| --- | --- |
| `@earendil-works/pi-tui/native/darwin/prebuilds/darwin-x64/darwin-modifiers.node` | Pi TUI 0.84.3 原包资源；macOS x64 修饰键检测，在本次两个目标均不加载，非必需 |
| `@earendil-works/pi-tui/native/darwin/prebuilds/darwin-arm64/darwin-modifiers.node` | Pi TUI 原包资源；macOS arm64 修饰键检测，加载失败回退 false；SDK／后台子代理启动非必需 |
| `@earendil-works/pi-tui/native/win32/prebuilds/win32-arm64/win32-console-mode.node` | Pi TUI 原包资源；Windows arm64 控制台模式／修饰键辅助，本次两个目标均不加载，非必需 |
| `@earendil-works/pi-tui/native/win32/prebuilds/win32-x64/win32-console-mode.node` | Pi TUI 原包资源；Windows x64 控制台模式／修饰键辅助，本次两个目标均不加载，非必需 |
| `@mariozechner/clipboard-darwin-universal/clipboard.darwin-universal.node` | clipboard 0.3.9 optional 包；macOS 原生剪贴板首选绑定，非 SDK／后台子代理启动必需 |
| `@mariozechner/clipboard-darwin-arm64/clipboard.darwin-arm64.node` | clipboard 0.3.9 optional 包；universal 加载失败后的 arm64 回退，非 SDK／后台子代理启动必需 |

来源核查：Pi TUI `dist/native-modifiers.js`／`dist/terminal.js` 按平台和架构选择原生文件；clipboard `index.js` 先尝试 universal 再尝试 arm64，Pi `dist/utils/clipboard-native.js` 允许原生加载失败并返回 null。Linux staging 剔除了两项 darwin clipboard 包，但本机安装图没有 Linux clipboard 原生包；本次未验证 Linux 原生剪贴板。

### 签名、公证与首次发版强制门

`security find-identity -v -p codesigning` 找到 2 个有效身份，包含 Developer ID Application。已完成以下保留 hardenedRuntime 的签名目录构建；公证单独禁用，不能将其当作正式发布包：

```sh
bun run stage:node-pty
bunx electron-builder --config electron-builder.yml --mac dir --arm64 --publish never -c.mac.notarize=false
codesign --verify --deep --strict --verbose=2 dist/mac-arm64/Pace.app
```

签名构建成功，electron-builder 使用 Developer ID Application，并输出 `skipped macOS notarization`（显式 `notarize=false`）。严格验证退出码为 `0`，末两行输出：

```text
dist/mac-arm64/Pace.app: valid on disk
dist/mac-arm64/Pace.app: satisfies its Designated Requirement
```

`codesign -dv --verbose=2` 显示 `flags=0x10000(runtime)` 与 Developer ID Application，确认 hardenedRuntime 保留。签名目录包首启预检：

```sh
PACE_E2E_EXECUTABLE=dist/mac-arm64/Pace.app/Contents/MacOS/Pace bun run test:e2e e2e/smoke/m5-2-preflight.spec.ts --grep 'gates first launch'
```

输出 `1 passed (5.4s)`，空 PATH 下内置引擎预检通过；不等同于安装后的真实后台子代理验证。

签名目录包 `Contents/Resources/pi-runtime` 为 `139M`（`du -sh`，磁盘占用），`13255` 文件、`0` 符号链接，保留上述六个 `.node`。公证本次未验证。

**首次发版必须验证签名与公证通过、且安装后 pi-subagents 后台子代理可启动。** 必须对实际分发包完成 Developer ID + hardenedRuntime 签名、Apple 公证及 staple 验证，在脱离仓库与全局 Pi 的安装环境运行 pi-subagents 后台子代理；记录命令、输出和子会话启动证据后才能发版。约 140MB／13k 新增文件及原生 `.node` 都进入签名封装范围，未签名目录包与裸 Node 导入探针不能替代这道门。

## 验收边界

测试执行中曾因并行运行两套全量造成既有 UI 测试超过 5 秒；改为串行后两套全绿。终端面板的一次异步回调断言失败单独复跑通过，未改动其 UI／测试实现。第一次设置变量的复核还与 staging 重建目录重叠，出现 ENOENT；最终结果均在 staging 完成后取得。

探针使用临时认证占位，不登录真实账号、不调用付费模型。本次未执行真实 OAuth、模型请求或 pi-subagents 完整后台任务，自动化只验证其宿主定位及子进程模块加载能力；首次发版门仍需完成安装后的真实后台启动。引擎升级另需覆盖停止、旧会话恢复／分叉和对应账号／模型能力。
