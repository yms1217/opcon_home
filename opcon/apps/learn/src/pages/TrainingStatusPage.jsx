import styled from 'styled-components'
import StatusBadge from '../components/common/StatusBadge'
import { useTrainingJobs } from '../hooks/useForgeApi'
import { openForge } from '../services/forgeApi'
import dayjs from 'dayjs'

const Page = styled.div`
  padding: 32px;
`

const PageTitle = styled.h1`
  margin: 0 0 8px 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--color-secondary-90, #262f44);
`

const PageSub = styled.p`
  margin: 0 0 28px 0;
  font-size: 14px;
  color: var(--color-secondary-50, #848c9d);
`

const HeaderRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
`

const RefreshBtn = styled.button`
  padding: 8px 16px;
  background: transparent;
  border: 1px solid var(--color-secondary-20, #dadde2);
  border-radius: 8px;
  color: var(--color-secondary-50, #848c9d);
  font-size: 13px;
  cursor: pointer;

  &:hover {
    border-color: #4A90D9;
    color: var(--color-secondary-90, #262f44);
  }
`

const JobList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`

const JobCard = styled.div`
  background: var(--color-neutral-10, #fff);
  border: 1px solid var(--color-secondary-20, #dadde2);
  border-radius: 12px;
  padding: 20px 24px;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 16px;
  align-items: start;
`

const JobLeft = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const JobName = styled.h3`
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--color-secondary-90, #262f44);
`

const JobMeta = styled.div`
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
`

const MetaItem = styled.div`
  font-size: 12px;
  color: var(--color-secondary-50, #848c9d);

  span {
    color: var(--color-secondary-70, #555e72);
    font-weight: 500;
    margin-left: 4px;
  }
`

const ProgressWrapper = styled.div`
  margin-top: 4px;
`

const ProgressBar = styled.div`
  height: 6px;
  border-radius: 3px;
  background: var(--color-secondary-20, #dadde2);
  overflow: hidden;
`

const ProgressFill = styled.div`
  height: 100%;
  border-radius: 3px;
  width: ${({ $value }) => $value}%;
  background: ${({ $status }) =>
    $status === 'completed' ? '#51CF66' :
    $status === 'failed' ? '#FF6B6B' : '#4A90D9'};
  transition: width 0.5s;
`

const ProgressLabel = styled.div`
  font-size: 11px;
  color: var(--color-secondary-50, #848c9d);
  margin-top: 4px;
  text-align: right;
`

const JobRight = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
`

const OpenForgeBtn = styled.button`
  padding: 8px 14px;
  background: transparent;
  border: 1px solid #4A90D9;
  border-radius: 8px;
  color: #4A90D9;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    background: rgba(74,144,217,0.1);
  }
`

const Empty = styled.div`
  padding: 60px;
  text-align: center;
  color: var(--color-secondary-50, #848c9d);
  font-size: 14px;
`

export default function TrainingStatusPage() {
  const { jobs, loading, refetch } = useTrainingJobs()

  const formatTime = (iso) => {
    if (!iso) return '—'
    return dayjs(iso).format('MM-DD HH:mm')
  }

  const calcElapsed = (start) => {
    if (!start) return '—'
    const diff = dayjs().diff(dayjs(start), 'minute')
    if (diff < 60) return `${diff}분`
    return `${Math.floor(diff / 60)}시간 ${diff % 60}분`
  }

  return (
    <Page>
      <PageTitle>학습 실행 현황</PageTitle>
      <PageSub>Forge에서 실행 중인 학습 Job의 상태를 확인합니다</PageSub>

      <HeaderRow>
        <div style={{ fontSize: 13, color: 'var(--color-secondary-50, #848c9d)' }}>
          활성 Job: {jobs.filter((j) => j.status === 'running').length}개
        </div>
        <RefreshBtn onClick={refetch} disabled={loading}>새로고침</RefreshBtn>
      </HeaderRow>

      {loading ? (
        <Empty>학습 Job 불러오는 중...</Empty>
      ) : jobs.length === 0 ? (
        <Empty>실행 중인 학습 Job이 없습니다</Empty>
      ) : (
        <JobList>
          {jobs.map((job) => (
            <JobCard key={job.id}>
              <JobLeft>
                <JobName>{job.name}</JobName>
                <JobMeta>
                  <MetaItem>모델:<span>{job.foundationModel}</span></MetaItem>
                  <MetaItem>Dataset:<span>{job.dataset}</span></MetaItem>
                  <MetaItem>시작:<span>{formatTime(job.startedAt)}</span></MetaItem>
                  {job.status === 'running' && (
                    <MetaItem>경과:<span>{calcElapsed(job.startedAt)}</span></MetaItem>
                  )}
                  {job.completedAt && (
                    <MetaItem>완료:<span>{formatTime(job.completedAt)}</span></MetaItem>
                  )}
                </JobMeta>
                {job.status === 'running' && (
                  <ProgressWrapper>
                    <ProgressBar>
                      <ProgressFill $value={job.progress} $status={job.status} />
                    </ProgressBar>
                    <ProgressLabel>{job.progress}%</ProgressLabel>
                  </ProgressWrapper>
                )}
              </JobLeft>

              <JobRight>
                <StatusBadge status={job.status} />
                <OpenForgeBtn onClick={() => openForge(`/training/${job.id}`)}>
                  Forge에서 보기 →
                </OpenForgeBtn>
              </JobRight>
            </JobCard>
          ))}
        </JobList>
      )}
    </Page>
  )
}
