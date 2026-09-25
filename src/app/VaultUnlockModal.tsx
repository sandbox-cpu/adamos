import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { useVault } from '../stores/vault'
import { Modal } from '../components/ui/Modal'
import { Button } from '../components/ui/Button'
import { Input, Toggle } from '../components/ui/Field'

/** Appears whenever an agent needs a key while the vault is locked. */
export function VaultUnlockModal() {
  const request = useVault((s) => s.unlockRequest)
  const cancel = useVault((s) => s.cancelUnlockRequest)
  const unlock = useVault((s) => s.unlock)
  const remembered = useVault((s) => s.remembered)
  const [pass, setPass] = useState('')
  const [remember, setRemember] = useState(remembered)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    setError('')
    const ok = await unlock(pass, remember)
    setBusy(false)
    if (ok) setPass('')
    else setError('That passphrase didn’t work. Try again.')
  }

  return (
    <Modal
      open={!!request}
      onClose={cancel}
      size="sm"
      icon={<KeyRound />}
      title="Unlock your vault"
      subtitle={request?.reason ?? 'Your agents need a key to continue.'}
      footer={
        <>
          <Button variant="ghost" onClick={cancel}>
            Not now
          </Button>
          <Button variant="primary" onClick={() => void submit()} loading={busy} disabled={!pass}>
            Unlock
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
        className="space-y-4"
      >
        <Input autoFocus type="password" placeholder="Vault passphrase" value={pass} onChange={(e) => setPass(e.target.value)} />
        {error && <p className="text-sm text-bad">{error}</p>}
        <Toggle checked={remember} onChange={setRemember} label="Keep unlocked on this computer" description="Only choose this on your own device." />
      </form>
    </Modal>
  )
}
