import { Outlet } from 'react-router-dom'

export default function Layout() {
  return (
    <div className="min-h-screen bg-surface-950">
      <header className="bg-surface-900 border-b border-surface-700/60">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <span className="text-2xl font-bold tracking-tight text-brand-400 drop-shadow-[0_0_10px_rgba(13,142,234,0.55)]">
            BuildBrief
          </span>
          <span className="text-surface-400 text-sm hidden sm:block">
            Turn your idea into a plan
          </span>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
