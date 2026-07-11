import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

if (!url || !key) {
  console.warn(
    'Defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no arquivo .env',
  )
}

export const supabase = createClient(url ?? '', key ?? '')

export function isSupabaseConfigured() {
  return Boolean(url && key && !key.includes('xxxxxxxx'))
}
