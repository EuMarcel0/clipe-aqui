import { Link, NavLink } from 'react-router-dom'
import { Clapperboard, FolderOpen, LogOut, Scissors } from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../hooks/useAuth'

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth()

  return (
    <div className="grain relative mx-auto flex min-h-dvh max-w-lg flex-col px-4 pb-24 pt-5 sm:max-w-2xl">
      <header className="mb-6 flex items-center justify-between gap-3">
        <Link to="/" className="group flex items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-ink text-accent shadow-[0_10px_30px_-12px_rgba(15,159,138,0.8)] transition group-hover:scale-[1.03]">
            <Clapperboard className="h-5 w-5" />
          </span>
          <div>
            <p className="font-display text-xl font-extrabold leading-none tracking-tight">
              Clipe Aqui
            </p>
            <p className="mt-1 text-xs text-ink/55">corte · legende · compartilhe</p>
          </div>
        </Link>

        {user ? (
          <button
            type="button"
            onClick={() => void signOut()}
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-white/70 px-3 py-2 text-xs font-medium text-ink/70"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sair
          </button>
        ) : null}
      </header>

      <main className="flex-1">{children}</main>

      {user ? (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-ink/8 bg-[#f7f4ee]/95 backdrop-blur-md">
          <div className="mx-auto flex max-w-lg justify-around px-2 py-2 sm:max-w-2xl">
            <Tab to="/" icon={<Scissors className="h-5 w-5" />} label="Studio" />
            <Tab to="/biblioteca" icon={<FolderOpen className="h-5 w-5" />} label="Biblioteca" />
          </div>
        </nav>
      ) : null}
    </div>
  )
}

function Tab({
  to,
  icon,
  label,
}: {
  to: string
  icon: React.ReactNode
  label: string
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        clsx(
          'flex min-w-24 flex-col items-center gap-1 rounded-2xl px-4 py-2 text-xs font-semibold transition',
          isActive ? 'bg-ink text-paper' : 'text-ink/55 hover:bg-white/60',
        )
      }
    >
      {icon}
      {label}
    </NavLink>
  )
}
