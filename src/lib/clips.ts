import { supabase } from './supabase'
import type { CaptionSegment, ClipRow } from '../types'

const CLIPS_BUCKET = 'clips'

/** URL pública do clip (R2 preferencial; fallback Supabase Storage legado). */
export function resolveClipMediaUrl(clip: Pick<ClipRow, 's3_url' | 's3_key'>) {
  if (clip.s3_url?.startsWith('http')) return clip.s3_url

  if (clip.s3_key) {
    const r2Base = import.meta.env.VITE_R2_PUBLIC_BASE_URL?.replace(/\/$/, '')
    if (r2Base) return `${r2Base}/${clip.s3_key}`

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
  await deleteClips([id])
}

/** Remove um ou mais clips do banco e do R2 (via edge function). */
export async function deleteClips(clipIds: string[]) {
  const ids = [...new Set(clipIds.map((id) => id.trim()).filter(Boolean))]
  if (ids.length === 0) return

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('Faça login para excluir clips')

  const base = import.meta.env.VITE_SUPABASE_URL
  const anon = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  const res = await fetch(`${base}/functions/v1/delete-clips`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: anon,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ clipIds: ids }),
  })

  const payload = (await res.json().catch(() => ({}))) as {
    error?: string
    deleted?: string[]
  }

  if (!res.ok) {
    throw new Error(payload.error || 'Não foi possível excluir os clips')
  }
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
    words?: Array<{ start: number; end: number; word: string }>
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

  const payload = (data ?? null) as
    | {
        error?: string
        detail?: string
        uploadUrl?: string
        key?: string
        bucket?: string
        publicUrl?: string
        contentType?: string
        token?: string
        provider?: string
      }
    | null

  if (error) {
    const fromBody = payload?.error
      ? [payload.error, payload.detail].filter(Boolean).join(' — ')
      : null
    throw new Error(fromBody || error.message || 'Falha ao criar URL de upload')
  }
  if (!payload) {
    throw new Error('Resposta vazia ao criar URL de upload')
  }
  if (payload.error) {
    throw new Error(
      [payload.error, payload.detail].filter(Boolean).map(String).join(' — '),
    )
  }
  if (!payload.uploadUrl || !payload.key || !payload.publicUrl) {
    throw new Error('URL de upload incompleta')
  }

  return {
    uploadUrl: payload.uploadUrl,
    token: payload.token,
    key: payload.key,
    bucket: payload.bucket ?? '',
    publicUrl: payload.publicUrl,
    contentType: payload.contentType || contentType,
    provider: payload.provider,
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
    provider?: string
  },
) {
  if (blob.size < 1024) {
    throw new Error('Arquivo do clip inválido para upload')
  }

  // Legado: Supabase Storage signed upload
  if (upload.token && upload.bucket && upload.provider !== 'r2') {
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

  // R2: PUT sem Content-Type extra (assinatura não inclui esse header)
  const res = await fetch(upload.uploadUrl, {
    method: 'PUT',
    body: blob,
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(
      body
        ? `Falha no upload R2 (${res.status}): ${body.slice(0, 200)}`
        : `Falha no upload R2 (${res.status})`,
    )
  }
}
