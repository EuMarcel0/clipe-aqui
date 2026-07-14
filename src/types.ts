export type CaptionSegment = {
  start: number
  end: number
  text: string
}

/** Posição vertical da legenda no frame (padrão: base = comportamento atual). */
export type CaptionPosition = 'base' | 'center'

/** Estilo visual da legenda (padrão: normal = texto branco com contorno). */
export type CaptionStyle = 'normal' | 'box'

export type CaptionLook = {
  position: CaptionPosition
  style: CaptionStyle
}

export const DEFAULT_CAPTION_LOOK: CaptionLook = {
  position: 'base',
  style: 'normal',
}

export type WatermarkPosition = 'top' | 'bottom'

export type WatermarkConfig = {
  text: string
  position: WatermarkPosition
}

/** Formato de exportação do clip */
export type ExportPreset = 'normal' | 'reels'

export type ClipRow = {
  id: string
  user_id: string
  title: string
  source_filename: string | null
  duration_seconds: number | null
  start_seconds: number
  end_seconds: number | null
  s3_key: string | null
  s3_url: string | null
  thumbnail_url: string | null
  captions: CaptionSegment[]
  captions_vtt: string | null
  share_token: string
  is_public: boolean
  status: 'draft' | 'processing' | 'ready' | 'failed'
  transcription_cost_usd: number | null
  created_at: string
  updated_at: string
}

export type StudioStep = 'upload' | 'trim' | 'captions' | 'export'
