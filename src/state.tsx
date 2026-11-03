import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { loadAll } from './db/db'
import type { FinanceData } from './core/types'

export type Tab = 'home' | 'activity' | 'budget' | 'investments' | 'goals'

/** Pushed pages on top of a tab (like a NavigationStack). */
export type Page =
  | { name: 'settings' }
  | { name: 'accounts' }
  | { name: 'categories' }
  | { name: 'recurring' }
  | { name: 'privacy' }
  | { name: 'backup' }
  | { name: 'activity' }
  | { name: 'investment'; id: string }
  | { name: 'goal'; id: string }

interface AppState {
  data: FinanceData
  tab: Tab
  setTab: (t: Tab) => void
  stack: Page[]
  push: (p: Page) => void
  pop: () => void
  sheets: ReactNode[]
  openSheet: (node: ReactNode) => void
  closeSheet: () => void
  toast: (msg: string) => void
  toastMsg: string | null
}

const Ctx = createContext<AppState | null>(null)

export function AppProvider({ children }: { children: (ready: boolean) => ReactNode }) {
  const data = useLiveQuery(loadAll, [])
  const [tab, setTabState] = useState<Tab>('home')
  const [stack, setStack] = useState<Page[]>([])
  const [sheets, setSheets] = useState<ReactNode[]>([])
  const [toastMsg, setToast] = useState<string | null>(null)

  const setTab = useCallback((t: Tab) => { setTabState(t); setStack([]) }, [])
  const push = useCallback((p: Page) => setStack((s) => [...s, p]), [])
  const pop = useCallback(() => setStack((s) => s.slice(0, -1)), [])
  const openSheet = useCallback((n: ReactNode) => setSheets((s) => [...s, n]), [])
  const closeSheet = useCallback(() => setSheets((s) => s.slice(0, -1)), [])
  const toast = useCallback((m: string) => {
    setToast(m)
    window.setTimeout(() => setToast((cur) => (cur === m ? null : cur)), 2200)
  }, [])

  const value = useMemo(
    () => (data ? { data, tab, setTab, stack, push, pop, sheets, openSheet, closeSheet, toast, toastMsg } : null),
    [data, tab, setTab, stack, push, pop, sheets, openSheet, closeSheet, toast, toastMsg],
  )
  return <Ctx.Provider value={value}>{children(!!data)}</Ctx.Provider>
}

export function useApp(): AppState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp outside provider')
  return v
}

export const useData = () => useApp().data
export const useHidden = () => useApp().data.settings.hideAmounts

/** Light haptic-style feedback where supported (Android). iOS Safari ignores vibrate. */
export function haptic(ms = 8) {
  try { navigator.vibrate?.(ms) } catch { /* noop */ }
}
