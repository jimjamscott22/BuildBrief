import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getProject,
  streamDeliverables,
  type Deliverable,
  type DeliverableFailure,
  type DeliverableKey,
  type GenerateRequest,
  type ProjectWithDeliverables,
} from '../../api'
import type { GenerationStreamEvent, GenerationStreamFailure } from '../../generationStream'

export type DeliverableRunStatus = 'queued' | 'generating' | 'complete' | 'failed'

export type GenerationPhase =
  | 'idle'
  | 'running'
  | 'stopping'
  | 'completed'
  | 'cancelled'
  | 'failed'

export interface GenerationRunState {
  phase: GenerationPhase
  drafts: Deliverable
  statuses: Partial<Record<DeliverableKey, DeliverableRunStatus>>
  failures: DeliverableFailure[]
  elapsed: number
  error: string
  notice: string
  savedRecord: ProjectWithDeliverables | undefined
  stop: () => void
}

type TerminalPhase = Extract<GenerationPhase, 'completed' | 'cancelled' | 'failed'>

const STOPPED_NOTICE = 'Generation stopped. Incomplete drafts were not saved.'

function initialDrafts(deliverables: DeliverableKey[]): Deliverable {
  return Object.fromEntries(deliverables.map((deliverable) => [deliverable, ''])) as Deliverable
}

function initialStatuses(
  deliverables: DeliverableKey[],
): Partial<Record<DeliverableKey, DeliverableRunStatus>> {
  return Object.fromEntries(
    deliverables.map((deliverable) => [deliverable, 'queued']),
  ) as Partial<Record<DeliverableKey, DeliverableRunStatus>>
}

function requestedDeliverable(
  value: string,
  deliverables: DeliverableKey[],
): DeliverableKey | undefined {
  return deliverables.find((deliverable) => deliverable === value)
}

function typedFailure(
  failure: GenerationStreamFailure,
  deliverables: DeliverableKey[],
): DeliverableFailure | undefined {
  const deliverable = requestedDeliverable(failure.deliverable, deliverables)
  if (!deliverable) return undefined
  return { ...failure, deliverable }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Generation failed.'
}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
}

export function useGenerationRun(
  projectId: string | undefined,
  request: GenerateRequest | undefined,
): GenerationRunState {
  const model = request?.model
  const preset = request?.preset
  const deliverablesSignature = request?.deliverables.join(',') ?? ''
  const controllerRef = useRef<AbortController | null>(null)
  const streamingRef = useRef(false)
  const stopRequested = useRef(false)
  const [phase, setPhase] = useState<GenerationPhase>('idle')
  const [drafts, setDrafts] = useState<Deliverable>({})
  const [statuses, setStatuses] = useState<
    Partial<Record<DeliverableKey, DeliverableRunStatus>>
  >({})
  const [failures, setFailures] = useState<DeliverableFailure[]>([])
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [savedRecord, setSavedRecord] = useState<ProjectWithDeliverables>()

  const stop = useCallback(() => {
    const controller = controllerRef.current
    if (!controller || controller.signal.aborted || !streamingRef.current) return
    stopRequested.current = true
    setPhase('stopping')
    controller.abort()
  }, [])

  useEffect(() => {
    if (phase !== 'running') return
    const timer = window.setInterval(() => {
      setElapsed((current) => current + 1)
    }, 1_000)
    return () => window.clearInterval(timer)
  }, [phase])

  useEffect(() => {
    if (!projectId || !model || !deliverablesSignature) {
      setPhase('idle')
      setDrafts({})
      setStatuses({})
      setFailures([])
      setElapsed(0)
      setError('')
      setNotice('')
      setSavedRecord(undefined)
      return
    }

    const deliverables = deliverablesSignature.split(',') as DeliverableKey[]
    const generationRequest: GenerateRequest = { model, deliverables }
    if (preset !== undefined) generationRequest.preset = preset
    const controller = new AbortController()
    let mounted = true
    let terminalPhase: TerminalPhase | undefined
    let terminalError = ''

    controllerRef.current = controller
    streamingRef.current = true
    stopRequested.current = false
    setPhase('running')
    setDrafts(initialDrafts(deliverables))
    setStatuses(initialStatuses(deliverables))
    setFailures([])
    setElapsed(0)
    setError('')
    setNotice('')
    setSavedRecord(undefined)

    const isCurrent = () => mounted && controllerRef.current === controller

    const handleEvent = (event: GenerationStreamEvent) => {
      if (!isCurrent() || terminalPhase) return
      switch (event.type) {
        case 'started':
          return
        case 'delta': {
          const deliverable = requestedDeliverable(event.deliverable, deliverables)
          if (!deliverable) return
          setStatuses((current) => ({ ...current, [deliverable]: 'generating' }))
          setDrafts((current) => ({
            ...current,
            [deliverable]: `${current[deliverable] ?? ''}${event.delta}`,
          }))
          return
        }
        case 'completed': {
          const deliverable = requestedDeliverable(event.deliverable, deliverables)
          if (!deliverable) return
          setStatuses((current) => ({ ...current, [deliverable]: 'complete' }))
          return
        }
        case 'failed': {
          const failure = typedFailure(event, deliverables)
          if (!failure) return
          setStatuses((current) => ({ ...current, [failure.deliverable]: 'failed' }))
          setFailures((current) => [
            ...current.filter((item) => item.deliverable !== failure.deliverable),
            failure,
          ])
          return
        }
        case 'done':
          terminalPhase = 'completed'
          setFailures(
            event.failures
              .map((failure) => typedFailure(failure, deliverables))
              .filter((failure): failure is DeliverableFailure => failure !== undefined),
          )
          return
        case 'error':
          terminalPhase = 'failed'
          terminalError = event.message
      }
    }

    const reloadAndSettle = async (
      finalPhase: TerminalPhase,
      finalError = '',
      finalNotice = '',
    ) => {
      try {
        const record = await getProject(projectId)
        if (!isCurrent()) return
        setSavedRecord(record)
        setDrafts(record.deliverables ?? {})
        setStatuses((current) => {
          const next = { ...current }
          for (const deliverable of deliverables) {
            if (record.deliverables?.[deliverable] !== undefined) {
              next[deliverable] = 'complete'
            }
          }
          return next
        })
        setError(finalError)
        setNotice(finalNotice)
        setPhase(finalPhase)
      } catch (reloadError) {
        if (!isCurrent()) return
        setError(finalError || errorMessage(reloadError))
        setNotice(finalNotice)
        setPhase('failed')
      }
    }

    const run = async () => {
      try {
        await streamDeliverables(projectId, generationRequest, handleEvent, controller.signal)
        if (!isCurrent()) return
        streamingRef.current = false
        await reloadAndSettle(terminalPhase ?? 'completed', terminalError)
      } catch (streamError) {
        if (!isCurrent()) return
        streamingRef.current = false
        if (terminalPhase) {
          await reloadAndSettle(terminalPhase, terminalError)
          return
        }
        if (isAbortError(streamError) && stopRequested.current) {
          await reloadAndSettle('cancelled', '', STOPPED_NOTICE)
          return
        }
        await reloadAndSettle('failed', errorMessage(streamError))
      }
    }

    void run()

    return () => {
      mounted = false
      if (controllerRef.current === controller) {
        controllerRef.current = null
        streamingRef.current = false
      }
      controller.abort()
    }
  }, [deliverablesSignature, model, preset, projectId])

  return {
    phase,
    drafts,
    statuses,
    failures,
    elapsed,
    error,
    notice,
    savedRecord,
    stop,
  }
}
