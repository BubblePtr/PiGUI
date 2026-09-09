# ADR-0036：产品更名 PiGUI → Pace，仓库留在个人账号，采用 Apache-2.0

- 状态：Accepted
- 日期：2026-09-09

## 背景

产品定位不变：Pi coding agent 的 GUI，把 Pi 的扩展性带到桌面，让 Harness 的行为通过 Extension 而不是源码写死来调整。PR #235 已接入 Pace 的图标与字标，但应用标识、数据目录、发布名仍是 PiGUI。PR #236 按 Pace 重写了 README，并在 `docs/brand/rename-audit.md` 盘点了改名涉及的全部位置。本 ADR 把盘点中"先定的命名决策"固定下来，后续改名 PR 从这里派生，不再逐项讨论。

上一次改名（Pig → PiGUI）记录在 [ADR-0017](0017-rename-to-pigui.md)。

仓库根目录一直没有许可证文件。没有它，外部贡献在法律上不成立，README 也无法声明许可。

## 决策

### 1. 名字

| 项 | 旧值 | 新值 |
| --- | --- | --- |
| 产品名 | PiGUI | **Pace**。"Pace Agent" 只作完整展示名（About 页、官网标题），界面文案一律用 "Pace" |
| 名字含义 | | move at your own pace：个人对 Agent 的使用拥有完全自主权，定制并控制自己的节奏 |
| GitHub 仓库 | `BubblePtr/PiGUI` | `BubblePtr/pace`，用 `gh repo rename`，旧 URL 由 GitHub 重定向 |
| macOS bundle id | `com.bubbleptr.pigui` | `com.bubbleptr.pace` |
| Linux 可执行名 / desktopName | `pigui` / `pigui.desktop` | `pace` / `pace.desktop` |
| 后端数据目录 | `~/.pigui`（dev `~/.pigui-dev`） | `~/.pace`（dev `~/.pace-dev`），带一次性迁移 |
| Electron userData | 由包名 `@pigui/desktop` 派生 | 通过 `app.setName("Pace")` 固定为 `Pace`（dev：`Pace-dev`），不依赖包名，带一次性迁移 |
| workspace 包作用域 | `@pigui/*` | `@pace/*` |
| 环境变量前缀 | `PIGUI_*` | `PACE_*`；`PIGUI_DATA_DIR` 作为文档公开的覆盖入口保留一个 MINOR 版本的兼容读取 |
| localStorage 键、IPC channel、CSS 类名前缀 | `pigui.*` / `pigui:*` / `pigui-*` | **不改**。用户不可见，localStorage 改名只会多一段迁移代码 |

### 2. 仓库留在个人账号

不转移到 organization。star、fork、贡献记录挂在个人主页上是 Build in Public 的一部分；现有 organization 的长期用途未定，不提前绑定。触发转移的条件是出现第二个需要 merge 权限的维护者、Pace 长出多个仓库、或需要以组织名义收款发布。转移保留 star、issue、release 与重定向，推迟不增加成本。

bundle id 是发布后不可更换的值，因此不编码 organization，固定为 `com.bubbleptr.pace`。

### 3. 许可证：Apache License 2.0

候选是 MIT 与 Apache-2.0。选 Apache-2.0 的理由：

- 含明确的专利授权与专利报复条款，对一个会接收外部 Extension 贡献的项目更稳妥。
- 第 6 条不授予商标使用权。Pace 刚建立品牌，需要"代码可自由使用、名字与图标不能随意冒用"的边界，MIT 没有这条。
- 参考对象 Apache Maka 同为 Apache-2.0，后续若贡献流程借鉴它，许可证一致。

版权主体为项目作者 Kieran Zhang。各 workspace 包的 `package.json` 加 `"license": "Apache-2.0"`；包仍为 `private`，不发布到 npm。不要求源文件头部加许可证注释。

## 刻意保留

- **ADR 正文不回改。** ADR-0001 到 ADR-0035 中的 "PiGUI" 是历史记录，本 ADR 之前的 PiGUI 即 Pace。
- **`.scratch/` 与 `docs/research/`** 是归档，不动。
- **应用内 Changelog 的历史条目**（"The first PiGUI release"）保留原文，只有链接跟随仓库改名。
- **"Pi"** 指 Pi coding agent 本身，永不改。
- **`surface: "trace"` 事件戳**与 ADR-0032 一样保持原值。

## 后果

- 改名 PR 必须同时落地三处迁移并各带测试，否则 v0.0.1 / v0.0.2 用户会丢数据或断更新：electron-updater 的 feed（旧包永远查 `BubblePtr/PiGUI`，依赖 GitHub 重定向，发版前用 0.0.2 安装包实测）、`~/.pigui` → `~/.pace` 目录迁移、userData 目录迁移。细节见 `docs/brand/rename-audit.md` "破坏性位置"。
- 改 bundle id 后 macOS 视其为新应用；已安装版本通过 updater 换成新包后，钥匙串里以旧 bundle id 存的条目（若有）不会跟随。
- 改名后的首个版本升 MINOR（`0.1.0`），Release 说明写明旧名与迁移行为。
- 落地顺序沿用盘点文档：本 ADR 与 LICENSE → 第一层改名与迁移 → 第二层内部标识 → 文档与 CONTRIBUTING。
