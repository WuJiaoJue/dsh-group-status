/**
 * 跨插件摘要模板：把「可订阅 store + 迟到的登记表 + React hook」做成可复制的骨架。
 *
 * ## 它解决什么
 *
 * 一个插件想把自己的状态暴露给**别的插件**消费（dsh-later 的定时任务、
 * dsh-gitea-dispatch 的等待评审……），每家的 store/hook 骨架几乎一样，只有数据源
 * 不同。本模块把骨架抽出来，复制进插件即可用。
 *
 * ## ⚠️ 为什么是"复制"而不是"import"
 *
 * 跨插件**值导入**在本项目行不通，且是**实测**的（不是规范推断）：
 *
 * ```
 * ✘ [ERROR] Could not resolve "dsh-group-status"
 *     import { … } from "dsh-group-status"
 * ```
 *
 * 别的插件不依赖本包，客户端 bundle 又是自包含的闭包工厂，所以跨包 import 只会
 * 解析失败；而 bundle 纯净度闸门只拦 `@deepseek-ai/*` 前缀，连"跨插件值导入"的
 * 专用报错都不会给。**能共享的只有声明在 `dsh.client.external` 里的模块表行**，
 * 那不是本模块的形态。
 *
 * 因此正确的接法是：
 *   - **provider 侧**：复制本模块 → `createSummaryStore` 建 store →
 *     `createSummaryRegistry` 建登记表 → 在 `apply` 里 `registry.setStore(store)` →
 *     把 `registry.useSummary` 连同 `getStore` 一起**从自己的 client 入口导出**；
 *   - **consumer 侧**：`require('<provider>/client')` 拿它导出的 hook（就像
 *     dsh-group-status 用 `useWaitingSummary` 那样）。登记表让 provider 的 `apply`
 *     晚于 consumer 渲染时也能自愈——这条是跨插件 hook 能工作的**关键**。
 *
 * ## 与上一版草稿的差别（每条都有测试锁住）
 *
 * | 问题 | 上一版 | 本版 |
 * | --- | --- | --- |
 * | 内容相同也每次轮询都通知 | `next !== snapshot` 引用比较，实测 11 次轮询通知 **11** 次 | `equals` **必填**，实测通知 **1** 次 |
 * | store 迟到就永远失效 | hook 把 store 当闭包实参；传 `undefined` 后再登记也不会恢复 | `createSummaryRegistry` 订阅登记表，迟到自愈 |
 * | 后台标签页仍轮询 | `setInterval` 无门控 | 默认「仅页面可见时轮询」，可注入 `canPoll` |
 * | 渲染期副作用 | `getSnapshot()` 里 `startPolling()` | 轮询在创建时启动，`getSnapshot` 保持纯净 |
 * | 状态推进靠固定 tick | 只能等下一个 interval | 可选 `scheduleNext` 精确定时（如截止时刻翻转） |
 * | React 靠 `require` + `@ts-ignore` | 宿主半边引用会静默变 no-op | 静态 `import`，构建期即暴露问题 |
 * | 折叠只回 `{sessions, entries}` | 状态优先级仍要各写一遍 | `summarizeGroup` 带 `rank`/`stateOf` 折叠 |
 *
 * @module dsh-group-status/client/cross-plugin-summary
 */
import { useSyncExternalStore } from 'react'

/* ------------------------------------------------------------------ *
 * 定时器面：测试可注入，避免用例里真的睡时间
 * ------------------------------------------------------------------ */

/** 本模块用到的最小定时器/文档面。 */
export interface SummaryTimers {
  setTimeout(handler: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
  setInterval(handler: () => void, ms: number): unknown
  clearInterval(handle: unknown): void
}

const globalTimers: SummaryTimers = {
  setTimeout: (handler, ms) => globalThis.setTimeout(handler, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
  setInterval: (handler, ms) => globalThis.setInterval(handler, ms),
  clearInterval: (handle) => globalThis.clearInterval(handle as ReturnType<typeof globalThis.setInterval>),
}

/**
 * 缺省的轮询门控：页面不可见时不打网络。
 *
 * 后台标签页的轮询没有意义（用户看不见），却会真的发请求——本项目其它 store 也是
 * 同一取向。没有 `document`（Node/测试）时视为可见。
 */
export function defaultCanPoll(): boolean {
  const doc = typeof document === 'undefined' ? undefined : document
  return doc === undefined || doc.visibilityState === undefined || doc.visibilityState === 'visible'
}

/* ------------------------------------------------------------------ *
 * store：唯一数据权威
 * ------------------------------------------------------------------ */

/** 可订阅的快照源。 */
export interface SummaryStore<T> {
  /** 当前快照；`undefined` = 还没拿到（或已 dispose）。 */
  getSnapshot(): T | undefined
  /** 订阅快照变化，返回退订函数。 */
  subscribe(listener: () => void): () => void
  /** 立即拉一次（不影响轮询节奏）。 */
  reload(): void
  /** 清理定时器与监听（宿主卸载时调用）。 */
  dispose(): void
}

export interface SummaryStoreConfig<T> {
  /**
   * 拉取快照。返回 `undefined` 表示**这次没拿到**（失败 / 无数据）：
   * store 会保留上一份快照且不通知，避免一次网络抖动把界面抹掉。
   */
  fetch: () => Promise<T | undefined>
  /**
   * 内容等价判定。**必填**：store 不知道 `T` 的形状，替你猜必然出错。
   *
   * ⚠️ 这不是"可选优化"。端点每次 `JSON.parse` 都产出新对象，若用引用比较，
   * 每次轮询都会通知 → 每个消费方每次轮询白重渲染（实测同样内容下 11 次轮询
   * 通知 11 次 vs 内容比较的 1 次）。Map 形态直接用 {@link mapEquals}。
   */
  equals: (previous: T | undefined, next: T | undefined) => boolean
  /** 轮询间隔（毫秒）。`0` = 只拉一次不轮询。缺省 15000。 */
  intervalMs?: number
  /** 是否创建后立即拉一次。缺省 true。 */
  immediate?: boolean
  /** 是否允许此刻发请求。缺省 {@link defaultCanPoll}（仅页面可见时）。 */
  canPoll?: () => boolean
  /**
   * 状态推进定时：给定当前快照，返回"多久后需要重算/重通知"（毫秒）。
   *
   * 用于「快照本身没变、但**派生状态**随本地时钟翻转」的场景（如等待窗口到期
   * `waiting → overdue`）。到点只通知（让消费方按自己的时钟重算），不重新拉取。
   * 缺省不装这个定时器。
   */
  scheduleNext?: (snapshot: T) => number | undefined
  /** 定时器注入（测试用）。缺省全局定时器。 */
  timers?: SummaryTimers
}

/**
 * 创建可订阅摘要 store（provider 的 `apply` 里创建一次）。
 *
 * 生命周期：构造即按 `immediate` 拉一次并装上轮询定时器——**不在
 * `getSnapshot()` 里启动**（那是渲染期副作用，React 要求 `getSnapshot` 纯净）。
 */
export function createSummaryStore<T>(config: SummaryStoreConfig<T>): SummaryStore<T> {
  const intervalMs = config.intervalMs ?? 15_000
  const immediate = config.immediate ?? true
  const timers = config.timers ?? globalTimers
  const canPoll = config.canPoll ?? defaultCanPoll
  const doc = typeof document === 'undefined' ? undefined : document

  const listeners = new Set<() => void>()
  let snapshot: T | undefined
  let disposed = false
  let inFlight = false
  let pollTimer: unknown
  let stateTimer: unknown

  const notify = (): void => {
    // 快照一份再遍历：订阅者可能在回调里退订。
    for (const listener of [...listeners]) {
      try {
        listener()
      } catch {
        /* 单个订阅者异常不影响其余订阅者与主流程 */
      }
    }
  }

  const clearStateTimer = (): void => {
    if (stateTimer === undefined) return
    timers.clearTimeout(stateTimer)
    stateTimer = undefined
  }

  /** 按 `scheduleNext` 把"下一次派生状态翻转"排成一次性定时器。 */
  const armStateTimer = (): void => {
    clearStateTimer()
    if (disposed || config.scheduleNext === undefined || snapshot === undefined) return
    const delay = config.scheduleNext(snapshot)
    if (delay === undefined || !Number.isFinite(delay)) return
    stateTimer = timers.setTimeout(() => {
      stateTimer = undefined
      // 先重排下一次，再通知：某个订阅者抛错也不该让定时链断掉。
      armStateTimer()
      notify()
    }, Math.max(0, delay))
  }

  const refresh = (): void => {
    if (disposed || inFlight) return
    inFlight = true
    void Promise.resolve()
      .then(() => config.fetch())
      .then((next) => {
        if (disposed || next === undefined) return
        if (config.equals(snapshot, next)) return
        snapshot = next
        notify()
        armStateTimer()
      })
      .catch(() => undefined)
      .finally(() => {
        inFlight = false
      })
  }

  const onVisibilityChange = (): void => {
    if (disposed || !canPoll()) return
    refresh()
  }

  if (immediate) refresh()
  if (intervalMs > 0) {
    pollTimer = timers.setInterval(() => {
      if (canPoll()) refresh()
    }, intervalMs)
  }
  doc?.addEventListener('visibilitychange', onVisibilityChange)

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    reload: refresh,
    dispose: () => {
      if (disposed) return
      disposed = true
      if (pollTimer !== undefined) timers.clearInterval(pollTimer)
      clearStateTimer()
      doc?.removeEventListener('visibilitychange', onVisibilityChange)
      listeners.clear()
    },
  }
}

/* ------------------------------------------------------------------ *
 * 登记表：让"迟到的 store"自愈——跨插件 hook 的关键
 * ------------------------------------------------------------------ */

/** `useSyncExternalStore` 的形状（测试可注入替身）。 */
export type UseSyncExternalStoreLike = <S>(
  subscribe: (onStoreChange: () => void) => () => void,
  getSnapshot: () => S,
  getServerSnapshot?: () => S,
) => S

const noopSubscribe = (): (() => void) => () => undefined
const undefinedSnapshot = (): undefined => undefined

/**
 * 跨插件摘要的登记表 + hook。
 *
 * provider 侧：`registry.setStore(store)`（`apply` 里），并把 `registry.useSummary`
 * 从自己的 client 入口导出。
 *
 * consumer 侧：直接调那个 `useSummary()`。
 *
 * 为什么需要登记表：consumer 渲染时 provider 的 `apply` 可能**还没跑**（插件 apply
 * 顺序不保证）。hook 因此订阅**两层**——先订阅登记表（store 一到就重渲染），再订阅
 * store 自身的快照。少了登记表，hook 只能把 store 当闭包实参捕获：传入 `undefined`
 * 之后即便 store 到位也永远返回 `undefined`（旧草稿正是如此）。
 */
export interface SummaryRegistry<T> {
  /** 登记/撤销 store。同一个 store 重复登记不重复通知。 */
  setStore(store: SummaryStore<T> | undefined): void
  /** 当前 store（未登记 → `undefined`）。 */
  getStore(): SummaryStore<T> | undefined
  /** 订阅登记变化。 */
  subscribe(listener: () => void): () => void
  /** React hook：返回快照或 `undefined`（provider 未加载）。 */
  useSummary(): T | undefined
}

export interface SummaryRegistryOptions {
  /** 注入 `useSyncExternalStore`（测试用）；缺省用 React 的。 */
  useSyncExternalStoreImpl?: UseSyncExternalStoreLike
}

/** 创建登记表 + hook。 */
export function createSummaryRegistry<T>(options: SummaryRegistryOptions = {}): SummaryRegistry<T> {
  const useStore = options.useSyncExternalStoreImpl ?? useSyncExternalStore
  let store: SummaryStore<T> | undefined
  const registryListeners = new Set<() => void>()

  const registry: SummaryRegistry<T> = {
    setStore: (next) => {
      if (next === store) return
      store = next
      for (const listener of [...registryListeners]) {
        try {
          listener()
        } catch {
          /* 忽略单个订阅者异常 */
        }
      }
    },
    getStore: () => store,
    subscribe: (listener) => {
      registryListeners.add(listener)
      return () => {
        registryListeners.delete(listener)
      }
    },
    useSummary: () => {
      // ① 订阅登记表：store 迟到也会重渲染。
      const registered = useStore(registry.subscribe, registry.getStore, undefinedSnapshot)
      // ② 再订阅 store 自己的快照。
      //
      // ⚠️ 刻意**不**用 `useMemo` 包一层闭包：`useSyncExternalStore` 要求
      // `subscribe`/`getSnapshot` 的**引用稳定**，否则每次渲染都会退订重订。store
      // 对象字面量上的这两个方法天然稳定（`registered` 换掉时才该变），所以直接取用
      // 即可；用 `useMemo` 反而多一个 hook、且让本 hook 无法在无渲染器环境里被替身
      // 驱动验证（实测：注入替身只替换了 useSyncExternalStore，真 useMemo 直接抛
      // "Cannot read properties of null"）。
      const subscribeStore = registered === undefined ? noopSubscribe : registered.subscribe
      const getSnapshot = registered === undefined ? undefinedSnapshot : registered.getSnapshot
      return useStore(subscribeStore, getSnapshot, undefinedSnapshot)
    },
  }
  return registry
}

/* ------------------------------------------------------------------ *
 * 纯函数：等价判定、id 归一、折叠
 * ------------------------------------------------------------------ */

/**
 * Map 形态的内容等价判定（喂给 `createSummaryStore` 的 `equals`）。
 *
 * @param equalsEntry - 条目比较；缺省 `Object.is`（适合条目是可变对象的场景，
 *   此时应传入逐字段比较）。
 * @returns `equals(previous, next)`。
 */
export function mapEquals<Entry>(
  equalsEntry: (a: Entry, b: Entry) => boolean = Object.is,
): (previous: ReadonlyMap<string, Entry> | undefined, next: ReadonlyMap<string, Entry> | undefined) => boolean {
  return (previous, next) => {
    if (previous === next) return true
    if (previous === undefined || next === undefined) return false
    if (previous.size !== next.size) return false
    for (const [key, value] of previous) {
      const other = next.get(key)
      if (other === undefined || !equalsEntry(value, other)) return false
    }
    return true
  }
}

/** 剥掉 `session-` / `webhook-` 前缀（与宿主及本仓库其余归一化保持同一口径）。 */
export function normalizeSessionId(raw: string): string {
  return raw.replace(/^(?:session|webhook)-/, '')
}

/**
 * 按 id 取条目，**容忍两种口径**。
 *
 * 依次尝试：原样 → 归一化（剥前缀）→ 归一化的 `session-` / `webhook-` 前缀形态。
 * 跨插件 id 口径不一致会**永远 miss 且不报错**（本仓库踩过），故统一走这里。
 */
export function entryFor<Entry>(
  summary: ReadonlyMap<string, Entry> | undefined,
  sessionId: string,
  normalizeId: (id: string) => string = normalizeSessionId,
): Entry | undefined {
  if (summary === undefined || sessionId === '') return undefined
  const direct = summary.get(sessionId)
  if (direct !== undefined) return direct
  const normalized = normalizeId(sessionId)
  if (normalized === '') return undefined
  return summary.get(normalized) ?? summary.get(`session-${normalized}`) ?? summary.get(`webhook-${normalized}`)
}

export interface GroupFoldOptions<Entry, State extends string> {
  /** 自定义 id 归一化（缺省 {@link normalizeSessionId}）。 */
  normalizeId?: (id: string) => string
  /** 从条目取状态。 */
  stateOf?: (entry: Entry) => State
  /** 状态优先级（越大越紧急）；缺省按出现顺序取最后一个。 */
  rank?: (state: State) => number
}

export interface GroupFold<Entry, State extends string> {
  /** 组内**有条目**的会话数。 */
  sessions: number
  /** 命中的条目（按传入会话顺序）。 */
  entries: Entry[]
  /** 组内最高优先级状态；未提供 `stateOf` 或组内无条目时缺省。 */
  state: State | undefined
}

/**
 * 通用分组折叠：把组内会话 id 折成可直接渲染的分组事实。
 *
 * 消费方只需给出「怎么取状态」和「状态优先级」，无需再各写一遍遍历 + 取最高。
 */
export function summarizeGroup<Entry, State extends string>(
  summary: ReadonlyMap<string, Entry> | undefined,
  sessionIds: readonly string[],
  options: GroupFoldOptions<Entry, State> = {},
): GroupFold<Entry, State> {
  const entries: Entry[] = []
  let state: State | undefined
  let best: number | undefined
  for (const id of sessionIds) {
    const entry = entryFor(summary, id, options.normalizeId)
    if (entry === undefined) continue
    entries.push(entry)
    if (options.stateOf === undefined) continue
    const candidate = options.stateOf(entry)
    const rank = options.rank === undefined ? entries.length : options.rank(candidate)
    if (best === undefined || rank >= best) {
      best = rank
      state = candidate
    }
  }
  return { sessions: entries.length, entries, state }
}
