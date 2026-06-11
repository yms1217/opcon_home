import styled from 'styled-components'
import RobotSelectorPanel from '../common/RobotSelectorPanel'

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
`

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const SectionLabel = styled.label`
  font-size: 13px;
  font-weight: 600;
  color: var(--color-secondary-70, #555e72);
`

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`

const NumberInput = styled.input`
  padding: 10px 12px;
  width: 80px;
  border-radius: 8px;
  border: 1px solid var(--color-secondary-20, #dadde2);
  background: var(--color-neutral-10, #fff);
  color: var(--color-secondary-90, #262f44);
  font-size: 14px;
  outline: none;
  text-align: center;

  &:focus {
    border-color: #4a90d9;
  }
`

const PurposeOptions = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const PurposeItem = styled.label`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid var(--color-secondary-20, #dadde2);
  cursor: pointer;
  font-size: 13px;
  color: var(--color-secondary-70, #555e72);

  &:hover {
    background: var(--color-neutral-30, #f5f5f5);
  }
`

const CheckLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--color-secondary-70, #555e72);
  cursor: pointer;
  padding: 8px 0;
`

const PURPOSE_OPTIONS = [
  { value: 'data-collection', label: '학습 데이터 수집' },
  { value: 'performance-check', label: '성능 검증' },
  { value: 'failure-collection', label: '실패 케이스 수집' },
]

export default function ExecutionConfig({ config, onChange }) {
  return (
    <Wrapper>
      <Section>
        <SectionLabel>수행 로봇 선택</SectionLabel>
        <RobotSelectorPanel
          multi
          value={config.robotIds}
          onChange={(ids) => onChange({ robotIds: ids })}
        />
      </Section>

      <Section>
        <SectionLabel>반복 횟수</SectionLabel>
        <Row>
          <NumberInput
            type="number"
            min={1}
            max={100}
            value={config.repeatCount}
            onChange={(e) => onChange({ repeatCount: Number(e.target.value) })}
          />
          <span style={{ color: 'var(--color-secondary-50, #848c9d)', fontSize: 13 }}>회</span>
        </Row>
      </Section>

      <Section>
        <SectionLabel>실행 목적</SectionLabel>
        <PurposeOptions>
          {PURPOSE_OPTIONS.map((opt) => (
            <PurposeItem key={opt.value}>
              <input
                type="radio"
                name="purpose"
                value={opt.value}
                checked={config.purpose === opt.value}
                onChange={() => onChange({ purpose: opt.value })}
              />
              {opt.label}
            </PurposeItem>
          ))}
        </PurposeOptions>
      </Section>

      <Section>
        <CheckLabel>
          <input
            type="checkbox"
            checked={config.saveForLearning}
            onChange={(e) => onChange({ saveForLearning: e.target.checked })}
          />
          학습용 데이터로 저장 (기본 ON)
        </CheckLabel>
      </Section>
    </Wrapper>
  )
}
