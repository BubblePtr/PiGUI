# 更新日志维护

Settings Dialog 的 Changelog 分类展示正式发布的用户可感知变化，入口使用当前路由的 `settings=changelog` 查询参数。打开与切换分类沿用设置弹窗行为，保留工作区和未保存的设置输入。

## 内容来源

唯一数据源是 `apps/desktop/src/entities/release/changelog.ts` 的 `changelogReleases`。内容随应用打包，因此断网也能阅读；不会在打开设置时请求 GitHub。当前收录的 v0.0.1 根据 [正式发布记录](https://github.com/BubblePtr/pace/releases/tag/v0.0.1) 整理，发布日期为 2026-09-06。

页面文案沿用应用现有的英文界面。仅展示已发布功能，不把主干上的未发布变更或开发计划计入历史版本。每个版本附原始 GitHub Release 链接；桌面端通过已有 `browser_open_external` 通道打开系统浏览器，失败时在链接下提示重试。

## 新版本发布时

1. 在发布构建前为本次发布补充一条记录：`version` 不带 `v` 前缀，`date` 使用 UTC 发布日的 `YYYY-MM-DD`，`url` 指向对应 GitHub Release。
2. 填写简短标题、摘要及 `changes`。每项变更包含 `kind`、面向用户的标题和说明；`added`、`improved`、`fixed` 分别显示为新功能、改进和修复，空分类不展示。
3. 页面按日期倒序排列，同日发布的条目在数据中保持新版本在前。日期按 UTC 显示，避免用户时区把发布日期移到前一天。Latest 标记指向随当前构建收录的最新版本，不代表已联网检查更新。
4. 运行 `bun run test apps/desktop/src/pages/settings.test.tsx apps/desktop/src/pages/settings-changelog.test.tsx` 和 `bun run build`，并在开发页面检查桌面、窄窗口与内容滚动。

更新已发布版本的历史说明需要随下一次应用构建分发。检查是否有新版本与下载更新仍由 About & Updates 分类负责。
