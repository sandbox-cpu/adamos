import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BarChart3, FilePen, UsersRound } from 'lucide-react'
import { contentTemplate } from '../../lib/press/templates'
import type { MediaContact } from '../../lib/types'
import { useContacts, useContent, useCoverage } from '../../hooks/data'
import { PageHeader } from '../../components/ui/Panel'
import { Tabs } from '../../components/ui/bits'
import { BriefModal, WritingDesk } from './WritingDesk'
import { Contacts } from './Contacts'
import { Coverage } from './Coverage'

type Tab = 'write' | 'contacts' | 'coverage'

export default function PressPage() {
  const [params, setParams] = useSearchParams()
  const content = useContent()
  const contacts = useContacts()
  const coverage = useCoverage()
  const tab = (params.get('tab') as Tab) || 'write'
  const docId = params.get('doc') ?? undefined
  const [pitch, setPitch] = useState<MediaContact | null>(null)

  const set = (patch: Record<string, string | undefined>) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v)
        else next.delete(k)
      }
      return next
    })

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Studios"
        title="Press Office"
        subtitle="Releases, pitches and statements written in minutes, your media contacts in one place, and every piece of coverage tracked."
      />
      <Tabs
        value={tab}
        onChange={(t) => set({ tab: t === 'write' ? undefined : t, doc: undefined })}
        items={[
          { id: 'write', label: 'Writing desk', icon: <FilePen />, count: content.length },
          { id: 'contacts', label: 'Media contacts', icon: <UsersRound />, count: contacts.length },
          { id: 'coverage', label: 'Coverage', icon: <BarChart3 />, count: coverage.length },
        ]}
      />
      {tab === 'write' && <WritingDesk docId={docId} openDoc={(id) => set({ doc: id })} />}
      {tab === 'contacts' && <Contacts onPitch={setPitch} />}
      {tab === 'coverage' && <Coverage />}
      {pitch && (
        <BriefModal
          template={contentTemplate('pitch')}
          prefill={{ outlet: `${pitch.name} at ${pitch.outlet}${pitch.beat ? ` (covers ${pitch.beat})` : ''}${pitch.notes ? `. Notes: ${pitch.notes}` : ''}` }}
          onClose={() => setPitch(null)}
          onStarted={(p) => {
            setPitch(null)
            set({ tab: undefined, doc: p.id })
          }}
        />
      )}
    </div>
  )
}
