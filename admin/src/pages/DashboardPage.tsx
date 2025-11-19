import { useQuery } from '@tanstack/react-query'
import { adminApi } from '../services/api'

function DashboardPage() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: async () => {
      const response = await adminApi.get('/settings/stats/overview')
      return response.data
    },
  })

  if (isLoading) {
    return <div style={{ textAlign: 'center', padding: '2rem' }}>Loading...</div>
  }

  const statCards = [
    {
      title: 'Total Users',
      value: stats?.users?.total || 0,
      subtitle: `${stats?.users?.new_today || 0} new today`,
      color: '#3b82f6',
    },
    {
      title: 'Active Users',
      value: stats?.users?.active || 0,
      subtitle: 'Currently active',
      color: '#10b981',
    },
    {
      title: 'Services',
      value: stats?.services?.total || 0,
      subtitle: `${stats?.services?.healthy || 0} healthy`,
      color: '#8b5cf6',
    },
    {
      title: 'API Requests Today',
      value: stats?.api_requests?.total_today || 0,
      subtitle: `${stats?.api_requests?.success_rate || 0}% success rate`,
      color: '#f59e0b',
    },
  ]

  return (
    <div>
      <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '2rem' }}>
        Dashboard
      </h1>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '1.5rem',
        marginBottom: '2rem',
      }}>
        {statCards.map((card) => (
          <div key={card.title} style={{
            padding: '1.5rem',
            backgroundColor: '#1e293b',
            borderRadius: '0.75rem',
            border: '1px solid #334155',
          }}>
            <h3 style={{
              fontSize: '0.875rem',
              color: '#94a3b8',
              marginBottom: '0.5rem',
            }}>
              {card.title}
            </h3>
            <p style={{
              fontSize: '2rem',
              fontWeight: 'bold',
              color: card.color,
              marginBottom: '0.5rem',
            }}>
              {card.value}
            </p>
            <p style={{ fontSize: '0.875rem', color: '#64748b' }}>
              {card.subtitle}
            </p>
          </div>
        ))}
      </div>

      <div style={{
        padding: '1.5rem',
        backgroundColor: '#1e293b',
        borderRadius: '0.75rem',
        border: '1px solid #334155',
      }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>
          System Information
        </h2>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
        }}>
          <div>
            <p style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Uptime</p>
            <p style={{ fontWeight: '600', marginTop: '0.25rem' }}>
              {stats?.system?.uptime_hours || 0} hours
            </p>
          </div>
          <div>
            <p style={{ fontSize: '0.875rem', color: '#94a3b8' }}>CPU Usage</p>
            <p style={{ fontWeight: '600', marginTop: '0.25rem' }}>
              {stats?.system?.cpu_usage || 0}%
            </p>
          </div>
          <div>
            <p style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Memory Usage</p>
            <p style={{ fontWeight: '600', marginTop: '0.25rem' }}>
              {stats?.system?.memory_usage || 0}%
            </p>
          </div>
          <div>
            <p style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Avg Response Time</p>
            <p style={{ fontWeight: '600', marginTop: '0.25rem' }}>
              {stats?.api_requests?.avg_response_time || 0}s
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DashboardPage

