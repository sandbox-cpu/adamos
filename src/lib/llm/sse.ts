/**
 * Minimal server-sent-events reader for fetch() responses. Yields the `data`
 * payload of each event (multi-line data fields are joined with newlines).
 */
export async function* readSSE(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let dataLines: string[] = []
  try {
    while (true) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let nl: number
      while ((nl = buffer.indexOf('\n')) !== -1) {
        let line = buffer.slice(0, nl)
        buffer = buffer.slice(nl + 1)
        if (line.endsWith('\r')) line = line.slice(0, -1)
        if (line === '') {
          if (dataLines.length) {
            yield dataLines.join('\n')
            dataLines = []
          }
          continue
        }
        if (line.startsWith(':')) continue
        if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''))
      }
    }
    buffer += decoder.decode()
    if (buffer.trim().startsWith('data:')) dataLines.push(buffer.trim().slice(5).replace(/^ /, ''))
    if (dataLines.length) yield dataLines.join('\n')
  } finally {
    reader.releaseLock()
  }
}
