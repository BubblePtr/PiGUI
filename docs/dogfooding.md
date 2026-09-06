# 用 PiGUI 开发 PiGUI（自举）

从 v0.0.1 起，PiGUI 自己也是开发 PiGUI 的工具之一。本文只记录为此必须成立的隔离规则；checkout 的选择不做特殊规定，本地 checkout 谁空闲谁用，被占用时其他工具走 worktree。

## 两个实例

- **宿主实例**：`/Applications` 里安装的正式版，只跑已发布版本，是日常使用的那份。
- **被测实例**：在某个 checkout 里执行 `bun run dev` 启动的开发版，只用来验证改动。

两者角色不互换：不要把 `bun run dev` 当宿主长期使用。

## 数据目录隔离

| 数据 | 宿主（打包版） | 被测（`bun run dev`） | 说明 |
| --- | --- | --- | --- |
| PiGUI 后端数据（journal、projections、preflight 状态） | `~/.pigui` | `~/.pigui-dev` | 主进程按 `app.isPackaged` 决定，见 `apps/desktop/electron/backend-environment.ts`；显式设置 `PIGUI_DATA_DIR` 时以其为准 |
| Electron userData（renderer 的 localStorage：项目注册表、草稿、模型偏好，以及 Chromium profile） | `~/Library/Application Support/@pigui/desktop` | `~/Library/Application Support/@pigui/desktop-dev` | 主进程在未打包时追加 `-dev` 后缀；显式传 `--user-data-dir` 时以其为准（E2E 用法）。这一步同时是 dev 实例能与正式版并存的前提：Chromium 同一 profile 只允许一个进程，第二个会直接退出 |
| Pi 自己的数据（`~/.pi/agent`：会话、认证、扩展） | 共享 | 共享 | Pi 拥有会话真相，PiGUI 只读；共享认证避免重复登录 |

预检页会显示后端数据目录，可以据此确认当前实例写到哪里。`~/.pigui-dev` 在首次跑预检时才会创建，启动后没有立刻出现是正常的。

## 兼容约束

宿主升级时会继续读取旧版本写下的 `~/.pigui`。任何改动 journal 或 projection 格式的 PR 都必须保持向后兼容读取或附带迁移，否则升级宿主会丢失历史。

## 发版节奏

宿主使用中遇到的问题记为 GitHub Issue 并打 `dogfood` 标签；攒成批次后按 [docs/release/macos.md](release/macos.md) 升 PATCH 发版。本地保留上一版 DMG，新版宿主不可用时回退。
