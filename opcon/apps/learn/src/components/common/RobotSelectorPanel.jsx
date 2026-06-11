import { useState, useMemo, useEffect } from 'react'
import styled from 'styled-components'
import { getDevices } from '../../services/dmApi'

const UNAVAILABLE_STATUSES = new Set(['OFFLINE', 'POWEROFF'])

/* ─── Status config (apps/robot robotUtils.js 기준) ─── */

const STATUS_MAP = {
  OPERATION: { color: '#2563eb', bg: '#dbeafe', label: '운영 중' },
  STANDBY:   { color: '#7c3aed', bg: '#f5f3ff', label: '대기' },
  CHARGE:    { color: '#059669', bg: '#d1fae5', label: '충전' },
  ERROR:     { color: '#dc2626', bg: '#fee2e2', label: '오류' },
  OFFLINE:   { color: '#d97706', bg: '#fef3c7', label: '오프라인' },
  POWEROFF:  { color: '#374151', bg: '#e5e7eb', label: '전원 꺼짐' },
}

const STATUS_FILTER_TABS = [
  { key: 'all',       label: '전체' },
  { key: 'STANDBY',   label: '대기' },
  { key: 'OPERATION', label: '운영 중' },
  { key: 'CHARGE',    label: '충전' },
  { key: 'ERROR',     label: '오류' },
]

function getStatusConfig(status) {
  if (!status) return { color: '#94a3b8', bg: '#f1f5f9', label: '알 수 없음' }
  return STATUS_MAP[status.toUpperCase()] || { color: '#94a3b8', bg: '#f1f5f9', label: status }
}

function matchesStatusFilter(deviceStatus, activeFilters) {
  if (activeFilters.includes('all')) return true
  return activeFilters.includes((deviceStatus || '').toUpperCase())
}

/* ─── Styled components ─── */

const Panel = styled.div`
  border: 1px solid var(--color-secondary-20, #dadde2);
  border-radius: 10px;
  background: var(--color-neutral-10, #fff);
  overflow: hidden;
`

const SearchRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--color-secondary-20, #dadde2);
`

const SearchIcon = styled.span`
  font-size: 14px;
  color: var(--color-secondary-50, #848c9d);
  flex-shrink: 0;
`

const SearchInput = styled.input`
  flex: 1;
  border: none;
  outline: none;
  font-size: 13px;
  color: var(--color-secondary-90, #262f44);
  background: transparent;

  &::placeholder {
    color: var(--color-secondary-50, #848c9d);
  }
`

const ClearBtn = styled.button`
  background: none;
  border: none;
  padding: 2px 6px;
  cursor: pointer;
  font-size: 14px;
  color: var(--color-secondary-50, #848c9d);
  border-radius: 4px;
  line-height: 1;

  &:hover {
    background: var(--color-secondary-20, #dadde2);
    color: var(--color-secondary-90, #262f44);
  }
`

const FilterRow = styled.div`
  display: flex;
  gap: 6px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--color-secondary-20, #dadde2);
  flex-wrap: wrap;
`

const FilterTab = styled.button`
  padding: 4px 12px;
  border-radius: 20px;
  border: 1px solid ${({ $active }) =>
    $active ? 'var(--color-primary-60, #2f929f)' : 'var(--color-secondary-20, #dadde2)'};
  background: ${({ $active }) =>
    $active ? 'rgba(47,146,159,0.1)' : 'transparent'};
  color: ${({ $active }) =>
    $active ? 'var(--color-primary-60, #2f929f)' : 'var(--color-secondary-50, #848c9d)'};
  font-size: 12px;
  font-weight: ${({ $active }) => ($active ? '600' : '400')};
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    border-color: var(--color-primary-60, #2f929f);
    color: var(--color-primary-60, #2f929f);
  }
`

const ListWrapper = styled.div`
  max-height: ${({ $maxHeight }) => $maxHeight || '260px'};
  overflow-y: auto;
`

const RobotRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  cursor: ${({ $disabled }) => ($disabled ? 'not-allowed' : 'pointer')};
  opacity: ${({ $disabled }) => ($disabled ? 0.45 : 1)};
  background: ${({ $selected, $disabled }) =>
    $disabled ? 'transparent' : $selected ? 'rgba(47,146,159,0.07)' : 'transparent'};
  border-left: 3px solid ${({ $selected, $disabled }) =>
    !$disabled && $selected ? 'var(--color-primary-60, #2f929f)' : 'transparent'};
  transition: background 0.12s;

  &:hover {
    background: ${({ $selected, $disabled }) =>
      $disabled ? 'transparent' : $selected ? 'rgba(47,146,159,0.1)' : 'var(--color-neutral-30, #f7f8fa)'};
  }

  & + & {
    border-top: 1px solid var(--color-secondary-20, #dadde2);
  }
`

const StatusDot = styled.span`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${({ $color }) => $color};
  flex-shrink: 0;
`

const RobotInfo = styled.div`
  flex: 1;
  min-width: 0;
`

const RobotName = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: var(--color-secondary-90, #262f44);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

const RobotMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 3px;
  flex-wrap: wrap;
`

const GroupBadge = styled.span`
  font-size: 11px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(47,146,159,0.1);
  color: var(--color-primary-60, #2f929f);
`

const SiteText = styled.span`
  font-size: 11px;
  color: var(--color-secondary-50, #848c9d);
`

const StatusBadge = styled.span`
  font-size: 11px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 4px;
  color: ${({ $color }) => $color};
  background: ${({ $bg }) => $bg};
`

const CheckMark = styled.span`
  font-size: 14px;
  color: var(--color-primary-60, #2f929f);
  flex-shrink: 0;
`

const Footer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  border-top: 1px solid var(--color-secondary-20, #dadde2);
  background: var(--color-neutral-30, #f7f8fa);
`

const FooterCount = styled.span`
  font-size: 12px;
  color: var(--color-secondary-50, #848c9d);

  strong {
    color: var(--color-primary-60, #2f929f);
    font-weight: 700;
  }
`

const ClearAllBtn = styled.button`
  background: none;
  border: none;
  padding: 2px 6px;
  cursor: pointer;
  font-size: 12px;
  color: var(--color-secondary-50, #848c9d);
  border-radius: 4px;

  &:hover {
    color: #ff6b6b;
    background: rgba(255,107,107,0.07);
  }
`

const EmptyRow = styled.div`
  padding: 28px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--color-secondary-50, #848c9d);
`

const LoadingRow = styled.div`
  padding: 28px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--color-secondary-50, #848c9d);
`

/* ─── Component ─── */

export default function RobotSelectorPanel({
  value,       // string (single) | string[] (multi)
  onChange,    // (id: string) => void | (ids: string[]) => void
  multi = false,
  maxHeight,
}) {
  const [robots, setRobots] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [statusFilters, setStatusFilters] = useState(['all'])

  const toggleStatusFilter = (key) => {
    setStatusFilters((prev) => {
      if (key === 'all') return ['all']
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev.filter((k) => k !== 'all'), key]
      return next.length === 0 ? ['all'] : next
    })
  }

  useEffect(() => {
    setLoading(true)
    getDevices()
      .then(setRobots)
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return robots.filter((r) => {
      const matchQuery =
        !q ||
        r.name?.toLowerCase().includes(q) ||
        r.group?.toLowerCase().includes(q) ||
        r.site?.toLowerCase().includes(q)
      const matchStatus = matchesStatusFilter(r.status, statusFilters)
      return matchQuery && matchStatus
    })
  }, [robots, query, statusFilters])

  const selectedIds = multi
    ? Array.isArray(value) ? value : []
    : value ? [value] : []

  const handleClick = (robot) => {
    if (UNAVAILABLE_STATUSES.has((robot.status || '').toUpperCase())) return
    const { id } = robot
    if (multi) {
      const next = selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id]
      onChange(next)
    } else {
      onChange(selectedIds[0] === id ? '' : id)
    }
  }

  const handleClearAll = () => {
    onChange(multi ? [] : '')
  }

  return (
    <Panel>
      {/* Search */}
      <SearchRow>
        <SearchIcon>🔍</SearchIcon>
        <SearchInput
          placeholder="로봇명, 그룹, 사이트 검색..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <ClearBtn onClick={() => setQuery('')} title="검색 초기화">✕</ClearBtn>
        )}
      </SearchRow>

      {/* Status filter */}
      <FilterRow>
        {STATUS_FILTER_TABS.map((tab) => (
          <FilterTab
            key={tab.key}
            $active={statusFilters.includes(tab.key)}
            onClick={() => toggleStatusFilter(tab.key)}
          >
            {tab.label}
          </FilterTab>
        ))}
      </FilterRow>

      {/* Robot list */}
      <ListWrapper $maxHeight={maxHeight}>
        {loading ? (
          <LoadingRow>로봇 목록을 불러오는 중...</LoadingRow>
        ) : filtered.length === 0 ? (
          <EmptyRow>
            {query || statusFilter !== 'all'
              ? '검색 결과가 없습니다'
              : '등록된 로봇이 없습니다'}
          </EmptyRow>
        ) : (
          filtered.map((robot) => {
            const unavailable = UNAVAILABLE_STATUSES.has((robot.status || '').toUpperCase())
            const selected = !unavailable && selectedIds.includes(robot.id)
            const sc = getStatusConfig(robot.status)
            return (
              <RobotRow
                key={robot.id}
                $selected={selected}
                $disabled={unavailable}
                onClick={() => handleClick(robot)}
              >
                <StatusDot $color={sc.color} title={sc.label} />
                <RobotInfo>
                  <RobotName>{robot.name}</RobotName>
                  <RobotMeta>
                    {robot.group && <GroupBadge>{robot.group}</GroupBadge>}
                    {robot.site && <SiteText>{robot.site}</SiteText>}
                    <StatusBadge $color={sc.color} $bg={sc.bg}>{sc.label}</StatusBadge>
                  </RobotMeta>
                </RobotInfo>
                {selected && <CheckMark>✓</CheckMark>}
              </RobotRow>
            )
          })
        )}
      </ListWrapper>

      {/* Footer (multi only) */}
      {multi && (
        <Footer>
          <FooterCount>
            <strong>{selectedIds.length}</strong>대 선택됨
            {robots.length > 0 && ` / 전체 ${robots.length}대`}
          </FooterCount>
          {selectedIds.length > 0 && (
            <ClearAllBtn onClick={handleClearAll}>선택 해제</ClearAllBtn>
          )}
        </Footer>
      )}
    </Panel>
  )
}
