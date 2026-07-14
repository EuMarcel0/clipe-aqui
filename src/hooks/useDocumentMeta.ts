import { useEffect } from 'react'

type MetaOptions = {
  title: string
  description?: string
  path?: string
  image?: string
  type?: 'website' | 'video.other' | 'article'
  noIndex?: boolean
}

const DEFAULT_DESCRIPTION =
  'Clipe Aqui transforma vídeos longos em clips curtos para redes sociais: corte o trecho, gere legendas com IA, adicione marca d’água e exporte em formato vertical para Reels, TikTok e YouTube Shorts — direto do celular.'

function upsertMeta(
  attr: 'name' | 'property',
  key: string,
  content: string,
) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!el) {
    el = document.createElement('link')
    el.rel = rel
    document.head.appendChild(el)
  }
  el.href = href
}

/** Atualiza title/description/OG no documento (SPA). */
export function useDocumentMeta({
  title,
  description = DEFAULT_DESCRIPTION,
  path = '/',
  image = '/og-image.png',
  type = 'website',
  noIndex = false,
}: MetaOptions) {
  useEffect(() => {
    const origin = (
      import.meta.env.VITE_APP_URL || window.location.origin
    ).replace(/\/$/, '')
    const url = `${origin}${path.startsWith('/') ? path : `/${path}`}`
    const imageUrl = image.startsWith('http') ? image : `${origin}${image}`
    const fullTitle = title.includes('Clipe Aqui')
      ? title
      : `${title} | Clipe Aqui`

    document.title = fullTitle

    upsertMeta('name', 'description', description)
    upsertMeta('name', 'robots', noIndex ? 'noindex, nofollow' : 'index, follow')
    upsertMeta('property', 'og:title', fullTitle)
    upsertMeta('property', 'og:description', description)
    upsertMeta('property', 'og:url', url)
    upsertMeta('property', 'og:image', imageUrl)
    upsertMeta('property', 'og:type', type)
    upsertMeta('name', 'twitter:title', fullTitle)
    upsertMeta('name', 'twitter:description', description)
    upsertMeta('name', 'twitter:image', imageUrl)
    upsertLink('canonical', url)
  }, [title, description, path, image, type, noIndex])
}

export const SITE_DESCRIPTION = DEFAULT_DESCRIPTION
