import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  User,
  fetchCurrentUser,
  requestToken,
  toApiError,
  tokenStorage,
} from '../services/api'

interface AuthContextType {
  user: User | null
  /** True until the stored token has been checked once. */
  isLoading: boolean
  /** Set when the session is valid but the account lacks admin permission (403). */
  isForbidden: boolean
  /** Non-auth failure during session restore (network error, server error). */
  authError: string | null
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isForbidden, setIsForbidden] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false

    const checkAuth = async () => {
      const token = tokenStorage.getAccessToken()
      if (!token) {
        if (!cancelled) {
          setIsLoading(false)
        }
        return
      }

      try {
        const currentUser = await fetchCurrentUser()
        if (!cancelled) {
          setUser(currentUser)
          setIsForbidden(false)
          setAuthError(null)
        }
      } catch (error) {
        const apiError = toApiError(error)
        if (cancelled) {
          return
        }
        if (apiError.isUnauthorized) {
          // Token is gone or expired: the api client already cleared it.
          tokenStorage.clear()
          setUser(null)
        } else if (apiError.isForbidden) {
          // Authenticated but not allowed here - stay on the page and explain.
          setIsForbidden(true)
        } else {
          setAuthError(apiError.detail || apiError.message)
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    checkAuth()

    return () => {
      cancelled = true
    }
  }, [])

  const login = async (username: string, password: string) => {
    const tokens = await requestToken(username, password)
    tokenStorage.setTokens(tokens.access_token, tokens.refresh_token)

    const currentUser = await fetchCurrentUser()
    setUser(currentUser)
    setIsForbidden(false)
    setAuthError(null)

    navigate('/dashboard')
  }

  const logout = () => {
    tokenStorage.clear()
    setUser(null)
    setIsForbidden(false)
    setAuthError(null)
    navigate('/login')
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, isForbidden, authError, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
