import { useEffect, useRef, useState } from 'react'
import { RefreshCw, ChevronRight, Download, EyeOff, FileSpreadsheet, KeyRound, Landmark, LockKeyhole, Repeat, ScanFace, ShieldCheck, Tag, Upload, VenetianMask } from 'lucide-react'
import { CURRENCY_NAME, parseRate, SYMBOL } from '../core/money'
import { fmtDate, today } from '../core/dates'
import { CURRENCIES, type Currency } from '../core/types'
import { requestPersistence } from '../db/db'
import { eraseAll, updateSettings } from '../db/repo'
import { loadDemoData } from '../db/demo'
import {
  applyCSVImport, cryptoAvailable, exportJSON, planCSVImport, readBackup, restoreBackup, saveFile, transactionsToCSV, type BackupFile, type CSVImportPlan,
} from '../db/backup'
import { biometricsAvailable, hashPin, lockSupported, registerBiometrics } from '../lock'
import { refreshRate } from '../rates'
import { haptic, useApp } from '../state'
import { Confirm, DecimalField, Footnote, FormCard, FormRow, NavBar, Sheet, Switch } from '../ui/components'

const Link = ({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) => (
  <button className="form-row" style={{ width: '100%' }} onClick={onClick}>
    <div className="label">{icon}{label}</div><div className="control"><ChevronRight size={16} className="muted" /></div>
  </button>
)

export function SettingsPage() {
  const { data, push, openSheet, toast } = useApp()
  const s = data.settings
  const [rate, setRate] = useState(s.crcPerUSD)
  const [updating, setUpdating] = useState(false)
  useEffect(() => { setRate(s.crcPerUSD) }, [s.crcPerUSD])
  const rateChanged = parseRate(rate) !== null && parseRate(rate) !== s.crcPerUSD
  const empty = !data.accounts.length && !data.transactions.length

  return (
    <div className="screen with-nav slide-in">
      <NavBar title="Settings" back="Overview" />
      <div className="stack">
        <FormCard title="Currency" footer={`${s.autoRate && s.rateSource ? `Rate from ${s.rateSource}, ${fmtDate(s.rateUpdatedAt)}. Updates on its own a few times a day when online.` : `Rate set by hand on ${fmtDate(s.rateUpdatedAt)}.`} Used for totals and new transactions; past transactions keep the rate recorded with them.`}>
          <FormRow label="Primary currency">
            <select className="field" value={s.primaryCurrency} onChange={(e) => updateSettings({ primaryCurrency: e.target.value as Currency, allowanceCurrency: s.allowanceCurrency ?? s.primaryCurrency })}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{SYMBOL[c]} {CURRENCY_NAME[c]}</option>)}
            </select>
          </FormRow>
          <FormRow label="₡ per $1">
            <DecimalField value={rate} onChange={setRate} width={110} />
            {rateChanged && <button className="link-btn strong" onClick={async () => {
              // A hand-entered rate turns automatic updates off so it isn't overwritten.
              await updateSettings({ crcPerUSD: parseRate(rate)!, rateUpdatedAt: today(), autoRate: false, rateSource: null }); haptic(); toast('Rate set · automatic updates off')
            }}>Set</button>}
          </FormRow>
          <FormRow label="Update automatically">
            <Switch checked={s.autoRate} label="Update exchange rate automatically" onChange={async (on) => {
              await updateSettings({ autoRate: on })
              if (on) { const r = await refreshRate(true); if (r) { setRate(r.rate); toast(`₡${r.rate} per $1`) } else toast("Couldn't reach the rate service — will retry later") }
            }} />
          </FormRow>
          {s.autoRate && (
            <button className="form-row" style={{ width: '100%' }} disabled={updating} onClick={async () => {
              setUpdating(true)
              const r = await refreshRate(true)
              setUpdating(false)
              if (r) { setRate(r.rate); haptic(); toast(`Updated: ₡${r.rate} per $1`) } else toast("Couldn't reach the rate service. Check your connection.")
            }}>
              <div className="label" style={{ color: 'var(--electric)' }}><RefreshCw size={18} />{updating ? 'Updating…' : 'Update now'}</div>
            </button>
          )}
        </FormCard>

        <FormCard title="Manage">
          <Link icon={<Landmark size={18} />} label="Accounts" onClick={() => push({ name: 'accounts' })} />
          <Link icon={<Tag size={18} />} label="Categories" onClick={() => push({ name: 'categories' })} />
          <Link icon={<Repeat size={18} />} label="Recurring transactions" onClick={() => push({ name: 'recurring' })} />
        </FormCard>

        <FormCard title="Privacy" footer="The app is covered when it goes to the background.">
          <FormRow label="App lock" icon={<LockKeyhole size={18} />}>
            <Switch checked={s.lock.enabled} label="App lock" onChange={(on) => {
              if (on) {
                if (!lockSupported()) return toast('App lock needs the app to be opened over HTTPS')
                openSheet(<PinSetup />)
              } else updateSettings({ lock: { enabled: false, pinHash: null, pinSalt: null, credentialId: null } })
            }} />
          </FormRow>
          <FormRow label="Hide amounts" icon={<EyeOff size={18} />}>
            <Switch checked={s.hideAmounts} label="Hide amounts" onChange={(v) => updateSettings({ hideAmounts: v })} />
          </FormRow>
          <Link icon={<ShieldCheck size={18} />} label="How your data is protected" onClick={() => push({ name: 'privacy' })} />
        </FormCard>

        <FormCard title="Backup" footer="Your data lives only on this device. Back up regularly and keep the file somewhere safe (Files, iCloud Drive, a computer).">
          <Link icon={<Download size={18} />} label="Backup & restore" onClick={() => push({ name: 'backup' })} />
        </FormCard>

        <FormCard title="Data">
          {s.isDemo ? (
            <button className="form-row" style={{ width: '100%', color: 'var(--coral)' }} onClick={() => openSheet(
              <Confirm title="Clear demo data?" message="All sample data is removed and you'll start fresh." confirmLabel="Clear and start fresh" onConfirm={() => eraseAll()} />)}>
              <div className="label" style={{ color: 'var(--coral)' }}><VenetianMask size={18} color="var(--coral)" />Clear demo data and start fresh</div>
            </button>
          ) : empty ? (
            <Link icon={<VenetianMask size={18} />} label="Load demo data" onClick={() => openSheet(
              <Confirm destructive={false} title="Load demo data?" message="Adds clearly labeled sample accounts and transactions. You can clear them anytime." confirmLabel="Load sample data" onConfirm={() => loadDemoData()} />)} />
          ) : null}
          <button className="form-row" style={{ width: '100%' }} onClick={() => openSheet(
            <Confirm title="Erase all data?" message="All accounts, transactions, budgets, investments and goals will be permanently deleted from this device." confirmLabel="Erase everything" onConfirm={() => eraseAll()} />)}>
            <div className="label" style={{ color: 'var(--coral)' }}>Erase all data</div>
          </button>
        </FormCard>

        <div className="small muted" style={{ textAlign: 'center', padding: '0 12px' }}>
          Midnight Ledger {__APP_VERSION__}<br />No accounts. No servers. No analytics or tracking. Your financial data never leaves this device unless you export it.
        </div>
      </div>
    </div>
  )
}

function PinSetup() {
  const { closeSheet, toast } = useApp()
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [useBio, setUseBio] = useState(false)
  const [bioOk, setBioOk] = useState(false)
  const [error, setError] = useState('')
  useState(() => { biometricsAvailable().then(setBioOk) })
  const valid = /^\d{4,6}$/.test(pin) && pin === confirm

  async function save() {
    if (!valid) return
    try {
      const { hash, salt } = await hashPin(pin)
      const credentialId = useBio ? await registerBiometrics() : null
      await updateSettings({ lock: { enabled: true, pinHash: hash, pinSalt: salt, credentialId } })
      closeSheet()
      toast('App lock on')
    } catch (e) {
      setError((e as Error).message || 'Face ID setup failed. Try again or continue with PIN only.')
    }
  }

  return (
    <Sheet title="App lock" full={false} onSave={save} canSave={valid} saveLabel="Turn on">
      <div className="stack">
        <FormCard footer="4–6 digits. If you forget it, you'll need to delete the app's data from iPhone Settings and restore a backup.">
          <FormRow label="PIN" icon={<KeyRound size={18} />}><input className="field num" type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} /></FormRow>
          <FormRow label="Confirm PIN"><input className="field num" type="password" inputMode="numeric" maxLength={6} value={confirm} onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ''))} /></FormRow>
        </FormCard>
        {bioOk && (
          <FormCard footer="Uses a passkey on this device only to ask for Face ID. Your PIN still works as a fallback.">
            <FormRow label="Also unlock with Face ID" icon={<ScanFace size={18} />}><Switch checked={useBio} onChange={setUseBio} label="Face ID" /></FormRow>
          </FormCard>
        )}
        {error && <div className="small neg">{error}</div>}
      </div>
    </Sheet>
  )
}

// ============================================================================
// Backup & restore
// ============================================================================

export function BackupPage() {
  const { data, openSheet, toast } = useApp()
  const jsonInput = useRef<HTMLInputElement>(null)
  const csvInput = useRef<HTMLInputElement>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [encrypt, setEncrypt] = useState(cryptoAvailable())
  const [busy, setBusy] = useState(false)
  const pwValid = !encrypt || (password.length >= 8 && password === confirm)

  async function doExport() {
    setBusy(true)
    try {
      const f = await exportJSON(encrypt ? password : null)
      await saveFile(f.name, f.text, 'application/json')
      await requestPersistence()
    } catch (e) { toast((e as Error).message) } finally { setBusy(false) }
  }

  async function pickJSON(file: File) {
    const text = await file.text()
    try {
      const r = await readBackup(text)
      openSheet('needsPassword' in r ? <UnlockBackup text={text} /> : <RestorePreview backup={r} />)
    } catch (e) { toast((e as Error).message) }
  }

  async function pickCSV(file: File) {
    const plan = planCSVImport(await file.text(), data)
    openSheet(<CSVPreview plan={plan} />)
  }

  return (
    <div className="screen with-nav slide-in">
      <NavBar title="Backup & restore" back="Settings" />
      <div className="stack">
        <FormCard title="Full backup (JSON)" footer={encrypt
          ? 'Encrypted with AES-256 using your password. Without the password the file can\'t be opened — by anyone, including you.'
          : 'Unencrypted: anyone with the file can read your financial data.'}>
          <FormRow label="Encrypt with password"><Switch checked={encrypt} onChange={setEncrypt} label="Encrypt" /></FormRow>
          {encrypt && (
            <>
              <FormRow label="Password"><input className="field" type="password" autoComplete="new-password" placeholder="8+ characters" value={password} onChange={(e) => setPassword(e.target.value)} /></FormRow>
              <FormRow label="Confirm"><input className="field" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></FormRow>
            </>
          )}
        </FormCard>
        {!cryptoAvailable() && <Footnote>Encryption needs the app to be opened over HTTPS (e.g. your GitHub Pages address).</Footnote>}
        <button className="btn-primary" disabled={!pwValid || busy} onClick={doExport}><Download size={18} />Export backup</button>
        <button className="btn-secondary" onClick={() => jsonInput.current?.click()}><Upload size={16} />Restore from backup…</button>
        <input ref={jsonInput} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) pickJSON(f) }} />

        <FormCard title="Spreadsheet (CSV)" footer="Transactions only, for Excel or Numbers. CSV files are not encrypted. Import accepts the same columns: date (YYYY-MM-DD), type, amount, currency, account, to_account, to_amount, category, note, rate_crc_per_usd.">
          <button className="form-row" style={{ width: '100%' }} onClick={() => saveFile(`midnight-ledger-transactions-${today()}.csv`, transactionsToCSV(data), 'text/csv')}>
            <div className="label"><FileSpreadsheet size={18} />Export transactions (CSV)</div>
          </button>
          <button className="form-row" style={{ width: '100%' }} onClick={() => csvInput.current?.click()}>
            <div className="label"><Upload size={18} />Import transactions (CSV)…</div>
          </button>
        </FormCard>
        <input ref={csvInput} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) pickCSV(f) }} />
      </div>
    </div>
  )
}

function UnlockBackup({ text }: { text: string }) {
  const { closeSheet, openSheet } = useApp()
  const [pw, setPw] = useState('')
  const [error, setError] = useState('')
  return (
    <Sheet title="Encrypted backup" full={false} saveLabel="Unlock" canSave={!!pw} onSave={async () => {
      try {
        const r = await readBackup(text, pw)
        if ('needsPassword' in r) return
        closeSheet(); openSheet(<RestorePreview backup={r} />)
      } catch (e) { setError((e as Error).message) }
    }}>
      <div className="stack">
        <FormCard><FormRow label="Password"><input className="field" type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} /></FormRow></FormCard>
        {error && <div className="small neg">{error}</div>}
      </div>
    </Sheet>
  )
}

function RestorePreview({ backup }: { backup: BackupFile }) {
  const { closeSheet, openSheet, toast } = useApp()
  const d = backup.data
  return (
    <Sheet title="Restore backup" full={false}>
      <div className="stack">
        <div className="card list">
          {([['Exported', new Date(backup.exportedAt).toLocaleString()], ['Accounts', d.accounts.length], ['Transactions', d.transactions.length],
            ['Investments', d.investments.length], ['Goals', d.goals.length]] as const).map(([k, v]) => (
            <div key={k} className="list-row"><div className="main muted">{k}</div><div className="end">{v}</div></div>
          ))}
        </div>
        <button className="btn-danger" onClick={() => openSheet(
          <Confirm title="Replace all data?" message="Everything currently in the app will be deleted and replaced by this backup." confirmLabel="Replace"
            onConfirm={async () => { await restoreBackup(backup); closeSheet(); toast('Backup restored') }} />)}>Replace current data with this backup</button>
      </div>
    </Sheet>
  )
}

function CSVPreview({ plan }: { plan: CSVImportPlan }) {
  const { closeSheet, toast } = useApp()
  return (
    <Sheet title="Import CSV" full={false} saveLabel="Import" canSave={!!plan.transactions.length && !plan.errors.length}
      onSave={async () => { await applyCSVImport(plan); closeSheet(); toast(`${plan.transactions.length} transactions imported`) }}>
      <div className="stack-s">
        {plan.errors.length ? (
          <>
            <div className="strong neg">Fix these lines and try again:</div>
            <div className="card small stack-s" style={{ gap: 4, maxHeight: 240, overflow: 'auto' }}>{plan.errors.slice(0, 50).map((e) => <div key={e}>{e}</div>)}</div>
          </>
        ) : (
          <>
            <div>{plan.transactions.length} transactions ready to add.</div>
            {!!plan.newAccounts.length && <div className="small muted">New accounts: {plan.newAccounts.map((a) => a.name).join(', ')} (opening balance 0 — edit later).</div>}
            {!!plan.newCategories.length && <div className="small muted">New categories: {plan.newCategories.map((c) => c.name).join(', ')}.</div>}
            <Footnote>Rows are added to your existing data, not replaced. Importing the same file twice creates duplicates.</Footnote>
          </>
        )}
      </div>
    </Sheet>
  )
}

export function PrivacyPage() {
  const items: [string, string][] = [
    ['Stored only on this device', 'Your records live in this browser\'s local database (IndexedDB) on your iPhone. There is no account, server, sync, analytics, advertising SDK or bank connection. Nothing is uploaded — the app works with Airplane Mode on.'],
    ['One network request: the exchange rate', 'When "Update automatically" is on, the app downloads the public ₡/$ rate (BCCR via Hacienda\'s API, or ExchangeRate-API as a backup) a few times a day. It only receives the rate — none of your data is sent. Turn it off in Settings to stay fully offline.'],
    ['Encrypted at rest by iOS', 'iPhone encrypts its storage, including Safari and Home Screen app data, with keys tied to your device passcode. This requires a passcode to be set.'],
    ['App lock controls access, not encryption', 'The PIN / Face ID lock stops someone using your unlocked phone from opening the app. It does not add a separate layer of encryption to the database.'],
    ['Back up regularly', 'Deleting the Home Screen app, clearing website data, or an iOS storage clean-up can remove the data. Export a backup from time to time.'],
    ['Password-encrypted backups', 'Backups are encrypted with AES-256-GCM using a key derived from your password (PBKDF2-SHA256, 310,000 rounds). Without the password the file is just random bytes. CSV exports are not encrypted.'],
    ['Hidden in the background', 'The app covers your balances when it leaves the screen. iOS may take its app-switcher snapshot first, so turn on Hide amounts for extra privacy.'],
    ['Same-site apps', 'Apps hosted under the same domain (for example other projects on your-name.github.io) share the browser origin. Only install apps you trust from that domain.'],
  ]
  return (
    <div className="screen with-nav slide-in">
      <NavBar title="Data protection" back="Settings" />
      <div className="stack-s">
        {items.map(([t, d]) => (
          <div key={t} className="card stack-s" style={{ gap: 4 }}><div className="strong">{t}</div><div className="small muted">{d}</div></div>
        ))}
      </div>
    </div>
  )
}
