import { supabase } from './supabase'

export type AppUserProfile = {
  id: string
  email: string
  full_name?: string | null
  whatsapp?: string | null
}

/** Garante registro em public.users (fallback do trigger handle_new_user). */
export async function syncUserRecord(input: AppUserProfile) {
  const now = new Date().toISOString()
  const { error } = await supabase.from('users').upsert(
    {
      id: input.id,
      email: input.email,
      full_name: input.full_name ?? null,
      whatsapp: input.whatsapp ?? null,
      updated_at: now,
    },
    { onConflict: 'id' },
  )
  if (error) throw error
}

/** Sincroniza o usuário autenticado atual a partir do metadata do Auth. */
export async function syncCurrentUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error) throw error
  if (!user) return

  const meta = user.user_metadata ?? {}
  await syncUserRecord({
    id: user.id,
    email: user.email ?? '',
    full_name:
      (typeof meta.full_name === 'string' && meta.full_name) ||
      (typeof meta.name === 'string' && meta.name) ||
      null,
    whatsapp:
      (typeof meta.whatsapp === 'string' && meta.whatsapp) ||
      (typeof meta.phone === 'string' && meta.phone) ||
      null,
  })
}
