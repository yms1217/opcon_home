import styled from 'styled-components'

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
`

const Option = styled.div`
  padding: 16px;
  border-radius: 10px;
  border: 2px solid ${({ $selected }) => ($selected ? '#FF6B6B' : 'var(--color-secondary-20, #dadde2)')};
  background: ${({ $selected }) => ($selected ? 'rgba(255,107,107,0.08)' : 'var(--color-neutral-10, #fff)')};
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    border-color: #FF6B6B;
  }
`

const OptionTitle = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: var(--color-secondary-90, #262f44);
  margin-bottom: 4px;
`

const OptionDesc = styled.div`
  font-size: 12px;
  color: var(--color-secondary-50, #848c9d);
`

const PURPOSES = [
  { value: 'pre-training', title: '사전학습 (Pre-Training)', desc: '대규모 일반화 학습용' },
  { value: 'simple-task', title: '간단 task 학습', desc: '특정 작업 빠른 학습' },
  { value: 'motion-extract', title: '모션 추출 / retargeting', desc: '사람 모션 → 로봇 변환' },
  { value: 'augmentation-seed', title: '증강용 seed 데이터 생성', desc: '시뮬레이션 증강을 위한 기반 데이터' },
]

export default function PurposeSelector({ selected, onToggle }) {
  return (
    <Grid>
      {PURPOSES.map((p) => (
        <Option key={p.value} $selected={selected.includes(p.value)} onClick={() => onToggle(p.value)}>
          <OptionTitle>{p.title}</OptionTitle>
          <OptionDesc>{p.desc}</OptionDesc>
        </Option>
      ))}
    </Grid>
  )
}
