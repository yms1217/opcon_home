export function toYmdHmKST(isoString) {
  const d = new Date(isoString)
  const fmt = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })

  const parts = fmt.formatToParts(d).reduce((acc, p) => {
    acc[p.type] = p.value
    return acc
  }, {})

  const yyyy = parts.year
  const MM = parts.month
  const dd = parts.day
  const HH = parts.hour
  const mm = parts.minute

  return `${yyyy}.${MM}.${dd} ${HH}:${mm}`
}

export function toUtcFromLocalDateTime(ymd, time = '00:00:00') {
  const date = new Date(`${ymd}T${time}`)
  return date.toISOString()
}

/**
 * ROS header.stamp {sec, nsec} → 'HH:MM:SS' (KST)
 */
export function rosStampToKstHms(stamp) {
  if (!stamp || typeof stamp.sec !== 'number') return '-'
  const ms = stamp.sec * 1000 + Math.floor((stamp.nsec || 0) / 1e6)
  return new Date(ms).toLocaleTimeString('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

/**
 * ROS stamp → 'HH:MM:SS.mmm' (KST)
 */
export function rosStampToKstHmsMs(stamp) {
  if (!stamp || typeof stamp.sec !== 'number') return '-'
  const msAll = stamp.sec * 1000 + Math.floor((stamp.nsec || 0) / 1e6)
  const d = new Date(msAll)

  const hms = d.toLocaleTimeString('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
  const ms = String(Math.floor((stamp.nsec || 0) / 1e6)).padStart(3, '0')
  return `${hms}.${ms}`
}
/**
 * 상대초(tSec) + {startSec} → 'HH:MM:SS' (KST)
 */
export function tSecToKstHms(tSec, timeRange) {
  if (typeof tSec !== 'number' || !timeRange?.startSec) return '-'
  const ms = (timeRange.startSec + tSec) * 1000
  return new Date(ms).toLocaleTimeString('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}
