import { useEffect, useState } from 'react'
import { Outlet, Link, useLocation, Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { LoadingPanel, NoticePanel } from './StatusPanel'

const NAVIGATION = [
  { name: '운영 개요', href: '/dashboard' },
  { name: '서비스', href: '/services' },
  { name: '사용자', href: '/users' },
  { name: '관측', href: '/observability' },
  { name: '운영 설정', href: '/settings' },
]

const ROLE_LABELS: Record<string, string> = {
  user: '일반',
  moderator: '중재자',
  admin: '관리자',
  super_admin: '최고 관리자',
}

function Layout() {
  const { user, isLoading, isForbidden, authError, logout } = useAuth()
  const location = useLocation()
  const [navOpen, setNavOpen] = useState(false)

  // Following a link should not leave the mobile menu covering the page.
  useEffect(() => {
    setNavOpen(false)
  }, [location.pathname])

  // Wait for the stored token to be checked before deciding where to send the
  // visitor; redirecting while loading throws away a valid session on reload.
  if (isLoading) {
    return (
      <div className="centered-notice">
        <LoadingPanel message="세션을 확인하는 중입니다." />
      </div>
    )
  }

  // 403 is not a redirect: the account is signed in but lacks admin permission.
  if (!user && isForbidden) {
    return (
      <div className="centered-notice">
        <NoticePanel
          tone="warning"
          title="관리자 권한이 필요합니다"
          actions={
            <button type="button" className="btn" onClick={logout}>
              로그아웃
            </button>
          }
        >
          <p>로그인은 되어 있으나 이 계정에는 관리 화면 권한이 없습니다.</p>
        </NoticePanel>
      </div>
    )
  }

  if (!user && authError) {
    return (
      <div className="centered-notice">
        <NoticePanel tone="error" title="세션을 확인하지 못했습니다">
          <p>{authError}</p>
        </NoticePanel>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  const roleLabel = ROLE_LABELS[user.role] || user.role

  return (
    <>
      <a className="skip-link" href="#main-content">
        본문으로 건너뛰기
      </a>
      <div className="app-shell">
        <aside className="app-sidebar">
          <div className="sidebar-head">
            <div>
              <div className="brand">
                BNGdrasil<span className="brand-dot" aria-hidden="true">.</span>
              </div>
              <div className="eyebrow">Operations console</div>
            </div>
            <button
              type="button"
              className="btn btn--sm nav-toggle"
              onClick={() => setNavOpen((open) => !open)}
              aria-expanded={navOpen}
              aria-controls="primary-navigation"
            >
              {navOpen ? '메뉴 닫기' : '메뉴'}
            </button>
          </div>

          <nav
            id="primary-navigation"
            className="app-nav"
            aria-label="주요 화면"
            data-collapsed={navOpen ? 'false' : 'true'}
          >
            {NAVIGATION.map((item) => {
              const isActive = location.pathname === item.href
              return (
                <Link key={item.href} to={item.href} aria-current={isActive ? 'page' : undefined}>
                  {item.name}
                </Link>
              )
            })}
          </nav>

          <div className="sidebar-foot" data-collapsed={navOpen ? 'false' : 'true'}>
            <div className="account-card">
              <p className="eyebrow">현재 계정</p>
              <p className="account-name">{user.username}</p>
              <p className="detail">역할 {roleLabel}</p>
            </div>
            <button type="button" className="btn btn--sm btn--block" onClick={logout}>
              로그아웃
            </button>
          </div>
        </aside>

        <main id="main-content" className="app-main">
          <Outlet />
        </main>
      </div>
    </>
  )
}

export default Layout
