// ReplayControls/hooks/useReplayControlsLogic.js
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fileApis } from '@/apis'
import { toUtcFromLocalDateTime } from '@/utils/dateUtils'
import { loadMcapTopicsAndSamplesFromArrayBuffer } from '../mcap/replayMcapTopicLoader'
const lichtblickURL = import.meta.env.VITE_LICHTBLICK_BASE_URL

const EMPTY_OPTION = { id: '__empty__', label: '파일 없음' }
const DIAG_TOPIC = '/hmc_ros2_control/diagnostic'

// Content-Disposition 에서 파일명 추출 (LogReplay 패턴과 동일 계열)
function extractFilenameFromContentDisposition(cd) {
  try {
    const starMatch = cd.match(/filename\*\s*=\s*([^']*)''([^;]+)/i)
    if (starMatch && starMatch[2]) return decodeURIComponent(starMatch[2])
    const match = cd.match(/filename\s*=\s*("?)([^";]+)\1/i)
    if (match && match[2]) return match[2]
  } catch {}
  return null
}

function triggerAnchorDownload(href, fileName, openInNewTab = false) {
  const a = document.createElement('a')
  a.style.display = 'none'
  a.href = href
  if (fileName) a.download = fileName
  a.rel = 'noopener'
  if (openInNewTab) a.target = '_blank'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/**
 * ReplayControls 전반 로직 훅
 * - 날짜/파일목록/선택/조회/다운로드 등 "ReplayControls"에서 쓸 기능을 계속 흡수할 수 있도록 구성
 */
export default function useReplayControlsLogic({ deviceId } = {}) {
  // ─────────────────────────────────────────────
  // 상태
  const todayStr = new Date().toISOString().slice(0, 10)
  const [selectedDate, setSelectedDate] = useState(todayStr)

  // 드랍다운 옵션 / 선택값
  const [logOptions, setLogOptions] = useState([EMPTY_OPTION])
  const [selectedLogId, setSelectedLogId] = useState(EMPTY_OPTION.id)

  // 로딩/에러
  const [isLoadingList, setIsLoadingList] = useState(false)
  const [listError, setListError] = useState(null)

  const [isReadingFile, setIsReadingFile] = useState(false)
  const [readError, setReadError] = useState(null)

  const [isPreparingDownload, setIsPreparingDownload] = useState(false)

  // 캘린더 가용 날짜 (yyyy-MM-dd 배열)
  const [allowedDateKeys, setAllowedDateKeys] = useState(null)

  // ✅ MCAP 결과 화면 구성용(토픽/샘플)
  const [mcapTopics, setMcapTopics] = useState([])
  const [mcapTopicStats, setMcapTopicStats] = useState(null)
  const [mcapTopicSamples, setMcapTopicSamples] = useState(null) // { [topic]: [obj,...] }
  const [isParsingMcap, setIsParsingMcap] = useState(false)
  const [mcapParseError, setMcapParseError] = useState(null)

  // “읽기” 결과 저장 (추가 동작은 이후)
  const selectedFileBytesRef = useRef(null) // ArrayBuffer
  const selectedFileMetaRef = useRef(null) // { id,label,createdAt,size,url }

  // 요청 가드(연속 클릭/언마운트 대비) — LogReplay에서 쓰던 방식과 동일 계열
  const requestGuardRef = useRef({ token: 0, cancelled: false })
  const [mcapTimeRange, setMcapTimeRange] = useState(null)

  // ✅ System/Event Log 실데이터: diagnostic 토픽 샘플을 UI용 이벤트로 변환
  // loader 샘플 스키마: { tSec, msg }
  const diagnosticEvents = useMemo(() => {
    const arr = mcapTopicSamples?.[DIAG_TOPIC] || []
    const out = []

    for (const s of arr) {
      const tSec = s?.tSec ?? s?.t
      const msg = s?.msg ?? s?.raw ?? null
      if (!Number.isFinite(tSec) || !msg) continue

      // diagnostic_msgs/msg/DiagnosticArray 케이스(status[])
      if (Array.isArray(msg.status)) {
        for (const st of msg.status) {
          // ✅ ERROR만: DiagnosticStatus.level 2 = ERROR
          if (st?.level !== 2) continue

          out.push({
            tSec,
            level: st?.level,
            source: st?.hardware_id || st?.name || '-',
            message: st?.message || '',
            raw: st
          })
        }
        continue
      }

      // diagnostic_msgs/msg/DiagnosticStatus 케이스(level/name/message/hardware_id)
      if (msg?.level !== 2) continue
      out.push({
        tSec,
        level: msg?.level,
        source: msg?.hardware_id || msg?.name || '-',
        message: msg?.message || '',
        raw: msg
      })
    }

    out.sort((a, b) => (a.tSec ?? 0) - (b.tSec ?? 0))
    return out
  }, [mcapTopicSamples])

  // presigned URL 캐시 — LogReplay에서 쓰던 방식과 동일 계열
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
    } catch {
      // URL 파싱 실패 → 캐시 스킵
    }
    return url
  }, [])

  // ─────────────────────────────────────────────
  // 입력 핸들러(컨트롤러)
  const onDateChange = useCallback((dateStr) => {
    setSelectedDate(dateStr)
  }, [])

  const onLogChange = useCallback((value) => {
    setSelectedLogId(value)
  }, [])

  // ─────────────────────────────────────────────
  // (1)(2) 파일 목록 조회 (첫번째 조회 버튼 + 페이지 로드시 자동)
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

  // (1) 페이지 로드시 오늘 날짜로 자동 조회 (mount 1회)
  useEffect(() => {
    handleFetchListClick()
  }, [])

  // [핵심] 첫 진입 시, Calendar가 자동 호출해주지 않으니 우리가 직접 1회 호출
  useEffect(() => {
    const { startDate, endDate } = computeVisibleRangeForMonth(selectedDate)
    handleVisibleRangeChange({ startDate, endDate })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
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

        console.log('dsa : dates: ', dates)
        setAllowedDateKeys(dates)
      } catch (e) {
        console.error('[get available dates] failed:', e)
        setAllowedDateKeys([])
      }
    },
    [deviceId]
  )

  // ─────────────────────────────────────────────
  // (3) 두번째 조회: 선택된 파일 "읽기" (지금은 bytes만 읽어서 ref에 저장)
  const handleViewSelectedFile = useCallback(async () => {
    if (!selectedLogId || selectedLogId === EMPTY_OPTION.id) return null
    const selected = logOptions.find((l) => l.id === selectedLogId)
    if (!selected) return null

    // 새 파일 읽기 시작할 때 이전 결과 초기화(UX)
    setIsReadingFile(true)
    setReadError(null)

    setIsParsingMcap(true)
    setMcapParseError(null)
    setMcapTopics([])
    setMcapTopicStats(null)
    setMcapTopicSamples(null)

    try {
      const url = await getPresignedUrl(selectedLogId)
      if (!url) throw new Error('다운로드 URL이 설정되지 않았습니다.')

      const resp = await fetch(url, { mode: 'cors' })
      if (!resp.ok) throw new Error(`파일 읽기 실패: HTTP ${resp.status}`)
      const buf = await resp.arrayBuffer()

      selectedFileBytesRef.current = buf
      selectedFileMetaRef.current = { ...selected, url }

      // ✅ 토픽 + 샘플 raw 메시지(/joint_states) 읽기 + 콘솔 검증 로그
      const { topics, stats, samples, timeRange } = await loadMcapTopicsAndSamplesFromArrayBuffer(buf, {
        // ✅ System/Performance 실데이터 전환을 위한 샘플 토픽 확장
        sampleTopics: [
          '/joint_states',
          '/hmc_ros2_control/diagnostic',
          '/hmc_ros2_control/actuator_states',
          '/tracking_controller/joint'
          // 필요 시(다음 단계): '/tf', '/tf_static'
        ],
        samplePerTopic: 300, // ✅ 최소 120~300 추천(차트/분석용)
        maxScanMessages: 300000,
        debug: true
      })

      setMcapTopics(topics || [])
      setMcapTopicStats(stats || null)
      setMcapTopicSamples(samples || null)
      setMcapTimeRange(timeRange || null)

      console.log('joint_states samples len =', samples['/joint_states']?.length)
      console.log('diagnostic samples len =', samples['/hmc_ros2_control/diagnostic']?.length)
      console.log('actuator_states samples len =', samples['/hmc_ros2_control/actuator_states']?.length)
      console.log('tracking_controller samples len =', samples['/tracking_controller/joint']?.length)

      return { meta: selectedFileMetaRef.current, bytes: buf }
    } catch (e) {
      setReadError(e)
      setMcapParseError(e)
      console.warn('[ReplayControls] handleViewSelectedFile failed:', e?.message || String(e))
      return null
    } finally {
      setIsReadingFile(false)
      setIsParsingMcap(false)
    }
  }, [selectedLogId, logOptions, getPresignedUrl])
  
  // Lichtblick
  const handleOpenLichtblick = useCallback(async () => {
    if (!selectedLogId || selectedLogId === EMPTY_OPTION.id) return;

    const selected = logOptions.find((l) => l.id === selectedLogId);
    if (!selected) return;

    const downloadUrl = await getPresignedUrl(selectedLogId);
    if (!downloadUrl) {
      alert("Logfile URL not found");
      return;
    }
    const ds = "remote-file";
    const u = new URL(lichtblickURL);
    u.search = "";
    u.searchParams.set("ds", ds);
    u.searchParams.set("ds.url", downloadUrl);
    u.searchParams.set("embed", "true")
    u.searchParams.set("ui", "minimal")
    const href = u.toString();
    const popup = window.open(href, "_blank", "noopener,noreferrer");
    if (popup) popup.opener = null;
  }, [selectedLogId, logOptions, getPresignedUrl]);

  // ─────────────────────────────────────────────
  // (4) 다운로드 버튼: 선택 파일 다운로드
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

    const fallbackFileName = selected?.label?.replace(/\s+/g, '_') || `${selected?.id || 'file'}`

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
            suggestedName: finalFileName
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

  // 언마운트 시 후속 setState 차단
  useEffect(() => {
    return () => {
      requestGuardRef.current.cancelled = true
    }
  }, [])

  // ─────────────────────────────────────────────
  // 반환 (확장 고려해서 state/actions + 필요한 핸들러도 직접 노출)
  return useMemo(
    () => ({
      // state
      selectedDate,
      logOptions,
      selectedLogId,
      isLoadingList,
      listError,
      isReadingFile,
      readError,
      isPreparingDownload,
      mcapTopics,
      mcapTopicStats,
      mcapTopicSamples,
      mcapTimeRange,
      isParsingMcap,
      mcapParseError,
      diagnosticEvents, // ✅ 추가: index.jsx에서 받도록

      // actions/handlers
      setSelectedDate,
      setSelectedLogId,
      onDateChange,
      onLogChange,
      handleFetchListClick, // 첫번째 조회(날짜) + 자동조회
      handleViewSelectedFile, // 두번째 조회(파일 읽기)
      handleDownloadLog, // 다운로드
      handleOpenLichtblick,
      handleVisibleRangeChange,
      allowedDateKeys,
      // (추후 확장용) 읽어온 파일 접근
      selectedFileBytesRef,
      selectedFileMetaRef,

      // constants
      EMPTY_OPTION
    }),
    [
      selectedDate,
      logOptions,
      selectedLogId,
      isLoadingList,
      listError,
      isReadingFile,
      readError,
      isPreparingDownload,
      mcapTopics,
      mcapTopicStats,
      mcapTopicSamples,
      mcapTimeRange,
      isParsingMcap,
      mcapParseError,
      diagnosticEvents,
      onDateChange,
      onLogChange,
      handleFetchListClick,
      handleViewSelectedFile,
      handleDownloadLog,
      handleOpenLichtblick,
      handleVisibleRangeChange,
      allowedDateKeys
    ]
  )
}
