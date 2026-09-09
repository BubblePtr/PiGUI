# 静态功能场景

运行 `bun run dev:mock`，打开 <http://127.0.0.1:1421>。页面直接进入 **Pace-Mock** 项目的会话；无需创建对话、启动 Pi 或配置模型密钥。修改业务组件后由 Vite 热更新。

## 场景与检查点

| Session 列表中的场景 | 检查什么 | 预期表现 |
| --- | --- | --- |
| 01 · 会话、Changes 与 Files | Markdown、代码块、表格、轨迹折叠、工具详情 | 打开即显示完整会话，展开 Worked for 可查看思考和工具调用 |
| 同一会话的 Changes | 修改、新增、删除、重命名、二进制，暂存与工作区状态 | 五个变更条目；`src/greeting.ts` 展示一行删除和一行新增 |
| 同一会话的 Files | 目录展开、代码预览、空目录、二进制、截断文件 | `src/greeting.ts` 与 Changes 新版本一致；`empty` 为空；`assets/logo.png` 显示二进制提示；`logs/large.txt` 显示截断提示 |
| 02 · 长会话与长输出 | 会话滚动、返回底部、长标题、工具输出折叠 | 32 轮固定对话，每次工具结果含 500 行文本 |
| 03 · 无变更与空目录 | Dock 空状态 | Changes 无变更，Files 无文件 |
| 04 · 工具失败与 Dock 读取错误 | 错误信息、失败工具详情、刷新入口 | 工具报错，Changes / Files 显示固定 EACCES 错误；刷新仍失败，便于检查错误布局 |
| 列表样例 1–12 | Session 列表滚动、长标题截断、悬浮菜单、切换选中 | 列表足够长，切换后展示对应会话 |

另有一条已归档记录，按现有业务规则从常规列表隐藏。

## 使用边界

- 使用真正的 Session 页面、Gateway 快照投影、Dock 和文件渲染器；固定数据位于 `apps/desktop/src/dev/mock/scenarios.ts`。新增静态回归场景时，在这里补充数据，并更新上表的预期表现。
- 此入口使用独立的浏览器端口和本地存储，不读取 Electron 的真实会话目录。固定记录和文件只存在于内存，刷新后重新生成；侧栏折叠等界面偏好仍由现有页面保存。
- 发消息、重命名、归档、Git 写操作、Terminal、嵌入式 Browser 等未支持命令明确报错，不伪造执行成功。真实流式、停止、恢复时序和操作结果请使用 `bun run dev` 验证。
- 专用 Vite 配置只允许开发服务，并将 HTML 入口替换成 mock bootstrap。正常 `dev` 和 Electron 打包仍使用原入口，不加载这些场景。
- mock 入口预加载 TypeScript / Markdown 高亮资源。目前 diff 渲染器在 StrictMode 重挂载与高亮器冷启动同时发生时可能留下空正文；预热让静态预览稳定，但不代表这个真实 dev 冷启动问题已修复。StrictMode 本身保持开启。

## 验证

`bun run test apps/desktop/src/dev/mock/scenarios.test.ts apps/desktop/src/shared/runtime.test.ts` 检查会话打开、Changes / Files 路径一致性以及现有运行时接口；`bun run typecheck` 检查数据契约。视觉回归应通过本地 dev 页面截图验证。
