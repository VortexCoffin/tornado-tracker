const TOKEN_KEY = 'ctt_auth_token'
const BACKUP_KEY = 'ctt_account_backup'

/** Auth headers for all authenticated API calls (token + account backup). */
export function authHeaders() {
  const token = localStorage.getItem(TOKEN_KEY)
  const backup = localStorage.getItem(BACKUP_KEY)
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (backup) headers['X-Account-Backup'] = backup
  return headers
}

/** Best-effort message from API error responses. */
export function apiErrorMessage(err, fallback = 'Request failed') {
  const data = err?.response?.data
  if (!data) return err?.message || fallback
  return data.message || data.error || err?.message || fallback
}

export { TOKEN_KEY, BACKUP_KEY }
