import styled from 'styled-components'
import SourceCardGrid from '../components/launcher/SourceCardGrid'
import { useDataReadiness } from '../hooks/useDataReadiness'
import { SOURCE_COLOR_MAP } from '../styles/theme'

const Page = styled.div`
  padding: 32px;
`

const Header = styled.div`
  margin-bottom: 40px;
`

const Title = styled.h1`
  margin: 0 0 8px 0;
  font-size: 24px;
  font-weight: 700;
  color: var(--color-secondary-90, #262f44);
`

const Subtitle = styled.p`
  margin: 0;
  font-size: 14px;
  color: var(--color-secondary-50, #848c9d);
`

const SectionTitle = styled.h2`
  margin: 40px 0 20px 0;
  font-size: 16px;
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
  const { stats } = useDataReadiness()

  const forgeStats = stats?.forge

  return (
    <Page>
      <Header>
        <Title>어떤 방식으로 학습 데이터를 만들겠습니까?</Title>
        <Subtitle>학습 목적에 맞는 데이터 수집 경로를 선택하세요</Subtitle>
      </Header>

      <SourceCardGrid />

      <SectionTitle>📊 데이터 준비 현황 요약</SectionTitle>
      <SummaryBar>
        {forgeStats ? (
          <>
            <SummaryItem $color={SOURCE_COLOR_MAP.tms}>
              <SummaryDot $color={SOURCE_COLOR_MAP.tms} />
              <SummaryLabel>TMS</SummaryLabel>
              <SummaryValue>{forgeStats.tms?.count?.toLocaleString()} Episodes</SummaryValue>
            </SummaryItem>
            <SummaryItem $color={SOURCE_COLOR_MAP.teleop}>
              <SummaryDot $color={SOURCE_COLOR_MAP.teleop} />
              <SummaryLabel>Teleop</SummaryLabel>
              <SummaryValue>{forgeStats.teleop?.count?.toLocaleString()} Episodes</SummaryValue>
            </SummaryItem>
            <SummaryItem $color={SOURCE_COLOR_MAP.watch}>
              <SummaryDot $color={SOURCE_COLOR_MAP.watch} />
              <SummaryLabel>LbW</SummaryLabel>
              <SummaryValue>{forgeStats.lbw?.videos} Videos → {forgeStats.lbw?.motions} Motions</SummaryValue>
            </SummaryItem>
            <SummaryItem $color={SOURCE_COLOR_MAP.simulation}>
              <SummaryDot $color={SOURCE_COLOR_MAP.simulation} />
              <SummaryLabel>Sim</SummaryLabel>
              <SummaryValue>{forgeStats.simulation?.count?.toLocaleString()} Episodes</SummaryValue>
            </SummaryItem>
            <SummaryItem $color={SOURCE_COLOR_MAP.upload}>
              <SummaryDot $color={SOURCE_COLOR_MAP.upload} />
              <SummaryLabel>Upload</SummaryLabel>
              <SummaryValue>{forgeStats.upload?.count?.toLocaleString()} Episodes</SummaryValue>
            </SummaryItem>
          </>
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
