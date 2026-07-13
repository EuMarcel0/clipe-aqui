import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { FolderOpen, LogOut, Plus, Wallet } from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../hooks/useAuth'
import { BrandLogo } from './BrandLogo'
import { ConfirmDialog } from './ConfirmDialog'

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth()
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [logoutLoading, setLogoutLoading] = useState(false)

  const confirmLogout = async () => {
    setLogoutLoading(true)
    try {
      await signOut()
      setLogoutOpen(false)
    } finally {
      setLogoutLoading(false)
    }
  }

  return (
    <div className="relative mx-auto flex min-h-dvh max-w-lg flex-col px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-4 sm:max-w-xl">
      <header className="mb-5 flex items-center justify-between gap-3">
        <Link to="/criar" className="group flex items-center gap-2.5">
          <BrandLogo className="h-9 w-9 transition group-hover:scale-[1.03]" />
          <p className="font-display text-lg font-bold tracking-tight text-ink">Clipe Aqui</p>
        </Link>

        {user ? (
          <div className="flex items-center gap-2">
            <Link
              to="/planos"
              className="press inline-flex h-9 items-center gap-1.5 rounded-full border border-white/10 bg-lift px-3 text-xs font-semibold text-muted"
            >
              <Wallet className="h-3.5 w-3.5" />
              Créditos
            </Link>
            <button
              type="button"
              onClick={() => setLogoutOpen(true)}
              className="press inline-flex h-9 items-center gap-1.5 rounded-full border border-white/10 bg-lift px-3 text-xs font-semibold text-muted"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sair
            </button>
          </div>
        ) : null}
      </header>

      <main className="fade-in flex-1">{children}</main>

      {user ? (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/6 bg-paper/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
          <div className="mx-auto flex max-w-lg items-stretch justify-around px-6 py-2 sm:max-w-xl">
            <Tab to="/criar" icon={<Plus className="h-5 w-5" strokeWidth={2.25} />} label="Criar" />
            <Tab
              to="/biblioteca"
              icon={<FolderOpen className="h-5 w-5" strokeWidth={2.25} />}
              label="Projetos"
            />
          </div>
        </nav>
      ) : null}

      <ConfirmDialog
        open={logoutOpen}
        title="Sair da conta?"
        description="Você precisará entrar de novo para criar ou ver seus clips."
        confirmLabel="Sair"
        cancelLabel="Cancelar"
        danger
        loading={logoutLoading}
        onCancel={() => {
          if (!logoutLoading) setLogoutOpen(false)
        }}
        onConfirm={() => void confirmLogout()}
      />
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
          'flex min-w-[5.5rem] flex-col items-center gap-1 rounded-2xl px-4 py-2 text-[11px] font-semibold tracking-wide transition',
          isActive ? 'text-accent' : 'text-muted hover:text-ink',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={clsx(
              'grid h-9 w-9 place-items-center rounded-2xl transition',
              isActive ? 'bg-accent/15 text-accent' : 'text-muted',
            )}
          >
            {icon}
          </span>
          {label}
        </>
      )}
    </NavLink>
  )
}
