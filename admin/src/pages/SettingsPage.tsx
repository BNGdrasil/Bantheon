import { useQuery, useMutation } from '@tanstack/react-query'
import { adminApi } from '../services/api'
import { useState } from 'react'

function SettingsPage() {
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState<any>(null)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const response = await adminApi.get('/settings')
      return response.data
    },
  })

  // Update setting mutation
  const updateSettingMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: any }) => {
      const response = await adminApi.put('/settings', { key, value })
      return response.data
    },
    onSuccess: () => {
      setMessage({ type: 'success', text: 'Setting updated successfully!' })
      setEditingKey(null)
      setEditValue(null)
      setTimeout(() => {
        refetch()
        setMessage(null)
      }, 2000)
    },
    onError: (error: any) => {
      setMessage({
        type: 'error',
        text: error.response?.data?.detail || 'Failed to update setting',
      })
      setTimeout(() => setMessage(null), 3000)
    },
  })

  const handleEdit = (key: string, currentValue: any) => {
    setEditingKey(key)
    setEditValue(currentValue)
  }

  const handleSave = (key: string) => {
    updateSettingMutation.mutate({ key, value: editValue })
  }

  const handleCancel = () => {
    setEditingKey(null)
    setEditValue(null)
  }

  if (isLoading) {
    return <div style={{ textAlign: 'center', padding: '2rem' }}>Loading settings...</div>
  }

  return (
    <div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '2rem',
      }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
            System Settings
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
            Configure Bifrost Gateway system settings
          </p>
        </div>
      </div>

      {/* Message Banner */}
      {message && (
        <div
          style={{
            padding: '1rem',
            marginBottom: '1.5rem',
            borderRadius: '0.5rem',
            backgroundColor: message.type === 'success' ? '#064e3b' : '#7f1d1d',
            color: message.type === 'success' ? '#6ee7b7' : '#fca5a5',
            border: `1px solid ${message.type === 'success' ? '#10b981' : '#ef4444'}`,
          }}
        >
          <p style={{ fontSize: '0.875rem', fontWeight: '600' }}>
            {message.type === 'success' ? '✅ ' : '❌ '}
            {message.text}
          </p>
        </div>
      )}

      {/* Warning Banner */}
      <div
        style={{
          marginBottom: '2rem',
          padding: '1rem',
          backgroundColor: '#78350f',
          borderRadius: '0.5rem',
          border: '1px solid #92400e',
        }}
      >
        <p style={{ fontSize: '0.875rem', color: '#fcd34d' }}>
          ⚠️ Changing system settings requires super_admin role and will take effect immediately.
        </p>
      </div>

      {/* Settings List */}
      <div
        style={{
          backgroundColor: '#1e293b',
          borderRadius: '0.75rem',
          border: '1px solid #334155',
          padding: '1.5rem',
        }}
      >
        {data?.settings && Object.keys(data.settings).length > 0 ? (
          Object.entries(data.settings).map(([key, value]: [string, any]) => (
            <div
              key={key}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '1rem',
                marginBottom: '0.75rem',
                backgroundColor: '#0f172a',
                borderRadius: '0.5rem',
                border: '1px solid #334155',
              }}
            >
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: '600', marginBottom: '0.25rem' }}>
                  {key
                    .split('_')
                    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' ')}
                </p>
                <p style={{ fontSize: '0.875rem', color: '#64748b', fontFamily: 'monospace' }}>
                  {key}
                </p>
              </div>

              {editingKey === key ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  {typeof value === 'boolean' ? (
                    <select
                      value={editValue ? 'true' : 'false'}
                      onChange={(e) => setEditValue(e.target.value === 'true')}
                      style={{
                        padding: '0.5rem',
                        backgroundColor: '#334155',
                        border: '1px solid #475569',
                        borderRadius: '0.375rem',
                        color: 'white',
                        fontSize: '0.875rem',
                      }}
                    >
                      <option value="true">Enabled</option>
                      <option value="false">Disabled</option>
                    </select>
                  ) : (
                    <input
                      type={typeof value === 'number' ? 'number' : 'text'}
                      value={editValue}
                      onChange={(e) =>
                        setEditValue(
                          typeof value === 'number' ? parseInt(e.target.value) : e.target.value
                        )
                      }
                      style={{
                        padding: '0.5rem',
                        backgroundColor: '#334155',
                        border: '1px solid #475569',
                        borderRadius: '0.375rem',
                        color: 'white',
                        fontSize: '0.875rem',
                        fontFamily: 'monospace',
                        minWidth: '150px',
                      }}
                    />
                  )}
                  <button
                    onClick={() => handleSave(key)}
                    disabled={updateSettingMutation.isPending}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: updateSettingMutation.isPending ? '#6b7280' : '#059669',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                      fontWeight: '600',
                      cursor: updateSettingMutation.isPending ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {updateSettingMutation.isPending ? '...' : '✓'}
                  </button>
                  <button
                    onClick={handleCancel}
                    disabled={updateSettingMutation.isPending}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: '#475569',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                      fontWeight: '600',
                      cursor: updateSettingMutation.isPending ? 'not-allowed' : 'pointer',
                    }}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div
                    style={{
                      padding: '0.5rem 1rem',
                      borderRadius: '0.5rem',
                      backgroundColor: '#334155',
                      fontFamily: 'monospace',
                      fontSize: '0.875rem',
                    }}
                  >
                    {typeof value === 'boolean' ? (
                      <span
                        style={{
                          color: value ? '#6ee7b7' : '#fca5a5',
                          fontWeight: '600',
                        }}
                      >
                        {value ? 'Enabled' : 'Disabled'}
                      </span>
                    ) : (
                      <span style={{ color: '#93c5fd' }}>{String(value)}</span>
                    )}
                  </div>
                  <button
                    onClick={() => handleEdit(key, value)}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                      fontWeight: '600',
                      cursor: 'pointer',
                    }}
                  >
                    Edit
                  </button>
                </div>
              )}
            </div>
          ))
        ) : (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
            <p>No settings available</p>
            <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
              Settings will be loaded from the gateway configuration
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default SettingsPage

