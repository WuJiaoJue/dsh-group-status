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
import { useSyncExternalStore } from 'react';
const globalTimers = {
    setTimeout: (handler, ms) => globalThis.setTimeout(handler, ms),
    clearTimeout: (handle) => globalThis.clearTimeout(handle),
    setInterval: (handler, ms) => globalThis.setInterval(handler, ms),
    clearInterval: (handle) => globalThis.clearInterval(handle),
};
/**
 * 缺省的轮询门控：页面不可见时不打网络。
 *
 * 后台标签页的轮询没有意义（用户看不见），却会真的发请求——本项目其它 store 也是
 * 同一取向。没有 `document`（Node/测试）时视为可见。
 */
export function defaultCanPoll() {
    const doc = typeof document === 'undefined' ? undefined : document;
    return doc === undefined || doc.visibilityState === undefined || doc.visibilityState === 'visible';
}
/**
 * 创建可订阅摘要 store（provider 的 `apply` 里创建一次）。
 *
 * 生命周期：构造即按 `immediate` 拉一次并装上轮询定时器——**不在
 * `getSnapshot()` 里启动**（那是渲染期副作用，React 要求 `getSnapshot` 纯净）。
 */
export function createSummaryStore(config) {
    const intervalMs = config.intervalMs ?? 15_000;
    const immediate = config.immediate ?? true;
    const timers = config.timers ?? globalTimers;
    const canPoll = config.canPoll ?? defaultCanPoll;
    const doc = typeof document === 'undefined' ? undefined : document;
    const listeners = new Set();
    let snapshot;
    let disposed = false;
    let inFlight = false;
    let pollTimer;
    let stateTimer;
    const notify = () => {
        // 快照一份再遍历：订阅者可能在回调里退订。
        for (const listener of [...listeners]) {
            try {
                listener();
            }
            catch {
                /* 单个订阅者异常不影响其余订阅者与主流程 */
            }
        }
    };
    const clearStateTimer = () => {
        if (stateTimer === undefined)
            return;
        timers.clearTimeout(stateTimer);
        stateTimer = undefined;
    };
    /** 按 `scheduleNext` 把"下一次派生状态翻转"排成一次性定时器。 */
    const armStateTimer = () => {
        clearStateTimer();
        if (disposed || config.scheduleNext === undefined || snapshot === undefined)
            return;
        const delay = config.scheduleNext(snapshot);
        if (delay === undefined || !Number.isFinite(delay))
            return;
        stateTimer = timers.setTimeout(() => {
            stateTimer = undefined;
            // 先重排下一次，再通知：某个订阅者抛错也不该让定时链断掉。
            armStateTimer();
            notify();
        }, Math.max(0, delay));
    };
    const refresh = () => {
        if (disposed || inFlight)
            return;
        inFlight = true;
        void Promise.resolve()
            .then(() => config.fetch())
            .then((next) => {
            if (disposed || next === undefined)
                return;
            if (config.equals(snapshot, next))
                return;
            snapshot = next;
            notify();
            armStateTimer();
        })
            .catch(() => undefined)
            .finally(() => {
            inFlight = false;
        });
    };
    const onVisibilityChange = () => {
        if (disposed || !canPoll())
            return;
        refresh();
    };
    if (immediate)
        refresh();
    if (intervalMs > 0) {
        pollTimer = timers.setInterval(() => {
            if (canPoll())
                refresh();
        }, intervalMs);
    }
    doc?.addEventListener('visibilitychange', onVisibilityChange);
    return {
        getSnapshot: () => snapshot,
        subscribe: (listener) => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        reload: refresh,
        dispose: () => {
            if (disposed)
                return;
            disposed = true;
            if (pollTimer !== undefined)
                timers.clearInterval(pollTimer);
            clearStateTimer();
            doc?.removeEventListener('visibilitychange', onVisibilityChange);
            listeners.clear();
        },
    };
}
const noopSubscribe = () => () => undefined;
const undefinedSnapshot = () => undefined;
/** 创建登记表 + hook。 */
export function createSummaryRegistry(options = {}) {
    const useStore = options.useSyncExternalStoreImpl ?? useSyncExternalStore;
    let store;
    const registryListeners = new Set();
    const registry = {
        setStore: (next) => {
            if (next === store)
                return;
            store = next;
            for (const listener of [...registryListeners]) {
                try {
                    listener();
                }
                catch {
                    /* 忽略单个订阅者异常 */
                }
            }
        },
        getStore: () => store,
        subscribe: (listener) => {
            registryListeners.add(listener);
            return () => {
                registryListeners.delete(listener);
            };
        },
        useSummary: () => {
            // ① 订阅登记表：store 迟到也会重渲染。
            const registered = useStore(registry.subscribe, registry.getStore, undefinedSnapshot);
            // ② 再订阅 store 自己的快照。
            //
            // ⚠️ 刻意**不**用 `useMemo` 包一层闭包：`useSyncExternalStore` 要求
            // `subscribe`/`getSnapshot` 的**引用稳定**，否则每次渲染都会退订重订。store
            // 对象字面量上的这两个方法天然稳定（`registered` 换掉时才该变），所以直接取用
            // 即可；用 `useMemo` 反而多一个 hook、且让本 hook 无法在无渲染器环境里被替身
            // 驱动验证（实测：注入替身只替换了 useSyncExternalStore，真 useMemo 直接抛
            // "Cannot read properties of null"）。
            const subscribeStore = registered === undefined ? noopSubscribe : registered.subscribe;
            const getSnapshot = registered === undefined ? undefinedSnapshot : registered.getSnapshot;
            return useStore(subscribeStore, getSnapshot, undefinedSnapshot);
        },
    };
    return registry;
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
export function mapEquals(equalsEntry = Object.is) {
    return (previous, next) => {
        if (previous === next)
            return true;
        if (previous === undefined || next === undefined)
            return false;
        if (previous.size !== next.size)
            return false;
        for (const [key, value] of previous) {
            const other = next.get(key);
            if (other === undefined || !equalsEntry(value, other))
                return false;
        }
        return true;
    };
}
/** 剥掉 `session-` / `webhook-` 前缀（与宿主及本仓库其余归一化保持同一口径）。 */
export function normalizeSessionId(raw) {
    return raw.replace(/^(?:session|webhook)-/, '');
}
/**
 * 按 id 取条目，**容忍两种口径**。
 *
 * 依次尝试：原样 → 归一化（剥前缀）→ 归一化的 `session-` / `webhook-` 前缀形态。
 * 跨插件 id 口径不一致会**永远 miss 且不报错**（本仓库踩过），故统一走这里。
 */
export function entryFor(summary, sessionId, normalizeId = normalizeSessionId) {
    if (summary === undefined || sessionId === '')
        return undefined;
    const direct = summary.get(sessionId);
    if (direct !== undefined)
        return direct;
    const normalized = normalizeId(sessionId);
    if (normalized === '')
        return undefined;
    return summary.get(normalized) ?? summary.get(`session-${normalized}`) ?? summary.get(`webhook-${normalized}`);
}
/**
 * 通用分组折叠：把组内会话 id 折成可直接渲染的分组事实。
 *
 * 消费方只需给出「怎么取状态」和「状态优先级」，无需再各写一遍遍历 + 取最高。
 */
export function summarizeGroup(summary, sessionIds, options = {}) {
    const entries = [];
    let state;
    let best;
    for (const id of sessionIds) {
        const entry = entryFor(summary, id, options.normalizeId);
        if (entry === undefined)
            continue;
        entries.push(entry);
        if (options.stateOf === undefined)
            continue;
        const candidate = options.stateOf(entry);
        const rank = options.rank === undefined ? entries.length : options.rank(candidate);
        if (best === undefined || rank >= best) {
            best = rank;
            state = candidate;
        }
    }
    return { sessions: entries.length, entries, state };
}
//# sourceMappingURL=cross-plugin-summary.js.map