import { useState } from 'react'
import styled from 'styled-components'
import ReadinessBySource from '../components/data/ReadinessBySource'
import ReadinessByPurpose from '../components/data/ReadinessByPurpose'
import ReadinessByTask from '../components/data/ReadinessByTask'
import { useDataReadiness } from '../hooks/useDataReadiness'

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

const TabBar = styled.div`
  display: flex;
  gap: 0;
  border-bottom: 2px solid var(--color-secondary-20, #dadde2);
  margin-bottom: 28px;
`

const Tab = styled.button`
  padding: 12px 24px;
  background: none;
  border: none;
  font-size: 14px;
  font-weight: ${({ $active }) => ($active ? '700' : '400')};
  color: ${({ $active }) => ($active ? '#4A90D9' : 'var(--color-secondary-50, #848c9d)')};
  cursor: pointer;
  border-bottom: 2px solid ${({ $active }) => ($active ? '#4A90D9' : 'transparent')};
  margin-bottom: -2px;
  transition: all 0.15s;

  &:hover {
    color: var(--color-secondary-90, #262f44);
  }
`

const Panel = styled.div`
  background: var(--color-neutral-10, #fff);
  border: 1px solid var(--color-secondary-20, #dadde2);
  border-radius: 12px;
  padding: 24px;
`

const TABS = [
  { key: 'source', label: '데이터 출처별' },
  { key: 'purpose', label: '학습 목적별' },
  { key: 'task', label: 'Task별' },
]

export default function DataReadinessPage() {
  const [activeTab, setActiveTab] = useState('source')
  const { stats, loading } = useDataReadiness()

  return (
    <Page>
      <PageTitle>데이터 준비 현황</PageTitle>
      <PageSub>학습에 사용 가능한 데이터 현황을 출처별, 목적별, Task별로 확인합니다</PageSub>

      <TabBar>
        {TABS.map((tab) => (
          <Tab key={tab.key} $active={activeTab === tab.key} onClick={() => setActiveTab(tab.key)}>
            {tab.label}
          </Tab>
        ))}
      </TabBar>

      <Panel>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-secondary-50, #848c9d)' }}>
            데이터 불러오는 중...
          </div>
        ) : (
          <>
            {activeTab === 'source' && <ReadinessBySource stats={null} />}
            {activeTab === 'purpose' && <ReadinessByPurpose stats={null} />}
            {activeTab === 'task' && <ReadinessByTask stats={null} />}
          </>
        )}
      </Panel>
    </Page>
  )
}
