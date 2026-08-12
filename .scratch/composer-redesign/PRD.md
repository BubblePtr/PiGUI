# Composer 重设计 — 决策记录

Status: decided(2026-08-12,原型探索完成;落地 slice 见 GitHub Issues)
Feature: composer-redesign
Created: 2026-08-12

> 由 /proto/composer 原型探索(prototype skill,5 变体 picker)得出。原型面已拆除;
> 本文档是唯一存活的产物,整合与遗留项以此为准。

## 探索过程

5 个变体:Baseline(现状)、Quiet(极简文本化)、Deck(全槽位控制台)、
Shift(运行态模式切换)、Relay(queue-first)。用户在真实 dev server 中全尺寸
对比后选定 **Relay 方向,叠加 Quiet 的极简底盘**,并追加两轮迭代反馈。

## 胜出方向:queue-first composer

- **运行中提交一律默认排队**。composer 里没有 Queue/Steer 模式切换;
  占位文本切换为 "Queue the next task…",输入时提示 `↵ queue`。
- **路由决策下放到等待区 item**:每条排队消息一行卡片,携带
  **Steer**(立即用这条转向当前 run,实现 = `steerRun` 成功后
  `withdrawQueuedMessage`)和 **Withdraw**。Steer 仅在运行中显示——
  idle 时不渲染死按钮。
- **等待区卡片形态**:单行 truncate(悬停 title 展示全文),无序号
  (上下位置即顺序),`border-border bg-surface` 卡片。
  实现要点:卡片在 grid 容器里必须带 `min-w-0`,否则 nowrap 文本把
  grid item 撑出容器(grid 默认 `min-width:auto`)。
- **composer 底盘沿用现有 ChatPromptInput**(Astryx ChatComposer 壳 +
  原生 textarea),移除运行态 endActions 的 Steer 按钮。

## 被否的方向(为什么)

- **Shift(composer 内 Queue|Steer 分段切换)**:模式环+按钮文案清晰,
  但"先选模式再提交"多一步;用户判断 steer 属于低频动作,不值得占据
  composer 常驻心智。挪到 item 上后频率匹配了。
- **Deck(全槽位常驻)**:空闲时也扛着一身控件,和 PiGUI 日常高频使用
  的"安静"性格不符。其中 context 进度条、附件抽屉留作后续能力。
- **Quiet 的 Enter=steer**:streaming 时 Enter 直接转向太危险
  (误回车即打断当前 run),被 queue-first 取代。

## 模型/思考力度选择器(第二轮迭代,规格保留、落地延后)

原型已验证但用户判定"细节还很多(上下文、fast 模式等),需要单独精做":

- 两级结构:一级 providers,悬停/点击右侧飞出该 provider 的模型子菜单。
  Astryx 无级联菜单组件,子菜单为自建 flyout。
- Popover 外壳有 ~304px 的内建 min-width,内容宽度类压不动它——
  **必须用 Popover 的 `width` prop 定宽**(原型定 232px)。
- 子菜单与一级面板留 8px 可见缝隙(不叠压),配 32px 隐形悬停桥
  (`::before`)防止斜穿缝隙时子菜单中途关闭。
- Thinking 滑杆:拖动时本地 state 跟手、松手才提交(丢掉本地 state
  会导致滑块拖不动——第一轮已踩过)。
- flyout 入场 150ms `cubic-bezier(0.32,0.72,0,1)` scale 0.97→1,
  origin left top,带 prefers-reduced-motion 关闭路径。

## 落地范围之外(能力缺口,GitHub Issues 跟踪)

- **队列拖拽重排**:交互已设计(整卡 draggable、拖动中 45% 透明、目标位
  顶边 accent 指示线),但 PiRuntimeBridge 无 reorder 能力,Pi 拥有队列
  真相,本地假重排会在 projection 刷新时漂移。等 runtime gateway 补
  reorder 后按本规格实现。
- **附件上传/展示**:Astryx 件齐全(FileInput/ChatComposerDrawer/
  Token/Thumbnail),但 bridge 无附件通道。
- **模型选择器精做**:上述规格 + 上下文窗口展示、fast 模式等。
