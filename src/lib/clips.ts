import { supabase } from './supabase'
import type { CaptionSegment, ClipRow } from '../types'

const CLIPS_BUCKET = 'clips'

/** Monta URL pública estável do Storage a partir da key salva. */
export function resolveClipMediaUrl(clip: Pick<ClipRow, 's3_url' | 's3_key'>) {
  if (clip.s3_key) {
    const base = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '')
    if (base) {
      return `${base}/storage/v1/object/public/${CLIPS_BUCKET}/${clip.s3_key}`
    }
    const { data } = supabase.storage.from(CLIPS_BUCKET).getPublicUrl(clip.s3_key)
    if (data.publicUrl) return data.publicUrl
  }
  return clip.s3_url
}

export async function listMyClips() {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Faça login para ver seus projetos')

  const { data, error } = await supabase
    .from('clips')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as ClipRow[]
}

export async function getClipByShareToken(token: string) {
  const { data, error } = await supabase.rpc('get_public_clip_by_token', {
    p_token: token,
  })

  if (error) throw error
  const rows = (data ?? []) as ClipRow[]
  return rows[0] ?? null
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

  const { data, error } = await supabase.rpc('create_clip_with_quota', {
    p_title: input.title,
    p_source_filename: input.source_filename,
    p_duration_seconds: input.duration_seconds,
    p_start_seconds: input.start_seconds,
    p_end_seconds: input.end_seconds,
  })

  if (error) {
    if (/QUOTA_EXCEEDED/i.test(error.message) || error.code === 'P0001') {
      throw new Error(
        'Limite grátis de 10 clips atingido. Compre créditos para continuar.',
      )
    }
    if (/FREE_CLIP_TOO_LONG/i.test(error.message)) {
      throw new Error(
        'No plano free o corte máximo é de 50 segundos. Compre créditos para clips maiores.',
      )
    }
    throw error
  }
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

export async function getUploadUrl(
  clipId: string,
  filename: string,
  contentType = 'video/mp4',
) {
  const { data, error } = await supabase.functions.invoke('get-upload-url', {
    body: { clipId, filename, contentType },
  })

  if (error) {
    throw new Error(
      (error as { message?: string }).message ||
        'Falha ao criar URL de upload',
    )
  }
  if (!data) {
    throw new Error('Resposta vazia ao criar URL de upload')
  }
  if (data.error) {
    throw new Error(
      [data.error, data.detail].filter(Boolean).map(String).join(' — '),
    )
  }
  if (!data.uploadUrl || !data.key) {
    throw new Error('URL de upload incompleta')
  }

  return data as {
    uploadUrl: string
    token: string
    key: string
    bucket: string
    publicUrl: string
    contentType: string
  }
}

export async function uploadClipToS3(
  blob: Blob,
  upload: {
    uploadUrl: string
    token?: string
    key: string
    bucket?: string
    contentType: string
  },
) {
  if (blob.size < 1024) {
    throw new Error('Arquivo do clip inválido para upload')
  }

  // Caminho preferencial: API do Storage com token assinado
  if (upload.token && upload.bucket) {
    const { error } = await supabase.storage
      .from(upload.bucket)
      .uploadToSignedUrl(upload.key, upload.token, blob, {
        contentType: upload.contentType,
      })
    if (error) {
      throw new Error(error.message || 'Falha no upload do Storage')
    }
    return
  }

  const res = await fetch(upload.uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': upload.contentType,
      'x-upsert': 'true',
    },
    body: blob,
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(
      body
        ? `Falha no upload (${res.status}): ${body.slice(0, 160)}`
        : `Falha no upload (${res.status})`,
    )
  }
}
