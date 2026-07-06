import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { NotificationProvider } from './context/NotificationContext'
import LivePage from './pages/LivePage'
import PastTornadoesPage from './pages/PastTornadoesPage'
import LoginPage from './pages/LoginPage'
import SignUpPage from './pages/SignUpPage'
import SettingsPage from './pages/SettingsPage'
import SubscribePage from './pages/SubscribePage'
import StormsPage from './pages/StormsPage'
import './App.css'

export default function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LivePage />} />
            <Route path="/past" element={<PastTornadoesPage />} />
            <Route path="/storms" element={<StormsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/subscribe" element={<SubscribePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignUpPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </NotificationProvider>
    </AuthProvider>
  )
}