import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { authHeaders, TOKEN_KEY, BACKUP_KEY } from '../utils/api'

const AuthContext = createContext(null)

function persistSession({ token, accountBackup }) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  if (accountBackup) localStorage.setItem(BACKUP_KEY, accountBackup)
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(BACKUP_KEY)
}

const GUEST_OVERLAYS = [
  { id: 'standard', name: 'Standard', type: 'base', unlocked: true, requiredTierName: 'Free' },
  { id: 'satellite', name: 'Satellite', type: 'base', unlocked: false, requiredTierName: 'Storm Tracker' },
  { id: 'dark', name: 'Dark', type: 'base', unlocked: false, requiredTierName: 'Storm Tracker' },
  { id: 'terrain', name: 'Terrain', type: 'base', unlocked: false, requiredTierName: 'Storm Tracker' },
  { id: 'radar', name: 'Radar', type: 'overlay', unlocked: true, requiredTierName: 'Free' },
  { id: 'clouds', name: 'Clouds', type: 'overlay', unlocked: false, requiredTierName: 'Pro' },
]

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [paypalConfig, setPaypalConfig] = useState({ configured: false, clientId: '', mode: 'sandbox' })

  const refreshAccount = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) {
      setUser(null)
      return null
    }

    const response = await axios.get('/api/auth/me', { headers: authHeaders() })
    if (response.data.accountBackup) {
      localStorage.setItem(BACKUP_KEY, response.data.accountBackup)
    }
    setUser(response.data.user)
    return response.data.user
  }, [])

  useEffect(() => {
    axios
      .get('/api/paypal/config')
      .then((response) => setPaypalConfig(response.data))
      .catch(() => setPaypalConfig({ configured: false, clientId: '', mode: 'sandbox' }))

    refreshAccount()
      .catch(() => {
        clearSession()
        setUser(null)
      })
      .finally(() => setLoading(false))
  }, [refreshAccount])

  const login = async (email, password) => {
    const accountBackup = localStorage.getItem(BACKUP_KEY) || undefined
    const response = await axios.post('/api/auth/login', {
      email,
      password,
      accountBackup,
    })
    persistSession(response.data)
    setUser(response.data.user)
    return response.data.user
  }

  const signup = async (name, email, password) => {
    const response = await axios.post('/api/auth/signup', { name, email, password })
    persistSession(response.data)
    setUser(response.data.user)
    return response.data.user
  }

  const logout = () => {
    clearSession()
    setUser(null)
  }

  const updateMapPreferences = async (updates) => {
    const response = await axios.put('/api/account/overlay', updates, {
      headers: authHeaders(),
    })
    if (response.data.accountBackup) {
      localStorage.setItem(BACKUP_KEY, response.data.accountBackup)
    }
    setUser(response.data.account)
    return response.data.account
  }

  const subscribeFree = async () => {
    const response = await axios.post(
      '/api/subscription/subscribe',
      { tier: 'free' },
      { headers: authHeaders() }
    )
    if (response.data.accountBackup) {
      localStorage.setItem(BACKUP_KEY, response.data.accountBackup)
    }
    setUser(response.data.account)
    return response.data.account
  }

  const startPayPalCheckout = async (tier) => {
    const returnUrl = `${window.location.origin}/subscribe`
    const cancelUrl = `${window.location.origin}/subscribe?cancelled=1`
    const response = await axios.post(
      '/api/subscription/paypal/create',
      { tier, returnUrl, cancelUrl },
      { headers: authHeaders() }
    )
    window.location.href = response.data.approvalUrl
    return response.data
  }

  const completePayPalCheckout = async (subscriptionId) => {
    const response = await axios.post(
      '/api/subscription/paypal/complete',
      { subscriptionId },
      { headers: authHeaders() }
    )
    if (response.data.accountBackup) {
      localStorage.setItem(BACKUP_KEY, response.data.accountBackup)
    }
    setUser(response.data.account)
    return response.data.account
  }

  const overlays = user?.overlays || GUEST_OVERLAYS
  const preferences = user?.preferences || {
    mapOverlay: 'standard',
    showRadar: true,
    showClouds: false,
  }

  const value = useMemo(
    () => ({
      user,
      loading,
      overlays,
      preferences,
      paypalConfig,
      login,
      signup,
      logout,
      refreshAccount,
      updateMapPreferences,
      subscribeFree,
      startPayPalCheckout,
      completePayPalCheckout,
    }),
    [user, loading, overlays, preferences, paypalConfig, refreshAccount]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
