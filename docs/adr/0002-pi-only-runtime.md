# Pig 只支持 Pi Runtime

Pig 的 Agent Workspace Control Plane 首版只支持 Pi Runtime，不支持 Claude、Codex、Gemini、OpenCode 或其他 agent runtime。Pig 仍然需要暴露 Pi 已有的多模型能力，因为模型和 provider 是 Pi session 的配置维度；但运行时边界固定为 Pi，避免把首版工程量扩散成通用 ACP agent host。

## Consequences

内部领域模型要区分 Runtime 和 Model：Runtime 只有 Pi，Model 可以很多。ACP 可以继续作为参考词汇或未来互操作方向，但不作为首版产品承诺。
