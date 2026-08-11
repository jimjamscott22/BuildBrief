import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode, type ReactNode } from 'react'
import {
  MemoryRouter,
  Route,
  Router,
  Routes,
  useLocation,
  type Location,
  type Navigator,
} from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../api'
import ResultsPage from './ResultsPage'
import {
  useGenerationRun,
  type GenerationRunState,
} from './results/useGenerationRun'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  getProject: vi.fn(),
}))

vi.mock('./results/useGenerationRun', () => ({
  useGenerationRun: vi.fn(),
}))

const stop = vi.fn()
const generationRequest: api.GenerateRequest = {
  model: 'ollama/test',
  deliverables: ['spec', 'implementation_plan'],
  preset: 'mvp',
}
const project: api.Project = {
  id: 'project-1',
  title: 'Live Brief',
  description: 'A streaming project',
  target_users: 'Builders',
  platform: 'web',
  tech_preferences: '',
  complexity: 'medium',
  constraints: '',
  extra_context: '',
  created_at: '2026-08-10T12:00:00Z',
  updated_at: '2026-08-10T12:00:00Z',
}

afterEach(cleanup)

function runState(overrides: Partial<GenerationRunState> = {}): GenerationRunState {
  return {
    phase: 'idle',
    drafts: {},
    statuses: {},
    failures: [],
    elapsed: 0,
    error: '',
    notice: '',
    savedRecord: undefined,
    stop,
    ...overrides,
  }
}

function ResultsRoute({ observer }: { observer?: ReactNode }) {
  return (
    <Routes>
      <Route
        path="/results/:id"
        element={
          <>
            <ResultsPage />
            {observer}
          </>
        }
      />
    </Routes>
  )
}

function renderGeneratingResults(observer?: ReactNode) {
  return render(
    <MemoryRouter
      initialEntries={[
        {
          pathname: '/results/project-1',
          state: { generationRequest, project },
        },
      ]}
    >
      <ResultsRoute observer={observer} />
    </MemoryRouter>,
  )
}

function renderGeneratingResultsBeforeReplacement() {
  const navigator: Navigator = {
    createHref: () => '/results/project-1',
    go: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
  }

  return render(
    <Router
      location={{
        pathname: '/results/project-1',
        search: '',
        hash: '',
        state: { generationRequest, project },
        key: 'live-results',
      }}
      navigator={navigator}
    >
      <ResultsRoute />
    </Router>,
  )
}

describe('ResultsPage live generation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getProject).mockResolvedValue({
      project,
      deliverables: { spec: '# Legacy saved spec' },
    })
    vi.mocked(useGenerationRun).mockReturnValue(runState())
  })

  it('renders live progress, draft markdown, statuses, and stop control', () => {
    vi.mocked(useGenerationRun).mockReturnValue(
      runState({
        phase: 'running',
        drafts: { spec: '# Live spec', implementation_plan: '' },
        statuses: { spec: 'generating', implementation_plan: 'queued' },
        elapsed: 12,
      }),
    )

    renderGeneratingResults()

    expect(screen.getByText('0 of 2 complete')).toBeInTheDocument()
    expect(screen.getByText('00:12')).toBeInTheDocument()
    expect(screen.getByText('Generating')).toBeInTheDocument()
    expect(screen.getByText('Queued')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Live spec' })).toBeInTheDocument()
    expect(screen.getByText('0 of 2 complete').closest('[aria-live="polite"]')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Stop generation' }))
    expect(stop).toHaveBeenCalledOnce()
  })

  it('shows a disabled stopping control while cancellation is pending', () => {
    vi.mocked(useGenerationRun).mockReturnValue(
      runState({
        phase: 'stopping',
        drafts: { spec: '# Partial spec', implementation_plan: '' },
        statuses: { spec: 'generating', implementation_plan: 'queued' },
      }),
    )

    renderGeneratingResults()

    expect(screen.getByRole('button', { name: 'Stopping...' })).toBeDisabled()
  })

  it('uses the saved record after cancellation and reports that incomplete drafts were discarded', async () => {
    vi.mocked(useGenerationRun).mockReturnValue(
      runState({
        phase: 'cancelled',
        drafts: { spec: '# Incomplete draft', implementation_plan: '# Unsaved plan' },
        statuses: { spec: 'generating', implementation_plan: 'queued' },
        notice: 'Generation stopped. Incomplete drafts were not saved.',
        savedRecord: {
          project,
          deliverables: {
            spec: '# Saved spec',
            implementation_plan: null,
            agent_prompt: null,
          },
        },
      }),
    )

    renderGeneratingResultsBeforeReplacement()

    expect(screen.getByRole('status')).toHaveTextContent(
      'Generation stopped. Incomplete drafts were not saved.',
    )
    expect(screen.getByRole('heading', { name: 'Saved spec' })).toBeInTheDocument()
    expect(screen.queryByText('Incomplete draft')).not.toBeInTheDocument()
    expect(screen.queryByText('Unsaved plan')).not.toBeInTheDocument()
    expect(screen.getByText('0 of 2 complete')).toBeInTheDocument()
    expect(screen.getByText('Generating')).toBeInTheDocument()
    expect(screen.getByText('Queued')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export Current' })).toBeDisabled()
  })

  it('never falls back to an incomplete draft when the terminal saved record is empty', () => {
    vi.mocked(useGenerationRun).mockReturnValue(
      runState({
        phase: 'cancelled',
        drafts: { spec: '# Incomplete draft', implementation_plan: '# Unsaved plan' },
        statuses: { spec: 'generating', implementation_plan: 'queued' },
        notice: 'Generation stopped. Incomplete drafts were not saved.',
        savedRecord: { project, deliverables: null },
      }),
    )

    renderGeneratingResultsBeforeReplacement()

    expect(screen.queryByRole('heading', { name: 'Incomplete draft' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Unsaved plan' })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(
      'Generation stopped. Incomplete drafts were not saved.',
    )
  })

  it('keeps an empty cancellation notice and recovery navigation after a true remount', async () => {
    let currentLocation: Location | undefined
    function LocationObserver() {
      currentLocation = useLocation()
      return null
    }

    vi.mocked(useGenerationRun).mockImplementation((_id, request) =>
      request
        ? runState({
            phase: 'cancelled',
            drafts: { spec: '# Incomplete draft' },
            statuses: { spec: 'generating', implementation_plan: 'queued' },
            notice: 'Generation stopped. Incomplete drafts were not saved.',
            savedRecord: { project, deliverables: null },
          })
        : runState(),
    )

    const firstRender = renderGeneratingResults(<LocationObserver />)

    await waitFor(() => {
      expect(currentLocation?.state).toEqual({
        deliverables: {},
        failures: [],
        requested: ['spec', 'implementation_plan'],
        project,
        terminalNotice: 'Generation stopped. Incomplete drafts were not saved.',
      })
    })

    const replacedEntry = {
      pathname: currentLocation?.pathname ?? '/results/project-1',
      state: currentLocation?.state,
    }
    firstRender.unmount()
    vi.mocked(useGenerationRun).mockClear()
    vi.mocked(api.getProject).mockClear()
    render(
      <MemoryRouter initialEntries={[replacedEntry]}>
        <ResultsRoute />
      </MemoryRouter>,
    )

    expect(screen.getByRole('status')).toHaveTextContent(
      'Generation stopped. Incomplete drafts were not saved.',
    )
    expect(screen.queryByRole('heading', { name: 'Incomplete draft' })).not.toBeInTheDocument()
    expect(screen.getByText('No generated deliverables to display.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Edit Brief' })).toHaveAttribute(
      'href',
      '/wizard?edit=project-1',
    )
    expect(screen.getByRole('link', { name: 'Start Over' })).toHaveAttribute('href', '/wizard')
    expect(vi.mocked(useGenerationRun).mock.calls.every(([, request]) => request === undefined)).toBe(true)
    expect(api.getProject).not.toHaveBeenCalled()
  })

  it('keeps a terminal transport alert with empty saved output after a true remount', async () => {
    let currentLocation: Location | undefined
    function LocationObserver() {
      currentLocation = useLocation()
      return null
    }

    vi.mocked(useGenerationRun).mockImplementation((_id, request) =>
      request
        ? runState({
            phase: 'failed',
            drafts: { spec: '# Unsaved transport draft' },
            statuses: { spec: 'generating', implementation_plan: 'queued' },
            error: 'The generation provider disconnected.',
            savedRecord: { project, deliverables: null },
          })
        : runState(),
    )

    const firstRender = renderGeneratingResults(<LocationObserver />)

    await waitFor(() => {
      expect(currentLocation?.state).toEqual({
        deliverables: {},
        failures: [],
        requested: ['spec', 'implementation_plan'],
        project,
        terminalError: 'The generation provider disconnected.',
      })
    })

    const replacedEntry = {
      pathname: currentLocation?.pathname ?? '/results/project-1',
      state: currentLocation?.state,
    }
    firstRender.unmount()
    vi.mocked(useGenerationRun).mockClear()
    vi.mocked(api.getProject).mockClear()
    render(
      <MemoryRouter initialEntries={[replacedEntry]}>
        <ResultsRoute />
      </MemoryRouter>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(
      'The generation provider disconnected.',
    )
    expect(screen.queryByRole('heading', { name: 'Unsaved transport draft' })).not.toBeInTheDocument()
    expect(screen.getByText('No generated deliverables to display.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Library' })).toHaveAttribute('href', '/library')
    expect(vi.mocked(useGenerationRun).mock.calls.every(([, request]) => request === undefined)).toBe(true)
    expect(api.getProject).not.toHaveBeenCalled()
  })

  it('renders a run-level generation error as an alert', () => {
    vi.mocked(useGenerationRun).mockReturnValue(
      runState({
        phase: 'failed',
        drafts: { spec: '' },
        statuses: { spec: 'failed', implementation_plan: 'queued' },
        error: 'The generation provider disconnected.',
      }),
    )

    renderGeneratingResults()

    expect(screen.getByRole('alert')).toHaveTextContent(
      'The generation provider disconnected.',
    )
  })

  it('disables exports while the active draft is unfinished or the run can still change', () => {
    vi.mocked(useGenerationRun).mockReturnValue(
      runState({
        phase: 'running',
        drafts: { spec: '# Partial spec', implementation_plan: '' },
        statuses: { spec: 'generating', implementation_plan: 'queued' },
      }),
    )

    renderGeneratingResults()

    expect(screen.getByRole('button', { name: 'Export Current' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Export Bundle' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: /Implementation Plan/ }))
    expect(screen.getByRole('button', { name: 'Export Current' })).toBeDisabled()
  })

  it('enables only the completed active draft during a terminal run', () => {
    vi.mocked(useGenerationRun).mockReturnValue(
      runState({
        phase: 'failed',
        drafts: { spec: '# Complete spec', implementation_plan: '' },
        statuses: { spec: 'complete', implementation_plan: 'failed' },
      }),
    )

    renderGeneratingResults()

    expect(screen.getByRole('button', { name: 'Export Current' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Export Bundle' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: /Implementation Plan/ }))
    expect(screen.getByRole('button', { name: 'Export Current' })).toBeDisabled()
  })

  it('does not allow streamed Markdown to inject raw HTML', () => {
    vi.mocked(useGenerationRun).mockReturnValue(
      runState({
        phase: 'running',
        drafts: { spec: '<button data-injected="true">Unsafe</button>' },
        statuses: { spec: 'generating', implementation_plan: 'queued' },
      }),
    )

    const { container } = renderGeneratingResults()

    expect(container.querySelector('[data-injected="true"]')).toBeNull()
  })
})

describe('ResultsPage saved results and history', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getProject).mockResolvedValue({
      project,
      deliverables: { spec: '# Legacy saved spec' },
    })
    vi.mocked(useGenerationRun).mockReturnValue(runState())
  })

  it('loads a direct saved route without starting a generation request', async () => {
    vi.mocked(api.getProject).mockResolvedValue({
      project,
      deliverables: { spec: '# Saved project spec' },
    })

    render(
      <MemoryRouter initialEntries={['/results/project-1']}>
        <ResultsRoute />
      </MemoryRouter>,
    )

    expect(screen.getByText('Loading saved results...')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Saved project spec' })).toBeInTheDocument()
    expect(api.getProject).toHaveBeenCalledWith('project-1')
    expect(useGenerationRun).toHaveBeenCalled()
    expect(vi.mocked(useGenerationRun).mock.calls.every(([, request]) => request === undefined)).toBe(true)
    expect(screen.getByRole('button', { name: 'Export Current' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Export Bundle' })).toBeEnabled()
  })

  it('consumes an in-progress request immediately and does not hand it back after remount', async () => {
    let currentLocation: Location | undefined
    function LocationObserver() {
      currentLocation = useLocation()
      return null
    }
    vi.mocked(useGenerationRun).mockImplementation((_id, request) =>
      request
        ? runState({
            phase: 'running',
            drafts: { spec: '# Streaming', implementation_plan: '' },
            statuses: { spec: 'generating', implementation_plan: 'queued' },
          })
        : runState(),
    )

    const firstRender = renderGeneratingResults(<LocationObserver />)

    await waitFor(() => {
      expect(currentLocation?.state).toEqual({ project })
    })
    const hookCalls = vi.mocked(useGenerationRun).mock.calls
    expect(hookCalls[hookCalls.length - 1]?.[1]).toEqual(generationRequest)

    const consumedEntry = {
      pathname: currentLocation?.pathname ?? '/results/project-1',
      state: currentLocation?.state,
    }
    firstRender.unmount()
    vi.mocked(useGenerationRun).mockClear()
    vi.mocked(api.getProject).mockClear()
    vi.mocked(api.getProject).mockResolvedValue({
      project,
      deliverables: { spec: '# Saved while away' },
    })

    render(
      <MemoryRouter initialEntries={[consumedEntry]}>
        <ResultsRoute />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'Saved while away' })).toBeInTheDocument()
    expect(vi.mocked(useGenerationRun).mock.calls).not.toHaveLength(0)
    expect(
      vi.mocked(useGenerationRun).mock.calls.every(([, request]) => request === undefined),
    ).toBe(true)
  })

  it('keeps failed authoritative reloads consumed so a remount cannot replay generation', async () => {
    let currentLocation: Location | undefined
    function LocationObserver() {
      currentLocation = useLocation()
      return null
    }
    vi.mocked(useGenerationRun).mockImplementation((_id, request) =>
      request
        ? runState({
            phase: 'failed',
            drafts: { spec: '# Unsaved stream', implementation_plan: '' },
            statuses: { spec: 'generating', implementation_plan: 'queued' },
            error: 'Could not reload saved generation results.',
            savedRecord: undefined,
          })
        : runState(),
    )

    const firstRender = renderGeneratingResults(<LocationObserver />)

    await waitFor(() => {
      expect(currentLocation?.state).toEqual({ project })
    })

    const consumedEntry = {
      pathname: currentLocation?.pathname ?? '/results/project-1',
      state: currentLocation?.state,
    }
    firstRender.unmount()
    vi.mocked(useGenerationRun).mockClear()
    vi.mocked(api.getProject).mockRejectedValue(new Error('Reload still unavailable.'))

    render(
      <MemoryRouter initialEntries={[consumedEntry]}>
        <ResultsRoute />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load that saved project.',
    )
    expect(
      vi.mocked(useGenerationRun).mock.calls.every(([, request]) => request === undefined),
    ).toBe(true)
  })

  it('consumes an in-progress entry only once during StrictMode effect rehearsal', async () => {
    const navigator: Navigator = {
      createHref: () => '/results/project-1',
      go: vi.fn(),
      push: vi.fn(),
      replace: vi.fn(),
    }
    vi.mocked(useGenerationRun).mockReturnValue(runState({
      phase: 'running',
      drafts: { spec: '', implementation_plan: '' },
      statuses: { spec: 'queued', implementation_plan: 'queued' },
    }))

    render(
      <StrictMode>
        <Router
          location={{
            pathname: '/results/project-1',
            search: '',
            hash: '',
            state: { generationRequest, project },
            key: 'strict-live-results',
          }}
          navigator={navigator}
        >
          <ResultsRoute />
        </Router>
      </StrictMode>,
    )

    await waitFor(() => expect(navigator.replace).toHaveBeenCalledOnce())
  })

  it('keeps the empty-state message and library recovery for a truly empty saved project', async () => {
    vi.mocked(api.getProject).mockResolvedValue({ project, deliverables: null })

    render(
      <MemoryRouter initialEntries={['/results/project-1']}>
        <ResultsRoute />
      </MemoryRouter>,
    )

    expect(await screen.findByText('No generated deliverables to display.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Library' })).toHaveAttribute(
      'href',
      '/library',
    )
  })

  it('preserves saved partial-failure details and result navigation', () => {
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/results/project-1',
            state: {
              project,
              deliverables: { spec: '# Saved spec' },
              requested: ['spec', 'implementation_plan'],
              failures: [
                {
                  deliverable: 'implementation_plan',
                  label: 'Implementation Plan',
                  message: 'Provider timeout',
                },
              ],
            },
          },
        ]}
      >
        <ResultsRoute />
      </MemoryRouter>,
    )

    expect(screen.getByText('1 of 2 generated')).toBeInTheDocument()
    expect(screen.getByText(/Provider timeout/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Edit Brief' })).toHaveAttribute(
      'href',
      '/wizard?edit=project-1',
    )
    expect(screen.getByRole('link', { name: 'Library' })).toHaveAttribute('href', '/library')
    expect(screen.getByRole('link', { name: 'Start Over' })).toHaveAttribute('href', '/wizard')
  })

  it('replaces terminal generation state so a remount cannot restart streaming', async () => {
    let currentLocation: Location | undefined
    function LocationObserver() {
      currentLocation = useLocation()
      return null
    }

    vi.mocked(useGenerationRun).mockImplementation((_id, request) =>
      request
        ? runState({
            phase: 'completed',
            drafts: { spec: '# Streamed spec' },
            statuses: { spec: 'complete', implementation_plan: 'failed' },
            failures: [
              {
                deliverable: 'implementation_plan',
                label: 'Implementation Plan',
                message: 'Provider timeout',
              },
            ],
            savedRecord: { project, deliverables: { spec: '# Authoritative spec' } },
          })
        : runState(),
    )

    const firstRender = renderGeneratingResults(<LocationObserver />)

    await waitFor(() => {
      expect(currentLocation?.state).toEqual({
        deliverables: { spec: '# Authoritative spec' },
        failures: [
          {
            deliverable: 'implementation_plan',
            label: 'Implementation Plan',
            message: 'Provider timeout',
          },
        ],
        requested: ['spec', 'implementation_plan'],
        project,
      })
    })
    const activeRequests = vi.mocked(useGenerationRun).mock.calls
      .map(([, request]) => request)
      .filter((request) => request !== undefined)
    expect(activeRequests.length).toBeGreaterThan(0)
    expect(activeRequests.every((request) => request === activeRequests[0])).toBe(true)
    expect(
      vi.mocked(useGenerationRun).mock.calls.some(([, request]) => request === undefined),
    ).toBe(true)

    const replacedEntry = {
      pathname: currentLocation?.pathname ?? '/results/project-1',
      state: currentLocation?.state,
    }
    firstRender.unmount()
    vi.mocked(useGenerationRun).mockClear()

    render(
      <MemoryRouter initialEntries={[replacedEntry]}>
        <ResultsRoute />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Authoritative spec' })).toBeInTheDocument()
    expect(useGenerationRun).toHaveBeenCalled()
    expect(vi.mocked(useGenerationRun).mock.calls.every(([, request]) => request === undefined)).toBe(true)
  })

  it('preserves all-deliverable failures and retry recovery after an empty result remount', async () => {
    let currentLocation: Location | undefined
    function LocationObserver() {
      currentLocation = useLocation()
      return null
    }

    const failures: api.DeliverableFailure[] = [
      {
        deliverable: 'spec',
        label: 'Specification Document',
        message: 'Spec generation failed',
      },
      {
        deliverable: 'implementation_plan',
        label: 'Implementation Plan',
        message: 'Plan generation failed',
      },
    ]
    vi.mocked(useGenerationRun).mockImplementation((_id, request) =>
      request
        ? runState({
            phase: 'failed',
            drafts: { spec: '# Unsaved spec', implementation_plan: '# Unsaved plan' },
            statuses: { spec: 'failed', implementation_plan: 'failed' },
            failures,
            savedRecord: { project, deliverables: null },
          })
        : runState(),
    )

    const firstRender = renderGeneratingResults(<LocationObserver />)
    await waitFor(() => {
      expect(currentLocation?.state).toEqual({
        deliverables: {},
        failures,
        requested: ['spec', 'implementation_plan'],
        project,
      })
    })

    const replacedEntry = {
      pathname: currentLocation?.pathname ?? '/results/project-1',
      state: currentLocation?.state,
    }
    firstRender.unmount()
    vi.mocked(useGenerationRun).mockClear()
    render(
      <MemoryRouter initialEntries={[replacedEntry]}>
        <ResultsRoute />
      </MemoryRouter>,
    )

    expect(screen.getByText('0 of 2 generated')).toBeInTheDocument()
    expect(screen.getByText(/Spec generation failed/)).toBeInTheDocument()
    expect(screen.getByText(/Plan generation failed/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Retry in the wizard' })).toHaveAttribute(
      'href',
      '/wizard?edit=project-1',
    )
    expect(screen.getByText('No generated deliverables to display.')).toBeInTheDocument()
  })
})
