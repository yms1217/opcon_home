import { useState, useCallback, useEffect } from 'react'
import { getActions } from '@/apis/ai/aiApis'
import EventTablePanel from './EventTablePanel'
import EventDetailPanel from './EventDetailPanel'
import useAiLogData from './hooks/useAiLogData'
import {
  EventPageLayout,
  EventTableArea,
  EventDetailArea,
  EventDetailSlideInner
} from './styles'
import {
  StyledPageContent,
  SectionRobot
} from '@repo/ui'

const EventManagement = () => {
  const {
    rows,
    isLoading,
    filters,
    pagination,
    functionOptions,
    updateFilter,
    updateDateRange,
    applyDatePreset,
    updatePage,
    updatePageSize,
    DATE_PRESET
  } = useAiLogData()

  const [selectedEventId, setSelectedEventId] = useState(null)
  const [actionOptions, setActionOptions] = useState([])

  useEffect(() => {
    let isMounted = true

    const loadActions = async () => {
      try {
        const response = await getActions()
        if (!isMounted) return

        const rows = Array.isArray(response?.data) ? response.data : []
        setActionOptions(rows)
      } catch {
        if (!isMounted) return
        setActionOptions([])
      }
    }

    loadActions()

    return () => {
      isMounted = false
    }
  }, [])

  const handleRowClick = useCallback((row) => {
    const nextEventId = row?.eventId ?? row?.id ?? null

    setSelectedEventId((prev) => {
      if (prev === nextEventId) {
        return null
      }
      return nextEventId
    })
  }, [])

  const handleCloseDetail = useCallback(() => {
    setSelectedEventId(null)
  }, [])

  const isDetailOpen = selectedEventId !== null

  return (
    <StyledPageContent className="column">
      <SectionRobot>
        <EventPageLayout $detailOpen={isDetailOpen}>
          <EventTableArea>
            <EventTablePanel
              rows={rows}
              isLoading={isLoading}
              filters={filters}
              functionOptions={functionOptions}
              onChangeFilter={updateFilter}
              onChangeDateRange={updateDateRange}
              onApplyDatePreset={applyDatePreset}
              datePresetMap={DATE_PRESET}
              pagination={pagination}
              onChangePage={updatePage}
              onChangePageSize={updatePageSize}
              onRowClick={handleRowClick}
              isDetailOpen={isDetailOpen}
              actionOptions={actionOptions}
            />
          </EventTableArea>

          <EventDetailArea $open={isDetailOpen}>
            <EventDetailSlideInner $open={isDetailOpen}>
              <EventDetailPanel
                eventId={selectedEventId}
                open={isDetailOpen}
                onClose={handleCloseDetail}
                actionOptions={actionOptions}
              />
            </EventDetailSlideInner>
          </EventDetailArea>
        </EventPageLayout>
      </SectionRobot>
    </StyledPageContent>
  )
}

export default EventManagement