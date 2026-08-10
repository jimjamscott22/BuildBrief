import { act, renderHook, waitFor } from '@testing-library/react'
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
    vi.mocked(api.getProject).mockResolvedValue(savedRecord({ spec: '# Complete' }))

    const { result } = renderHook(() => useGenerationRun('project-1', partialRequest))

    await waitFor(() => expect(result.current.phase).toBe('completed'))
    expect(result.current.statuses.spec).toBe('complete')
    expect(result.current.statuses.agent_prompt).toBe('failed')
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

  it('aborts silently on unmount and ignores every late event', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    let streamSignal: AbortSignal | undefined
    let sendEvent: ((event: GenerationStreamEvent) => void) | undefined
    vi.mocked(api.streamDeliverables).mockImplementation(
      async (_id, _request, onEvent, signal) => {
        streamSignal = signal
        sendEvent = onEvent
        await new Promise<void>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(abortError()), { once: true })
        })
      },
    )

    const { unmount } = renderHook(() => useGenerationRun('project-1', request))
    expect(streamSignal?.aborted).toBe(false)

    unmount()
    expect(streamSignal?.aborted).toBe(true)

    await act(async () => {
      sendEvent?.({ type: 'delta', deliverable: 'spec', delta: '# Too late' })
      await Promise.resolve()
    })

    expect(api.getProject).not.toHaveBeenCalled()
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('ignores events from a superseded request', async () => {
    let firstSignal: AbortSignal | undefined
    let sendFirstEvent: ((event: GenerationStreamEvent) => void) | undefined
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
        onEvent({ type: 'started', deliverables: ['spec'] })
        onEvent({ type: 'delta', deliverable: 'spec', delta: '# Current' })
        onEvent({ type: 'completed', deliverable: 'spec' })
        onEvent({ type: 'done', failures: [] })
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
    await waitFor(() => expect(result.current.phase).toBe('completed'))

    expect(result.current.drafts.spec).toBe('# Current')
    expect(api.getProject).toHaveBeenCalledTimes(1)
  })
})
