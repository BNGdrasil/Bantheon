import { useQuery } from '@tanstack/react-query'
import { adminApi } from '../services/api'

function UsersPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const response = await adminApi.get('/users')
      return response.data
    },
  })

  if (isLoading) {
    return <div style={{ textAlign: 'center', padding: '2rem' }}>Loading users...</div>
  }

  return (
    <div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '2rem',
      }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold' }}>Users</h1>
        <p style={{ color: '#94a3b8' }}>Total: {data?.total || 0}</p>
      </div>

      <div style={{
        backgroundColor: '#1e293b',
        borderRadius: '0.75rem',
        border: '1px solid #334155',
        overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#0f172a' }}>
              <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600' }}>ID</th>
              <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600' }}>Username</th>
              <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600' }}>Email</th>
              <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600' }}>Role</th>
              <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {data?.users?.map((user: any) => (
              <tr key={user.id} style={{ borderTop: '1px solid #334155' }}>
                <td style={{ padding: '1rem' }}>{user.id}</td>
                <td style={{ padding: '1rem', fontWeight: '600' }}>{user.username}</td>
                <td style={{ padding: '1rem', color: '#94a3b8' }}>{user.email}</td>
                <td style={{ padding: '1rem' }}>
                  <span style={{
                    padding: '0.25rem 0.75rem',
                    borderRadius: '9999px',
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    backgroundColor: user.role === 'admin' ? '#1e3a8a' : '#1e293b',
                    color: user.role === 'admin' ? '#93c5fd' : '#94a3b8',
                  }}>
                    {user.role}
                  </span>
                </td>
                <td style={{ padding: '1rem' }}>
                  <span style={{
                    padding: '0.25rem 0.75rem',
                    borderRadius: '9999px',
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    backgroundColor: user.is_active ? '#064e3b' : '#7f1d1d',
                    color: user.is_active ? '#6ee7b7' : '#fca5a5',
                  }}>
                    {user.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default UsersPage

