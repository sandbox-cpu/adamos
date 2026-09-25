import { sleep } from '../utils'
import type { LLMRequest, LLMResult } from './types'

/**
 * Demo mode: used when no AI profile is connected. Streams a scripted answer
 * so every screen can be explored before any keys are added. The UI always
 * labels these answers as demo content.
 */
export async function runDemo(req: LLMRequest): Promise<LLMResult> {
  if (req.json) {
    await sleep(700 + Math.random() * 700, req.signal)
    const json = req.demo?.json ? req.demo.json() : {}
    return { text: JSON.stringify(json), json, thinking: '', citations: [], stopReason: 'end_turn', usage: { input: 0, output: 0 }, demo: true }
  }

  const scripted = typeof req.demo?.text === 'function' ? req.demo.text() : req.demo?.text
  const text = scripted ?? genericDemoText(req)
  await sleep(350 + Math.random() * 400, req.signal)
  const tokens = text.match(/\S+\s*|\s+/g) ?? [text]
  let out = ''
  for (let i = 0; i < tokens.length; i++) {
    if (req.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    out += tokens[i]
    req.onEvent?.({ type: 'text', delta: tokens[i] })
    if (i % 3 === 0) await sleep(14 + Math.random() * 26, req.signal)
  }
  return { text: out, thinking: '', citations: [], stopReason: 'end_turn', usage: { input: 0, output: 0 }, demo: true }
}

function genericDemoText(req: LLMRequest): string {
  const last = [...req.messages].reverse().find((m) => m.role === 'user')?.content ?? ''
  const topic = last.replace(/\s+/g, ' ').trim().slice(0, 90)
  return `Here’s how I’d approach **${topic || 'this'}**:\n\n1. **Clarify the goal** – what does a great result look like, and by when?\n2. **Gather what we know** – pull the relevant notes from your brain and any live research.\n3. **Shape options** – two or three routes with the trade-offs spelled out.\n4. **Agree next steps** – owners, dates and what I can take off your plate.\n\n_This is a demo answer. Connect an AI provider in **Settings → AI** and I’ll give you a real, specific response._`
}
