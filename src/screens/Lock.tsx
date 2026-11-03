import { useEffect, useState } from 'react'
import { Delete, ScanFace } from 'lucide-react'
import { unlockWithBiometrics, verifyPin } from '../lock'
import { useApp } from '../state'
import { BrandMark } from './Onboarding'

export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const { data } = useApp()
  const { lock } = data.settings
  const [pin, setPin] = useState('')
  const [shake, setShake] = useState(false)

  useEffect(() => {
    if (pin.length < 4 || !lock.pinHash || !lock.pinSalt) return
    let cancelled = false
    verifyPin(pin, lock.pinHash, lock.pinSalt).then((ok) => {
      if (cancelled) return
      if (ok) onUnlock()
      else if (pin.length >= 6) { setShake(true); setTimeout(() => { setShake(false); setPin('') }, 400) }
    })
    return () => { cancelled = true }
  }, [pin, lock.pinHash, lock.pinSalt, onUnlock])

  const press = (d: string) => setPin((p) => (p.length < 6 ? p + d : p))
  const bio = async () => { if (lock.credentialId && (await unlockWithBiometrics(lock.credentialId))) onUnlock() }

  return (
    <div className="overlay-full fade-in">
      <BrandMark size={64} />
      <div className="strong" style={{ fontSize: 20 }}>Midnight Ledger is locked</div>
      <div className="muted small">Enter your PIN{lock.credentialId ? ' or use Face ID' : ''}</div>
      <div className={`pin-dots ${shake ? 'shake' : ''}`} aria-label={`${pin.length} digits entered`}>
        {Array.from({ length: Math.max(4, pin.length) }, (_, i) => <span key={i} className={i < pin.length ? 'on' : ''} />)}
      </div>
      <div className="pin-pad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <button key={d} onClick={() => press(d)}>{d}</button>)}
        {lock.credentialId ? <button aria-label="Unlock with Face ID" onClick={bio} style={{ display: 'grid', placeItems: 'center', color: 'var(--electric)' }}><ScanFace size={30} /></button> : <span />}
        <button onClick={() => press('0')}>0</button>
        <button aria-label="Delete digit" onClick={() => setPin((p) => p.slice(0, -1))} style={{ display: 'grid', placeItems: 'center', background: 'none', border: 0 }}><Delete size={26} /></button>
      </div>
    </div>
  )
}

/** Covers balances when the app is in the background (best effort on iOS). */
export function PrivacyShield() {
  return (
    <div className="overlay-full" aria-hidden>
      <BrandMark size={64} />
      <div className="strong">Midnight Ledger</div>
    </div>
  )
}
