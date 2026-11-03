import { useCallback, useEffect, useState } from 'react'
import { ChartColumn, Flag, LayoutGrid, List, Plus, TrendingUp } from 'lucide-react'
import { AppProvider, haptic, useApp, type Tab } from './state'
import { runRecurring } from './db/repo'
import { SheetHost, Toast } from './ui/components'
import { Home } from './screens/Home'
import { Activity } from './screens/Activity'
import { BudgetScreen } from './screens/Budget'
import { InvestmentDetail, Investments } from './screens/Investments'
import { GoalDetail, Goals } from './screens/Goals'
import { BackupPage, PrivacyPage, SettingsPage } from './screens/Settings'
import { AccountsPage, CategoriesPage, RecurringPage } from './screens/Manage'
import { TransactionEditor } from './screens/TransactionEditor'
import { Onboarding } from './screens/Onboarding'
import { LockScreen, PrivacyShield } from './screens/Lock'

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'home', label: 'Home', icon: <LayoutGrid size={22} /> },
  { id: 'activity', label: 'Activity', icon: <List size={22} /> },
  { id: 'budget', label: 'Budget', icon: <ChartColumn size={22} /> },
  { id: 'investments', label: 'Investments', icon: <TrendingUp size={22} /> },
  { id: 'goals', label: 'Goals', icon: <Flag size={22} /> },
]

function Shell() {
  const { data, tab, setTab, stack, openSheet, sheets } = useApp()
  const lockOn = data.settings.lock.enabled
  const [locked, setLocked] = useState(lockOn)
  const [background, setBackground] = useState(false)
  const unlock = useCallback(() => setLocked(false), [])

  useEffect(() => {
    const onVis = () => {
      const hidden = document.visibilityState === 'hidden'
      setBackground(hidden)
      if (hidden && data.settings.lock.enabled) setLocked(true)
      if (!hidden) runRecurring()
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pagehide', onVis)
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pagehide', onVis) }
  }, [data.settings.lock.enabled])

  if (!data.settings.onboarded) return <><Onboarding /><SheetHost /><Toast /></>

  const page = stack[stack.length - 1]
  let content: React.ReactNode
  if (page) {
    switch (page.name) {
      case 'settings': content = <SettingsPage />; break
      case 'accounts': content = <AccountsPage />; break
      case 'categories': content = <CategoriesPage />; break
      case 'recurring': content = <RecurringPage />; break
      case 'privacy': content = <PrivacyPage />; break
      case 'backup': content = <BackupPage />; break
      case 'activity': content = <Activity pushed />; break
      case 'investment': content = <InvestmentDetail id={page.id} />; break
      case 'goal': content = <GoalDetail id={page.id} />; break
    }
  } else {
    content = tab === 'home' ? <Home /> : tab === 'activity' ? <Activity /> : tab === 'budget' ? <BudgetScreen /> : tab === 'investments' ? <Investments /> : <Goals />
  }

  return (
    <div className="app">
      <main key={page ? `${page.name}-${stack.length}` : tab} style={{ display: 'contents' }}>{content}</main>
      {!sheets.length && (!page || ['activity', 'investment', 'goal'].includes(page.name)) && (
        <button className="fab" aria-label="Add transaction" onClick={() => { haptic(); openSheet(<TransactionEditor />) }}><Plus size={28} strokeWidth={2.4} /></button>
      )}
      <nav className="tabbar" aria-label="Main">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => { if (tab !== t.id || stack.length) { haptic(4); setTab(t.id) } }}>
            {t.icon}<span>{t.label}</span>
          </button>
        ))}
      </nav>
      <SheetHost />
      <Toast />
      {locked && lockOn && <LockScreen onUnlock={unlock} />}
      {background && !locked && <PrivacyShield />}
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      {(ready) => (ready ? <Shell /> : <div className="overlay-full" />)}
    </AppProvider>
  )
}
