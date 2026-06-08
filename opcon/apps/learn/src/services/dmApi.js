const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'
const BASE = import.meta.env.VITE_API_BASE_URL || ''

const MOCK_DEVICES = [
  { id: 'robot-001', name: 'RSP-001', model: 'RSP-7', status: 'idle', location: '1F 창고' },
  { id: 'robot-002', name: 'RSP-002', model: 'RSP-7', status: 'running', location: '2F 물류' },
  { id: 'robot-003', name: 'RSP-003', model: 'RSP-9', status: 'idle', location: '3F 제조' },
  { id: 'robot-004', name: 'RSP-004', model: 'RSP-9', status: 'offline', location: '1F 창고' },
]

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) throw new Error(`DM API error: ${res.status}`)
  return res.json()
}

export const getDevices = async () => {
  if (USE_MOCK) return MOCK_DEVICES
  return request('/devices')
}

export const getDevice = async (id) => {
  if (USE_MOCK) return MOCK_DEVICES.find((d) => d.id === id) || null
  return request(`/devices/${id}`)
}

export const getDeviceStatus = async (id) => {
  if (USE_MOCK) {
    const device = MOCK_DEVICES.find((d) => d.id === id)
    return device ? { id, status: device.status } : null
  }
  return request(`/devices/${id}/status`)
}

export const createTeleopSession = async (config) => {
  if (USE_MOCK) {
    return { id: `teleop-${Date.now()}`, ...config, createdAt: new Date().toISOString() }
  }
  return request('/teleop-sessions', { method: 'POST', body: JSON.stringify(config) })
}
