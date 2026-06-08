import styled from 'styled-components'

const Grid = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`

const Row = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`

const RowHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`

const PurposeName = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: var(--color-secondary-90, #262f44);
`

const Percent = styled.span`
  font-size: 14px;
  font-weight: 700;
  color: ${({ $value }) =>
    $value >= 80 ? '#51CF66' :
    $value >= 50 ? '#FCC419' : '#FF6B6B'};
`

const ProgressBar = styled.div`
  height: 8px;
  border-radius: 4px;
  background: var(--color-secondary-20, #dadde2);
  overflow: hidden;
`

const Progress = styled.div`
  height: 100%;
  border-radius: 4px;
  width: ${({ $value }) => $value}%;
  background: ${({ $value }) =>
    $value >= 80 ? '#51CF66' :
    $value >= 50 ? '#FCC419' : '#FF6B6B'};
  transition: width 0.6s ease;
`

const BasedOn = styled.span`
  font-size: 11px;
  color: var(--color-secondary-50, #848c9d);
`

const MOCK_DATA = [
  { id: 'pre-training', name: 'Pre-Training', percent: 78, basedOn: 'LbW + Sim 기반' },
  { id: 'post-training', name: 'Post-Training', percent: 62, basedOn: 'Teleop + TMS 기반' },
  { id: 'in-field', name: 'In-Field Fine-tuning', percent: 28, basedOn: 'TMS Fleet 데이터' },
  { id: 'failure-model', name: 'Failure Recovery Model', percent: 15, basedOn: 'TMS 실패 로그' },
]

export default function ReadinessByPurpose({ stats }) {
  const data = stats || MOCK_DATA

  return (
    <Grid>
      {data.map((item) => (
        <Row key={item.id}>
          <RowHeader>
            <PurposeName>{item.name}</PurposeName>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <BasedOn>{item.basedOn}</BasedOn>
              <Percent $value={item.percent}>{item.percent}%</Percent>
            </div>
          </RowHeader>
          <ProgressBar>
            <Progress $value={item.percent} />
          </ProgressBar>
        </Row>
      ))}
    </Grid>
  )
}
