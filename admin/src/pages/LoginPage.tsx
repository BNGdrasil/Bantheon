import { useState, FormEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { loginErrorMessage } from '../services/api'

function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { login } = useAuth()

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    // Guard against a second submit while the first one is still running.
    if (isSubmitting) {
      return
    }
    setError('')
    setIsSubmitting(true)

    try {
      await login(username, password)
    } catch (err) {
      setError(loginErrorMessage(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <p className="eyebrow">BNGdrasil</p>
        <h1 className="login-title">운영 콘솔 로그인</h1>
        <p className="page-lead">등록된 관리 계정으로만 접근할 수 있습니다.</p>

        <div role="alert" aria-live="assertive">
          {error && (
            <div className="panel panel--error login-error">
              <p className="panel-title">로그인하지 못했습니다</p>
              <div className="panel-body">{error}</div>
            </div>
          )}
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="username">아이디</label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              disabled={isSubmitting}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="password">비밀번호</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              disabled={isSubmitting}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn btn--primary btn--block" disabled={isSubmitting}>
            {isSubmitting ? '확인하는 중' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default LoginPage
