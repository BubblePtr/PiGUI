# ADR-0024：Model / Thinking controls 以 runtime capability 为准

- 状态：已接受
- 日期：2026-07-19
- 关联线稿：[`docs/wireframes/m4-model-thinking-controls.tldraw`](../wireframes/m4-model-thinking-controls.tldraw)

## 背景

PiGUI 需要在 Session composer 中切换下一次运行使用的 Model 和 Thinking。不同模型支持的 Thinking 档位并不相同，Pi SDK 还允许模型通过 `thinkingLevelMap` 禁用某些档位。因此 UI 不能维护一份独立、静态的模型能力表，也不能让 SDK 在提交后静默修正无效档位。

配置还必须跨桌面进程重启恢复，并且不能在 active run 中途改变。

## 决策

1. `RuntimeGatewaySnapshot.modelControls` 是 renderer 的实时真相，包含当前可用模型、每个模型支持的 Thinking 档位和当前选择。
2. backend Session Projection 只持久化 `modelSelection`，不持久化可重新发现的 capability 列表。
3. Model 与 Thinking 作为一个 `configure_model` 命令提交。driver 在切换模型前验证模型可用性和 Thinking 档位；active run 直接拒绝。
4. cold resume 时，Gateway 从 Session Projection 读取选择并传给 SDK resumer；SDK runtime 暴露前先恢复这组选择。
5. composer 只显示一个组合按钮。popover 内 Model 使用列表，Thinking 使用按当前模型 capability 动态生成的离散 slider。切换模型时，如果原档位不可用，UI 明确选择数值距离最近的可用档位，再提交完整配置对。
6. Pi SDK driver 提供完整能力；legacy Pi RPC driver 明确返回不支持，不伪造 capability。

## 结果

- UI、Gateway 与 SDK 使用同一份能力真相，不会出现静态选项漂移。
- 无效组合在 driver 边界失败，不依赖 SDK 的静默 clamp。
- Projection 文件保持小而稳定；重启恢复不依赖 renderer 本地状态。
- 配置命令当前只保证 PiGUI API 层的原子性。SDK 内部仍按“先 Model、后 Thinking”调用，但所有失败前置条件都会在第一次写操作前完成验证。
