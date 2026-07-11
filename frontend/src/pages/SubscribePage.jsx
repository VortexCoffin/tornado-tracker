import { useEffect, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import Header from '../components/Header'
import { useAuth } from '../context/AuthContext'
import { apiErrorMessage } from '../utils/api'
import '../auth.css'

export default function SubscribePage() {
  const {
    user,
    paypalConfig,
    subscribeFree,
    startPayPalCheckout,
    completePayPalCheckout,
    refreshAccount,
  } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [upgrading, setUpgrading] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    axios
      .get('/api/plans')
      .then((response) => setPlans(response.data.plans || []))
      .catch(() => setError('Could not load subscription plans'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const subscriptionId = searchParams.get('subscription_id')
    if (!subscriptionId || !user) return

    let active = true
    setUpgrading('paypal')
    setError('')
    completePayPalCheckout(subscriptionId)
      .then((account) => {
        if (!active) return
        const planName =
          plans.find((plan) => plan.id === account.subscription?.tier)?.name ||
          account.subscription?.tier
        setMessage(`Subscribed to ${planName} via PayPal.`)
        setSearchParams({})
      })
      .catch((err) => {
        if (!active) return
        setError(apiErrorMessage(err, 'PayPal activation failed'))
      })
      .finally(() => {
        if (active) setUpgrading(null)
      })

    return () => {
      active = false
    }
  }, [searchParams, user, completePayPalCheckout, setSearchParams, plans])

  useEffect(() => {
    if (searchParams.get('cancelled') === '1') {
      setError('PayPal checkout was cancelled.')
      setSearchParams({})
    }
  }, [searchParams, setSearchParams])

  if (!user) return <Navigate to="/login" replace />

  const currentTier = user.subscription?.tier || 'free'

  const handleFree = async () => {
    setUpgrading('free')
    setError('')
    setMessage('')
    try {
      await subscribeFree()
      await refreshAccount()
      setMessage('You are now on the Free plan.')
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not switch to Free'))
    } finally {
      setUpgrading(null)
    }
  }

  const handlePayPal = async (tier) => {
    if (!paypalConfig.configured) {
      setError('PayPal is not configured on the server yet.')
      return
    }

    setUpgrading(tier)
    setError('')
    setMessage('')
    try {
      await startPayPalCheckout(tier)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not start PayPal checkout'))
      setUpgrading(null)
    }
  }

  return (
    <div className="app">
      <Header />

      <main className="subscribe-page">
        <h2>Subscription Plans</h2>
        <p className="settings-intro">
          Unlock premium map overlays. Storm Tracker is $2.99/month and Pro is $4.99/month,
          billed through PayPal
          {paypalConfig.mode === 'live' ? ' (live)' : ' (sandbox)'}.
        </p>

        {!paypalConfig.configured && (
          <p className="settings-note">
            PayPal is not configured yet. Add <code>PAYPAL_CLIENT_ID</code> and{' '}
            <code>PAYPAL_CLIENT_SECRET</code> to <code>backend/.env</code>.
          </p>
        )}

        {loading && <div className="loading-state">Loading plans...</div>}
        {error && <div className="auth-error">{error}</div>}
        {message && <div className="settings-success">{message}</div>}

        <div className="plan-grid">
          {plans.map((plan) => (
            <article
              key={plan.id}
              className={`plan-card ${currentTier === plan.id ? 'current' : ''}`}
            >
              <div className="plan-card-top">
                <h3>{plan.name}</h3>
                <p className="plan-price">
                  {plan.price === 0 ? 'Free' : `$${plan.price.toFixed(2)}/mo`}
                </p>
              </div>
              <p className="plan-description">{plan.description}</p>
              <ul className="plan-overlays">
                {plan.overlays.map((overlay) => (
                  <li key={overlay.id}>{overlay.name}</li>
                ))}
              </ul>

              {plan.price === 0 ? (
                <button
                  type="button"
                  className="auth-submit"
                  disabled={currentTier === plan.id || upgrading === 'free'}
                  onClick={handleFree}
                >
                  {currentTier === plan.id
                    ? 'Current plan'
                    : upgrading === 'free'
                      ? 'Updating...'
                      : 'Switch to Free'}
                </button>
              ) : (
                <button
                  type="button"
                  className="paypal-btn"
                  disabled={
                    currentTier === plan.id ||
                    upgrading === plan.id ||
                    upgrading === 'paypal' ||
                    !paypalConfig.configured
                  }
                  onClick={() => handlePayPal(plan.id)}
                >
                  {currentTier === plan.id
                    ? 'Current plan'
                    : upgrading === plan.id || upgrading === 'paypal'
                      ? 'Redirecting to PayPal...'
                      : `Subscribe with PayPal`}
                </button>
              )}
            </article>
          ))}
        </div>

        {user.subscription?.provider === 'paypal' && (
          <p className="settings-note">
            Active PayPal subscription: {user.subscription.paypalSubscriptionId}
          </p>
        )}

        <p className="auth-switch">
          <Link to="/">Back to live alerts</Link>
        </p>
      </main>
    </div>
  )
}