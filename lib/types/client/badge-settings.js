/**
 * 插件设置读取（折叠徽标显示偏好）。
 *
 * 数据流：apply 时先建一个**稳定**的标准 props 源并经 `provideRoot` 挂上（此时还不知道
 * 设置面在不在），再用 `ctx.inject(['configForms'], …)` 等宿主设置服务就绪——就绪后
 * 订阅本条目设置面，把快照推给源。设置页保存 → 宿主替换快照 → 源通知 → 徽标即时重渲染。
 *
 * 为什么不在 apply 里直接 `ctx.get('configForms')`：服务可能在**本插件之后**才注册，
 * 那时读到的 undefined 会永久生效（设置被静默忽略，直到刷新）。`ctx.inject` 是非阻塞的
 * 嵌套插件，服务永不到达也不会影响本插件其余功能。
 *
 * 为什么源必须一开始就存在：标准 props 的 hook 调用顺序必须稳定——挂上/摘掉
 * `useBadgeSettings` 会改变调用顺序而崩渲染。故源恒在，只有它的**值**随设置变化。
 *
 * 稳定性约定（React 外部存储，见 dsh-later 的同名 hook）：`getSnapshot` 必须返回稳定
 * 引用——每次都构造新对象会让选择器的 `Object.is` 比较永不成立，触发
 * 「Maximum update depth exceeded」死循环（React #185），折叠行徽标会整块崩掉。
 *
 * 设置面缺席或未就绪时，回落到**默认显示已完成**，与 `Config.showCompletedInBadge` 的
 * schema 默认值同源：读不到配置不是「关掉」。
 */
/** Loader 条目 id —— 设置页的寻址键，也是宿主 `describe()` 的 ns。 */
export const ENTRY_ID = 'dsh-group-status';
/** 默认值：与 `Config.showCompletedInBadge` 的 schema 默认同源（true）。 */
export const DEFAULT_BADGE_SETTINGS = Object.freeze({
    showCompletedInBadge: true,
});
/** 从原始快照派生：只有**显式 false** 才隐藏，缺失/非法一律显示。 */
function resolveFromSnapshot(snap) {
    if (snap === undefined || snap.status !== 'ready')
        return DEFAULT_BADGE_SETTINGS;
    const value = snap.value;
    if (value === undefined || value === null || typeof value !== 'object')
        return DEFAULT_BADGE_SETTINGS;
    return { showCompletedInBadge: value['showCompletedInBadge'] !== false };
}
/**
 * 建一个恒在、取值稳定的徽标设置源。
 *
 * `getSnapshot` 是**纯读**（无副作用、无订阅），因此可以安全地在渲染期间被反复调用，
 * 也满足外部存储的引用稳定要求；订阅只由 {@link MutableBadgeSettingsSource.publish}
 * 在取值真正变化时触发。
 * @returns 源；调用方持有它并在设置面就绪后 `publish`。
 */
export function createBadgeSettingsSource() {
    const listeners = new Set();
    let resolved = DEFAULT_BADGE_SETTINGS;
    let seen;
    let seenSet = false;
    return {
        getSnapshot: () => resolved,
        subscribe: (listener) => {
            listeners.add(listener);
            return () => { listeners.delete(listener); };
        },
        publish: (snapshot) => {
            // 同一快照引用重复推入（含 undefined ↔ undefined）直接丢弃。
            if (seenSet && snapshot === seen)
                return;
            seen = snapshot;
            seenSet = true;
            const next = resolveFromSnapshot(snapshot);
            // 取值没变就不替换引用、不通知：宿主为无关字段替换快照时不该惊动折叠行。
            if (next.showCompletedInBadge === resolved.showCompletedInBadge)
                return;
            resolved = next;
            for (const listener of [...listeners])
                listener();
        },
    };
}
/** 旧口径的纯解析函数，保留给测试与 `publish` 复用。 */
export function resolveBadgeSettings(snapshot) {
    return resolveFromSnapshot(snapshot);
}
//# sourceMappingURL=badge-settings.js.map