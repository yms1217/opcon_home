// hooks/useLogReplayData.js
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fileApis } from '@/apis'
import { detectLevel, extractFilenameFromContentDisposition, triggerAnchorDownload } from '../logReplayRender.js'
import useLogSearch from './useLogSearch.js'
import { scanReplayAllOnceFromMcapUrl } from '../mcap/mcapLoader.js'
import { toUtcFromLocalDateTime } from '@/utils/dateUtils'
import { gunzipToUint8Array, parseTarEntries, filterTextEntries, decodeUtf8, splitLines } from '../mcap/archiveUtils.js'
const lichtblickURL = import.meta.env.VITE_LICHTBLICK_BASE_URL

const EMPTY_OPTION = { id: '__empty__', label: '파일 없음' }
const INITIAL_HINT = 'mcap 파일 선택 후 조회 버튼을 눌러주세요'

export default function useLogReplayData({
  setPathPoints,
  setGridData,
  setLocalCostmapData,
  setLocalCostmapFrames,
  setPlannedPathPoints,
  setLidarScans,
  setDwaGoals,
  setLoadPhase,
  setT0EpochMs,
  updateBuffer,
  renderNow,
  resetView,
  deviceId
}) {
  // 스트리밍 상태 ref
  const expectedDurationSecRef = useRef(0)
  const decodedSpanSecRef = useRef(0)
  const t0RawRef = useRef(null)
  const tLastRawRef = useRef(-Infinity)

  const tLastCostmapRelRef = useRef(-Infinity) // ✅ ADD
  const pendingLocalCostmapAbsRef = useRef([]) // ✅ ADD

  const gridDoneRef = useRef({ v: false })
  const posesDoneRef = useRef({ v: false })
  const EPS_TRAW = 1e-6
  const tarPrefetchPromiseRef = useRef(null)
  const tarPrefetchKeyRef = useRef('')
  const t0EpochMsRef = useRef(null) //ADD: playback 기준점(ms)
  // 서버 옵션/상태
  const todayStr = new Date().toISOString().slice(0, 10)
  const [logOptions, setLogOptions] = useState([EMPTY_OPTION])
  const [selectedDate, setSelectedDate] = useState(todayStr)
  const [selectedLogId, setSelectedLogId] = useState(EMPTY_OPTION.id)

  // 캘린더 가용 날짜 (yyyy-MM-dd 배열)
  const [allowedDateKeys, setAllowedDateKeys] = useState(null)

  // 텍스트 로그/검색
  const [logLines, setLogLines] = useState([])
  const [isLoadingLogs, setIsLoadingLogs] = useState(false)

  const [logError, setLogError] = useState(null)
  const [filteredLines, setFilteredLines] = useState([])

  const MAX_FILTER_VIEW = 12000 // UI 표시 한정, 전부 메모리에 복제하지 않음
  const [hasAnyTarLogs, setHasAnyTarLogs] = useState(false)
  const [levelFilter, setLevelFilter] = useState({ INFO: true, WARN: true, ERROR: true, DEBUG: true, FATAL: true })
  const activeLevels = useMemo(
    () =>
      Object.entries(levelFilter)
        .filter(([, v]) => v)
        .map(([k]) => k),
    [levelFilter]
  )
  const [pendingKeyword, setPendingKeyword] = useState('')
  const [appliedKeyword, setAppliedKeyword] = useState('')

  const { ready: searchReady, add: searchAdd, clear: searchClear, query: searchQuery } = useLogSearch()
  const logSeqRef = useRef(0)
  const searchDebounceRef = useRef(0)

  // ──────────────────────────────────────────────────────────────
  // [Step1] tar.gz 다운로드 상태/버퍼
  const tarGzBytesRef = useRef(null) // Uint8Array (압축 그대로 저장)
  const tarGzMetaRef = useRef(null) // { id, label, createdAt, size, url }
  const [isLoadingTar, setIsLoadingTar] = useState(false)
  const [tarError, setTarError] = useState(null)
  // ────────────────────────────────────────────────────────────
  const MAX_LOG_LINES_IN_MEMORY = 30000
  const SEARCH_LIMIT = 20000

  const isLoadingLogsRef = useRef(false)
  useEffect(() => {
    isLoadingLogsRef.current = isLoadingLogs
  }, [isLoadingLogs])
  // 오버레이/게이팅
  const [loadPhase, _setLoadPhase] = useState('init')
  useEffect(() => {
    setLoadPhase?.(loadPhase)
  }, [loadPhase, setLoadPhase])
  const rightOverlayVisible = useMemo(() => loadPhase === 'init' || loadPhase === 'error', [loadPhase])
  const rightOverlayText = useMemo(
    () => (loadPhase === 'init' ? INITIAL_HINT : loadPhase === 'error' ? '로딩 실패' : ''),
    [loadPhase]
  )
  const DEBUG_REPLAY = true
  const dbg = (...args) => {
    if (!DEBUG_REPLAY) return
    console.log('[ReplayDbg]', ...args)
  }

  // presigned URL
  const presignedCacheRef = useRef(new Map())
  const getPresignedUrl = useCallback(async (fileId) => {
    if (!fileId || fileId === EMPTY_OPTION.id) return ''
    const cached = presignedCacheRef.current.get(fileId)
    const now = Date.now()
    if (cached && cached.expiresAt && cached.expiresAt - now > 10_000) return cached.url
    const resp = await fileApis.getFilesDownloardurl(fileId)
    const url = resp?.presignedUrl || ''
    if (!url) return ''
    try {
      const u = new URL(url)
      const expiresSec = Number(u.searchParams.get('X-Amz-Expires') || '0')
      const expiresAt = now + Math.max(0, expiresSec - 30) * 1000
      presignedCacheRef.current.set(fileId, { url, expiresAt })
    } catch (e) {
      dbg('presigned URL parse failed', e?.message || String(e))
    }
    return url
  }, [])

  // mcap 선택 항목으로부터 정확히 매칭되는 tar.gz option 찾기
  // 규칙:
  //   'dwa_mcap_<SUFFIX>.mcap' → 'driving_log_<SUFFIX>.tar.gz'
  const findPairedTarGzOption = useCallback((selected, options) => {
    if (!selected || !selected.label || !Array.isArray(options) || options.length === 0) {
      return null
    }

    // 1) mcap 파일명 정규화
    let base = String(selected.label)
      .trim()
      .replace(/\.mcap$/i, '')

    // 2) prefix 제거
    const suffix = base.replace(/^dwa_mcap_/i, '')
    if (!suffix) return null

    // 3) 기대 tar.gz 파일명 생성
    const expectedLabel = `driving_log_${suffix}.tar.gz`
    const expectedLower = expectedLabel.toLowerCase()

    // 4) 정확히 일치하는 option 검색 (case-insensitive)
    return options.find((o) => (o?.label || '').toLowerCase() === expectedLower) || null
  }, [])

  // tar.gz 사전 로드 (압축 해제는 아직 X)
  const prefetchTarGzForSelected = useCallback(
    async (selected, options, reason = 'unknown') => {
      const cand = findPairedTarGzOption(selected, options)
      const key = cand?.id || ''
      if (!cand) {
        console.warn('[tar.gz] candidate not found for selected MCAP.')
        return null
      }
      if (tarGzMetaRef.current?.id === cand.id && tarGzBytesRef.current?.length) {
        return tarGzMetaRef.current
      }
      if (tarPrefetchPromiseRef.current && tarPrefetchKeyRef.current === key) {
        return tarPrefetchPromiseRef.current
      }
      tarPrefetchKeyRef.current = key
      tarPrefetchPromiseRef.current = (async () => {
        setIsLoadingTar(true)
        setTarError(null)
        try {
          console.log('[tar.gz] candidate:', cand.label, cand.createdAt, 'reason=', reason)
          const url = await getPresignedUrl(cand.id)
          if (!url) throw new Error('presigned URL for tar.gz is empty')
          const resp = await fetch(url, { mode: 'cors' })
          if (!resp.ok) throw new Error(`tar.gz download failed: HTTP ${resp.status}`)
          const buf = await resp.arrayBuffer()
          tarGzBytesRef.current = new Uint8Array(buf)
          tarGzMetaRef.current = { ...cand, url }
          console.log(`[tar.gz] loaded: ${cand.label}, bytes=${tarGzBytesRef.current.length}, reason=${reason}`)
          return tarGzMetaRef.current
        } catch (e) {
          console.warn('[tar.gz] prefetch failed:', e)
          setTarError(e?.message || String(e))
          return null
        } finally {
          setIsLoadingTar(false)
          tarPrefetchPromiseRef.current = null
          tarPrefetchKeyRef.current = ''
        }
      })()
      return tarPrefetchPromiseRef.current
    },
    [findPairedTarGzOption, getPresignedUrl]
  )

  const queryWindow = useCallback(
    async ({ levels, keyword = '', fromMs, toMs, limit = 5000 } = {}) => {
      if (!searchReady) return []
      const timeRange =
        Number.isFinite(fromMs) && Number.isFinite(toMs) ? { from: Math.round(fromMs), to: Math.round(toMs) } : null
      const res = await searchQuery({
        levels,
        keyword,
        sortBy: timeRange ? 'pbAsc' : 'tsAsc',
        limit,
        timeRange
      })
      const items = Array.isArray(res?.items) ? res.items : []
      return items.map((it) => it?.text).filter(Boolean)
    },
    [searchReady, searchQuery]
  )
  //캘린더에 해당하는는 파일 목록 조회
  const handleVisibleRangeChange = useCallback(
    async ({ startDate, endDate }) => {
      const toDateKey = (v) => {
        if (!v) return ''
        const d = typeof v === 'string' ? new Date(v) : v
        return isNaN(d) ? '' : d.toISOString().slice(0, 10)
      }

      const startKey = toDateKey(startDate)
      const endKey = toDateKey(endDate)
      if (!startKey || !endKey) return

      const start = toUtcFromLocalDateTime(startKey, '00:00:00')
      const end = toUtcFromLocalDateTime(endKey, '23:59:59')

      try {
        const size = 500
        const params = deviceId ? { start, end, deviceId, size } : { start, end }
        const items = (await fileApis.getFiles(params))?.content ?? []

        const dates = Array.from(
          new Set(
            items
              .map((it) => it?.createdAt && new Date(it.createdAt))
              .filter((d) => d && !isNaN(d))
              .map((d) => d.toISOString().slice(0, 10))
          )
        ).sort()

        setAllowedDateKeys(dates)
      } catch (e) {
        console.error('[get available dates] failed:', e)
        setAllowedDateKeys([])
      }
    },
    [deviceId]
  )

  // 현재 달(캘린더 6주 그리드)의 가시 범위를 계산
  const computeVisibleRangeForMonth = useCallback((yyyyMMdd) => {
    const base = (() => {
      const [y, m] = (yyyyMMdd || '').split('-').map(Number)
      return Number.isFinite(y) && Number.isFinite(m)
        ? new Date(y, m - 1, 1)
        : new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    })()

    const start = new Date(base)
    start.setDate(1 - start.getDay()) // 달력 첫 셀

    const end = new Date(start)
    end.setDate(start.getDate() + 41) // 6주

    return { startDate: start, endDate: end }
  }, [])

  // [핵심] 첫 진입 시, Calendar가 자동 호출해주지 않으니 우리가 직접 1회 호출
  useEffect(() => {
    const { startDate, endDate } = computeVisibleRangeForMonth(selectedDate)
    handleVisibleRangeChange({ startDate, endDate })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 파일 목록 조회
  const handleFetchListClick = useCallback(async () => {
    try {
      const start = toUtcFromLocalDateTime(selectedDate, '00:00:00')
      const end = toUtcFromLocalDateTime(selectedDate, '23:59:59')

      // deviceId가 존재하면 옵션에 포함 (없으면 제외)
      const size = 500 //temp code
      const params = deviceId ? { start, end, deviceId, size } : { start, end }
      const response = await fileApis.getFiles(params)
      const items = Array.isArray(response?.content) ? response.content : []
      const nextOptionsRaw = items.map((it) => ({
        id: it.fileId,
        label: it.fileOriginalName || it.fileId,
        createdAt: it.createdAt,
        size: it.fileSize
      }))
      const nextOptions = nextOptionsRaw.length > 0 ? nextOptionsRaw : [EMPTY_OPTION]
      setLogOptions(nextOptions)
      if (!nextOptions.some((o) => o.id === selectedLogId)) {
        setSelectedLogId(nextOptions[0].id)
      }
    } catch (e) {
      dbg('handleFetchListClick failed', e?.message || String(e))
      setLogOptions([EMPTY_OPTION])
      setSelectedLogId(EMPTY_OPTION.id)
    }
  }, [selectedDate, selectedLogId, deviceId])

  // 선택 변경 (초기화는 상위 훅에서)
  const onDateChange = useCallback((date) => {
    setSelectedDate(date)
  }, [])
  const onLogChange = useCallback((value) => {
    setSelectedLogId(value)
  }, [])

  useEffect(() => {
    const allOn = levelFilter.INFO && levelFilter.WARN && levelFilter.ERROR && levelFilter.DEBUG && levelFilter.FATAL
    // 검색 엔진 준비 전에는 표시하지 않음
    const keyword = (appliedKeyword || '').trim()
    const noKeyword = !keyword

    if (!activeLevels || activeLevels.length === 0) {
      setFilteredLines([])
      return
    }

    if (allOn && noKeyword) {
      const tail = Array.isArray(logLines) ? logLines.slice(-MAX_FILTER_VIEW) : []
      setFilteredLines(tail)
      return
    }
    // 레벨 필터 모두 해제 → 즉시 빈 결과
    if (isLoadingLogs) {
      setFilteredLines([])
      return
    }

    if (!searchReady) {
      setFilteredLines([])
      return
    }

    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const { items } = await searchQuery({
          levels: activeLevels,
          keyword,
          sortBy: 'tsAsc',
          limit: SEARCH_LIMIT
        })

        // ✅ worker가 text를 직접 주므로, 더 이상 logLines[id] 매핑 금지
        let out = Array.isArray(items) ? items.map((it) => it?.text).filter(Boolean) : []

        if (out.length > MAX_FILTER_VIEW) {
          out = out.slice(out.length - MAX_FILTER_VIEW)
        }
        setFilteredLines(out)
      } catch (e) {
        console.warn('[auto query] failed:', e)
        setFilteredLines([])
      }
    }, 250)
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    }
  }, [isLoadingLogs, searchReady, activeLevels, appliedKeyword, logLines, logLines.length, searchQuery, levelFilter])
  // 키워드 검색 버튼
  const searchReadyRef = useRef(false)
  useEffect(() => {
    searchReadyRef.current = !!searchReady
  }, [searchReady])
  const pendingKeywordRef = useRef('')
  useEffect(() => {
    pendingKeywordRef.current = pendingKeyword
  }, [pendingKeyword])
  const activeLevelsRef = useRef(activeLevels)
  const logLinesRef = useRef(logLines)
  useEffect(() => {
    logLinesRef.current = logLines
  }, [logLines])

  const handleKeywordSearchClick = useCallback(async () => {
    const keyword = (pendingKeywordRef.current || '').trim()
    const allOn = levelFilter.INFO && levelFilter.WARN && levelFilter.ERROR && levelFilter.DEBUG && levelFilter.FATAL

    // 준비 전에는 표시하지 않음
    setAppliedKeyword(keyword)
    if (!activeLevelsRef.current || activeLevelsRef.current.length === 0) {
      setFilteredLines([])
      return
    }
    // 레벨 모두 해제 시 즉시 빈 결과
    if (allOn && !keyword) {
      const tail = Array.isArray(logLinesRef.current) ? logLinesRef.current.slice(-MAX_FILTER_VIEW) : []
      setFilteredLines(tail)
      return
    }
    if (!searchReadyRef.current || isLoadingLogsRef.current) {
      setFilteredLines([])
      return
    }

    try {
      const { items } = await searchQuery({
        levels: activeLevelsRef.current,
        keyword,
        sortBy: 'tsAsc',
        limit: SEARCH_LIMIT
      })

      // ✅ worker가 text를 직접 주므로, logLinesRef.current[id] 매핑 제거
      let out = Array.isArray(items) ? items.map((it) => it?.text).filter(Boolean) : []

      if (out.length > MAX_FILTER_VIEW) {
        out = out.slice(out.length - MAX_FILTER_VIEW)
      }
      setFilteredLines(out)
    } catch (e) {
      console.warn('[keyword search] failed:', e)
      setFilteredLines([])
    }
  }, [searchQuery, levelFilter])

  // 다운로드
  const [isPreparingDownload, setIsPreparingDownload] = useState(false)
  const handleDownloadLog = useCallback(async () => {
    if (!selectedLogId || selectedLogId === EMPTY_OPTION.id) return
    const selected = logOptions.find((l) => l.id === selectedLogId)
    if (!selected) return

    setIsPreparingDownload(true)
    const downloadUrl = await getPresignedUrl(selectedLogId)
    if (!downloadUrl) {
      setIsPreparingDownload(false)
      alert('다운로드 URL이 설정되지 않았습니다.')
      return
    }

    const fallbackFileName = selected?.label?.replace(/\s+/g, '_') || `${selected?.id || 'log'}.mcap`

    try {
      const resp = await fetch(downloadUrl, { mode: 'cors' })
      if (!resp.ok) throw new Error(`다운로드 실패: HTTP ${resp.status}`)

      const blob = await resp.blob()
      const cd = resp.headers.get('Content-Disposition') || resp.headers.get('content-disposition')
      const serverFileName = cd ? extractFilenameFromContentDisposition(cd) : null
      const finalFileName = serverFileName || fallbackFileName

      if (window.showSaveFilePicker) {
        try {
          setIsPreparingDownload(false)
          const pickerHandle = await window.showSaveFilePicker({
            suggestedName: finalFileName,
            types: [
              {
                description: 'MCAP 로그 파일',
                accept: { 'application/octet-stream': ['.mcap'], 'application/x-mcap': ['.mcap'] }
              }
            ]
          })
          const writable = await pickerHandle.createWritable()
          await writable.write(blob)
          await writable.close()
          return
        } catch (pickerErr) {
          if (pickerErr && (pickerErr.name === 'AbortError' || pickerErr.name === 'NotAllowedError')) return
          console.warn('[download] showSaveFilePicker 실패/취소 → <a download> 폴백', pickerErr)
        }
      }

      const blobUrl = URL.createObjectURL(blob)
      setIsPreparingDownload(false)
      try {
        triggerAnchorDownload(blobUrl, finalFileName)
      } finally {
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000)
      }
    } catch (err) {
      console.warn('[download] fetch 실패 → 원본 URL <a download>로 폴백', err)
      setIsPreparingDownload(false)
      triggerAnchorDownload(downloadUrl, fallbackFileName, true)
    }
  }, [selectedLogId, logOptions, getPresignedUrl])

  // Lichtblick
  const handleOpenLichtblick = useCallback(async () => {
    if (!selectedLogId || selectedLogId === EMPTY_OPTION.id) return

    const selected = logOptions.find((l) => l.id === selectedLogId)
    if (!selected) return

    const downloadUrl = await getPresignedUrl(selectedLogId)
    if (!downloadUrl) {
      alert('Logfile URL not found')
      return
    }
    const ds = 'remote-file'
    const u = new URL(lichtblickURL)
    u.search = ''
    u.searchParams.set('ds', ds)
    u.searchParams.set('ds.url', downloadUrl)
    u.searchParams.set('embed', 'true')
    u.searchParams.set('ui', 'minimal')
    const href = u.toString()
    const popup = window.open(href, '_blank', 'noopener,noreferrer')
    if (popup) popup.opener = null
  }, [selectedLogId, logOptions, getPresignedUrl])

  const TOPICS = {
    grid: '/carto_service/occupancygrid',
    trackedpose: '/carto_service/trackedpose',
    path: '/master_service/path',
    lidar: '/lidar_service/data',
    localCostmap: '/debug/dwa_local_costmap'
  }
  // ──────────────────────────────────────────────────────────────
  // 조회(스트리밍)
  // ──────────────────────────────────────────────────────────────
  const handleViewLog = useCallback(async () => {
    if (!selectedLogId || selectedLogId === EMPTY_OPTION.id) return
    const selected = logOptions.find((l) => l.id === selectedLogId)
    if (!selected) return

    const filename = (selected.label ?? '').toLowerCase()
    if (!filename.includes('mcap')) {
      alert('선택한 항목은 분석 가능한 파일이 아닙니다.')
      return
    }

    const downloadUrl = await getPresignedUrl(selectedLogId)
    if (!downloadUrl) {
      alert('다운로드 URL이 설정되지 않았습니다.')
      return
    }

    // ──────────────────────────────────────────────────────────────
    // 초기화
    // ──────────────────────────────────────────────────────────────

    const resetStreamRefs = () => {
      expectedDurationSecRef.current = 0
      decodedSpanSecRef.current = 0
      t0RawRef.current = null
      tLastRawRef.current = -Infinity
      gridDoneRef.current.v = false
      posesDoneRef.current.v = false
    }

    const resetUiState = () => {
      _setLoadPhase('loading')
      updateBuffer?.(0.06)
      setPathPoints?.([])
      setGridData?.(null)
      setLocalCostmapData?.(null)
      setLocalCostmapFrames?.([])
      setPlannedPathPoints?.([])
      setLidarScans?.([])
      setDwaGoals?.([])
      setLogLines([])
      setFilteredLines([])
      searchClear?.()
      logSeqRef.current = 0
      setIsLoadingLogs(true)
      setLogError(null)
      setT0EpochMs?.(null)
      t0EpochMsRef.current = null
      resetView?.()
      renderNow?.()
    }

    resetStreamRefs()
    resetUiState()

    let rosoutFound = false
    // tar.gz 프리패치(비동기)
    void prefetchTarGzForSelected(selected, logOptions, 'view-start')

    const maybeSetReady = () => {
      if (gridDoneRef.current.v && posesDoneRef.current.v) {
        _setLoadPhase('ready')
        updateBuffer?.(1.0)
      }
    }
    const readStampSec = (stamp) => {
      if (!stamp) return Number.NaN
      try {
        if (typeof stamp === 'object') {
          const sec = Number(stamp.sec)
          const nsec = Number(stamp.nanosec ?? stamp.nsec)
          if (Number.isFinite(sec)) {
            return sec + (Number.isFinite(nsec) ? nsec * 1e-9 : 0)
          }
        }
        if (typeof stamp === 'bigint') {
          const ns = Number(stamp)
          if (Number.isFinite(ns)) return ns * 1e-9
        }
        // number: sec or ns
        if (typeof stamp === 'number' && Number.isFinite(stamp)) {
          return stamp > 1e12 ? stamp * 1e-9 : stamp
        }
      } catch {}
      return Number.NaN
    }
    // [ADD] costmap absolute time(sec) 추출
    const readGridAbsSec = (grid, fallbackTSec) => {
      const s = readStampSec(grid?.header?.stamp)
      if (Number.isFinite(s)) return s
      const fb = Number(fallbackTSec)
      return Number.isFinite(fb) ? fb : Number.NaN
    }
    // [ADD] poses 기준점(t0RawRef) 확보 후,
    // t0 이전에 들어온 local costmap 프레임을 rel sec로 변환해 flush
    const flushPendingLocalCostmaps = () => {
      const t0 = t0RawRef.current
      if (t0 == null) return

      const pend = pendingLocalCostmapAbsRef.current
      if (!Array.isArray(pend) || pend.length === 0) return
      pendingLocalCostmapAbsRef.current = []

      const mapped = []
      for (const it of pend) {
        const tAbs = Number(it?.tAbsSec)
        if (!Number.isFinite(tAbs)) continue

        let rel = tAbs - Number(t0)
        if (!Number.isFinite(rel)) rel = 0
        if (!(rel > (tLastCostmapRelRef.current ?? -Infinity))) {
          rel = (tLastCostmapRelRef.current ?? -Infinity) + EPS_TRAW
        }
        tLastCostmapRelRef.current = rel
        mapped.push({ tSec: rel, grid: it.grid })
      }

      if (mapped.length) {
        setLocalCostmapFrames?.((prev) => (prev && prev.length ? prev.concat(mapped) : mapped))
        renderNow?.()
      }
    }

    const pushBatchNormalized = (batch) => {
      if (!Array.isArray(batch) || batch.length === 0) return
      let minRaw = +Infinity,
        maxRaw = -Infinity
      const norm = []
      for (const r of batch) {
        const tRaw = Number(r?.tSec)
        const x = Number(r?.x),
          y = Number(r?.y)
        const yaw = Number(r?.yaw) || 0
        if (!Number.isFinite(tRaw) || !Number.isFinite(x) || !Number.isFinite(y)) continue

        if (t0RawRef.current == null) {
          t0RawRef.current = tRaw
          const baseMs = Math.round(tRaw * 1000)
          t0EpochMsRef.current = baseMs
          setT0EpochMs?.(baseMs)

          // ✅ [ADD] costmap pending → rel sec flush
          flushPendingLocalCostmaps()
        }

        let t = tRaw - (t0RawRef.current ?? tRaw)
        if (!(t > (tLastRawRef.current ?? -Infinity))) t = (tLastRawRef.current ?? -Infinity) + EPS_TRAW
        tLastRawRef.current = t
        norm.push({ x, y, yaw, tSec: t })
        if (tRaw < minRaw) minRaw = tRaw
        if (tRaw > maxRaw) maxRaw = tRaw
      }
      if (norm.length === 0) return
      if (isFinite(minRaw) && isFinite(maxRaw)) {
        const span = Math.max(0, maxRaw - (t0RawRef.current ?? maxRaw))
        if (span > decodedSpanSecRef.current) decodedSpanSecRef.current = span
      }

      // ✅ pose 스트리밍이 실제로 들어오기 시작했음을 표시
      posesDoneRef.current.v = true
      maybeSetReady()

      setPathPoints?.((prev) => (prev ? prev.concat(norm) : norm))
      renderNow?.()

      const exp = Math.max(0, Number(expectedDurationSecRef.current) || 0)
      if (exp > 0) {
        const ratio = Math.max(0, Math.min(0.99, decodedSpanSecRef.current / exp))
        updateBuffer?.(Math.max(0.06, ratio))
      } else {
        updateBuffer?.(Math.min(0.2, 0.06 + Math.min(0.01, 0.0005 * norm.length)))
      }
    }

    try {
      const clipTail = (arr, max) => (arr.length > max ? arr.slice(arr.length - max) : arr)

      const appendLines = (batch) => {
        if (!Array.isArray(batch) || batch.length === 0) return

        setLogLines((prev) => {
          const merged = prev.concat(batch)
          return clipTail(merged, MAX_LOG_LINES_IN_MEMORY)
        })

        // ✅ 로딩 중에도 인덱싱(add)은 수행해야 검색이 된다
        try {
          let lastAbsMs = Number.NaN
          let lastPbMs = Number.NaN
          const normalized = batch.map((raw) => {
            const text = String(raw ?? '')
            const level = detectLevelExt(text)
            const absMs = extractEpochMsFromLine(text)
            if (Number.isFinite(absMs)) {
              lastAbsMs = absMs
              const base = t0EpochMsRef.current
              const pb = base ? absMs - base : Number.NaN
              if (Number.isFinite(pb)) lastPbMs = pb
            }
            const pbMs = Number.isFinite(lastPbMs) ? lastPbMs : null
            const ts = logSeqRef.current++
            return { ts, level, text, pbMs }
          })
          searchAdd?.(normalized)
        } catch (e) {
          console.warn('[searchAdd] failed:', e)
        }
      }
      const appendSysLine = (text) => appendLines([`----- ${text} -----`])

      // [TIMEZONE/KST] 고정: glog 타임스탬프를 KST(UTC+9) 기준 절대시간으로 환산
      const toEpochMsKST = (Y, M, D, hh, mm, ss, ms) =>
        Date.UTC(Number(Y), Number(M) - 1, Number(D), Number(hh) - 9, Number(mm), Number(ss), Number(ms || 0))

      // KST 타임스탬프 표시용 포맷터
      const formatKst = (tMs) => {
        if (!Number.isFinite(tMs)) return ''
        const k = new Date(tMs + 9 * 60 * 60 * 1000)
        const yyyy = k.getUTCFullYear()
        const mm = String(k.getUTCMonth() + 1).padStart(2, '0')
        const dd = String(k.getUTCDate()).padStart(2, '0')
        const HH = String(k.getUTCHours()).padStart(2, '0')
        const MM = String(k.getUTCMinutes()).padStart(2, '0')
        const SS = String(k.getUTCSeconds()).padStart(2, '0')
        const mmm = String(k.getUTCMilliseconds()).padStart(3, '0')
        return `${yyyy}-${mm}-${dd} ${HH}:${MM}:${SS}.${mmm} KST`
      }

      const SHOW_KST_PREFIX = true

      // glog/ROS 혼합 로그 레벨 감지
      const detectLevelExt = (text) => {
        const base = detectLevel(text)
        if (base) return base
        const s = String(text || '')
        if (/^\s*WARNING:/.test(s)) return 'WARN'
        if (/^\s*ERROR:/.test(s)) return 'ERROR'
        if (/^\s*DEBUG:/.test(s)) return 'DEBUG'
        const m = s.match(/^\s*([IWEFD])\d{8}\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?/)
        if (m) {
          const c = m[1]
          if (c === 'I') return 'INFO'
          if (c === 'W') return 'WARN'
          if (c === 'E') return 'ERROR'
          if (c === 'F') return 'FATAL'
          if (c === 'D') return 'DEBUG'
        }
        return 'INFO'
      }

      // 라인에서 epoch(ms) 추출
      const extractEpochMsFromLine = (text) => {
        const s = String(text || '')
        // (A) [1651167756.118140838]
        const all = s.match(/\[(\d{9,10}(?:\.\d{1,9})?)\]/g)
        if (all && all.length) {
          const last = all[all.length - 1].replace(/[\[\]]/g, '')
          const sec = parseFloat(last)
          if (Number.isFinite(sec)) return Math.round(sec * 1000)
        }
        // (B) glog: ^[IWEFD]YYYYMMDD HH:MM:SS(.us)
        const g = s.match(/^\s*[IWEFD](\d{4})(\d{2})(\d{2})\s+(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?/)
        if (g) {
          const [, Y, Mo, D, hh, mm, ss, fracRaw] = g
          const ms = Math.floor((fracRaw || '').padEnd(3, '0').slice(0, 3))
          return toEpochMsKST(Y, Mo, D, hh, mm, ss, ms)
        }
        return Number.NaN
      }

      // 정규화된 라인(레벨/타임스탬프 포함) append + 검색 인덱스 업데이트
      // items: [{ text, level, tMs }]
      const appendNormalizedBatch = (items) => {
        if (!Array.isArray(items) || items.length === 0) return

        const normalized = items.map((it) => {
          const textRaw = String(it?.text ?? '')
          const level = it?.level || 'INFO'
          const tMs = Number(it?.tMs)
          const prefix = SHOW_KST_PREFIX ? `[${formatKst(tMs)}] ` : ''
          const text = prefix + textRaw
          const ts = logSeqRef.current++
          const base = t0EpochMsRef.current
          const pbMs = base && Number.isFinite(tMs) ? tMs - base : null
          return { ts, level, text, pbMs }
        })

        const nextTexts = normalized.map((n) => n.text)
        setLogLines((prev) => {
          const merged = prev.concat(nextTexts)
          return clipTail(merged, MAX_LOG_LINES_IN_MEMORY)
        })

        // ✅ 로딩 중에도 인덱싱(add)은 수행
        try {
          searchAdd?.(normalized)
        } catch (e) {
          console.warn('[searchAdd] failed:', e)
        }
      }

      // ──────────────────────────────────────────────────────────────
      const tryIngestTarLogsIfAvailable = async () => {
        // 필요 시 사전 로드 마저 수행
        dbg('TAR INGEST START')
        if (!tarGzBytesRef.current) {
          try {
            await prefetchTarGzForSelected(selected, logOptions, 'tar-fallback')
          } catch (e) {
            console.warn('[STEP2] prefetchTarGzForSelected failed:', e)
          }
        }
        const gz = tarGzBytesRef.current
        const meta = tarGzMetaRef.current
        if (!gz || !gz.length) {
          console.log('[STEP2] tar.gz not available')
          return false
        }

        try {
          // 1) gunzip → tar bytes
          const tarBytes = await gunzipToUint8Array(gz)
          if (!tarBytes || !tarBytes.length) {
            console.warn('[STEP2] gunzip result empty')
            return false
          }
          // 2) tar entries
          const entries = parseTarEntries(tarBytes)
          if (!entries.length) {
            console.warn('[STEP2] no tar entries')
            return false
          }

          // 진단 출력(시스템 라인) — 오너 선점 없이도 안전
          const asChar = (tf) => (tf ? String.fromCharCode(tf) : '0')
          console.log(
            '[STEP2] tar entries:',
            entries.map((e) => ({ name: e.name, size: e.size, typeflag: e.typeflag, tf: asChar(e.typeflag) }))
          )
          appendSysLine(`[TAR] ${meta?.label || 'tar.gz'} entries = ${entries.length}`)
          const LIST_LIMIT = 100
          const listPreview = entries.slice(0, LIST_LIMIT).map((e, i) => `${i + 1}. ${e.name} (${e.size} bytes)`)
          appendLines(listPreview)
          if (entries.length > LIST_LIMIT) appendSysLine(`[TAR] ...and ${entries.length - LIST_LIMIT} more`)

          // 3) 텍스트 로그 후보만 선택
          const textEntries = filterTextEntries(entries)
          if (!textEntries.length) {
            console.warn('[STEP2] no text-like entries → fallback to rosout')
            appendSysLine('[TAR] no text-like entries (check extensions or binary heuristic)')
            return false
          }

          console.log(`[STEP2] ingest text logs from tar: ${textEntries.length} files`)
          appendSysLine(`[TAR] ingest text entries = ${textEntries.length}`)

          // 4) 파일 단위/청크 단위로 "즉시/점진" append (전역 정렬 대기 제거)
          const EMIT_EVERY_LINES = 500 // 한 번에 내보낼 최소 라인 수 임계치
          const EMIT_EVERY_MS = 16 // 또는 마지막 방출 후 경과 시간(ms)
          const MINI_SORT_IN_CHUNK = true // 방출 직전 청크 내부 경량 정렬
          let lastTs = Number.NaN
          let emitBuf = []
          let lastEmitAt = Date.now()

          for (const ent of textEntries) {
            const text = decodeUtf8(ent.bytes)
            const lines = splitLines(text)
            let withTs = 0
            for (const line of lines) {
              const level = detectLevelExt(line)
              let tMs = extractEpochMsFromLine(line)
              if (Number.isFinite(tMs)) {
                withTs++
                lastTs = tMs
              } else if (Number.isFinite(lastTs)) {
                // 타임스탬프 없는 라인은 직전 시각
                tMs = lastTs
              }

              emitBuf.push({ text: line, level, tMs })

              // 일정 분량/시간마다 즉시 방출
              const now = Date.now()
              const sortByTms = (arr) => {
                arr.sort((a, b) => {
                  const ta = Number.isFinite(a.tMs) ? a.tMs : Number.POSITIVE_INFINITY
                  const tb = Number.isFinite(b.tMs) ? b.tMs : Number.POSITIVE_INFINITY
                  return ta - tb
                })
              }

              if (emitBuf.length >= EMIT_EVERY_LINES || now - lastEmitAt >= EMIT_EVERY_MS) {
                // 첫 append 직전 오너 선점 (First-Writer-Wins)
                if (MINI_SORT_IN_CHUNK) {
                  sortByTms(emitBuf)
                }
                appendNormalizedBatch(emitBuf)
                emitBuf = []
                lastEmitAt = now
                // 대용량 대응: 이벤트 루프 양보
                // eslint-disable-next-line no-await-in-loop
              }
            }
            appendSysLine(`[TAR] read ${ent.name} (lines=${lines.length}, withTs=${withTs})`)
            // 대용량 대응: 이벤트 루프 양보
            // eslint-disable-next-line no-await-in-loop
            await new Promise((r) => setTimeout(r, 0))
          }
          // 남은 버퍼 최종 방출(있다면)
          if (emitBuf.length) {
            if (MINI_SORT_IN_CHUNK) {
              emitBuf.sort((a, b) => {
                const ta = Number.isFinite(a.tMs) ? a.tMs : Number.POSITIVE_INFINITY
                const tb = Number.isFinite(b.tMs) ? b.tMs : Number.POSITIVE_INFINITY
                return ta - tb
              })
            }
            appendNormalizedBatch(emitBuf)
          }
          setHasAnyTarLogs(true) //tar 로그가 실제로 존재함
          dbg('TAR INGEST END', { ok: true })
          return true
        } catch (e) {
          console.warn('[STEP2] tar ingestion failed → fallback to rosout', e)
          appendSysLine(`[TAR] ingestion failed → fallback to rosout: ${e?.message || e}`)
          dbg('TAR INGEST END', { ok: false })
          return false
        }
      }

      // ──────────────────────────────────────────────────────────────
      // ✅ 1-pass scan: readMessages()를 단 1회만 수행
      // ──────────────────────────────────────────────────────────────
      await scanReplayAllOnceFromMcapUrl(downloadUrl, {
        // candidates: TOPICS 기반
        poseCandidates: [TOPICS.trackedpose, '/odom', '/lio_odom', '/aslam_pose'],
        pathCandidates: [TOPICS.path, '/plan', '/transformed_global_plan', '/planned_path', '/path'],
        lidarCandidates: [TOPICS.lidar, '/scan', '/laser_scan', '/laser'],
        costmapCandidates: [TOPICS.localCostmap, '/local_costmap/costmap', '/debug/dwa_local_costmap', '/costmap'],
        goalCandidates: ['/debug/dwa_goal', '/goal_pose', '/goal', '/move_base_simple/goal'],
        rosoutCandidates: ['/rosout'],
        gridCandidates: [TOPICS.grid, '/map', '/carto_service/occupancygrid'],

        // perf knobs
        poseDownsample: 3,
        poseTimeDownsampleMs: 80,
        lidarTimeDownsampleMs: 80,
        lidarPointDownsample: 2,
        lidarClampToRange: true,
        costmapTimeDownsampleMs: 80,
        costmapTimeSource: 'logTime',
        goalTimeDownsampleMs: 0,
        goalTimeSource: 'logTime',
        logMaxLines: SEARCH_LIMIT,
        logBatchSize: 80,

        // callbacks
        onPoseBatch: (arr) => {
          if (!Array.isArray(arr) || arr.length === 0) return
          pushBatchNormalized(arr)
        },
        onGridOnce: (grid) => {
          if (grid) setGridData?.(grid)
          renderNow?.()
          gridDoneRef.current.v = true
          maybeSetReady()
        },
        onPathBatch: (arr) => {
          if (!Array.isArray(arr) || arr.length === 0) return
          const norm = []
          for (const r of arr) {
            const x = Number(r?.x),
              y = Number(r?.y)
            if (!Number.isFinite(x) || !Number.isFinite(y)) continue
            const tSec = Number.isFinite(r?.tSec) ? Number(r.tSec) : undefined
            norm.push({ x, y, tSec })
          }
          if (norm.length) {
            setPlannedPathPoints?.((prev) => (prev ? prev.concat(norm) : norm))
            renderNow?.()
          }
        },
        onLidarBatch: (arr) => {
          if (!Array.isArray(arr) || arr.length === 0) return
          setLidarScans?.((prev) => (prev ? prev.concat(arr) : arr))
          renderNow?.()
        },
        onCostmapBatch: (arrRaw) => {
          if (!Array.isArray(arrRaw) || arrRaw.length === 0) return

          const t0 = t0RawRef.current
          const out = []

          for (const item of arrRaw) {
            const grid = item?.grid
            const tAbs = readGridAbsSec(grid, item?.tSec)
            if (!Number.isFinite(tAbs)) continue

            if (t0 == null) {
              pendingLocalCostmapAbsRef.current.push({ tAbsSec: tAbs, grid })
              continue
            }

            let rel = tAbs - Number(t0)
            if (!Number.isFinite(rel)) rel = 0
            if (!(rel > (tLastCostmapRelRef.current ?? -Infinity))) {
              rel = (tLastCostmapRelRef.current ?? -Infinity) + EPS_TRAW
            }
            tLastCostmapRelRef.current = rel
            out.push({ tSec: rel, grid })
          }

          flushPendingLocalCostmaps()

          if (out.length) {
            setLocalCostmapFrames?.((prev) => (prev && prev.length ? prev.concat(out) : out))
            renderNow?.()
            // 대표 1장 세팅(원하던 동작 유지)
            const first = out.find(Boolean)
            if (first?.grid) setLocalCostmapData?.(first.grid)
          }
        },
        onGoalBatch: (arrRaw) => {
          if (!Array.isArray(arrRaw) || arrRaw.length === 0) return
          const t0 = t0RawRef.current
          const mapped = arrRaw.map(({ tSec, x, y, z, yaw, frame_id }) => {
            let rel = tSec
            if (t0 != null && Number.isFinite(t0)) {
              rel = Number(tSec) - Number(t0)
              if (!Number.isFinite(rel)) rel = 0
            }
            return { tSec: rel, x, y, z, yaw, frame_id }
          })
          setDwaGoals?.((prev) => (prev && prev.length ? prev.concat(mapped) : mapped))
          renderNow?.()
        },
        onLogBatch: (lines) => {
          if (!Array.isArray(lines) || lines.length === 0) return
          rosoutFound = true
          setHasAnyTarLogs(true) // 로그 소스 존재
          appendLines(lines)
        }
      })

      // rosout 없으면 tar.gz fallback 유지
      if (!rosoutFound) {
        appendSysLine('[ROSOUT] not found → fallback to tar.gz')
        await tryIngestTarLogsIfAvailable()
      }
      setIsLoadingLogs(false)

      // scan 완료 후: 버퍼/상태 마무리
      updateBuffer?.(1.0)
      // posesDoneRef/gridDoneRef는 각 콜백에서 갱신됨
      maybeSetReady()
    } catch (err) {
      console.error('[handleViewLog] failed:', err)
      setLogError(err?.message || String(err))
      _setLoadPhase('error')
    } finally {
    }
  }, [
    selectedLogId,
    logOptions,
    getPresignedUrl,
    setPathPoints,
    setGridData,
    setLocalCostmapData,
    setLocalCostmapFrames,
    setPlannedPathPoints,
    setLidarScans,
    setDwaGoals,
    setT0EpochMs,
    resetView,
    renderNow,
    updateBuffer
  ])

  const formatDate = useCallback(function (yyyyMMdd) {
    if (!yyyyMMdd) return ''
    const [y, m, d] = yyyyMMdd.split('-')
    return `${y}.${m}.${d}`
  }, [])

  return {
    // 서버/옵션
    logOptions,
    selectedDate,
    selectedLogId,
    onDateChange,
    onLogChange,
    handleFetchListClick,
    handleVisibleRangeChange,
    allowedDateKeys,

    // 검색/로그
    logLines,
    filteredLines,
    isLoadingLogs,
    hasAnyTarLogs,
    isLoadingTar,
    tarError,
    logError,
    levelFilter,
    setLevelFilter,
    pendingKeyword,
    setPendingKeyword,
    appliedKeyword,
    handleKeywordSearchClick,

    // 다운로드/외부 오픈
    isPreparingDownload,
    handleDownloadLog,
    handleOpenLichtblick,

    // 오버레이
    loadPhase,
    rightOverlayVisible,
    rightOverlayText,

    // 유틸
    formatDate,

    // 조회
    handleViewLog,
    queryWindow
  }
}
