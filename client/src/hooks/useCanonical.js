import { useEffect } from 'react'

/**
 * Sets the canonical <link> tag in <head> to the given URL.
 * Falls back to the current page's full URL if no url is provided.
 */
export default function useCanonical(url) {
  useEffect(() => {
    const canonical = url || window.location.href.split('?')[0].split('#')[0]
    let tag = document.querySelector('link[rel="canonical"]')
    if (!tag) {
      tag = document.createElement('link')
      tag.setAttribute('rel', 'canonical')
      document.head.appendChild(tag)
    }
    tag.setAttribute('href', canonical)
    return () => {
      // Restore to root on unmount so there's always a canonical present
      tag.setAttribute('href', 'https://www.miloo.chat/')
    }
  }, [url])
}
