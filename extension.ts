import Gio from 'gi://Gio';
import { Extension, InjectionManager } from 'resource:///org/gnome/shell/extensions/extension.js';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

const ANNOTATOR_WM_CLASS = 'site.nullable.annotator';

function isAnnotatorWindow(window: Meta.Window): boolean {
    return window.get_wm_class() === ANNOTATOR_WM_CLASS;
}

export default class AnnotatorGnomeShellExtension extends Extension {
    private settings: Gio.Settings | null = null;
    private settingsSignalIds: number[] = [];
    private injectionManager: InjectionManager | null = null;
    private skipTaskbar: boolean = false;
    private keepOnTop: boolean = false;
    private tracker: Shell.WindowTracker | null = null;
    private trackerSignalId: number | null = null;
    private dashToPanelExtension: Extension | null = null;
    // 存储已隐藏的 dash-to-panel 图标，以便在禁用时恢复显示
    private hiddenIcons: Set<any> = new Set();

    enable(): void {
        log(`${this.metadata.name} enabling...`);

        this.settings = this.getSettings();
        this.skipTaskbar = this.settings?.get_boolean('skip-taskbar') ?? false;
        this.keepOnTop = this.settings?.get_boolean('keep-on-top') ?? false;

        // 监听设置变更
        this._connectSettingsSignals();

        // 注入 is_skip_taskbar 方法
        this._injectSkipTaskbar();

        // 获取 dash-to-panel 扩展实例（如果已启用）
        this._initDashToPanel();

        // 监听窗口变化，以便动态应用 keep-on-top 和更新 dash-to-panel 图标
        this.tracker = Shell.WindowTracker.get_default();
        this.trackerSignalId = this.tracker.connect('tracked-windows-changed', () => {
            this._applyKeepOnTop();
            this._updateDashToPanelIcons();
        });

        // 初始应用 keep-on-top
        this._applyKeepOnTop();

        // 可选：将扩展实例挂载到全局（仅调试用，生产可移除）
        // (global as any).annotatorGnomeExtension = this;
    }

    disable(): void {
        log(`${this.metadata.name} disabling...`);

        // 断开设置信号
        if (this.settings) {
            this.settingsSignalIds.forEach(id => this.settings!.disconnect(id));
            this.settingsSignalIds = [];
            this.settings = null;
        }

        // 恢复所有被覆盖的方法
        this.injectionManager?.clear();
        this.injectionManager = null;

        // 断开窗口跟踪信号
        if (this.trackerSignalId && this.tracker) {
            this.tracker.disconnect(this.trackerSignalId);
            this.trackerSignalId = null;
            this.tracker = null;
        }

        // 恢复 dash-to-panel 上被隐藏的图标
        this._restoreDashToPanelIcons();
        this.hiddenIcons.clear();
        this.dashToPanelExtension = null;

        // 清除全局引用
        // (global as any).annotatorGnomeExtension = null;
    }

    // -------------------- 私有辅助方法 --------------------

    private _connectSettingsSignals(): void {
        if (!this.settings) return;

        const onSkipTaskbarChanged = () => {
            this.skipTaskbar = this.settings!.get_boolean('skip-taskbar') ?? false;
            this._updateDashToPanelIcons();
        };
        const onKeepOnTopChanged = () => {
            this.keepOnTop = this.settings!.get_boolean('keep-on-top') ?? false;
            this._applyKeepOnTop();
        };

        this.settingsSignalIds.push(
            this.settings.connect('changed::skip-taskbar', onSkipTaskbarChanged),
            this.settings.connect('changed::keep-on-top', onKeepOnTopChanged)
        );
    }

    private _injectSkipTaskbar(): void {
        this.injectionManager = new InjectionManager();
        this.injectionManager.overrideMethod(
            Meta.Window.prototype,
            'is_skip_taskbar',
            (originalMethod) => {
                const extension = this;
                return function (this: Meta.Window) {
                    if (isAnnotatorWindow(this)) {
                        // log(`Annotator window: override is_skip_taskbar -> ${extension.skipTaskbar}`);
                        return extension.skipTaskbar;
                    }
                    return originalMethod.call(this);
                };
            }
        );
    }

    private _initDashToPanel(): void {
        // 尝试获取 dash-to-panel 扩展实例（假设它挂载在 global.dashToPanel）
        // 更健壮的方式：通过 ExtensionManager 查找，但这里简化处理
        this.dashToPanelExtension = (global as any).dashToPanel ?? null;
        if (!this.dashToPanelExtension) {
            log('dash-to-panel extension not found');
        }
    }

    private _findAnnotatorMetaWindows(): Meta.Window[] {
        const actors = global.get_window_actors() || [];
        return actors
            .map(actor => actor.meta_window)
            .filter((win): win is Meta.Window => win !== null && isAnnotatorWindow(win));
    }

    private _applyKeepOnTop(): void {
        const windows = this._findAnnotatorMetaWindows();
        windows.forEach(window => {
            if (this.keepOnTop) {
                window.make_above();
            } else {
                window.unmake_above();
            }
        });
    }

    /**
     * 更新 dash-to-panel 上 Annotator 窗口图标的显示/隐藏状态。
     * 由于 dash-to-panel 内部实现可能变化，此处采用递归查找 + hide() 方法，
     * 同时缓存隐藏的图标以便恢复。
     */
    private _updateDashToPanelIcons(): void {
        if (!this.dashToPanelExtension) return;

        // 先恢复之前隐藏的图标，防止重复隐藏或残留
        this._restoreDashToPanelIcons();

        const panels = (this.dashToPanelExtension as any).panels ?? [];
        panels.forEach((panel: any) => {
            this._traverseAndToggleIcon(panel, this.skipTaskbar);
        });
    }

    private _traverseAndToggleIcon(parent: any, hide: boolean): void {
        if (!parent || typeof parent.get_children !== 'function') return;

        const children = parent.get_children() || [];
        for (const child of children) {
            // 检查是否为 Annotator 窗口对应的图标（通过 _labelText 识别，依赖内部实现）
            if (child?._labelText === ANNOTATOR_WM_CLASS) {
                if (hide && child.hide instanceof Function) {
                    child.hide();
                    this.hiddenIcons.add(child); // 记录已隐藏的图标
                } else if (!hide && child.show instanceof Function && this.hiddenIcons.has(child)) {
                    // 调用show方法目前好像不起作用，暂时就先这样吧
                    child.show();
                    this.hiddenIcons.delete(child);
                }
            } else {
                this._traverseAndToggleIcon(child, hide);
            }
        }
    }

    private _restoreDashToPanelIcons(): void {
        this.hiddenIcons.forEach(icon => {
            if (icon?.show instanceof Function) {
                icon.show();
            }
        });
        this.hiddenIcons.clear();
    }
}