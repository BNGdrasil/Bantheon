import { useQuery, useMutation } from '@tanstack/react-query'
import { adminApi } from '../services/api'
import { useState } from 'react'

interface Service {
  id: number
  name: string
  display_name: string | null
  url: string
  health_check_path: string
  timeout_seconds: number
  rate_limit_per_minute: number
  is_active: boolean
  description: string | null
  created_at: string
  updated_at: string
  last_health_check: string | null
  health_status: 'healthy' | 'unhealthy' | 'unknown' | 'checking'
  metadata: Record<string, any>
}

interface ServiceStats {
  total_services: number
  active_services: number
  healthy_services: number
  unhealthy_services: number
  unknown_services: number
}

function ServicesPage() {
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [newService, setNewService] = useState({
    name: '',
    display_name: '',
    url: '',
    health_check_path: '/health',
    timeout_seconds: 30,
    rate_limit_per_minute: 100,
    is_active: true,
    description: '',
  })

  // Fetch services list
  const { data: services, isLoading: servicesLoading, refetch: refetchServices } = useQuery<Service[]>({
    queryKey: ['admin-services'],
    queryFn: async () => {
      const response = await adminApi.get('/services')
      return response.data
    },
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  })

  // Fetch service statistics
  const { data: stats, isLoading: statsLoading } = useQuery<ServiceStats>({
    queryKey: ['admin-services-stats'],
    queryFn: async () => {
      const response = await adminApi.get('/services/stats')
      return response.data
    },
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  })

  // Reload registry mutation
  const reloadRegistryMutation = useMutation({
    mutationFn: async () => {
      const response = await adminApi.post('/services/reload')
      return response.data
    },
    onSuccess: (data) => {
      setMessage({ type: 'success', text: data.message })
      setTimeout(() => {
        refetchServices()
        setMessage(null)
      }, 2000)
    },
    onError: (error: any) => {
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.detail || 'Failed to reload registry' 
      })
      setTimeout(() => setMessage(null), 3000)
    },
  })

  // Health check all mutation
  const healthCheckAllMutation = useMutation({
    mutationFn: async () => {
      const response = await adminApi.post('/services/health-check-all')
      return response.data
    },
    onSuccess: (data) => {
      setMessage({ type: 'success', text: data.message })
      setTimeout(() => {
        refetchServices()
        setMessage(null)
      }, 3000)
    },
    onError: (error: any) => {
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.detail || 'Failed to trigger health check' 
      })
      setTimeout(() => setMessage(null), 3000)
    },
  })

  // Add service mutation
  const addServiceMutation = useMutation({
    mutationFn: async (serviceData: typeof newService) => {
      const response = await adminApi.post('/services', serviceData)
      return response.data
    },
    onSuccess: () => {
      setMessage({ type: 'success', text: 'Service added successfully!' })
      setShowAddModal(false)
      setNewService({
        name: '',
        display_name: '',
        url: '',
        health_check_path: '/health',
        timeout_seconds: 30,
        rate_limit_per_minute: 100,
        is_active: true,
        description: '',
      })
      setTimeout(() => {
        refetchServices()
        setMessage(null)
      }, 2000)
    },
    onError: (error: any) => {
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.detail || 'Failed to add service' 
      })
      setTimeout(() => setMessage(null), 3000)
    },
  })

  const handleAddService = () => {
    if (!newService.name || !newService.url) {
      setMessage({ type: 'error', text: 'Name and URL are required' })
      setTimeout(() => setMessage(null), 3000)
      return
    }
    addServiceMutation.mutate(newService)
  }

  const getHealthColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return { bg: '#064e3b', text: '#6ee7b7' }
      case 'unhealthy':
        return { bg: '#7f1d1d', text: '#fca5a5' }
      case 'checking':
        return { bg: '#1e3a8a', text: '#93c5fd' }
      default:
        return { bg: '#374151', text: '#9ca3af' }
    }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never'
    const date = new Date(dateString)
    return date.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (servicesLoading || statsLoading) {
    return <div style={{ textAlign: 'center', padding: '2rem' }}>Loading services...</div>
  }

  return (
    <div>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '2rem',
      }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
            Services
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
            Manage and monitor API services registered in Bifrost Gateway
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#059669',
              color: 'white',
              borderRadius: '0.5rem',
              border: 'none',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '0.875rem',
            }}
          >
            ➕ Add Service
          </button>
          <button
            onClick={() => refetchServices()}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#3b82f6',
              color: 'white',
              borderRadius: '0.5rem',
              border: 'none',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '0.875rem',
            }}
          >
            🔄 Refresh
          </button>
          <button
            onClick={() => healthCheckAllMutation.mutate()}
            disabled={healthCheckAllMutation.isPending}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: healthCheckAllMutation.isPending ? '#6b7280' : '#10b981',
              color: 'white',
              borderRadius: '0.5rem',
              border: 'none',
              cursor: healthCheckAllMutation.isPending ? 'not-allowed' : 'pointer',
              fontWeight: '600',
              fontSize: '0.875rem',
            }}
          >
            {healthCheckAllMutation.isPending ? '⏳ Checking...' : '🏥 Health Check All'}
          </button>
          <button
            onClick={() => reloadRegistryMutation.mutate()}
            disabled={reloadRegistryMutation.isPending}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: reloadRegistryMutation.isPending ? '#6b7280' : '#8b5cf6',
              color: 'white',
              borderRadius: '0.5rem',
              border: 'none',
              cursor: reloadRegistryMutation.isPending ? 'not-allowed' : 'pointer',
              fontWeight: '600',
              fontSize: '0.875rem',
            }}
          >
            {reloadRegistryMutation.isPending ? '⏳ Reloading...' : '🔁 Reload Registry'}
          </button>
        </div>
      </div>

      {/* Message Banner */}
      {message && (
        <div style={{
          padding: '1rem',
          marginBottom: '1.5rem',
          borderRadius: '0.5rem',
          backgroundColor: message.type === 'success' ? '#064e3b' : '#7f1d1d',
          color: message.type === 'success' ? '#6ee7b7' : '#fca5a5',
          border: `1px solid ${message.type === 'success' ? '#10b981' : '#ef4444'}`,
        }}>
          <p style={{ fontSize: '0.875rem', fontWeight: '600' }}>
            {message.type === 'success' ? '✅ ' : '❌ '}
            {message.text}
          </p>
        </div>
      )}

      {/* Statistics Cards */}
      {stats && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          marginBottom: '2rem',
        }}>
          <div style={{
            padding: '1.5rem',
            backgroundColor: '#1e293b',
            borderRadius: '0.75rem',
            border: '1px solid #334155',
          }}>
            <p style={{ fontSize: '0.875rem', color: '#94a3b8', marginBottom: '0.5rem' }}>
              Total Services
            </p>
            <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#f1f5f9' }}>
              {stats.total_services}
            </p>
          </div>

          <div style={{
            padding: '1.5rem',
            backgroundColor: '#1e293b',
            borderRadius: '0.75rem',
            border: '1px solid #334155',
          }}>
            <p style={{ fontSize: '0.875rem', color: '#94a3b8', marginBottom: '0.5rem' }}>
              Active Services
            </p>
            <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#10b981' }}>
              {stats.active_services}
            </p>
          </div>

          <div style={{
            padding: '1.5rem',
            backgroundColor: '#1e293b',
            borderRadius: '0.75rem',
            border: '1px solid #334155',
          }}>
            <p style={{ fontSize: '0.875rem', color: '#94a3b8', marginBottom: '0.5rem' }}>
              Healthy
            </p>
            <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#6ee7b7' }}>
              {stats.healthy_services}
            </p>
          </div>

          <div style={{
            padding: '1.5rem',
            backgroundColor: '#1e293b',
            borderRadius: '0.75rem',
            border: '1px solid #334155',
          }}>
            <p style={{ fontSize: '0.875rem', color: '#94a3b8', marginBottom: '0.5rem' }}>
              Unhealthy
            </p>
            <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#fca5a5' }}>
              {stats.unhealthy_services}
            </p>
          </div>

          <div style={{
            padding: '1.5rem',
            backgroundColor: '#1e293b',
            borderRadius: '0.75rem',
            border: '1px solid #334155',
          }}>
            <p style={{ fontSize: '0.875rem', color: '#94a3b8', marginBottom: '0.5rem' }}>
              Unknown
            </p>
            <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#9ca3af' }}>
              {stats.unknown_services}
            </p>
          </div>
        </div>
      )}

      {/* Services List */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
        gap: '1.5rem',
      }}>
        {services && services.length > 0 ? (
          services.map((service) => {
            const healthColors = getHealthColor(service.health_status)
            return (
              <div key={service.id} style={{
                padding: '1.5rem',
                backgroundColor: '#1e293b',
                borderRadius: '0.75rem',
                border: `2px solid ${service.is_active ? '#334155' : '#7f1d1d'}`,
              }}>
                {/* Service Header */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'start',
                  marginBottom: '1rem',
                }}>
                  <div>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '0.25rem' }}>
                      {service.display_name || service.name}
                    </h3>
                    <p style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#94a3b8' }}>
                      {service.name}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <span style={{
                      padding: '0.25rem 0.75rem',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      backgroundColor: healthColors.bg,
                      color: healthColors.text,
                    }}>
                      {service.health_status}
                    </span>
                    {!service.is_active && (
                      <span style={{
                        padding: '0.25rem 0.75rem',
                        borderRadius: '9999px',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        backgroundColor: '#7f1d1d',
                        color: '#fca5a5',
                      }}>
                        Inactive
                      </span>
                    )}
                  </div>
                </div>

                {/* Service Description */}
                {service.description && (
                  <p style={{
                    fontSize: '0.875rem',
                    color: '#cbd5e1',
                    marginBottom: '1rem',
                  }}>
                    {service.description}
                  </p>
                )}

                {/* Service Details */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div>
                    <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                      Base URL
                    </p>
                    <p style={{
                      fontSize: '0.875rem',
                      fontFamily: 'monospace',
                      color: '#f1f5f9',
                      wordBreak: 'break-all',
                    }}>
                      {service.url}
                    </p>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div>
                      <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                        Health Check
                      </p>
                      <p style={{ fontSize: '0.875rem', fontFamily: 'monospace', color: '#f1f5f9' }}>
                        {service.health_check_path}
                      </p>
                    </div>

                    <div>
                      <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                        Timeout
                      </p>
                      <p style={{ fontSize: '0.875rem', color: '#f1f5f9' }}>
                        {service.timeout_seconds}s
                      </p>
                    </div>
                  </div>

                  <div>
                    <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                      Last Health Check
                    </p>
                    <p style={{ fontSize: '0.875rem', color: '#f1f5f9' }}>
                      {formatDate(service.last_health_check)}
                    </p>
                  </div>

                  <div>
                    <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                      Rate Limit
                    </p>
                    <p style={{ fontSize: '0.875rem', color: '#f1f5f9' }}>
                      {service.rate_limit_per_minute} req/min
                    </p>
                  </div>
                </div>
              </div>
            )
          })
        ) : (
          <div style={{
            padding: '3rem',
            textAlign: 'center',
            color: '#94a3b8',
            gridColumn: '1 / -1',
          }}>
            <p style={{ fontSize: '1.125rem', marginBottom: '0.5rem' }}>No services registered</p>
            <p style={{ fontSize: '0.875rem' }}>
              Add services via the Bifrost API or Admin API
            </p>
          </div>
        )}
      </div>

      {/* Add Service Modal */}
      {showAddModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: '#1e293b',
            borderRadius: '0.75rem',
            border: '1px solid #334155',
            padding: '2rem',
            maxWidth: '600px',
            width: '90%',
            maxHeight: '90vh',
            overflowY: 'auto',
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1.5rem',
            }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Add New Service</h2>
              <button
                onClick={() => setShowAddModal(false)}
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: '#cbd5e1' }}>
                  Service Name * <span style={{ color: '#64748b', fontSize: '0.75rem' }}>(used in routing)</span>
                </label>
                <input
                  type="text"
                  value={newService.name}
                  onChange={(e) => setNewService({ ...newService, name: e.target.value })}
                  placeholder="e.g., my-service"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '0.5rem',
                    color: 'white',
                    fontSize: '0.875rem',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: '#cbd5e1' }}>
                  Display Name
                </label>
                <input
                  type="text"
                  value={newService.display_name}
                  onChange={(e) => setNewService({ ...newService, display_name: e.target.value })}
                  placeholder="e.g., My Service"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '0.5rem',
                    color: 'white',
                    fontSize: '0.875rem',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: '#cbd5e1' }}>
                  Service URL *
                </label>
                <input
                  type="text"
                  value={newService.url}
                  onChange={(e) => setNewService({ ...newService, url: e.target.value })}
                  placeholder="e.g., http://my-service:8080"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '0.5rem',
                    color: 'white',
                    fontSize: '0.875rem',
                    fontFamily: 'monospace',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: '#cbd5e1' }}>
                  Health Check Path
                </label>
                <input
                  type="text"
                  value={newService.health_check_path}
                  onChange={(e) => setNewService({ ...newService, health_check_path: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '0.5rem',
                    color: 'white',
                    fontSize: '0.875rem',
                    fontFamily: 'monospace',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: '#cbd5e1' }}>
                    Timeout (seconds)
                  </label>
                  <input
                    type="number"
                    value={newService.timeout_seconds}
                    onChange={(e) => setNewService({ ...newService, timeout_seconds: parseInt(e.target.value) })}
                    min="1"
                    max="300"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '0.5rem',
                      color: 'white',
                      fontSize: '0.875rem',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: '#cbd5e1' }}>
                    Rate Limit (req/min)
                  </label>
                  <input
                    type="number"
                    value={newService.rate_limit_per_minute}
                    onChange={(e) => setNewService({ ...newService, rate_limit_per_minute: parseInt(e.target.value) })}
                    min="1"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '0.5rem',
                      color: 'white',
                      fontSize: '0.875rem',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: '#cbd5e1' }}>
                  Description
                </label>
                <textarea
                  value={newService.description}
                  onChange={(e) => setNewService({ ...newService, description: e.target.value })}
                  placeholder="Brief description of the service"
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '0.5rem',
                    color: 'white',
                    fontSize: '0.875rem',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  id="is_active"
                  checked={newService.is_active}
                  onChange={(e) => setNewService({ ...newService, is_active: e.target.checked })}
                  style={{ width: '1.25rem', height: '1.25rem', cursor: 'pointer' }}
                />
                <label htmlFor="is_active" style={{ fontSize: '0.875rem', color: '#cbd5e1', cursor: 'pointer' }}>
                  Service is active (will receive traffic)
                </label>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                <button
                  onClick={handleAddService}
                  disabled={addServiceMutation.isPending}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    backgroundColor: addServiceMutation.isPending ? '#6b7280' : '#059669',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.5rem',
                    fontWeight: '600',
                    cursor: addServiceMutation.isPending ? 'not-allowed' : 'pointer',
                  }}
                >
                  {addServiceMutation.isPending ? 'Adding...' : 'Add Service'}
                </button>
                <button
                  onClick={() => setShowAddModal(false)}
                  disabled={addServiceMutation.isPending}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    backgroundColor: '#475569',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.5rem',
                    fontWeight: '600',
                    cursor: addServiceMutation.isPending ? 'not-allowed' : 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ServicesPage

