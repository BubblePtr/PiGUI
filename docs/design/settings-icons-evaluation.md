# Settings 图标评估

2026-09-12。状态：候选建议，尚未实施 Settings 页面替换。本次已实施的补充仅为 Header 右上角的 Dock 开关镜像。

## 范围与判断

按 `apps/desktop/src/pages/settings.tsx` 的五个导航入口及实际内容评估，同时在本地 mock 的 Settings 弹窗检查现有图形与布局。优先继续使用 Hugeicons Animated；以下五枚均已在固定版本的上游源码中确认存在。动画描述取自源码，尚未把这些候选接入正式 Settings 页面做最终视觉验收。

| 入口 | 当前图标 | 首选候选 | 优先级 | 语义理由 | 原版动作 |
| --- | --- | --- | --- | --- | --- |
| Providers | `Globe` | [`key-01`](https://github.com/enesgules/hugeicons-animated/blob/10d719295bdf4247ae2da4dd10a05db412570ce2/icons/key-01.tsx) | 优先换 | 本页实际管理订阅登录与 API key，钥匙表达认证比地球更直接。若以后变成服务连接管理，可再考虑 `link-01`。 | 整把钥匙轻推、转动后回位；原版约 0.5 秒。 |
| Models | `Bot` | [`robot-01`](https://github.com/enesgules/hugeicons-animated/blob/10d719295bdf4247ae2da4dd10a05db412570ce2/icons/robot-01.tsx) | 换动画版本 | 机器人仍适合模型入口，改用该库的机器人头部图形；不必为了变化更换类别。 | 天线、头部与眼睛响应，约 1 秒；16px 下需控制原版屏幕细节的存在感。 |
| Chats | `FolderOpen` | [`message-01`](https://github.com/enesgules/hugeicons-animated/blob/10d719295bdf4247ae2da4dd10a05db412570ce2/icons/message-01.tsx) | 优先换 | 目前内容只有工作目录，但导航标识应表达 Chats，而不是绑定当前唯一的文件夹设置。与 New Chat 的加号气泡组成同一套语义。 | 气泡展开，文字线随后写入；两个阶段合计约 0.7 秒。 |
| Changelog | `Sparkles` | [`file-01`](https://github.com/enesgules/hugeicons-animated/blob/10d719295bdf4247ae2da4dd10a05db412570ce2/icons/file-01.tsx) | 建议换 | 更新记录是可阅读的版本文档；纸张比星光明确，也避免和 Skills / AI 功能混用星光语义。 | 纸张微动，内部文字线伸缩；约 0.6 秒。 |
| About & Updates | `RefreshCw` | [`information-circle`](https://github.com/enesgules/hugeicons-animated/blob/10d719295bdf4247ae2da4dd10a05db412570ce2/icons/information-circle.tsx) | 优先换 | 入口承载应用信息与版本状态。刷新箭头更适合具体的 Check for updates 动作，不能代表整个页面。 | 圆框、字干与圆点轻弹；原版约 0.56 秒。 |

## 动效边界

- 候选只用于左侧五个导航按钮，沿用 16px / 1.5 线宽，悬停播一轮，不因切换到选中项而循环。
- Providers 卡片与 Models 分组中的供应商品牌图标保持品牌原形与静态。它们负责识别服务商，不是需要强调的操作入口。
- About 中的 Pace 应用图标、Changelog 时间轴的圆点保持静态；圆点表示版本位置，不表示加载。
- 不给每个表单按钮补装饰性图标。更新检查如果使用刷新动效，应跟随实际检查状态；禁用、减少动态效果以及键盘单独聚焦的处理与已接入的 Header 图标一致。
- `robot-01` 原版细节较多，最终接入前以实际 16px 导航大小判断，优先保留清楚的头部与眨眼动作。其余候选的动作无需额外编造。

备选中，`earth` 的连续地球滚动更容易被理解为网络或地理；`sparkles` 更像新功能提示；`history` 已用于 Trajectory。它们都存在于同一来源库，但不作为这五个入口的首选。
