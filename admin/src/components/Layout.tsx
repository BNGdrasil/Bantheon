import { Outlet, Link, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

function Layout() {
  const { user, logout } = useAuth()
  const location = useLocation()

  if (!user) {
    window.location.href = '/login'
    return null
  }

  const navigation = [
    { name: 'Dashboard', href: '/dashboard' },
    { name: 'Users', href: '/users' },
    { name: 'Services', href: '/services' },
    { name: 'Logs', href: '/logs' },
    { name: 'Settings', href: '/settings' },
  ]

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <aside style={{
        width: '250px',
        backgroundColor: '#1e293b',
        borderRight: '1px solid #334155',
        padding: '1.5rem',
      }}>
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#3b82f6' }}>
            BNGdrasil
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Admin Dashboard</p>
        </div>

        <nav>
          {navigation.map((item) => {
            const isActive = location.pathname === item.href
            return (
              <Link
                key={item.name}
                to={item.href}
                style={{
                  display: 'block',
                  padding: '0.75rem 1rem',
                  marginBottom: '0.5rem',
                  borderRadius: '0.5rem',
                  textDecoration: 'none',
                  backgroundColor: isActive ? '#3b82f6' : 'transparent',
                  color: isActive ? 'white' : '#94a3b8',
                  fontWeight: isActive ? '600' : '400',
                  transition: 'all 0.2s',
                }}
                onMouseOver={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = '#334155'
                }}
                onMouseOut={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                {item.name}
              </Link>
            )
          })}
        </nav>

        <div style={{
          position: 'absolute',
          bottom: '1.5rem',
          left: '1.5rem',
          right: '1.5rem',
        }}>
          <div style={{
            padding: '1rem',
            backgroundColor: '#334155',
            borderRadius: '0.5rem',
            marginBottom: '1rem',
          }}>
            <p style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Logged in as</p>
            <p style={{ fontWeight: '600', marginTop: '0.25rem' }}>{user.username}</p>
            <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
              Role: {user.role}
            </p>
          </div>
          <button
            onClick={logout}
            style={{
              width: '100%',
              padding: '0.75rem',
              backgroundColor: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'background-color 0.2s',
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#dc2626'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#ef4444'}
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
        <Outlet />
      </main>
    </div>
  )
}

export default Layout

