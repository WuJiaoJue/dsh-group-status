/**
 * Workspace picker plugin, node half. Pure UI plugin: no host-side behavior —
 * the empty apply exists so the plugin appears in the host cordis.yml / Loader
 * (load and lifecycle follow the host; the browser half ships via
 * exports["./client"], discovered through the package.json dsh.client
 * declaration).
 *
 * The `Config` below is the **only** host-side surface, and it exists purely so
 * the settings page has something to project: it drives browser-half display
 * preferences, so the plugin never reads it here. DSH ≥0.2.0 builds that page
 * straight off `entry.fiber.runtime.Config` (ns = this entry's Loader id,
 * `dsh-group-status`), which is why a client-only plugin needs a Config export
 * and an otherwise-empty apply.
 */
import Schema from '@deepseek-ai/schemastery';
/** Loader entry id — also the settings namespace the Host projects onto. */
export declare const name = "dsh-group-status";
/**
 * 插件配置（单一事实来源）。
 *
 * `.volatile()` 标记这些字段为「用户可调」：内核据此把 Config 投影成设置页表单，
 * 并把保存结果回灌到条目配置。浏览器半通过 `configForms.get('dsh-group-status')`
 * 读取同一份文档，改完即时生效、无需刷新。
 *
 * 全部可选且带默认值：未配置时即开箱即用（已完成默认显示）。
 */
export declare const Config: Schema<NoInfer<Schemastery.ObjectS<NoInfer<{
    /**
     * 折叠分组徽标是否显示「已完成」绿点。
     *
     * 关闭后 `done` 既不画绿点，也不计入徽标数字与 hover 明细里的分组聚合行
     * （会话行自身的绿点不受影响——那是行级状态，不是分组提示）。
     */
    showCompletedInBadge: Schema<boolean, boolean, "defined">;
}>>>, NoInfer<Schemastery.ObjectT<NoInfer<{
    /**
     * 折叠分组徽标是否显示「已完成」绿点。
     *
     * 关闭后 `done` 既不画绿点，也不计入徽标数字与 hover 明细里的分组聚合行
     * （会话行自身的绿点不受影响——那是行级状态，不是分组提示）。
     */
    showCompletedInBadge: Schema<boolean, boolean, "defined">;
}>>>, "volatile">;
/** The resolved shape {@link Config} projects into. */
export interface Config {
    showCompletedInBadge: boolean;
}
/**
 * Host plugin body. Cordis passes `(ctx, config)`; only the Config matters here
 * and even that is read by the browser half, not here — the body stays empty so
 * this plugin keeps its "pure UI plugin" shape.
 * @param _ctx - host context (unused: no host-side behavior).
 * @param _config - resolved {@link Config} (unused: the browser half reads it).
 */
export declare function apply(_ctx: unknown, _config: Config): void;
//# sourceMappingURL=index.d.ts.map