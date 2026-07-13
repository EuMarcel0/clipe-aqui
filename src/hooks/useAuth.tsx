import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { syncCurrentUser } from '../lib/users'
import { signInWithGoogle as startGoogleOAuth } from '../lib/google-oauth'

export type SignUpInput = {
  email: string
  password: string
  fullName: string
  whatsapp: string
}

type AuthContextValue = {
  user: User | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (input: SignUpInput) => Promise<{ needsEmailConfirm: boolean }>
  signInWithGoogle: (next?: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setLoading(false)
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    // Garante linha em public.users (útil para contas antigas)
    await syncCurrentUser().catch((err) => {
      console.warn('syncCurrentUser após login:', err)
    })
  }, [])

  const signUp = useCallback(async (input: SignUpInput) => {
    const whatsappDigits = input.whatsapp.replace(/\D/g, '')
    const { data, error } = await supabase.auth.signUp({
      email: input.email.trim(),
      password: input.password,
      options: {
        data: {
          full_name: input.fullName.trim(),
          whatsapp: whatsappDigits,
        },
      },
    })
    if (error) throw error

    const needsEmailConfirm = Boolean(data.user && !data.session)

    if (data.session) {
      await syncCurrentUser().catch((err) => {
        console.warn('syncCurrentUser após signup:', err)
      })
    }

    return { needsEmailConfirm }
  }, [])

  const signInWithGoogle = useCallback(async (next = '/criar') => {
    const { error } = await startGoogleOAuth(next)
    if (error) throw error
  }, [])

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }, [])

  const value = useMemo(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      signIn,
      signUp,
      signInWithGoogle,
      signOut,
    }),
    [session, loading, signIn, signUp, signInWithGoogle, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}
