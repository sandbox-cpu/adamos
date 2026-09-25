import { useCallback, useEffect, useRef, useState } from 'react'

interface DictationResult {
  isFinal: boolean
  0: { transcript: string }
}

interface DictationRecognition {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((e: { resultIndex: number; results: ArrayLike<DictationResult> }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
}

type Ctor = new () => DictationRecognition

function ctor(): Ctor | undefined {
  if (typeof window === 'undefined') return undefined
  const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

/** Speech-to-text dictation using the browser's built-in recogniser. */
export function useDictation(onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const rec = useRef<DictationRecognition | null>(null)
  const cb = useRef(onFinal)
  cb.current = onFinal
  const supported = !!ctor()

  const stop = useCallback(() => {
    rec.current?.stop()
  }, [])

  const start = useCallback(() => {
    const C = ctor()
    if (!C) return
    const r = new C()
    r.continuous = true
    r.interimResults = true
    r.lang = navigator.language || 'en-GB'
    r.onresult = (e) => {
      let live = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        if (res.isFinal) cb.current(res[0].transcript.trim())
        else live += res[0].transcript
      }
      setInterim(live)
    }
    r.onend = () => {
      setListening(false)
      setInterim('')
    }
    r.onerror = () => {
      setListening(false)
      setInterim('')
    }
    rec.current = r
    r.start()
    setListening(true)
  }, [])

  useEffect(() => () => rec.current?.stop(), [])

  return { supported, listening, interim, start, stop, toggle: () => (listening ? stop() : start()) }
}
