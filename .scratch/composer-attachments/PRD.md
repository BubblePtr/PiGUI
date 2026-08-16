# Composer 附件与插入菜单 — 决策记录

Issue: [#98](https://github.com/BubblePtr/PiGUI/issues/98) · 前身见 `.scratch/composer-redesign/PRD.md` 的「附件上传/展示」节 · 原型探索于 `/proto/composer-attachments`(落地后拆除),2026-08-14 定稿。

## 定稿方向:Shelf 抽屉 + footer「Add to prompt」菜单

- **已选附件用 `ChatComposerDrawer`**。图片走 `Carousel` + `Thumbnail`,文本走 `Token`,可逐个移除。不要 Strip(无抽屉折行)或 Ledger(路径行列表)。
- **入口在 footer,模型选择器左边**。icon-only `Plus`,文案/tooltip 为「Add to prompt」。不要 header 回形钉:Quiet 底盘没有 header context,回形针会变成一条空 chrome。
- **这个按钮不是「传文件」**。它打开分组菜单,直接选中要塞进这次发送的东西:
  - Files — 图片或文本
  - Commands — 斜杠命令(写入 draft)
  - Skills — 来自 `get_config_inventory` 的 skill 名
  - Plugins — 已启用的 extension 名
- **首轮类型**:只收图片(`image/*` 或常见扩展)和文本/代码文件。其它类型拒绝,文案:`PiGUI can only attach images and text files.`
- **菜单图标 16px**。Hugeicons 默认 24px,Astryx 菜单项是 `sm`(1rem)。

## 被否的方向

| 变体 | 轴 | 否因 |
| --- | --- | --- |
| Strip | 无抽屉 chrome,40px 图 + chip | 已选态没有折叠面,多附件时顶高输入 |
| Ledger | 路径行 + 体积 | 像资源管理器,不像「这次要发送的东西」 |
| Header 回形针 | 官方 ChatComposer 默认入口 | 锁死成「传文件」;Quiet 空 header 多一条 chrome |

## 本轮落地范围

- 呈现与入口:抽屉、+ 菜单、拖放、粘贴、文件选择。
- 文本附件发送:把文件内容内联进仍是 `string` 的 prompt,再走现有 `sendInitialPrompt` / `queueFollowUp` / 建 session。
- 图片附件:选中、预览、移除,并通过 Gateway `send_prompt` / `queue_follow_up` / `steer_run` 的 `images` 通道送到 Pi(`ImageContent`:`mimeType` + base64 `data`)。合成 user echo 与 runtime `image` part 用于 Live Chat 回放。
- 斜杠命令先内置 `/compact`、`/clear`(Pi 实有命令)。Skills / Plugins 读配置库存;空则不渲染该分组。

## 明确不在本轮

- 附件写入工作区或持久化进 follow-up draft。
- 斜杠命令 / Skills / 插件的 typeahead 或完整目录浏览器。
