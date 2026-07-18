# PiGUI 跨端外壳从 Tauri 改为 Electron，后端做成可重定位服务

PiGUI 把桌面外壳从 Tauri 2 切换到 Electron。承重理由只有一个：PiGUI 确定要内嵌浏览器以支持页面预览和 DOM 元素标注（annotation），这是 Agent GUI 的事实标配（Codex、Claude Desktop、Cursor 均有），而 Tauri 2 的多 webview 仍是实验特性、内容注入受限；Electron 的 `WebContentsView` + `executeJavaScript` + CDP 对"嵌任意页面 + 注入标注层 + 检视 DOM"是碾压级能力。生态一致（多数 Agent GUI 用 Electron，参考代码丰富）是次要加分项。此前的 Tauri 选型只活在团队记忆里、从未进 ADR，本决策正式将其反转并记录。

借此一步迁移，后端定型为一个**传输无关、可重定位的服务**：

- **进程拓扑**：会话日志解析 + `pi` 子进程管理放进 Node `utilityProcess`，main 进程保持极薄（只管窗口与 IPC 路由）。这把 Tauri 时代 Rust 后端的进程隔离用 Node 拿回来，并落地"发动机不该让仪表盘熄火"（见 ADR-0001/0005）。
- **进程恢复**：`utilityProcess` 异常退出后，main 进程按有上限的指数退避自动重启，并通过统一 event 通道发布 `connected` / `disconnected` 生命周期事件。renderer 保持原 IPC 订阅，在重连后重新读取 Session Projection，并对当前 Session 执行 cold resume；app 退出时必须取消重启计时器并终止 utility process，避免退出竞态。
- **统一协议**：UI↔后端的全部流量（会话数据查询 + Pi 控制 + Pi 事件推流）收进**一条传输无关的 RPC 协议**——`{id, method, params} → {id, result/error}` 信封 + 单向 `event` 推流。transport 抽象只需各实现一次：MessagePort 版（现在）、WebSocket 版（远期）。
- **解析器重写**：约 1802 行的 Rust 会话解析器（`src-tauri/src/sessions.rs`）连同 config/checkout/pi_rpc 一并重写为 TS。它是 I/O 密集的 JSONL 解析 + 字符串启发式，Node 对应能力齐备，Rust 原本的性能优势在此 workload 上未兑现。产品尚未发布、无既有基准，**不与 Rust 输出做逐字节对拍**；按项目 TDD 纪律，TS 解析器针对自有 fixture 先写失败测试再实现即可（字符计数用 Unicode 标量长度，避开 UTF-16 坑）。`src-tauri/` 在 TS 解析器测试转绿后整体删除。

## Considered Options

- **留在 Tauri 2**：包体更小、内存更低，且已有 ~2600 行 Rust 沉没成本。否决：唯一承重需求（内嵌浏览器 + DOM 标注）在 Tauri 2 上无法干净实现，继续在其上叠加功能等于往判了死刑的地基浇水泥。
- **进程拓扑放 main 进程**：V1 调试更简单。否决：违背"现在缝隙最小、一步到位"，且放弃了与 ADR-0001/0005 隔离原则对齐的机会。
- **保持请求/响应与事件流两条独立通道**：改动更小。否决：远期上远程时要分别处理两次；统一成一条协议后只有一个 transport 接口要换。

## Consequences

- **时机**：趁前端对外壳的耦合处于历史最低点（仅 6 个 invoke 命令、UI 经 `invoke()` 与 `PiRpcTransport` 完全解耦）先迁移，再做其他功能。每多写一个 Tauri 专有原语，账单就涨。
- **只留缝、不建远程**：本次只做到"后端是可重定位的本地服务（utilityProcess + 传输无关协议）"。WebSocket/远程/鉴权/TLS/多客户端会话归属一律推后。
- **远期开放项（不进 V1 预算）**：把后端搬到 VPS 当瘦客户端是另一个产品形态——PiGUI 的承重数据（`~/.pi/agent` 日志、Execution Checkout 的 Git worktree、Pi 进程）都在用户本机，真要远程需把整套文件/checkout 语义搬到服务端，并支付跨网络信任边界的固定税（auth/TLS/重连）。"后端可重定位"这个抽象能力 ≠ "VPS 部署"这个产品。
- **嵌入浏览器的安全面**：外壳从第一天立安全默认（`contextIsolation: true` + `sandbox` + preload 暴露 typed invoke + renderer 不开 nodeIntegration）；后端在 utilityProcess，被嵌入的网页内容永远碰不到它。"向敌意页面注入标注脚本 vs 沙箱"的张力留到该功能开发时单独决策。
- **工具链**：electron-vite（main/preload/renderer 三段拆分），沿用现有 Vite + React；Bun 继续作包管理器，Electron 主进程仍运行 Node。
