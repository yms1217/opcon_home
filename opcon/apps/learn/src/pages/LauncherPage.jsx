import { useState, useEffect, useRef } from 'react'
import styled from 'styled-components'
import { useNavigate } from 'react-router-dom'
import SourceCard from '../components/launcher/SourceCard'
import { SOURCE_CARDS } from '../components/launcher/SourceCardGrid'
import { useDataReadiness } from '../hooks/useDataReadiness'
import { useLearning } from '../context/LearningContext'
import { getTaskflows } from '../services/tmsApi'
import { SOURCE_COLOR_MAP } from '../styles/theme'

/* ─── Layout ─── */

const Page = styled.div`
  padding: 32px;
  max-width: 1100px;
`

const Title = styled.h1`
  margin: 0 0 6px 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--color-secondary-90, #262f44);
`

const Subtitle = styled.p`
  margin: 0 0 32px 0;
  font-size: 14px;
  color: var(--color-secondary-50, #848c9d);
`

const SectionTitle = styled.h2`
  margin: 0 0 16px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-secondary-70, #555e72);
  display: flex;
  align-items: center;
  gap: 8px;

  &::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--color-secondary-20, #dadde2);
    margin-left: 8px;
  }
`

/* ─── Phase 1: Task selection ─── */

const TaskGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
  margin-bottom: 24px;
`

const TaskCard = styled.button`
  padding: 18px 20px;
  border-radius: 12px;
  border: 2px solid ${({ $selected }) =>
    $selected ? 'var(--color-primary-60, #2f929f)' : 'var(--color-secondary-20, #dadde2)'};
  background: ${({ $selected }) =>
    $selected ? 'rgba(47,146,159,0.08)' : 'var(--color-neutral-10, #fff)'};
  cursor: pointer;
  text-align: left;
  transition: all 0.15s;

  &:hover {
    border-color: var(--color-primary-60, #2f929f);
    background: rgba(47,146,159,0.05);
  }
`

const TaskName = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: ${({ $selected }) =>
    $selected ? 'var(--color-primary-60, #2f929f)' : 'var(--color-secondary-90, #262f44)'};
  margin-bottom: 4px;
`

const TaskMeta = styled.div`
  font-size: 12px;
  color: var(--color-secondary-50, #848c9d);
`

const NewTaskRow = styled.div`
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 28px;
`

const NewTaskInput = styled.input`
  flex: 1;
  max-width: 340px;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid var(--color-secondary-20, #dadde2);
  background: var(--color-neutral-10, #fff);
  font-size: 14px;
  color: var(--color-secondary-90, #262f44);
  outline: none;

  &:focus { border-color: var(--color-primary-60, #2f929f); }
  &::placeholder { color: var(--color-secondary-50, #848c9d); }
`

const NextBtn = styled.button`
  padding: 10px 28px;
  border-radius: 8px;
  background: var(--color-primary-60, #2f929f);
  color: #fff;
  border: none;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;

  &:disabled { opacity: 0.4; cursor: not-allowed; }
  &:hover:not(:disabled) { opacity: 0.88; }
`

/* ─── Phase 2: Method selection ─── */

const TaskBreadcrumb = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 28px;
  padding: 14px 20px;
  background: rgba(47,146,159,0.07);
  border: 1px solid rgba(47,146,159,0.2);
  border-radius: 10px;
`

const BackBtn = styled.button`
  padding: 6px 14px;
  border-radius: 6px;
  border: 1px solid var(--color-secondary-20, #dadde2);
  background: var(--color-neutral-10, #fff);
  font-size: 13px;
  color: var(--color-secondary-70, #555e72);
  cursor: pointer;

  &:hover { border-color: var(--color-secondary-50, #848c9d); }
`

const TaskLabel = styled.span`
  font-size: 14px;
  font-weight: 700;
  color: var(--color-primary-60, #2f929f);
`

const TaskBadge = styled.span`
  font-size: 12px;
  color: var(--color-secondary-50, #848c9d);
`

const MethodGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
  margin-bottom: 40px;
`

/* ─── Summary bar ─── */

const SummaryBar = styled.div`
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
`

const SummaryItem = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  border-radius: 10px;
  background: var(--color-neutral-10, #fff);
  border: 1px solid ${({ $color }) => `${$color}33`};
`

const SummaryDot = styled.div`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${({ $color }) => $color};
  flex-shrink: 0;
`

const SummaryLabel = styled.span`
  font-size: 13px;
  color: var(--color-secondary-50, #848c9d);
`

const SummaryValue = styled.span`
  font-size: 14px;
  font-weight: 700;
  color: var(--color-secondary-90, #262f44);
`

const SUMMARY_LABELS = {
  tms: 'TMS',
  teleop: 'Teleop',
  watch: 'LbW',
  simulation: 'Sim',
  upload: 'Upload',
}

export default function LauncherPage() {
  const navigate = useNavigate()
  const { state, setTask } = useLearning()
  const { stats } = useDataReadiness()
  const navigatingToChild = useRef(false)

  const [phase, setPhase] = useState(state.selectedTask ? 'method' : 'task')
  const [taskflows, setTaskflows] = useState([])
  const [selectedTask, setSelectedTaskLocal] = useState(state.selectedTask || null)
  const [customTask, setCustomTask] = useState('')

  useEffect(() => {
    getTaskflows().then(setTaskflows)
    return () => {
      if (!navigatingToChild.current) setTask(null)
    }
  }, [])

  const handleTaskSelect = (name) => {
    setSelectedTaskLocal(name)
    setCustomTask('')
  }

  const handleConfirmTask = () => {
    const task = customTask.trim() || selectedTask
    if (!task) return
    setTask(task)
    setSelectedTaskLocal(task)
    setPhase('method')
  }

  const handleBack = () => {
    setPhase('task')
  }

  const handleMethodNavigate = (route) => {
    navigatingToChild.current = true
    navigate(route)
  }

  const activeTask = customTask.trim() || selectedTask
  const nasStats = stats?.nas
  const forgeStats = stats?.forge

  if (phase === 'task') {
    return (
      <Page>
        <Title>Task 선택</Title>
        <Subtitle>학습할 Task를 선택하면 해당 Task에 맞는 데이터 수집 방법을 안내해드립니다</Subtitle>

        <SectionTitle>등록된 Task</SectionTitle>
        <TaskGrid>
          {taskflows.map((tf) => (
            <TaskCard
              key={tf.id}
              $selected={selectedTask === tf.name && !customTask}
              onClick={() => handleTaskSelect(tf.name)}
            >
              <TaskName $selected={selectedTask === tf.name && !customTask}>{tf.name}</TaskName>
              <TaskMeta>{tf.stepCount}개 Step · 최근 실행 {tf.lastRun}</TaskMeta>
            </TaskCard>
          ))}
        </TaskGrid>

        <SectionTitle>새 Task 직접 입력</SectionTitle>
        <NewTaskRow>
          <NewTaskInput
            placeholder="새 Task 이름을 입력하세요 (예: 창고 정리)"
            value={customTask}
            onChange={(e) => {
              setCustomTask(e.target.value)
              if (e.target.value) setSelectedTaskLocal(null)
            }}
          />
          <NextBtn onClick={handleConfirmTask} disabled={!activeTask}>
            다음 →
          </NextBtn>
        </NewTaskRow>

        {nasStats && (
          <>
            <SectionTitle style={{ marginTop: 20 }}>NAS 데이터 현황</SectionTitle>
            <SummaryBar>
              {Object.entries(SUMMARY_LABELS).map(([key, label]) => {
                const s = nasStats[key === 'watch' ? 'lbw' : key]
                const count = s?.count ?? s?.videos ?? '—'
                return (
                  <SummaryItem key={key} $color={SOURCE_COLOR_MAP[key]}>
                    <SummaryDot $color={SOURCE_COLOR_MAP[key]} />
                    <SummaryLabel>{label}</SummaryLabel>
                    <SummaryValue>{typeof count === 'number' ? count.toLocaleString() : count}</SummaryValue>
                  </SummaryItem>
                )
              })}
            </SummaryBar>
          </>
        )}
      </Page>
    )
  }

  // Phase: method
  const currentTask = state.selectedTask
  return (
    <Page>
      <TaskBreadcrumb>
        <BackBtn onClick={handleBack}>← Task 변경</BackBtn>
        <TaskBadge>학습 Task:</TaskBadge>
        <TaskLabel>{currentTask}</TaskLabel>
      </TaskBreadcrumb>

      <Title>학습 데이터 수집 경로 선택</Title>
      <Subtitle>학습 목적에 맞는 데이터 수집 경로를 선택하세요</Subtitle>

      <MethodGrid>
        {SOURCE_CARDS.map((card) => (
          <SourceCard key={card.id} card={card} onNavigate={handleMethodNavigate} />
        ))}
      </MethodGrid>

      <SectionTitle>NAS 데이터 현황</SectionTitle>
      <SummaryBar>
        {nasStats ? (
          Object.entries(SUMMARY_LABELS).map(([key, label]) => {
            const s = nasStats[key === 'watch' ? 'lbw' : key]
            const count = s?.count ?? s?.videos ?? '—'
            return (
              <SummaryItem key={key} $color={SOURCE_COLOR_MAP[key]}>
                <SummaryDot $color={SOURCE_COLOR_MAP[key]} />
                <SummaryLabel>{label}</SummaryLabel>
                <SummaryValue>{typeof count === 'number' ? count.toLocaleString() : count}</SummaryValue>
              </SummaryItem>
            )
          })
        ) : forgeStats ? (
          Object.entries(SUMMARY_LABELS).map(([key, label]) => (
            <SummaryItem key={key} $color={SOURCE_COLOR_MAP[key]}>
              <SummaryDot $color={SOURCE_COLOR_MAP[key]} />
              <SummaryLabel>{label}</SummaryLabel>
              <SummaryValue style={{ color: 'var(--color-secondary-50, #848c9d)' }}>—</SummaryValue>
            </SummaryItem>
          ))
        ) : (
          Object.entries(SUMMARY_LABELS).map(([key, label]) => (
            <SummaryItem key={key} $color={SOURCE_COLOR_MAP[key]}>
              <SummaryDot $color={SOURCE_COLOR_MAP[key]} />
              <SummaryLabel>{label}</SummaryLabel>
              <SummaryValue style={{ color: 'var(--color-secondary-50, #848c9d)' }}>—</SummaryValue>
            </SummaryItem>
          ))
        )}
      </SummaryBar>
    </Page>
  )
}
