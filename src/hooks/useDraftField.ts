import { useEffect, useRef, useState } from 'react'

/** Keeps a text field responsive while saving it quietly in the background. */
export function useDraftField(value: string, save: (v: string) => void, delay = 450) {
  const [draft, setDraft] = useState(value)
  const saveRef = useRef(save)
  const pending = useRef<string | null>(null)
  useEffect(() => {
    saveRef.current = save
  })
  useEffect(() => {
    if (pending.current === null) setDraft(value)
  }, [value])
  useEffect(() => {
    if (pending.current === null) return
    const t = setTimeout(() => {
      if (pending.current !== null) saveRef.current(pending.current)
      pending.current = null
    }, delay)
    return () => clearTimeout(t)
  }, [draft, delay])
  useEffect(
    () => () => {
      if (pending.current !== null) saveRef.current(pending.current)
    },
    [],
  )
  return [
    draft,
    (v: string) => {
      pending.current = v
      setDraft(v)
    },
  ] as const
}
