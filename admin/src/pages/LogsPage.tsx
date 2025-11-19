import { useQuery } from '@tanstack/react-query'
import { adminApi } from '../services/api'

function LogsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['logs'],
    queryFn: async () => {
      const response = await adminApi.get('/logs')
      return response.data
    },
  })

  if (isLoading) {
    return <div style={{ textAlign: 'center', padding: '2rem' }}>Loading logs...</div>
  }

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'ERROR':
        return { bg: '#7f1d1d', text: '#fca5a5' }
      case 'WARNING':
        return { bg: '#78350f', text: '#fcd34d' }
      case 'INFO':
        return { bg: '#1e3a8a', text: '#93c5fd' }
      default:
        return { bg: '#1e293b', text: '#94a3b8' }
    }
  }

  return (
    <div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '2rem',
      }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold' }}>System Logs</h1>
        <p style={{ color: '#94a3b8' }}>Total: {data?.total || 0}</p>
      </div>

      <div style={{
        backgroundColor: '#1e293b',
        borderRadius: '0.75rem',
        border: '1px solid #334155',
        padding: '1.5rem',
      }}>
        {data?.logs?.map((log: any, index: number) => {
          const levelColor = getLevelColor(log.level)
          return (
            <div
              key={index}
              style={{
                padding: '1rem',
                marginBottom: '1rem',
                backgroundColor: '#0f172a',
                borderRadius: '0.5rem',
                border: '1px solid #334155',
              }}
            >
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.5rem',
              }}>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <span style={{
                    padding: '0.25rem 0.75rem',
                    borderRadius: '9999px',
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    backgroundColor: levelColor.bg,
                    color: levelColor.text,
                  }}>
                    {log.level}
                  </span>
                  <span style={{ fontSize: '0.875rem', fontWeight: '600' }}>
                    {log.service}
                  </span>
                </div>
                <span style={{ fontSize: '0.875rem', color: '#64748b' }}>
                  {log.timestamp}
                </span>
              </div>
              <p style={{
                fontSize: '0.875rem',
                color: '#94a3b8',
                fontFamily: 'monospace',
              }}>
                {log.message}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default LogsPage

