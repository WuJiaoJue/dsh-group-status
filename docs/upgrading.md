# 上游升级手册（rebase runbook）

本仓库是 `@deepseek-ai/dsh-client-ui-workspace` 的 **fork 覆盖包**：同一个侧栏槽位再注册一份，并把官方那一行 disable。
上游一换代，本包就得手工 rebase 一次。这份手册写清楚基线从哪来、本地改了哪几处、下一代怎么合、怎么验证。

> 目标读者：维护者。使用与安装请看 [README](../README.md)。

## 基线从哪来

- **基线版本**：`@deepseek-ai/dsh-client-ui-workspace 0.2.0-rc.2`（DSH `dsh-v0.2.0-rc.2` 源码树）。
- **来源**：`src/` 与 `tests/` 是上游对应包的**源码副本**，在 `d70ad82`（“build: vendor upstream source, own the build”）里一次性拷入，此后由本仓库自己构建。
- **不要再 diff `lib/`**：`lib/client.js` 是 tsdown 产物（`window.__ModuleLoader__.load({ id: 'dsh-group-status', factory })` 闭包工厂），不是可 diff 的官方复制品；npm 上发布的上游包同样只带构建产物。**rebase 对象永远是 `src/`。**
- **构建链**：`build/tools/` 是上游 tsdown 客户端预设拉平后的自包含副本（自解析 manifest、扁平导入、不扫 monorepo 路径）；`tsconfig.json` 是独立客户端配置，去掉了 monorepo base 与 project references。
- **产物要提交**：`lib/` 随仓库提交，`dsh plugin --profile web add "github:WuJiaoJue/dsh-group-status"` 直接吃它。**改完 `src/` 必须 `pnpm build` 并一并提交 `lib/`**，否则从 GitHub 安装的人拿不到新行为。
- **产物不是逐字节可复现的**：`lib/client.js` 里 CSS Modules 的类名哈希（如 `.eCE9Ta_…`）与 `//#region` 注释路径都跟**构建时的绝对路径**有关。同一份 `src/` 在不同 checkout（比如 issue worktree）里构建，`lib/` 会有几十行「只有哈希和路径不同」的 diff——那是噪声，不是功能差异。所以：**谁改 `src/` 谁重建并提交**，review 时不要把这种 diff 当行为变更。

## 本地改动清单（rebase 时逐条重新施加）

| # | 文件 / 符号 | 改了什么 |
|---|---|---|
| 1 | `src/client/tree.ts` — `GroupLiveStatus`、`summarizeGroupStatus()`、`GroupNode.liveStatus` | 折叠时也对该分组的全部成员算聚合计数；含跨插件两个可选入参（schedule / waiting-review） |
| 2 | `src/client/rows/Rows.tsx` — `groupLiveLabel()` / `groupLiveBadge()` | 折叠且有活时在 `ProjectRowItem` 上画徽标（点 + 图标 + 数字），`role="img"` + `aria-label` |
| 3 | `src/client/rows/Rows.tsx` — `WorkspaceHoverContent` 的 `status` prop | 折叠时在 hover 卡里追加聚合明细行 |
| 4 | `src/client/rows/Rows.module.css` — `.groupBadge*` / `.groupLive*` | 徽标与数字的样式 |
| 5 | `src/client/rows/WorkspaceBrowser.tsx` — `require('dsh-later/client')` / `require('dsh-gitea-dispatch/client')` | 可选消费跨插件摘要 hook，容忍未安装（`try/catch` 后保持 `undefined`） |
| 6 | `src/client/cross-plugin-summary.ts` | **本仓库新增文件**（上游没有）：provider 侧摘要骨架，导出 `createSummaryStore` / `createSummaryRegistry` / `defaultCanPoll` / `entryFor` / `mapEquals` / `normalizeSessionId` / `summarizeGroup` |
| 7 | `src/client/locales.ts` | 复用上游文案键；只新增了 `status.waitingReview` 与 `status.scheduled`（中 / 英） |
| 8 | `package.json` | `dsh.client.external: ["dsh-later", "dsh-gitea-dispatch"]`；`icon` 字段；`test` / `test:node` / `test:spec` / `test:watch` 脚本与测试用 devDependencies |
| 9 | `vitest.config.ts`、`tests/support/`、`tests/group-status.client.spec.ts` | **本仓库新增**：让上游 spec 在独立仓库可跑（见下节），加一份属于本包的折叠聚合 spec |
| 10 | `tests/cross-plugin-summary.node.test.mjs` | **本仓库新增**：模板模块的 12 条 `node --test` 用例（import 编译产物 `lib/types/client/cross-plugin-summary.js`，所以 `test:node` 先跑 `types`） |

`cordis.patch.yml` 只有两条：`insert` 本包、`ui-workspace` `disabled: true`。升级不动它。

## rebase 步骤

1. **取新基线源码**：从新一代 DSH 源码树取 `@deepseek-ai/dsh-client-ui-workspace` 的 `src/` 与 `tests/`（不要用 npm 包的 `lib/`）。
2. **先看上游动了什么**：把新基线的 `src/` 与本地 `src/` 逐个 diff，重点看第 1–5、7 条改动落点周围有没有结构变化，以及槽位名 / 组件签名是否变了（见下节）。
3. **覆盖再施加**：用新基线覆盖 `src/`、`tests/`，然后按上表逐条把本地改动重新施加（不要直接 `git merge` 整棵源码树之外的东西）。
4. **补跨插件接入**：第 5、6、10 条属于本仓库新增能力，覆盖后要确认两个 hook 的接入点还在、`src/client/cross-plugin-summary.ts` 未被删、模板用例仍全绿。
5. **类型检查**：`npx tsc --noEmit -p tsconfig.json` 必须干净（上游严格选项不变）。
6. **构建**：`pnpm build`（= `pnpm types` + `tsdown`）→ 产出 `lib/index.js`、`lib/client.js`、`lib/types/`。
7. **跑测试**：`pnpm test` 必须全绿；看到跳过的 spec 数变了要回头核对下节。
8. **重装重启**：
   ```sh
   dsh plugin --profile web remove dsh-group-status
   dsh plugin --profile web add "link:$PWD"    # 或 github: 装法
   # 重启 dsh web
   ```
9. **验证**（见下节），然后提交：commit 信息写清新基线版本，`lib/` 一起提交；tag 带基线，如 `v0.2.0-rc.2-fork1`。

## 测试基线

`pnpm test` = `test:node`（`npm run types && node --test`，12 用例）→ `test:spec`（`vitest run`，jsdom，4 个文件 / 96 用例）。合计 **108 用例**：

| 文件 | 来源 | 覆盖 |
|---|---|---|
| `tests/cross-plugin-summary.node.test.mjs` | **本仓库** | provider 侧模板：store 订阅、迟到登记自愈、分组折叠、id 归一、帧等值（12 用例，`node --test`）|
| `tests/tree.client.spec.ts` | 上游 | 分组派生、排序、会话行与搜索 |
| `tests/browser-styles.client.spec.ts` | 上游 | 侧栏样式契约（直接读 CSS 文件） |
| `tests/animated-rows.client.spec.tsx` | 上游 | 行动画 |
| `tests/group-status.client.spec.ts` | **本仓库** | 折叠聚合：计数、待处理类互斥、子智能体、空白/归档跳过、定时任务与等待评审聚合、未安装时降级 |

**7 个上游 spec 被显式跳过**（`vitest.config.ts` 顶部的 `MONOREPO_ONLY_SPECS`），因为它们在独立仓库里无解：

- `rows` / `workspace-browser` / `workspace-picker`：`@deepseek-ai/dsh-client-test-runtime` 深导入 `dsh-client-ui-renderer`、`dsh-api-session-controller` 的**源码**（`…/src/client/bind.ts`、`scoped-slots.tsx`、`scope.ts`）。这些包不发布 `src/`（`0.2.1-alpha` 也没有），产物里也没有导出 `bindSnapshotSelector` / `createSlotRenderer`。
- `apply` / `shortcuts` / `workspaces-service` / `session-actions` / `host-home-staleness` / `rename-assembly`：从已发布的 `…/client` 产物里取**运行期值**（`SlotRegistry`、`LocaleRuntime`、`LayoutController`、各种 `*Error`）。这些产物是闭包工厂，`require` 图假定宿主已预载外部依赖——例如 `dsh-client-ui-primitives` 自己**一个依赖都不声明**，却 require 了 shiki / katex / micromark 全家桶。要在本地跑就得把 DSH 应用整棵依赖树装成插件 devDependencies。

> 底线：不要给这两类写假实现让它们变绿——那测的是假实现。上游哪天开始发布 `src/` 或宿主无关的测试运行时，删掉对应条目即可。

`vitest.config.ts` 还负责四件让上游 spec 保持原样的接线：把 `@deepseek-ai/dsh-client-ui-workspace/client` 指到本仓库 `src/client/index.ts`；把 `@deepseek-ai/dsh-client-locale/src/locales/{en,zh}.ts` 指到 `tests/support/common-locale.ts`（该包只发布类型，没有运行期字典）；把 `../../shortcuts/src/client/registry.ts` 指到 `@deepseek-ai/dsh-client-shortcuts/client`；给测试模块真实的 `file:` URL（有一个 spec 用 `new URL(..., import.meta.url)` 读文件）。`tests/support/setup.ts` 每个用例前清 `localStorage`——viewing store 会从 `dsh.workspace.view.v5` 水合，不清就会串上一条用例的排序状态。

依赖说明：`vitest` / `jsdom` / `@testing-library/react` 是测试运行的直接依赖；`zustand` 与 `immer` 是给 `@deepseek-ai/dsh-client-store` 补的——该包**没有声明**这两个依赖，它假定宿主提供（版本对齐宿主：`zustand@5.0.10`、`immer@10.2.0`）。

## 核对清单：上游换代时最容易踩的两类东西

**槽位名是否改名**（本包注册 / 消费的）：

- `sidebar.workspaces`
- `sidebar.workspaces.session.menu.item`
- `sidebar.workspaces.session.row.action`
- `sidebar.session.row.leading` / `sidebar.session.row.hover`
- `conversation.hero.workspace`
- `shell.overlay`

**组件签名是否变化**（本包改过的两处所在）：

- `ProjectRowItem`：`group, containsCurrentDescendant, onToggle, onCreate, actions, drag, home, newShortcut, t`
- `WorkspaceHoverContent`：`label, cwd, createdAt, status, t`

**跨插件接口是否搬家**：

- dsh-later 的 `useScheduleSummary()`（见其 README 的跨插件摘要 API 一节）
- dsh-gitea-dispatch 的 `useWaitingSummary()`（issue #16）
- provider 侧模板的导出面（`createSummaryStore` / `createSummaryRegistry` / `summarizeGroup` / `mapEquals` / `entryFor` / `normalizeSessionId` / `defaultCanPoll`）——它被别的插件**复制**走，改名会静默影响它们的调用点；设计说明与「复制、不要 import」的实测依据写在 [`src/client/cross-plugin-summary.ts`](../src/client/cross-plugin-summary.ts) 文件头

## 验证

1. 找一个有进行中 / 待审批会话的分组 → 收起 → 文件夹名后出现徽标；
2. 悬停文件夹行 → 明细行出现，文案与徽标 `aria-label` 一致；
3. 展开分组 → 徽标消失，子行自带状态；
4. 组内有定时任务时出现时钟图标（紫 / 橙 / 红）；有等待评审时出现列表笔图标（琥珀 / 红）；
5. 临时卸掉 dsh-later / dsh-gitea-dispatch → 图标消失但**不报错**、不空转；
6. 浏览器 console 无报错；
7. 中 / 英界面语言切换后文案跟随。

## 回滚

```sh
dsh plugin --profile web remove dsh-group-status
# 两条补丁一起撤，官方行自动回来；重启 dsh web 生效
```

## 已知限制

- 本包 vendored 上游源码，不是公共 API 消费方：上游重构时 rebase 成本可能不止「重新施加 10 条」。
- 聚合计数与展开态共用同一份派生，超大分组（数百会话）每次状态变更多一次全量 traverse，与展开渲染同量级。
- 定时任务按「组内有」计 1，不按任务条数累计，也不占 hover 明细行。
