/** An error whose message is written for a non-technical reader. */
export class FriendlyError extends Error {
  hint?: string
  constructor(message: string, hint?: string) {
    super(message)
    this.name = 'FriendlyError'
    this.hint = hint
  }
}

export function httpError(provider: string, status: number, body: string, model?: string): FriendlyError {
  const detail = extractMessage(body)
  if (status === 401 || status === 403) {
    return new FriendlyError(`${provider} didn’t accept the API key.`, 'Open the Vault and check the key for this AI profile is correct and active.')
  }
  if (status === 404) {
    return new FriendlyError(`${provider} couldn’t find the model “${model ?? 'unknown'}”.`, 'Pick a different model for this AI profile in Settings → AI.')
  }
  if (status === 429) {
    return new FriendlyError(`${provider} is getting too many requests right now.`, 'Wait a moment and try again, or check your plan’s usage limits.')
  }
  if (status === 402) {
    return new FriendlyError(`${provider} says the account has run out of credit.`, 'Top up the account or switch this agent to another AI profile.')
  }
  if (status >= 500) {
    return new FriendlyError(`${provider} is having a wobble (error ${status}).`, 'Try again in a minute.')
  }
  return new FriendlyError(`${provider} returned an error${detail ? `: ${detail}` : ` (${status})`}.`)
}

export function networkError(provider: string): FriendlyError {
  return new FriendlyError(
    `Couldn’t connect to ${provider}.`,
    'Check your internet connection. Some services also block connections straight from a web browser. If this keeps happening, use Claude, Gemini or OpenRouter for this agent.',
  )
}

function extractMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } | string; message?: string }
    if (typeof parsed.error === 'string') return parsed.error
    return parsed.error?.message ?? parsed.message ?? ''
  } catch {
    return body.slice(0, 160)
  }
}
