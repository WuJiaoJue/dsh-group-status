/** 本模块用到的最小定时器/文档面。 */
export interface SummaryTimers {
    setTimeout(handler: () => void, ms: number): unknown;
    clearTimeout(handle: unknown): void;
    setInterval(handler: () => void, ms: number): unknown;
    clearInterval(handle: unknown): void;
}
/**
 * 缺省的轮询门控：页面不可见时不打网络。
 *
 * 后台标签页的轮询没有意义（用户看不见），却会真的发请求——本项目其它 store 也是
 * 同一取向。没有 `document`（Node/测试）时视为可见。
 */
export declare function defaultCanPoll(): boolean;
/** 可订阅的快照源。 */
export interface SummaryStore<T> {
    /** 当前快照；`undefined` = 还没拿到（或已 dispose）。 */
    getSnapshot(): T | undefined;
    /** 订阅快照变化，返回退订函数。 */
    subscribe(listener: () => void): () => void;
    /** 立即拉一次（不影响轮询节奏）。 */
    reload(): void;
    /** 清理定时器与监听（宿主卸载时调用）。 */
    dispose(): void;
}
export interface SummaryStoreConfig<T> {
    /**
     * 拉取快照。返回 `undefined` 表示**这次没拿到**（失败 / 无数据）：
     * store 会保留上一份快照且不通知，避免一次网络抖动把界面抹掉。
     */
    fetch: () => Promise<T | undefined>;
    /**
     * 内容等价判定。**必填**：store 不知道 `T` 的形状，替你猜必然出错。
     *
     * ⚠️ 这不是"可选优化"。端点每次 `JSON.parse` 都产出新对象，若用引用比较，
     * 每次轮询都会通知 → 每个消费方每次轮询白重渲染（实测同样内容下 11 次轮询
     * 通知 11 次 vs 内容比较的 1 次）。Map 形态直接用 {@link mapEquals}。
     */
    equals: (previous: T | undefined, next: T | undefined) => boolean;
    /** 轮询间隔（毫秒）。`0` = 只拉一次不轮询。缺省 15000。 */
    intervalMs?: number;
    /** 是否创建后立即拉一次。缺省 true。 */
    immediate?: boolean;
    /** 是否允许此刻发请求。缺省 {@link defaultCanPoll}（仅页面可见时）。 */
    canPoll?: () => boolean;
    /**
     * 状态推进定时：给定当前快照，返回"多久后需要重算/重通知"（毫秒）。
     *
     * 用于「快照本身没变、但**派生状态**随本地时钟翻转」的场景（如等待窗口到期
     * `waiting → overdue`）。到点只通知（让消费方按自己的时钟重算），不重新拉取。
     * 缺省不装这个定时器。
     */
    scheduleNext?: (snapshot: T) => number | undefined;
    /** 定时器注入（测试用）。缺省全局定时器。 */
    timers?: SummaryTimers;
}
/**
 * 创建可订阅摘要 store（provider 的 `apply` 里创建一次）。
 *
 * 生命周期：构造即按 `immediate` 拉一次并装上轮询定时器——**不在
 * `getSnapshot()` 里启动**（那是渲染期副作用，React 要求 `getSnapshot` 纯净）。
 */
export declare function createSummaryStore<T>(config: SummaryStoreConfig<T>): SummaryStore<T>;
/** `useSyncExternalStore` 的形状（测试可注入替身）。 */
export type UseSyncExternalStoreLike = <S>(subscribe: (onStoreChange: () => void) => () => void, getSnapshot: () => S, getServerSnapshot?: () => S) => S;
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
    setStore(store: SummaryStore<T> | undefined): void;
    /** 当前 store（未登记 → `undefined`）。 */
    getStore(): SummaryStore<T> | undefined;
    /** 订阅登记变化。 */
    subscribe(listener: () => void): () => void;
    /** React hook：返回快照或 `undefined`（provider 未加载）。 */
    useSummary(): T | undefined;
}
export interface SummaryRegistryOptions {
    /** 注入 `useSyncExternalStore`（测试用）；缺省用 React 的。 */
    useSyncExternalStoreImpl?: UseSyncExternalStoreLike;
}
/** 创建登记表 + hook。 */
export declare function createSummaryRegistry<T>(options?: SummaryRegistryOptions): SummaryRegistry<T>;
/**
 * Map 形态的内容等价判定（喂给 `createSummaryStore` 的 `equals`）。
 *
 * @param equalsEntry - 条目比较；缺省 `Object.is`（适合条目是可变对象的场景，
 *   此时应传入逐字段比较）。
 * @returns `equals(previous, next)`。
 */
export declare function mapEquals<Entry>(equalsEntry?: (a: Entry, b: Entry) => boolean): (previous: ReadonlyMap<string, Entry> | undefined, next: ReadonlyMap<string, Entry> | undefined) => boolean;
/** 剥掉 `session-` / `webhook-` 前缀（与宿主及本仓库其余归一化保持同一口径）。 */
export declare function normalizeSessionId(raw: string): string;
/**
 * 按 id 取条目，**容忍两种口径**。
 *
 * 依次尝试：原样 → 归一化（剥前缀）→ 归一化的 `session-` / `webhook-` 前缀形态。
 * 跨插件 id 口径不一致会**永远 miss 且不报错**（本仓库踩过），故统一走这里。
 */
export declare function entryFor<Entry>(summary: ReadonlyMap<string, Entry> | undefined, sessionId: string, normalizeId?: (id: string) => string): Entry | undefined;
export interface GroupFoldOptions<Entry, State extends string> {
    /** 自定义 id 归一化（缺省 {@link normalizeSessionId}）。 */
    normalizeId?: (id: string) => string;
    /** 从条目取状态。 */
    stateOf?: (entry: Entry) => State;
    /** 状态优先级（越大越紧急）；缺省按出现顺序取最后一个。 */
    rank?: (state: State) => number;
}
export interface GroupFold<Entry, State extends string> {
    /** 组内**有条目**的会话数。 */
    sessions: number;
    /** 命中的条目（按传入会话顺序）。 */
    entries: Entry[];
    /** 组内最高优先级状态；未提供 `stateOf` 或组内无条目时缺省。 */
    state: State | undefined;
}
/**
 * 通用分组折叠：把组内会话 id 折成可直接渲染的分组事实。
 *
 * 消费方只需给出「怎么取状态」和「状态优先级」，无需再各写一遍遍历 + 取最高。
 */
export declare function summarizeGroup<Entry, State extends string>(summary: ReadonlyMap<string, Entry> | undefined, sessionIds: readonly string[], options?: GroupFoldOptions<Entry, State>): GroupFold<Entry, State>;
//# sourceMappingURL=cross-plugin-summary.d.ts.map