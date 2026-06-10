import { useState, useCallback, useEffect } from 'react'
import { getFunctions, getQueryLogs } from '@/apis/ai/aiApis'
import { ALL_VALUE } from '../constants'

const DATE_PRESET = {
  TODAY: 'today',
  WEEK: 'week',
  MONTH_1: '1month',
  MONTH_3: '3month',
  CUSTOM: 'custom'
}

const pad2 = (value) => String(value).padStart(2, '0')

const formatDate = (date) => {
  const year = date.getFullYear()
  const month = pad2(date.getMonth() + 1)
  const day = pad2(date.getDate())
  return `${year}-${month}-${day}`
}

const addDays = (date, days) => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

const addMonths = (date, months) => {
  const next = new Date(date)
  next.setMonth(next.getMonth() + months)
  return next
}

const getToday = () => {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

const getDateRangeByPreset = (preset) => {
  const today = getToday()

  if (preset === DATE_PRESET.TODAY) {
    return {
      startDate: formatDate(today),
      endDate: formatDate(today),
      datePreset: DATE_PRESET.TODAY
    }
  }

  if (preset === DATE_PRESET.MONTH_1) {
    return {
      startDate: formatDate(addMonths(today, -1)),
      endDate: formatDate(today),
      datePreset: DATE_PRESET.MONTH_1
    }
  }

  if (preset === DATE_PRESET.MONTH_3) {
    return {
      startDate: formatDate(addMonths(today, -3)),
      endDate: formatDate(today),
      datePreset: DATE_PRESET.MONTH_3
    }
  }

  return {
    startDate: formatDate(addDays(today, -6)),
    endDate: formatDate(today),
    datePreset: DATE_PRESET.WEEK
  }
}

const createInitialFilters = () => ({
  searchQuery: '',
  severity: ALL_VALUE,
  func: ALL_VALUE,
  status: ALL_VALUE,
  ...getDateRangeByPreset(DATE_PRESET.WEEK)
})

const INITIAL_PAGINATION = {
  page: 1,
  pageSize: 10,
  totalCount: 0,
  resetPageToggle: false
}

const getListItems = (response) => {
  if (Array.isArray(response)) return response
  if (Array.isArray(response?.items)) return response.items
  if (Array.isArray(response?.data)) return response.data
  if (Array.isArray(response?.data?.items)) return response.data.items
  if (Array.isArray(response?.list)) return response.list
  return []
}

const getPageInfo = (response) => {
  if (response?.pageInfo) return response.pageInfo
  if (response?.data?.pageInfo) return response.data.pageInfo
  return {}
}

const toQueryRequestParams = (filters = {}, pagination = {}) => {
  const summary =
    typeof filters.searchQuery === 'string' ? filters.searchQuery.trim() : ''

  const severity =
    filters.severity && filters.severity !== ALL_VALUE ? filters.severity : ''

  const func =
    filters.func && filters.func !== ALL_VALUE ? filters.func : ''

  const status =
    filters.status && filters.status !== ALL_VALUE ? filters.status : ''

  const start = filters.startDate || ''
  const end = filters.endDate || ''

  const page = Number(pagination.page || 1)
  const pageSize = Number(pagination.pageSize || 10)
  const startIndex = (page - 1) * pageSize

  return {
    ...(summary ? { summary } : {}),
    ...(severity ? { severity } : {}),
    ...(func ? { func } : {}),
    ...(status ? { status } : {}),
    ...(start ? { start } : {}),
    ...(end ? { end } : {}),
    startIndex,
    count: pageSize
  }
}

const toFunctionOptions = (funcs = []) => {
  const values = Array.from(
    new Set(
      (Array.isArray(funcs) ? funcs : [])
        .map((item) => String(item ?? '').trim())
        .filter(Boolean)
    )
  )

  return [
    { value: ALL_VALUE, name: 'Function 전체' },
    ...values.map((value) => ({ value, name: value }))
  ]
}

const useAiLogData = () => {
  const [isLoading, setIsLoading] = useState(false)
  const [rows, setRows] = useState([])
  const [filters, setFilters] = useState(createInitialFilters)
  const [pagination, setPagination] = useState(INITIAL_PAGINATION)
  const [functionOptions, setFunctionOptions] = useState([
    { value: ALL_VALUE, name: 'Function 전체' }
  ])

  const loadFunctionOptions = useCallback(async () => {
    try {
      const funcs = await getFunctions()
      setFunctionOptions(toFunctionOptions(funcs))
    } catch (error) {
      setFunctionOptions([{ value: ALL_VALUE, name: 'Function 전체' }])
    }
  }, [])

  const loadData = useCallback(async (nextFilters, nextPagination) => {
    setIsLoading(true)

    try {
      const requestParams = toQueryRequestParams(nextFilters, nextPagination)
      const response = await getQueryLogs(requestParams)

      const items = getListItems(response)
      const pageInfo = getPageInfo(response)

      const nextTotalCount =
        Number(
          pageInfo?.totalCount ??
          pageInfo?.total ??
          pageInfo?.allCount
        ) || 0

      setRows(items)

      setPagination((prev) => ({
        ...prev,
        totalCount: nextTotalCount
      }))
    } catch (error) {
      console.error('Error loading AI log data:', error)
      setRows([])
      setPagination((prev) => ({
        ...prev,
        totalCount: 0
      }))
    } finally {
      setIsLoading(false)
    }
  }, [])

  const resetToFirstPage = useCallback(() => {
    setPagination((prev) => ({
      ...prev,
      page: 1,
      resetPageToggle: !prev.resetPageToggle
    }))
  }, [])

  const updateFilter = useCallback((key, value) => {
    setFilters((prev) => {
      if (prev[key] === value) return prev
      return {
        ...prev,
        [key]: value
      }
    })

    resetToFirstPage()
  }, [resetToFirstPage])

  const updateDateRange = useCallback((key, value) => {
    setFilters((prev) => {
      if (prev[key] === value && prev.datePreset === DATE_PRESET.CUSTOM) {
        return prev
      }

      const next = {
        ...prev,
        [key]: value,
        datePreset: DATE_PRESET.CUSTOM
      }

      if (next.startDate && next.endDate && next.startDate > next.endDate) {
        if (key === 'startDate') {
          next.endDate = value
        } else if (key === 'endDate') {
          next.startDate = value
        }
      }

      return next
    })

    resetToFirstPage()
  }, [resetToFirstPage])

  const applyDatePreset = useCallback((preset) => {
    const nextRange = getDateRangeByPreset(preset)

    setFilters((prev) => {
      if (
        prev.startDate === nextRange.startDate &&
        prev.endDate === nextRange.endDate &&
        prev.datePreset === nextRange.datePreset
      ) {
        return prev
      }

      return {
        ...prev,
        ...nextRange
      }
    })

    resetToFirstPage()
  }, [resetToFirstPage])

  const resetFilters = useCallback(() => {
    setFilters(createInitialFilters())
    setPagination((prev) => ({
      ...prev,
      page: 1,
      totalCount: 0,
      resetPageToggle: !prev.resetPageToggle
    }))
  }, [])

  const updatePage = useCallback((page) => {
    setPagination((prev) => {
      if (prev.page === page) return prev
      return {
        ...prev,
        page
      }
    })
  }, [])

  const updatePageSize = useCallback((pageSize) => {
    setPagination((prev) => {
      if (prev.pageSize === pageSize && prev.page === 1) return prev
      return {
        ...prev,
        page: 1,
        pageSize,
        resetPageToggle: !prev.resetPageToggle
      }
    })
  }, [])

  useEffect(() => {
    loadFunctionOptions()
  }, [loadFunctionOptions])

  useEffect(() => {
    loadData(filters, pagination)
  }, [filters, pagination.page, pagination.pageSize, loadData])

  const reload = useCallback(() => {
    loadData(filters, pagination)
  }, [filters, pagination, loadData])

  return {
    isLoading,
    rows,
    filters,
    pagination,
    functionOptions,
    updateFilter,
    updateDateRange,
    applyDatePreset,
    resetFilters,
    updatePage,
    updatePageSize,
    reload,
    DATE_PRESET
  }
}

export default useAiLogData
