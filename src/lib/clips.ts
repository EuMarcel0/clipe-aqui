import { supabase } from './supabase'
import type { CaptionSegment, ClipRow } from '../types'

export async function listMyClips() {
  const { data, error } = await supabase
    .from('clips')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as ClipRow[]
}

export async function getClipByShareToken(token: string) {
  const { data, error } = await supabase
    .from('clips')
    .select('*')
    .eq('share_token', token)
    .eq('is_public', true)
    .maybeSingle()

  if (error) throw error
  return data as ClipRow | null
}

export async function createClipDraft(input: {
  title: string
  source_filename: string
  duration_seconds: number
  start_seconds: number
  end_seconds: number
}) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Faça login para salvar clips')

  const { data, error } = await supabase
    .from('clips')
    .insert({
      user_id: user.id,
      title: input.title,
      source_filename: input.source_filename,
      duration_seconds: input.duration_seconds,
      start_seconds: input.start_seconds,
      end_seconds: input.end_seconds,
      status: 'processing',
    })
    .select('*')
    .single()

  if (error) throw error
  return data as ClipRow
}

export async function updateClip(
  id: string,
  patch: Partial<{
    title: string
    s3_key: string
    s3_url: string
    captions: CaptionSegment[]
    captions_vtt: string
    is_public: boolean
    status: ClipRow['status']
    transcription_cost_usd: number
  }>,
) {
  const { data, error } = await supabase
    .from('clips')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw error
  return data as ClipRow
}

export async function deleteClip(id: string) {
  const { error } = await supabase.from('clips').delete().eq('id', id)
  if (error) throw error
}

export async function transcribeAudio(audio: Blob, durationSeconds: number) {
  const form = new FormData()
  form.append('audio', audio, 'clip.mp3')
  form.append('language', 'pt')
  form.append('duration_seconds', String(durationSeconds))

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('Faça login para gerar legendas')

  const base = import.meta.env.VITE_SUPABASE_URL
  const anon = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  const res = await fetch(`${base}/functions/v1/transcribe`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: anon,
    },
    body: form,
  })

  const payload = await res.json()
  if (!res.ok) {
    throw new Error(payload?.error ?? 'Falha na transcrição')
  }

  return payload as {
    text: string
    segments: CaptionSegment[]
    vtt: string
    model: string
    estimated_cost_usd: number
    cost_per_minute_usd: number
  }
}

export async function getUploadUrl(clipId: string, filename: string) {
  const { data, error } = await supabase.functions.invoke('get-upload-url', {
    body: { clipId, filename, contentType: 'video/mp4' },
  })

  if (error) throw error
  return data as {
    uploadUrl: string
    key: string
    publicUrl: string
    contentType: string
  }
}

export async function uploadClipToS3(blob: Blob, uploadUrl: string, contentType: string) {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: blob,
  })
  if (!res.ok) {
    throw new Error(`Falha no upload S3 (${res.status})`)
  }
}
