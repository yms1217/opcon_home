import { useState } from 'react'
import styled from 'styled-components'
import { useParams, useNavigate } from 'react-router-dom'
import FilterBar from '../components/common/FilterBar'
import EpisodeCandidateList from '../components/tms/EpisodeCandidateList'
import EpisodeReviewPanel from '../components/tms/EpisodeReviewPanel'
import { useEpisodeCandidates } from '../hooks/useEpisodeCandidates'
import { createDataset, uploadToDataset } from '../services/forgeApi'

const Page = styled.div`
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: calc(100vh - 80px);
`

const PageHeader = styled.div``

const PageTitle = styled.h1`
  margin: 0 0 4px 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--color-secondary-90, #262f44);
`

const PageMeta = styled.p`
  margin: 0;
  font-size: 13px;
  color: var(--color-secondary-50, #848c9d);
`

const SplitLayout = styled.div`
  display: grid;
  grid-template-columns: 340px 1fr;
  gap: 16px;
  flex: 1;
  min-height: 0;
`

const ListPane = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: hidden;
`

const ListTitle = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: var(--color-secondary-50, #848c9d);
  text-transform: uppercase;
  letter-spacing: 0.5px;
`

const SummaryBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  background: var(--color-neutral-10, #fff);
  border: 1px solid var(--color-secondary-20, #dadde2);
  border-radius: 10px;
  flex-wrap: wrap;
  gap: 12px;
`

const SummaryStats = styled.div`
  display: flex;
  gap: 20px;
`

const StatItem = styled.div`
  font-size: 13px;
  color: var(--color-secondary-50, #848c9d);

  span {
    font-weight: 700;
    color: ${({ $color }) => $color || 'var(--color-secondary-90, #262f44)'};
    margin-left: 4px;
  }
`

const SendBtn = styled.button`
  padding: 10px 20px;
  background: #4A90D9;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;

  &:hover {
    background: #3a7bc8;
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`

const FILTER_DEFS = [
  {
    key: 'step',
    label: 'Step',
    type: 'select',
    options: Array.from({ length: 5 }, (_, i) => ({ value: `Step ${i + 1}`, label: `Step ${i + 1}` })),
  },
  {
    key: 'status',
    label: '상태',
    type: 'select',
    options: [
      { value: 'success', label: '성공' },
      { value: 'failed', label: '실패' },
      { value: 'retry', label: '재시도' },
    ],
  },
  { key: 'hasIntervention', label: 'Intervention', type: 'checkbox', checkLabel: 'Intervention 있음' },
]

export default function TmsEpisodeCandidatePage() {
  const { executionId } = useParams()
  const navigate = useNavigate()
  const { candidates, loading, reviewMap, updateReview, summary } = useEpisodeCandidates(executionId)
  const [selected, setSelected] = useState(null)
  const [filters, setFilters] = useState({})
  const [sending, setSending] = useState(false)

  const handleFilterChange = (key, value) => {
    setFilters((f) => ({ ...f, [key]: value || undefined }))
  }

  const handleSendToForge = async () => {
    const accepted = candidates.filter((ep) => reviewMap[ep.id] === 'accepted')
    if (accepted.length === 0) return

    setSending(true)
    try {
      const dataset = await createDataset({ name: `TMS-${executionId}`, episodeIds: accepted.map((e) => e.id) })
      await uploadToDataset(dataset.id, [])
      alert(`Forge Dataset 생성 완료: ${dataset.id}`)
      navigate('/learning/')
    } catch (e) {
      alert('전송 실패: ' + e.message)
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return <Page><div style={{ color: 'var(--color-secondary-50, #848c9d)' }}>로딩 중...</div></Page>
  }

  return (
    <Page>
      <PageHeader>
        <PageTitle>Episode 후보 검토</PageTitle>
        <PageMeta>실행 ID: {executionId}</PageMeta>
      </PageHeader>

      <FilterBar filters={FILTER_DEFS} values={filters} onChange={handleFilterChange} />

      <SplitLayout>
        <ListPane>
          <ListTitle>Episode 목록 ({candidates.length})</ListTitle>
          <EpisodeCandidateList
            episodes={candidates}
            reviewMap={reviewMap}
            selectedId={selected?.id}
            onSelect={setSelected}
            filters={filters}
          />
        </ListPane>

        <EpisodeReviewPanel
          episode={selected}
          reviewStatus={selected ? reviewMap[selected.id] : null}
          onReview={updateReview}
        />
      </SplitLayout>

      <SummaryBar>
        <SummaryStats>
          <StatItem $color="#51CF66">채택:<span>{summary.accepted}</span></StatItem>
          <StatItem $color="#FCC419">보류:<span>{summary.pending}</span></StatItem>
          <StatItem $color="#FF6B6B">제외:<span>{summary.rejected}</span></StatItem>
          <StatItem>총:<span>{summary.total}</span></StatItem>
        </SummaryStats>
        <SendBtn
          disabled={summary.accepted === 0 || sending}
          onClick={handleSendToForge}
        >
          {sending ? '전송 중...' : `Forge로 Dataset 전송 (${summary.accepted}개)`}
        </SendBtn>
      </SummaryBar>
    </Page>
  )
}
