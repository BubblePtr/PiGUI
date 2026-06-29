# Slice 03 — 配置清单（后端 build_config_inventory + master-detail UI）

Status: done
Feature: v1.5-usage-config-dashboard
Covers user stories: 14, 15, 16, 17, 18, 19, 20, 21, 22, 23

## Parent

PRD: `.scratch/v1.5-usage-config-dashboard/PRD.md`

## What to build

填充 `配置` Tab：把 Pi 的安装/设置**只读地**摊开成一个左类目、右详情的清单。这是 V1.5 唯一的新后端接缝。

- **后端新命令** `get_config_inventory() -> ConfigInventory`，包一层**纯函数** `build_config_inventory(agent_dir) -> ConfigInventory`（与 `build_index` 同形：接受目录、返回结构体、可对 fixture 目录单测）。路径解析复用 `resolve_agent_dir()`（`PI_CODING_AGENT_DIR` → `~/.pi/agent`）。
- 数据来源（全部只读）：
  - `settings.json`：`defaultModel`、`defaultProvider`、`defaultThinkingLevel`、`theme`、`packages[]`、`extensions[]`
  - `skills/` 目录：列出本地 skills
  - `extensions/` 目录：补充 extensions 信息
  - prompt templates：作为一个类目；磁盘位置当前未确认，解析不到则该类目返回**空**
- **绝不读取 `auth.json`**；命令**绝不写**任何文件。
- **前端**：master-detail——左类目（模型 / 包 / Extensions / Skills / Prompt Templates），右详情。prompt templates 为空时显示"未安装"。数据随窗口聚焦 / 手动刷新重读。

## Acceptance criteria

- [ ] `配置` Tab 以左类目、右详情呈现
- [ ] 显示默认模型、默认 provider、默认思考力度、theme
- [ ] 显示已安装的包列表、已启用的 extensions、本地可用的 skills
- [ ] Prompt Templates 类目存在；无任何模板时显示"未安装"（不空白、不报错）
- [ ] 后端纯函数 `build_config_inventory(dir)` 有 `cargo test` 单测，对一个 fixture `.pi/agent` 目录（含 `settings.json` + `skills/` + `extensions/`，以及一个**无 prompt templates** 的情形）断言解析结果
- [ ] 验证：命令链路绝不读取/展示 `auth.json`、绝不写任何文件
- [ ] 数据可经窗口聚焦 / 手动刷新更新
- [ ] 暗色模式显示正常、颜色走设计 token

## Blocked by

- Slice 01（三 Tab 应用壳）—— 需要 `配置` Tab 与外壳就位
