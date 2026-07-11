import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import TornadoLogo from './TornadoLogo'
import NotificationBell from './NotificationBell'

export default function Header({ children }) {
  const { user, logout } = useAuth()

  return (
    <header className="header">
      <Link to="/" className="brand">
        <TornadoLogo size={38} />
        <div>
          <h1>Canada Tornado Tracker</h1>
          <p>Live severe weather alerts from Environment Canada</p>
        </div>
      </Link>

      <nav className="main-nav">
        <NavLink to="/" end>
          Live Alerts
        </NavLink>
        <NavLink to="/past">Recent Tornadoes</NavLink>
        <NavLink to="/storms">Storm Feed</NavLink>
        <NavLink to="/feedback">Feedback</NavLink>
      </nav>

      <div className="header-actions">
        {children}
        <NotificationBell />
        {user ? (
          <div className="user-menu">
            <Link to="/subscribe" className="nav-btn">
              {user.subscription?.tier === 'free' ? 'Upgrade' : user.subscription?.tier}
            </Link>
            <Link to="/settings" className="nav-btn">
              Alerts
            </Link>
            <span className="user-name">Hi, {user.name}</span>
            <button type="button" className="refresh-btn" onClick={logout}>
              Log out
            </button>
          </div>
        ) : (
          <div className="auth-links">
            <Link to="/login" className="nav-btn">
              Log in
            </Link>
            <Link to="/signup" className="nav-btn primary">
              Sign up
            </Link>
          </div>
        )}
      </div>
    </header>
  )
}