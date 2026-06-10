const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'
const BASE = import.meta.env.VITE_API_BASE_URL || ''

const MOCK_TASKFLOWS = [
  { id: 'tf-001', name: '자재 팔레타이징', description: '입고 자재를 규격별로 팔레트에 적재', stepCount: 5, lastRun: '2026-06-01' },
  { id: 'tf-002', name: 'Pick & Place', description: '물건 집어 올려 다른 위치에 배치', stepCount: 3, lastRun: '2026-06-03' },
  { id: 'tf-003', name: '재고 검수 분류', description: '입고 물품의 상태를 검수하고 카테고리별 분류', stepCount: 6, lastRun: '2026-05-28' },
  { id: 'tf-004', name: '제조 PoC', description: '제조 라인 부품 조립 검증', stepCount: 8, lastRun: '2026-06-05' },
]

const MOCK_EXECUTION = {
  id: 'exec-2026-001',
  taskflowId: 'tf-001',
  taskflowName: '자재 팔레타이징',
  status: 'running',
  startedAt: '2026-06-08T10:00:00Z',
  progress: 60,
  completedSteps: 3,
  totalSteps: 5,
}

const MOCK_EPISODES = Array.from({ length: 20 }, (_, i) => ({
  id: `EP-${String(i + 1).padStart(3, '0')}`,
  status: i % 5 === 1 ? 'failed' : i % 5 === 2 ? 'retry' : 'success',
  step: `Step ${(i % 5) + 1}`,
  duration: `${Math.floor(Math.random() * 30) + 10}s`,
  hasIntervention: i % 4 === 0,
  thumbnail: null,
}))

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) throw new Error(`TMS API error: ${res.status}`)
  return res.json()
}

export const getTaskflows = async () => {
  if (USE_MOCK) return MOCK_TASKFLOWS
  return request('/taskflows')
}

export const getTaskflow = async (id) => {
  if (USE_MOCK) return MOCK_TASKFLOWS.find((t) => t.id === id) || null
  return request(`/taskflows/${id}`)
}

export const createExecution = async (payload) => {
  if (USE_MOCK) return { ...MOCK_EXECUTION, id: `exec-${Date.now()}`, ...payload }
  return request('/executions', { method: 'POST', body: JSON.stringify(payload) })
}

export const getExecution = async (id) => {
  if (USE_MOCK) return { ...MOCK_EXECUTION, id }
  return request(`/executions/${id}`)
}

export const getExecutionEvents = async (id) => {
  if (USE_MOCK) return []
  return request(`/executions/${id}/events`)
}

export const getEpisodeCandidates = async (executionId) => {
  if (USE_MOCK) return MOCK_EPISODES
  return request(`/executions/${executionId}/episodes`)
}

export const getEpisode = async (id) => {
  if (USE_MOCK) return MOCK_EPISODES.find((e) => e.id === id) || null
  return request(`/episodes/${id}`)
}

export const updateEpisodeReviewStatus = async (id, status) => {
  if (USE_MOCK) return { id, reviewStatus: status }
  return request(`/episodes/${id}/review-status`, { method: 'PUT', body: JSON.stringify({ status }) })
}

export const getLearningExecutionStats = async () => {
  if (USE_MOCK) {
    return {
      total: 234,
      accepted: 180,
      pending: 34,
      rejected: 20,
    }
  }
  return request('/executions/stats?purpose=learning')
}
