// App lock: a 4–6 digit PIN (always) plus optional Face ID / Touch ID via WebAuthn.
// This gates access to the UI. It does not encrypt IndexedDB — see Settings → How your data is protected.

const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

export const lockSupported = () => typeof crypto !== 'undefined' && !!crypto.subtle

export async function hashPin(pin: string, saltB64?: string): Promise<{ hash: string; salt: string }> {
  const salt = saltB64 ? unb64url(saltB64) : crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 150_000 }, key, 256)
  return { hash: b64url(bits), salt: b64url(salt) }
}

export async function verifyPin(pin: string, hash: string, salt: string) {
  return (await hashPin(pin, salt)).hash === hash
}

export async function biometricsAvailable(): Promise<boolean> {
  try {
    return !!window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
  } catch {
    return false
  }
}

/** Creates a device-bound passkey used only to prompt Face ID / Touch ID. Returns its id. */
export async function registerBiometrics(): Promise<string> {
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'WalletWing', id: location.hostname },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'WalletWing', displayName: 'WalletWing' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null
  if (!cred) throw new Error('Face ID setup was cancelled.')
  return b64url(cred.rawId)
}

export async function unlockWithBiometrics(credentialId: string): Promise<boolean> {
  try {
    const res = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: 'public-key', id: unb64url(credentialId) }],
        userVerification: 'required',
        timeout: 60_000,
      },
    })
    return !!res
  } catch {
    return false
  }
}
