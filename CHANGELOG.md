# 更新日志

本文件记录面向使用者的重要变更。细粒度提交历史见 git log。

## 未发布

- **feat** 多层聚合：父分组折叠时，徽标聚合所有后代分组的会话状态，不再只看直接成员。嵌套的 workspace 目录结构现在能正确反映整棵子树的活动。
- **fix** 上面这条「多层聚合」交付时是坏的：折叠的父文件夹会**漏算处于展开状态的中间层文件夹**的会话。`directStatusesForGroups` 沿用了「展开即 `EMPTY_LIVE_STATUS`」的占位写法，而聚合器把这个值当输入消费，于是展开的中间层对祖先贡献 0。现在展开的分组同样被测量，「不画徽标」退回渲染层决定。实测：dsh-group-status 展开且 1 个运行中、dsh-gitea-dispatch 1、dsh-later 3 时，dsh-plugins 的折叠徽标由 `4` 修正为 `5`。
- **fix** 折叠文件夹时完全没有淡出动画。`AnimatedRows` 的 `resetKey` 混入了 `sessionLimits`，而上游在折叠时会把该组的 limit 重置回默认值 → `resetKey` 变化 → 动画被整个跳过。属上游行为（vendor 基线 `d70ad82`），非本仓库引入。副作用：「展开其余 N 个会话」现在也会淡入而非瞬时呈现。
- **test** 徽标管线的测试此前是**自欺**的：`groupOf()` 在测试里手工赋值 `group.liveStatus`，而那份手工副本编码的正是上面第一个错误语义——所以少算 bug 能一路绿灯合入。改为走真实管线 `deriveGroups → directStatusesForGroups → aggregateGroupStatuses`，并给聚合路径补上全折叠 / 全展开两侧的 perf 护栏。变异验证：把 bug 塞回去，红 6 个测试（此前 0 个）。
- **refactor** 未经聚合的行现在在类型上不可表示：`StatusedGroupNode`（`liveStatus` 必填）+ `withAggregatedStatus` 生产者。上游的 `GroupNode.liveStatus?` 与 vendored 文件的签名均未改动。
- **refactor** 删掉 `tree.ts` 里无人使用的 re-export（两个值只有测试在用，4 个跨插件 summary 类型零消费方）。`tree.ts` 相对上游基线的新增分歧 31 → 18 行。
- **docs** 修正 README 的徽标数字公式：漏了「运行中的子智能体」一项，且「有徽标就带数字」与 `countThreshold` 默认值 2 自相矛盾。
- **perf** 代价说明：为正确性放弃了「展开的分组跳过聚合计算」这一优化，展开分组现在也会被测量（折叠祖先需要它的数字）。该成本由新增的 perf 用例守住。
- **feat** 设置项从 1 个扩展到 7 个：5 个按状态显隐（进行中 / 待审批 / 已完成 / 定时任务 / 等待评审）+ 悬停明细开关 + 数字显示阈值。设置卡片分 3 个 section，每个开关独立控制对应来源的点/图标是否出现在折叠徽标、悬停明细与计数中。
- **feat** 数字显示阈值（`countThreshold`）：取代原来的布尔开关 `alwaysShowCount`。现在可以设置一个数字阈值，只有当聚合数量 >= 该阈值时才在徽标上显示数字。默认 2（即 count=1 时省略，因为状态点已表达"有东西"）；设为 1 则始终显示；设为 3 则 count=1 和 count=2 时都不显示。
- **fix** 设置项 `showCompletedInBadge` 在 GUI 里根本没有入口：宿主只把 `Config` 投影成客户端表单，插件页要插件自己往 `plugins.bundle.config` 注册卡片才画得出来。现在侧栏 **插件** → dsh-group-status 的 bundle 详情页有这张卡片，保存后写进 profile patch 并即时生效。外观与交互不自造——用官方 `SettingsForm` / `SettingsFormModel` / `Switch`，与「插件 → 官方 → 子智能体」同一套框架与取值。README 此前描述的路径是文档超前于实现，文案与升级手册已同步。
- **test** 新增字段规格（真实现）与卡片接线（官方组件契约等价桩）用例。

## 0.2.0-rc.2-fork1

- **feat** 折叠分组聚合徽标：收起的文件夹行显示进行中（转圈）、待审批（黄点）、已完成（绿点）的聚合状态，带数字与悬停明细。
- **feat** 跨插件聚合（可选）：接入 dsh-later 定时任务（时钟图标）与 dsh-gitea-dispatch 等待评审（列表笔图标），未安装时静默降级。
- **feat** 设置项 `showCompletedInBadge`：可关闭折叠徽标上的「已完成」绿点，默认开启。
- **feat** 无障碍：徽标带 `role="img"` + 本地化 `aria-label`，悬停 `title` 同文案。
- **refactor** 拆分 `badge-settings` / `group-status` 模块，新增 `GroupBadge` 组件。
- **refactor** 上游 `tree.ts` / `Rows.tsx` 代码下沉，侧栏展开态与官方版本逐像素一致。
- **docs** 中英双语 README + 上游升级手册 + 跨插件摘要模板说明。
- **test** 上游 spec 本地可跑（vitest + jsdom），新增折叠聚合用例（计数、待处理类互斥、子智能体、空白/归档跳过、跨插件来源）。
