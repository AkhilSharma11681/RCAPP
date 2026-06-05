export const trackEvent = (eventName, params = {}) => {
  if (typeof window.gtag !== 'undefined') {
    window.gtag('event', eventName, params)
  }
}

// REQ-FB-05: one-time "first match" marker, persisted in localStorage
const FIRST_MATCH_KEY = 'miloo_first_match'
export function markFirstMatch() {
  try {
    if (localStorage.getItem(FIRST_MATCH_KEY)) return false
    localStorage.setItem(FIRST_MATCH_KEY, '1')
    return true
  } catch (e) {
    return false
  }
}
