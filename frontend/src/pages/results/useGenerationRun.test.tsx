import { act, renderHook, waitFor } from '@testing-library/react'
import { StrictMode, type PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../../api'
import type { GenerateRequest, ProjectWithDeliverables } from '../../api'
import type { GenerationStreamEvent } from '../../generationStream'
import { useGenerationRun } from './useGenerationRun'

vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api')>()),
  getProject: vi.fn(),
  streamDeliverables: vi.fn(),
}))

const request: GenerateRequest = {
  model: 'ollama/test',
  deliverables: ['spec'],
  preset: 'mvp',
}

function savedRecord(
  deliverables: ProjectWithDeliverables['deliverables'],
): ProjectWithDeliverables {
  return {
    project: {
      id: 'project-1',
      title: 'Live Brief',
      description: 'A streaming project',
      target_users: 'Builders',
      platform: 'web',
      tech_preferences: '',
      complexity: 'medium',
      constraints: '',
      extra_context: '',
      created_at: '2026-08-10T00:00:00Z',
      updated_at: '2026-08-10T00:00:01Z',
    },
    deliverables,
  }
}

function abortError() {
  return new DOMException('The operation was aborted.', 'AbortError')
}

function strictWrapper({ children }: PropsWithChildren) {
  return <StrictMode>{children}</StrictMode>
}

describe('useGenerationRun', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('accumulates deltas and settles from persisted output', async () => {
    let finishReload: ((record: ProjectWithDeliverables) => void) | undefined
    vi.mocked(api.streamDeliverables).mockImplementation(async (_id, _request, onEvent) => {
      onEvent({ type: 'started', deliverables: ['spec'] })
      onEvent({ type: 'delta', deliverable: 'spec', delta: '# Live' })
      onEvent({ type: 'delta', deliverable: 'spec', delta: ' draft' })
      onEvent({ type: 'completed', deliverable: 'spec' })
      onEvent({ type: 'done', failures: [] })
    })
    vi.mocked(api.getProject).mockReturnValue(
      new Promise((resolve) => {
        finishReload = resolve
      }),
    )

    const { result } = renderHook(() => useGenerationRun('project-1', request))

    await waitFor(() => expect(api.getProject).toHaveBeenCalledWith('project-1'))
    expect(result.current.phase).toBe('running')
    expect(result.current.drafts.spec).toBe('# Live draft')
    expect(result.current.statuses.spec).toBe('complete')
    expect(result.current.savedRecord).toBeUndefined()

    act(() => {
      finishReload?.(savedRecord({ spec: '# Saved' }))
    })

    await waitFor(() => expect(result.current.phase).toBe('completed'))
    expect(result.current.drafts.spec).toBe('# Saved')
    expect(result.current.statuses.spec).toBe('complete')
    expect(result.current.savedRecord?.deliverables?.spec).toBe('# Saved')
  })

  it('tracks elapsed seconds only while the run is active', async () => {
    vi.useFakeTimers()
    let finishStream: (() => void) | undefined
    vi.mocked(api.streamDeliverables).mockReturnValue(
      new Promise((resolve) => {
        finishStream = resolve
      }),
    )
    vi.mocked(api.getProject).mockResolvedValue(savedRecord({ spec: '# Saved' }))

    const { result } = renderHook(() => useGenerationRun('project-1', request))

    act(() => {
      vi.advanceTimersByTime(2_000)
    })
    expect(result.current.elapsed).toBe(2)

    await act(async () => {
      finishStream?.()
      await Promise.resolve()
    })
    expect(result.current.phase).toBe('completed')

    act(() => {
      vi.advanceTimersByTime(2_000)
    })
    expect(result.current.elapsed).toBe(2)
  })

  it('stops intentionally, discards incomplete drafts, and reloads saved output', async () => {
    const stoppedRequest: GenerateRequest = {
      ...request,
      deliverables: ['spec', 'implementation_plan'],
    }
    let streamSignal: AbortSignal | undefined
    vi.mocked(api.streamDeliverables).mockImplementation(
      async (_id, _request, onEvent, signal) => {
        streamSignal = signal
        onEvent({ type: 'started', deliverables: stoppedRequest.deliverables })
        onEvent({ type: 'delta', deliverable: 'spec', delta: '# Incomplete' })
        onEvent({ type: 'delta', deliverable: 'implementation_plan', delta: '# Saved plan' })
        onEvent({ type: 'completed', deliverable: 'implementation_plan' })
        await new Promise<void>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(abortError()), { once: true })
        })
      },
    )
    vi.mocked(api.getProject).mockResolvedValue(
      savedRecord({ implementation_plan: '# Saved plan' }),
    )

    const { result } = renderHook(() => useGenerationRun('project-1', stoppedRequest))
    await waitFor(() => expect(result.current.drafts.spec).toBe('# Incomplete'))
    expect(result.current.statuses.spec).toBe('generating')

    act(() => result.current.stop())
    expect(result.current.phase).toBe('stopping')
    expect(streamSignal?.aborted).toBe(true)

    await waitFor(() => expect(result.current.phase).toBe('cancelled'))
    expect(api.getProject).toHaveBeenCalledWith('project-1')
    expect(result.current.drafts.spec).toBeUndefined()
    expect(result.current.drafts.implementation_plan).toBe('# Saved plan')
    expect(result.current.savedRecord?.deliverables?.implementation_plan).toBe('# Saved plan')
    expect(result.current.notice).toBe(
      'Generation stopped. Incomplete drafts were not saved.',
    )
    expect(result.current.error).toBe('')
  })

  it('latches Stop when the aborted stream resolves cleanly', async () => {
    let finishStream: (() => void) | undefined
    let finishReload: ((record: ProjectWithDeliverables) => void) | undefined
    let sendEvent: ((event: GenerationStreamEvent) => void) | undefined
    vi.mocked(api.streamDeliverables).mockImplementation(
      (_id, _request, onEvent) => {
        sendEvent = onEvent
        return new Promise<void>((resolve) => {
          finishStream = resolve
        })
      },
    )
    vi.mocked(api.getProject).mockReturnValue(
      new Promise((resolve) => {
        finishReload = resolve
      }),
    )

    const { result } = renderHook(() => useGenerationRun('project-1', request))
    expect(result.current.statuses.spec).toBe('queued')

    act(() => {
      sendEvent?.({ type: 'delta', deliverable: 'spec', delta: '# In progress' })
    })
    expect(result.current.statuses.spec).toBe('generating')

    act(() => result.current.stop())
    expect(result.current.phase).toBe('stopping')

    act(() => {
      sendEvent?.({ type: 'delta', deliverable: 'spec', delta: ' late' })
    })
    expect(result.current.drafts.spec).toBe('# In progress')
    expect(result.current.statuses.spec).toBe('generating')

    await act(async () => {
      finishStream?.()
      await Promise.resolve()
    })
    await waitFor(() => expect(api.getProject).toHaveBeenCalledWith('project-1'))
    expect(result.current.phase).toBe('stopping')
    expect(result.current.drafts.spec).toBe('# In progress')
    expect(result.current.savedRecord).toBeUndefined()

    act(() => {
      finishReload?.(savedRecord({ spec: '# Previously saved' }))
    })

    await waitFor(() => expect(result.current.phase).toBe('cancelled'))
    expect(result.current.drafts.spec).toBe('# Previously saved')
    expect(result.current.notice).toBe(
      'Generation stopped. Incomplete drafts were not saved.',
    )
    expect(result.current.error).toBe('')
  })

  it('ignores observable done-frame side effects after Stop', async () => {
    let rejectStream: ((reason: unknown) => void) | undefined
    let finishReload: ((record: ProjectWithDeliverables) => void) | undefined
    let sendEvent: ((event: GenerationStreamEvent) => void) | undefined
    vi.mocked(api.streamDeliverables).mockImplementation(
      (_id, _request, onEvent) => {
        sendEvent = onEvent
        return new Promise<void>((_resolve, reject) => {
          rejectStream = reject
        })
      },
    )
    vi.mocked(api.getProject).mockReturnValue(
      new Promise((resolve) => {
        finishReload = resolve
      }),
    )

    const { result } = renderHook(() => useGenerationRun('project-1', request))

    act(() => result.current.stop())
    act(() => {
      sendEvent?.({
        type: 'done',
        failures: [{ deliverable: 'spec', label: 'Spec', message: 'Late failure.' }],
      })
    })
    expect(result.current.phase).toBe('stopping')
    expect(result.current.failures).toEqual([])

    await act(async () => {
      rejectStream?.(new Error('Late transport failure.'))
      await Promise.resolve()
    })
    await waitFor(() => expect(api.getProject).toHaveBeenCalledWith('project-1'))
    expect(result.current.phase).toBe('stopping')
    expect(result.current.failures).toEqual([])

    act(() => finishReload?.(savedRecord(null)))

    await waitFor(() => expect(result.current.phase).toBe('cancelled'))
    expect(result.current.notice).toBe(
      'Generation stopped. Incomplete drafts were not saved.',
    )
    expect(result.current.error).toBe('')
  })

  it('keeps Stop authoritative after a late error frame', async () => {
    let rejectStream: ((reason: unknown) => void) | undefined
    let finishReload: ((record: ProjectWithDeliverables) => void) | undefined
    let sendEvent: ((event: GenerationStreamEvent) => void) | undefined
    vi.mocked(api.streamDeliverables).mockImplementation(
      (_id, _request, onEvent) => {
        sendEvent = onEvent
        return new Promise<void>((_resolve, reject) => {
          rejectStream = reject
        })
      },
    )
    vi.mocked(api.getProject).mockReturnValue(
      new Promise((resolve) => {
        finishReload = resolve
      }),
    )

    const { result } = renderHook(() => useGenerationRun('project-1', request))

    act(() => result.current.stop())
    act(() => sendEvent?.({ type: 'error', message: 'Late provider error.' }))
    expect(result.current.phase).toBe('stopping')
    expect(result.current.error).toBe('')

    await act(async () => {
      rejectStream?.(new Error('Late transport failure.'))
      await Promise.resolve()
    })
    await waitFor(() => expect(api.getProject).toHaveBeenCalledWith('project-1'))
    expect(result.current.phase).toBe('stopping')
    expect(result.current.error).toBe('')

    act(() => finishReload?.(savedRecord(null)))

    await waitFor(() => expect(result.current.phase).toBe('cancelled'))
    expect(result.current.notice).toBe(
      'Generation stopped. Incomplete drafts were not saved.',
    )
    expect(result.current.error).toBe('')
  })

  it.each([
    ['done', { type: 'done', failures: [] } as GenerationStreamEvent, 'completed', ''],
    [
      'error',
      { type: 'error', message: 'Provider failed first.' } as GenerationStreamEvent,
      'failed',
      'Provider failed first.',
    ],
  ])(
    'preserves a terminal %s frame received before Stop',
    async (_name, terminalEvent, expectedPhase, expectedError) => {
      let finishStream: (() => void) | undefined
      let sendEvent: ((event: GenerationStreamEvent) => void) | undefined
      let streamSignal: AbortSignal | undefined
      vi.mocked(api.streamDeliverables).mockImplementation(
        (_id, _request, onEvent, signal) => {
          sendEvent = onEvent
          streamSignal = signal
          return new Promise<void>((resolve) => {
            finishStream = resolve
          })
        },
      )
      vi.mocked(api.getProject).mockResolvedValue(savedRecord(null))

      const { result } = renderHook(() => useGenerationRun('project-1', request))

      act(() => sendEvent?.(terminalEvent))
      act(() => result.current.stop())
      expect(streamSignal?.aborted).toBe(false)

      await act(async () => {
        finishStream?.()
        await Promise.resolve()
      })

      await waitFor(() => expect(result.current.phase).toBe(expectedPhase))
      expect(result.current.error).toBe(expectedError)
      expect(result.current.notice).toBe('')
    },
  )

  it('retains deliverable failures and completes from a done event', async () => {
    const partialRequest: GenerateRequest = {
      ...request,
      deliverables: ['spec', 'agent_prompt'],
    }
    const failure = {
      deliverable: 'agent_prompt',
      label: 'Agent prompt',
      message: 'Provider returned no content.',
    }
    vi.mocked(api.streamDeliverables).mockImplementation(async (_id, _request, onEvent) => {
      onEvent({ type: 'started', deliverables: partialRequest.deliverables })
      onEvent({ type: 'delta', deliverable: 'spec', delta: '# Complete' })
      onEvent({ type: 'completed', deliverable: 'spec' })
      onEvent({ type: 'failed', ...failure })
      onEvent({ type: 'done', failures: [failure] })
    })
    vi.mocked(api.getProject).mockResolvedValue(
      savedRecord({ spec: '# Complete', agent_prompt: '# Older saved prompt' }),
    )

    const { result } = renderHook(() => useGenerationRun('project-1', partialRequest))

    await waitFor(() => expect(result.current.phase).toBe('completed'))
    expect(result.current.statuses.spec).toBe('complete')
    expect(result.current.statuses.agent_prompt).toBe('failed')
    expect(result.current.drafts.agent_prompt).toBe('# Older saved prompt')
    expect(result.current.failures).toEqual([failure])
    expect(api.getProject).toHaveBeenCalledWith('project-1')
  })

  it('fails on a terminal error event and reloads authoritative output', async () => {
    vi.mocked(api.streamDeliverables).mockImplementation(async (_id, _request, onEvent) => {
      onEvent({ type: 'started', deliverables: ['spec'] })
      onEvent({ type: 'delta', deliverable: 'spec', delta: '# Unsaved' })
      onEvent({ type: 'error', message: 'Provider became unavailable.' })
      onEvent({ type: 'done', failures: [] })
    })
    vi.mocked(api.getProject).mockResolvedValue(savedRecord(null))

    const { result } = renderHook(() => useGenerationRun('project-1', request))

    await waitFor(() => expect(result.current.phase).toBe('failed'))
    expect(result.current.error).toBe('Provider became unavailable.')
    expect(result.current.drafts.spec).toBeUndefined()
    expect(result.current.savedRecord).toEqual(savedRecord(null))
    expect(api.getProject).toHaveBeenCalledWith('project-1')
  })

  it('fails on a transport error and reloads authoritative output', async () => {
    vi.mocked(api.streamDeliverables).mockRejectedValue(new Error('Connection lost.'))
    vi.mocked(api.getProject).mockResolvedValue(savedRecord({ spec: '# Previously saved' }))

    const { result } = renderHook(() => useGenerationRun('project-1', request))

    await waitFor(() => expect(result.current.phase).toBe('failed'))
    expect(result.current.error).toBe('Connection lost.')
    expect(result.current.drafts.spec).toBe('# Previously saved')
    expect(result.current.savedRecord?.deliverables?.spec).toBe('# Previously saved')
    expect(api.getProject).toHaveBeenCalledWith('project-1')
  })

  it.each([
    [
      'done and clean resolution',
      { type: 'done', failures: [] } as GenerationStreamEvent,
      'resolve',
    ],
    [
      'error and rejection',
      { type: 'error', message: 'Too late.' } as GenerationStreamEvent,
      'reject',
    ],
  ])('does not reload after unmount on late %s', async (_name, lateEvent, settlement) => {
    let streamSignal: AbortSignal | undefined
    let sendEvent: ((event: GenerationStreamEvent) => void) | undefined
    let finishStream: (() => void) | undefined
    let rejectStream: ((reason: unknown) => void) | undefined
    vi.mocked(api.streamDeliverables).mockImplementation(
      (_id, _request, onEvent, signal) => {
        streamSignal = signal
        sendEvent = onEvent
        return new Promise<void>((resolve, reject) => {
          finishStream = resolve
          rejectStream = reject
        })
      },
    )
    vi.mocked(api.getProject).mockResolvedValue(savedRecord(null))

    const { unmount } = renderHook(() => useGenerationRun('project-1', request))
    expect(streamSignal?.aborted).toBe(false)

    unmount()
    expect(streamSignal?.aborted).toBe(true)

    await act(async () => {
      sendEvent?.(lateEvent)
      if (settlement === 'resolve') finishStream?.()
      else rejectStream?.(new Error('Late transport failure.'))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(api.getProject).not.toHaveBeenCalled()
  })

  it('ignores events from a superseded request', async () => {
    let firstSignal: AbortSignal | undefined
    let sendFirstEvent: ((event: GenerationStreamEvent) => void) | undefined
    let sendSecondEvent: ((event: GenerationStreamEvent) => void) | undefined
    let finishSecondStream: (() => void) | undefined
    vi.mocked(api.streamDeliverables).mockImplementation(
      async (_id, generationRequest, onEvent, signal) => {
        if (generationRequest.model === 'ollama/first') {
          firstSignal = signal
          sendFirstEvent = onEvent
          await new Promise<void>((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(abortError()), { once: true })
          })
          return
        }
        sendSecondEvent = onEvent
        await new Promise<void>((resolve) => {
          finishSecondStream = resolve
        })
      },
    )
    vi.mocked(api.getProject).mockResolvedValue(savedRecord({ spec: '# Current' }))

    const { result, rerender } = renderHook(
      ({ model }) => useGenerationRun('project-1', { ...request, model }),
      { initialProps: { model: 'ollama/first' } },
    )

    rerender({ model: 'ollama/second' })
    expect(firstSignal?.aborted).toBe(true)

    await act(async () => {
      sendFirstEvent?.({ type: 'delta', deliverable: 'spec', delta: '# Stale' })
      await Promise.resolve()
    })
    expect(result.current.drafts.spec).toBe('')

    act(() => {
      sendSecondEvent?.({ type: 'delta', deliverable: 'spec', delta: '# Current' })
    })
    expect(result.current.drafts.spec).toBe('# Current')

    await act(async () => {
      sendSecondEvent?.({ type: 'completed', deliverable: 'spec' })
      sendSecondEvent?.({ type: 'done', failures: [] })
      finishSecondStream?.()
      await Promise.resolve()
    })
    await waitFor(() => expect(result.current.phase).toBe('completed'))

    expect(result.current.drafts.spec).toBe('# Current')
    expect(api.getProject).toHaveBeenCalledTimes(1)
  })

  it('aborts StrictMode rehearsal work and settles only the current request', async () => {
    const signals: AbortSignal[] = []
    const eventSenders: Array<(event: GenerationStreamEvent) => void> = []
    const streamResolvers: Array<() => void> = []
    vi.mocked(api.streamDeliverables).mockImplementation(
      (_id, _request, onEvent, signal) => {
        signals.push(signal)
        eventSenders.push(onEvent)
        return new Promise<void>((resolve, reject) => {
          streamResolvers.push(resolve)
          signal.addEventListener('abort', () => reject(abortError()), { once: true })
        })
      },
    )
    vi.mocked(api.getProject).mockResolvedValue(savedRecord({ spec: '# Current' }))

    const { result } = renderHook(() => useGenerationRun('project-1', request), {
      wrapper: strictWrapper,
    })

    await waitFor(() => expect(api.streamDeliverables).toHaveBeenCalledTimes(2))
    expect(signals[0].aborted).toBe(true)
    expect(signals[1].aborted).toBe(false)

    act(() => {
      eventSenders[0]({ type: 'delta', deliverable: 'spec', delta: '# Rehearsal' })
      eventSenders[1]({ type: 'delta', deliverable: 'spec', delta: '# Current' })
      eventSenders[1]({ type: 'completed', deliverable: 'spec' })
      eventSenders[1]({ type: 'done', failures: [] })
    })
    expect(result.current.drafts.spec).toBe('# Current')

    await act(async () => {
      streamResolvers[1]()
      await Promise.resolve()
    })

    await waitFor(() => expect(result.current.phase).toBe('completed'))
    expect(result.current.drafts.spec).toBe('# Current')
    expect(api.getProject).toHaveBeenCalledTimes(1)
  })
})
