import { NavLink, Outlet } from 'react-router-dom'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  [
    'relative font-mono text-[11px] uppercase tracking-[0.22em] py-2 transition-colors duration-200',
    isActive ? 'text-paper' : 'text-paper-dim hover:text-paper',
    'after:absolute after:left-0 after:right-0 after:-bottom-0.5 after:h-px after:bg-cyan-400',
    'after:origin-left after:transition-transform after:duration-300',
    isActive ? 'after:scale-x-100' : 'after:scale-x-0 hover:after:scale-x-100',
  ].join(' ')

export default function Layout() {
  return (
    <div className="min-h-screen relative">
      <header className="relative">
        <div className="max-w-5xl mx-auto px-6 sm:px-10 pt-10 pb-8">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
            {/* Wordmark block */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <span className="caption text-cyan-400">BB · 01</span>
                <span className="h-px w-12 bg-cyan-400/60 rule-draw" aria-hidden />
              </div>
              <h1 className="font-display italic text-[2.75rem] sm:text-[3.25rem] leading-[0.95] text-paper tracking-tighter-2">
                BuildBrief
              </h1>
              <span className="caption">
                Turn your idea into a plan
              </span>
            </div>

            {/* Nav */}
            <nav className="flex items-center gap-7 pb-1">
              <NavLink to="/wizard" className={navLinkClass}>
                Wizard
              </NavLink>
              <NavLink to="/library" className={navLinkClass}>
                Library
              </NavLink>
              <a
                href="https://github.com/github/copilot-resources"
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[11px] uppercase tracking-[0.22em] text-paper-dim hover:text-cyan-300 transition-colors duration-200 inline-flex items-center gap-1"
              >
                Resources <span aria-hidden>↗</span>
              </a>
            </nav>
          </div>

          {/* Drafting rule under header */}
          <div className="mt-8 flex items-center gap-4">
            <span className="h-px flex-1 bg-ink-700" />
            <span className="caption text-paper-mute">Drafting Table</span>
            <span className="h-px w-16 bg-cyan-400/40" />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 sm:px-10 pb-24">
        <Outlet />
      </main>

      <footer className="max-w-5xl mx-auto px-6 sm:px-10 pb-10">
        <div className="flex items-center justify-between hairline pt-4">
          <span className="caption text-paper-mute">© BuildBrief</span>
          <span className="caption text-paper-mute">v0.1 · Drafting Table</span>
        </div>
      </footer>
    </div>
  )
}
