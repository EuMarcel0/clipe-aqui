import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { AppShell } from './components/AppShell'
import { AuthPage } from './pages/AuthPage'
import { StudioPage } from './pages/StudioPage'
import { LibraryPage } from './pages/LibraryPage'
import { SharePage } from './pages/SharePage'

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) {
    return <p className="py-20 text-center text-sm text-ink/55">Carregando…</p>
  }
  if (!user) return <Navigate to="/auth" replace />
  return children
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) {
    return <p className="py-20 text-center text-sm text-ink/55">Carregando…</p>
  }
  if (user) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppShell>
          <Routes>
            <Route
              path="/auth"
              element={
                <PublicOnly>
                  <AuthPage />
                </PublicOnly>
              }
            />
            <Route
              path="/"
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
        </AppShell>
      </BrowserRouter>
    </AuthProvider>
  )
}
