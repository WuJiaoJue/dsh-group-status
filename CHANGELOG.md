# 更新日志

本文件记录面向使用者的重要变更。细粒度提交历史见 git log。

## 未发布

- **feat** 多层聚合：父分组折叠时，徽标聚合所有后代分组的会话状态，不再只看直接成员。嵌套的 workspace 目录结构现在能正确反映整棵子树的活动。
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
