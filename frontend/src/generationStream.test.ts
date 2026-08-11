import { describe, expect, it, vi } from 'vitest'
import { ApiError, streamDeliverables, type GenerateRequest } from './api'
import { readGenerationStream } from './generationStream'

function body(...chunks: string[]) {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)))
      controller.close()
    },
  })
}

function bytes(...chunks: Uint8Array[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(chunk))
      controller.close()
    },
  })
}

describe('readGenerationStream', () => {
  it('parses split frames, adjacent frames, CRLF, and unicode', async () => {
    const onEvent = vi.fn()
    await readGenerationStream(
      body(
        'event: started\r\ndata: {"deliverables":["spec"]}\r\n\r',
        '\nevent: delta\ndata: {"deliverable":"spec","delta":"å"}\n\n',
        'event: completed\ndata: {"deliverable":"spec"}\n\n',
        'event: done\ndata: {"failures":[]}\n\n',
      ),
      onEvent,
    )
    expect(onEvent.mock.calls.map(([event]) => event.type)).toEqual([
      'started', 'delta', 'completed', 'done',
    ])
    expect(onEvent.mock.calls[1][0].delta).toBe('å')
  })

  it('rejects malformed JSON', async () => {
    await expect(
      readGenerationStream(body('event: delta\ndata: nope\n\n'), vi.fn()),
    ).rejects.toThrow('Invalid generation stream data')
  })

  it('decodes UTF-8 characters split across chunks', async () => {
    const encoded = new TextEncoder().encode(
      [
        'event: delta\ndata: {"deliverable":"spec","delta":"å"}\n\n',
        'event: done\ndata: {"failures":[]}\n\n',
      ].join(''),
    )
    const splitAt = encoded.indexOf(0xc3) + 1
    const onEvent = vi.fn()

    await readGenerationStream(bytes(encoded.slice(0, splitAt), encoded.slice(splitAt)), onEvent)

    expect(onEvent).toHaveBeenCalledWith({
      type: 'delta',
      deliverable: 'spec',
      delta: 'å',
    })
  })

  it('rejects clean EOF before a terminal event, cancels the reader, and releases its lock', async () => {
    const encoded = new TextEncoder().encode(
      'event: started\ndata: {"deliverables":["spec"]}\n\n',
    )
    const read = vi.fn()
      .mockResolvedValueOnce({ done: false, value: encoded })
      .mockResolvedValueOnce({ done: true, value: undefined })
    const cancel = vi.fn().mockResolvedValue(undefined)
    const releaseLock = vi.fn()
    const truncatedBody = {
      getReader: () => ({ read, cancel, releaseLock }),
    } as unknown as ReadableStream<Uint8Array>

    await expect(readGenerationStream(truncatedBody, vi.fn())).rejects.toThrow(
      'Generation stream ended before a terminal event.',
    )

    expect(cancel).toHaveBeenCalledOnce()
    expect(releaseLock).toHaveBeenCalledOnce()
    expect(cancel.mock.invocationCallOrder[0]).toBeLessThan(releaseLock.mock.invocationCallOrder[0])
  })

  it('cancels a malformed never-ending body and releases its lock', async () => {
    const cancelBody = vi.fn()
    const malformedBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('event: delta\ndata: nope\n\n'))
      },
      cancel: cancelBody,
    })

    await expect(readGenerationStream(malformedBody, vi.fn())).rejects.toThrow(
      'Invalid generation stream data',
    )

    expect(cancelBody).toHaveBeenCalledOnce()
    expect(malformedBody.locked).toBe(false)
  })

  it.each([
    ['done', '{"failures":[]}', { type: 'done', failures: [] }],
    ['error', '{"message":"Provider failed."}', { type: 'error', message: 'Provider failed.' }],
  ])(
    'stops at a terminal %s frame, cancels promptly, and ignores trailing frames',
    async (eventName, payload, expectedEvent) => {
      const encoded = new TextEncoder().encode([
        `event: ${eventName}\ndata: ${payload}\n\n`,
        'event: delta\ndata: {"deliverable":"spec","delta":"late"}\n\n',
      ].join(''))
      const read = vi.fn()
        .mockResolvedValueOnce({ done: false, value: encoded })
        .mockRejectedValueOnce(new Error('Reader should not be called after terminal.'))
      const cancel = vi.fn().mockResolvedValue(undefined)
      const releaseLock = vi.fn()
      const trailingBody = {
        getReader: () => ({ read, cancel, releaseLock }),
      } as unknown as ReadableStream<Uint8Array>
      const onEvent = vi.fn()

      await readGenerationStream(trailingBody, onEvent)

      expect(onEvent).toHaveBeenCalledTimes(1)
      expect(onEvent).toHaveBeenCalledWith(expectedEvent)
      expect(read).toHaveBeenCalledOnce()
      expect(cancel).toHaveBeenCalledOnce()
      expect(releaseLock).toHaveBeenCalledOnce()
    },
  )

  it('rejects unknown events, invalid payloads, and trailing fragments', async () => {
    await expect(
      readGenerationStream(body('event: unknown\ndata: {}\n\n'), vi.fn()),
    ).rejects.toThrow('Invalid generation stream data')
    await expect(
      readGenerationStream(body('event: started\ndata: {"deliverables":"spec"}\n\n'), vi.fn()),
    ).rejects.toThrow('Invalid generation stream data')
    await expect(
      readGenerationStream(body('event: done\ndata: {"failures":[]}'), vi.fn()),
    ).rejects.toThrow('Invalid generation stream data')
  })
})

describe('streamDeliverables', () => {
  const request: GenerateRequest = {
    model: 'gpt-test',
    deliverables: ['spec'],
  }

  it('posts to the stream endpoint with SSE headers and forwards its abort signal', async () => {
    const signal = new AbortController().signal
    const onEvent = vi.fn()
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('event: done\ndata: {"failures":[]}\n\n', { status: 200 }),
    )

    await streamDeliverables('project-id', request, onEvent, signal)

    expect(fetchMock).toHaveBeenCalledWith('/api/projects/project-id/generate/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(request),
      signal,
    })
    expect(onEvent).toHaveBeenCalledWith({ type: 'done', failures: [] })
  })

  it('turns a non-2xx JSON detail into an ApiError', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Streaming is unavailable' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(
      streamDeliverables('project-id', request, vi.fn(), new AbortController().signal),
    ).rejects.toEqual(expect.objectContaining({
      name: 'ApiError',
      message: 'Streaming is unavailable',
      status: 503,
    } satisfies Partial<ApiError>))
  })
})
