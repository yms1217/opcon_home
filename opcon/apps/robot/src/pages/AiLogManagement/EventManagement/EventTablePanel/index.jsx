import { useCallback, useState } from 'react'
import styled from 'styled-components'
import { Table } from '@repo/ui'
import {
  SectionMaxWidth,
  CountText
} from './styles'
import { getEventTableColumns } from './components/EventTableColumns'
import EventFilterBar from './components/EventFilterBar'
import EventSummaryCards from './components/EventSummaryCards'

const ConfirmOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2200;
`

const ConfirmCard = styled.div`
  width: min(360px, calc(100vw - 48px));
  background: #ffffff;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.2);
  padding: 18px;
`

const ConfirmText = styled.div`
  font-size: 14px;
  color: #334155;
  line-height: 1.6;
`

const ConfirmActions = styled.div`
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
`

const ConfirmButton = styled.button`
  height: 36px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #334155;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
`

const ConfirmPrimaryButton = styled(ConfirmButton)`
  border-color: #2563eb;
  background: #2563eb;
  color: #ffffff;
`

const EventTablePanel = ({
  rows,
  isLoading,
  tCommon,
  filters,
  functionOptions,
  onChangeFilter,
  onChangeDateRange,
  onApplyDatePreset,
  datePresetMap,
  pagination,
  onChangePage,
  onChangePageSize,
  onRowClick,
  isDetailOpen,
  actionOptions,
  summary
}) => {
  const [pendingActionName, setPendingActionName] = useState('')

  const handleRowClicked = useCallback(
    (row) => {
      onRowClick?.(row)
    },
    [onRowClick]
  )

  const handleChangePage = useCallback(
    (page) => {
      if (page === pagination.page) return
      onChangePage(page)
    },
    [onChangePage, pagination.page]
  )

  const handleChangeRowsPerPage = useCallback(
    (currentRowsPerPage) => {
      if (currentRowsPerPage === pagination.pageSize) return
      onChangePageSize(currentRowsPerPage)
    },
    [onChangePageSize, pagination.pageSize]
  )

  const handleRecommendActionClick = useCallback((actionName) => {
    setPendingActionName(String(actionName || '').trim())
  }, [])

  const columns = getEventTableColumns(actionOptions, handleRecommendActionClick)

  return (
    <SectionMaxWidth>
      <EventFilterBar
        filters={filters}
        functionOptions={functionOptions}
        datePresetMap={datePresetMap}
        onChangeFilter={onChangeFilter}
        onChangeDateRange={onChangeDateRange}
        onApplyDatePreset={onApplyDatePreset}
        isDetailOpen={isDetailOpen}
      />

      <CountText>총 {pagination.totalCount}건</CountText>

      <EventSummaryCards
        rows={rows}
        totalCount={pagination.totalCount}
        summary={summary}
      />

      <Table
        columns={columns}
        data={rows}
        keyField="id"
        noData={typeof tCommon === 'function' ? tCommon('noData') : '데이터가 없습니다.'}
        isLoading={isLoading}
        pagination
        paginationServer
        paginationTotalRows={pagination.totalCount}
        paginationPerPage={pagination.pageSize}
        paginationDefaultPage={pagination.page}
        paginationRowsPerPageOptions={[10, 30, 50, 100]}
        onChangePage={handleChangePage}
        onChangeRowsPerPage={handleChangeRowsPerPage}
        highlightOnHover
        pointerOnHover
        onRowClicked={handleRowClicked}
      />

      {pendingActionName ? (
        <ConfirmOverlay onClick={() => setPendingActionName('')}>
          <ConfirmCard onClick={(e) => e.stopPropagation()}>
            <ConfirmText>{pendingActionName} 실행하시겠습니까?</ConfirmText>

            <ConfirmActions>
              <ConfirmButton type="button" onClick={() => setPendingActionName('')}>
                취소
              </ConfirmButton>
              <ConfirmPrimaryButton type="button" onClick={() => setPendingActionName('')}>
                확인
              </ConfirmPrimaryButton>
            </ConfirmActions>
          </ConfirmCard>
        </ConfirmOverlay>
      ) : null}
    </SectionMaxWidth>
  )
}

export default EventTablePanel