import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { AppShell } from './components/AppShell'
import { AuthPage } from './pages/AuthPage'
import { LandingPage } from './pages/LandingPage'
import { StudioPage } from './pages/StudioPage'
import { LibraryPage } from './pages/LibraryPage'
import { SharePage } from './pages/SharePage'

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/auth" replace />
  return children
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (user) return <Navigate to="/criar" replace />
  return children
}

function LoadingScreen() {
  return (
    <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-3">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-ink/10 border-t-accent" />
      <p className="text-sm font-medium text-muted">Carregando…</p>
    </div>
  )
}

function ShellLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  if (pathname === '/') return <>{children}</>
  return <AppShell>{children}</AppShell>
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ShellLayout>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route
              path="/auth"
              element={
                <PublicOnly>
                  <AuthPage />
                </PublicOnly>
              }
            />
            <Route
              path="/criar"
              element={
                <Protected>
                  <StudioPage />
                </Protected>
              }
            />
            <Route
              path="/biblioteca"
              element={
                <Protected>
                  <LibraryPage />
                </Protected>
              }
            />
            <Route path="/s/:token" element={<SharePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ShellLayout>
      </BrowserRouter>
    </AuthProvider>
  )
}
