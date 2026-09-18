import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App.tsx'
import { ApiError } from './services/api'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Retrying a client error or an unimplemented endpoint only delays the
      // error state the page has to show anyway.
      retry: (failureCount, error) => {
        if (error instanceof ApiError) {
          const status = error.status
          if (status !== null && (status === 501 || (status >= 400 && status < 500))) {
            return false
          }
        }
        return failureCount < 1
      },
      refetchOnWindowFocus: false,
      // Polling continues only while the tab is visible; a background tab must
      // not keep hitting the gateway.
      refetchIntervalInBackground: false,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)

