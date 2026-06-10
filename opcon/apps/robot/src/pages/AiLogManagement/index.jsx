import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Title } from '@repo/ui'
import EventManagement from './EventManagement'
import Statistics from './Statistics'
import {
  PageRoot,
  TabBar,
  TabButton,
  TabContent,
  TabPanelContainer,
  TabPanelInner,
  PlaceholderPanel
} from './styles'
import FunctionManagement from './FunctionManagement'
import ActionManagement from './ActionManagement'
import PromptManagement from './PromptManagement'
import AssigneesManagement from './AssigneesManagement'
import ReportManagement from './ReportManagement'
const TAB_EVENT = 'event'
const TAB_STATS = 'stats'
const TAB_FUNC = 'func'
const TAB_ACTION = 'action'
const TAB_PROMPT = 'prompt'
const TAB_ASSIGNEES = 'assignees'
const TAB_REPORT = 'report'


const AiLogManagement = () => {
  const { t } = useTranslation('robot')
  const [activeTab, setActiveTab] = useState(TAB_EVENT)

  const handleChangeTab = useCallback((tab) => {
    setActiveTab(tab)
  }, [])

  return (
    <>
      <Title>{t('aiLogManagement')}</Title>

      <PageRoot>
        <TabBar>
          <TabButton
            type="button"
            $active={activeTab === TAB_EVENT}
            onClick={() => handleChangeTab(TAB_EVENT)}
          >
            이벤트
          </TabButton>

          <TabButton
            type="button"
            $active={activeTab === TAB_STATS}
            onClick={() => handleChangeTab(TAB_STATS)}
          >
            통계
          </TabButton>

          <TabButton
            type="button"
            $active={activeTab === TAB_FUNC}
            onClick={() => handleChangeTab(TAB_FUNC)}
          >
            기능 관리
          </TabButton>
          <TabButton
            type="button"
            $active={activeTab === TAB_ACTION}
            onClick={() => handleChangeTab(TAB_ACTION)}
          >
            액션 관리
          </TabButton>
          <TabButton
            type="button"
            $active={activeTab === TAB_PROMPT}
            onClick={() => handleChangeTab(TAB_PROMPT)}
          >
            프롬프트 관리
          </TabButton>
          <TabButton
            type="button"
            $active={activeTab === TAB_ASSIGNEES}
            onClick={() => handleChangeTab(TAB_ASSIGNEES)}
          >
            담당자 관리
          </TabButton>
          <TabButton
            type="button"
            $active={activeTab === TAB_REPORT}
            onClick={() => handleChangeTab(TAB_REPORT)}
          >
            리포트
          </TabButton>
        </TabBar>

        <TabContent>
          <TabPanelContainer>
            <TabPanelInner>
              {activeTab === TAB_EVENT ? <EventManagement /> : null}
              {activeTab === TAB_STATS ? <Statistics /> : null}
              {activeTab === TAB_FUNC ? (
                <FunctionManagement />
              ) : null}
              {activeTab === TAB_ACTION ? (
                <ActionManagement />
              ) : null}
              {activeTab === TAB_PROMPT ? (
                <PromptManagement />
              ) : null}
              {activeTab === TAB_ASSIGNEES ? (
                <AssigneesManagement />
              ) : null}
              {activeTab === TAB_REPORT ? (
                <ReportManagement />
              ) : null}
            </TabPanelInner>
          </TabPanelContainer>
        </TabContent>
      </PageRoot>
    </>
  )
}

export default AiLogManagement
