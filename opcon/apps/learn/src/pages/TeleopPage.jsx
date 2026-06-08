import { useState, useEffect } from 'react'
import styled from 'styled-components'
import { getDevices, createTeleopSession } from '../services/dmApi'
import { openForge } from '../services/forgeApi'
import Card from '../components/common/Card'

const Page = styled.div`
  padding: 32px;
  max-width: 800px;
`

const PageTitle = styled.h1`
  margin: 0 0 8px 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--color-secondary-90, #262f44);
`

const PageSub = styled.p`
  margin: 0 0 32px 0;
  font-size: 14px;
  color: var(--color-secondary-50, #848c9d);
`

const Form = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
`

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const Label = styled.label`
  font-size: 13px;
  font-weight: 600;
  color: var(--color-secondary-70, #555e72);
`

const Select = styled.select`
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--color-secondary-20, #dadde2);
  background: var(--color-neutral-10, #fff);
  color: var(--color-secondary-90, #262f44);
  font-size: 14px;
  outline: none;
  cursor: pointer;

  &:focus { border-color: #7B61FF; }
`

const Input = styled.input`
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--color-secondary-20, #dadde2);
  background: var(--color-neutral-10, #fff);
  color: var(--color-secondary-90, #262f44);
  font-size: 14px;
  outline: none;
  width: 120px;

  &:focus { border-color: #7B61FF; }
`

const Divider = styled.hr`
  border: none;
  border-top: 1px solid var(--color-secondary-20, #dadde2);
  margin: 8px 0;
`

const ForgeSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 8px;
`

const ForgeSectionTitle = styled.h3`
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-secondary-70, #555e72);
`

const ForgeBtn = styled.button`
  padding: 14px 24px;
  background: #7B61FF;
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  align-self: flex-start;

  &:hover:not(:disabled) { background: #6a50e0; }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
`

const PurposeGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`

const PurposeChip = styled.button`
  padding: 8px 16px;
  border-radius: 20px;
  border: 1px solid ${({ $selected }) => ($selected ? '#7B61FF' : 'var(--color-secondary-20, #dadde2)')};
  background: ${({ $selected }) => ($selected ? 'rgba(123,97,255,0.15)' : 'transparent')};
  color: ${({ $selected }) => ($selected ? '#7B61FF' : 'var(--color-secondary-50, #848c9d)')};
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
`

const PURPOSES = ['Fine-tuning', 'Failure Recovery', 'Benchmark Dataset 생성']

export default function TeleopPage() {
  const [robots, setRobots] = useState([])
  const [config, setConfig] = useState({
    task: '',
    goalEpisodes: 10,
    robotId: '',
    purpose: '',
  })
  const [opening, setOpening] = useState(false)
  const [openError, setOpenError] = useState(null)

  useEffect(() => {
    getDevices().then(setRobots)
  }, [])

  const canOpen = config.task && config.robotId

  const handleOpenForge = async () => {
    if (!canOpen) return
    setOpening(true)
    setOpenError(null)
    try {
      const session = await createTeleopSession(config)
      openForge(`/data-collector?sessionId=${session.id}`)
    } catch (e) {
      setOpenError(e.message)
    } finally {
      setOpening(false)
    }
  }

  return (
    <Page>
      <PageTitle>Teleoperation으로 정밀 시연 수집</PageTitle>
      <PageSub>사람이 직접 로봇을 조종하며 고품질 action 데이터를 수집합니다</PageSub>

      <Card>
        <Form>
          <Field>
            <Label>Task 선택</Label>
            <Select value={config.task} onChange={(e) => setConfig((c) => ({ ...c, task: e.target.value }))}>
              <option value="">선택하세요</option>
              <option value="신발 정리">신발 정리</option>
              <option value="Pick & Place">Pick &amp; Place</option>
              <option value="수건 접기">수건 접기</option>
              <option value="제조 PoC">제조 PoC</option>
            </Select>
          </Field>

          <Field>
            <Label>목표 Episode 수</Label>
            <Input
              type="number"
              min={1}
              value={config.goalEpisodes}
              onChange={(e) => setConfig((c) => ({ ...c, goalEpisodes: Number(e.target.value) }))}
            />
          </Field>

          <Field>
            <Label>로봇 선택</Label>
            <Select value={config.robotId} onChange={(e) => setConfig((c) => ({ ...c, robotId: e.target.value }))}>
              <option value="">선택하세요</option>
              {robots.map((r) => (
                <option key={r.id} value={r.id}>{r.name} ({r.status})</option>
              ))}
            </Select>
          </Field>

          <Field>
            <Label>학습 목적</Label>
            <PurposeGrid>
              {PURPOSES.map((p) => (
                <PurposeChip
                  key={p}
                  $selected={config.purpose === p}
                  onClick={() => setConfig((c) => ({ ...c, purpose: p }))}
                >
                  {p}
                </PurposeChip>
              ))}
            </PurposeGrid>
          </Field>

          <Divider />

          <ForgeSection>
            <ForgeSectionTitle>🔗 Forge Data Collector 연결</ForgeSectionTitle>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--color-secondary-50, #848c9d)' }}>
              설정이 완료되면 Forge에서 Teleoperation 데이터를 수집합니다.
            </p>
            {!canOpen && (
              <p style={{ margin: 0, fontSize: 12, color: '#FCC419' }}>
                Task와 로봇을 먼저 선택하세요
              </p>
            )}
            {openError && (
              <p style={{ margin: 0, fontSize: 12, color: '#FF6B6B' }}>
                오류: {openError}
              </p>
            )}
            <ForgeBtn onClick={handleOpenForge} disabled={!canOpen || opening}>
              {opening ? '세션 생성 중...' : '🎮 Forge Data Collector 열기'}
            </ForgeBtn>
          </ForgeSection>
        </Form>
      </Card>
    </Page>
  )
}
