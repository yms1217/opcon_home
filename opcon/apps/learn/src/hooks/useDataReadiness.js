import { useState, useEffect } from 'react'
import { getDatasetStats } from '../services/forgeApi'
import { getLearningExecutionStats } from '../services/tmsApi'

export function useDataReadiness() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    Promise.all([getDatasetStats(), getLearningExecutionStats()])
      .then(([forgeStats, tmsStats]) => {
        setStats({ forge: forgeStats, tms: tmsStats })
      })
      .finally(() => setLoading(false))
  }, [])

  return { stats, loading }
}
