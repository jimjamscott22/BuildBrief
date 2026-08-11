export type GenerationStreamFailure = {
  deliverable: string
  label: string
  message: string
}

export type GenerationStreamEvent =
  | { type: 'started'; deliverables: string[] }
  | { type: 'delta'; deliverable: string; delta: string }
  | { type: 'completed'; deliverable: string }
  | { type: 'failed'; deliverable: string; label: string; message: string }
  | { type: 'done'; failures: GenerationStreamFailure[] }
  | { type: 'error'; message: string }

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString)
}

function isFailureArray(value: unknown): value is GenerationStreamFailure[] {
  return Array.isArray(value) && value.every((failure) => {
    if (typeof failure !== 'object' || failure === null) return false
    const value = failure as Record<string, unknown>
    return isString(value.deliverable) && isString(value.label) && isString(value.message)
  })
}

function invalidGenerationStreamData(): never {
  throw new Error('Invalid generation stream data.')
}

function validateGenerationEvent(
  name: string,
  payload: Record<string, unknown>,
): GenerationStreamEvent {
  switch (name) {
    case 'started':
      if (isStringArray(payload.deliverables)) {
        return { type: 'started', deliverables: payload.deliverables }
      }
      return invalidGenerationStreamData()
    case 'delta':
      if (isString(payload.deliverable) && isString(payload.delta)) {
        return { type: 'delta', deliverable: payload.deliverable, delta: payload.delta }
      }
      return invalidGenerationStreamData()
    case 'completed':
      if (isString(payload.deliverable)) {
        return { type: 'completed', deliverable: payload.deliverable }
      }
      return invalidGenerationStreamData()
    case 'failed':
      if (isString(payload.deliverable) && isString(payload.label) && isString(payload.message)) {
        return {
          type: 'failed',
          deliverable: payload.deliverable,
          label: payload.label,
          message: payload.message,
        }
      }
      return invalidGenerationStreamData()
    case 'done':
      if (isFailureArray(payload.failures)) {
        return { type: 'done', failures: payload.failures }
      }
      return invalidGenerationStreamData()
    case 'error':
      if (isString(payload.message)) {
        return { type: 'error', message: payload.message }
      }
      return invalidGenerationStreamData()
    default:
      return invalidGenerationStreamData()
  }
}

function parseFrame(frame: string): GenerationStreamEvent | null {
  let name = ''
  const data: string[] = []
  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith('event:')) name = line.slice(6).trim()
    if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
  }
  if (!name) return null
  try {
    const payload = JSON.parse(data.join('\n')) as Record<string, unknown>
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
      return invalidGenerationStreamData()
    }
    return validateGenerationEvent(name, payload)
  } catch {
    return invalidGenerationStreamData()
  }
}

export async function readGenerationStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: GenerationStreamEvent) => void,
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let terminalReceived = false

  const parseCompleteFrames = () => {
    let separator = /\r?\n\r?\n/.exec(buffer)
    while (separator) {
      const frame = buffer.slice(0, separator.index)
      buffer = buffer.slice(separator.index + separator[0].length)
      const event = parseFrame(frame)
      if (event) {
        onEvent(event)
        if (event.type === 'done' || event.type === 'error') {
          terminalReceived = true
          return
        }
      }
      separator = /\r?\n\r?\n/.exec(buffer)
    }
  }

  const cancelReader = async () => {
    try {
      await reader.cancel()
    } catch {
      // Preserve the stream parsing or transport error that triggered cancellation.
    }
  }

  try {
    while (!terminalReceived) {
      const { done, value } = await reader.read()
      if (done) {
        buffer += decoder.decode()
        parseCompleteFrames()
        if (terminalReceived) break
        if (buffer.trim()) invalidGenerationStreamData()
        throw new Error('Generation stream ended before a terminal event.')
      }
      buffer += decoder.decode(value, { stream: true })
      parseCompleteFrames()
    }

    await cancelReader()
  } catch (error) {
    await cancelReader()
    throw error
  } finally {
    reader.releaseLock()
  }
}
