// 仅当前可见 Tab 按面板间隔自动刷新
import { useEffect } from "scripting"
import { needsSetup, useStore } from "./store"

export function useTabAutoRefresh(tabIndex: number, load: () => void | Promise<void>) {
  const { visibleTab, prefs, config } = useStore()
  useEffect(() => {
    if (visibleTab !== tabIndex) return
    if (needsSetup()) return
    void load()
    if (!prefs.autoRefresh) return
    const id = setInterval(() => {
      if (needsSetup()) return
      void load()
    }, prefs.intervalSec * 1000)
    return () => clearInterval(id)
  }, [visibleTab, prefs.autoRefresh, prefs.intervalSec, config])
}
