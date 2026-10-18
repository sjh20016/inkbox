// 卜算子三维形象入口（游戏侧门面）
//
// 游戏启动时**只**加载这一小段：不 import three、不 import GLTFLoader。
// 玩家第一次点面板上的肖像入口，`open()` 才动态 `import('./BusanziViewer.js')`，
// 把 three / 模型 / 独立 renderer 全部推迟到「真的要看」的那一刻（首开按需加载）。
//
// 暴露给游戏：`window.inkbox.busanziViewer`（open / play / close / ready / state / metrics）。
//   · `open()`    → Promise<boolean>：窗口打开且模型可播后 resolve true；失败 false（游戏不受影响）
//   · `play(n)`   → Promise<'Idle'|'Walk'|'Wind'|false>：必要时自动 open
//   · `close()`   → 同步关窗并释放独立 renderer / 几何 / 材质 / 贴图 / mixer
//   · `ready()`   → Promise<boolean>：可等待状态（从未打开时是 false，不会触发加载）
//   · `state`     → { opened, loading, ready, activeClip, error, clips }
//   · `metrics()` → 独立 renderer 的 drawCall / 显存计数（验收用）

export function createBusanziViewerHost({ onError } = {}) {
  let viewer = null;
  let readyPromise = null;
  const notifyError = (message) => {
    try { onError?.(message); } catch { /* 通知失败不影响游戏 */ }
  };
  const ensureViewer = async () => {
    if (!viewer) {
      const { BusanziViewer } = await import('./BusanziViewer.js');
      viewer = new BusanziViewer({ onError: notifyError });
    }
    return viewer;
  };

  return {
    get state() {
      return viewer?.state ?? { opened: false, loading: false, ready: false, activeClip: null, error: null, clips: ['Idle', 'Walk', 'Wind'] };
    },
    get viewer() { return viewer; },
    /** 可等待的加载状态（从未打开 → Promise<false>，不会触发加载）。 */
    ready() {
      // 关窗后（尤其 Esc / 遮罩这类 Viewer 内部关闭路径）状态必须以 Viewer 为准：
      // 上一次 open 留下的 readyPromise 不能继续报告 true。
      if (!viewer || !viewer.state.opened) return Promise.resolve(false);
      return readyPromise ?? Promise.resolve(false);
    },
    async open() {
      try {
        const impl = await ensureViewer();
        readyPromise = impl.open();
        return await readyPromise;
      } catch (error) {
        notifyError(`卜算子形象加载失败：${error?.message || error}`);
        readyPromise = Promise.resolve(false);
        return false;
      }
    },
    async play(name) {
      try {
        const impl = await ensureViewer();
        if (!impl.opened) {
          readyPromise = impl.open();
          await readyPromise;
        }
        return await impl.play(name);
      } catch (error) {
        notifyError(`卜算子动画未能播放：${error?.message || error}`);
        return false;
      }
    },
    close() {
      viewer?.close();
      readyPromise = null;
    },
    metrics() { return viewer?.metrics() ?? null; },
    dispose() {
      viewer?.dispose();
      viewer = null;
      readyPromise = null;
    },
  };
}
