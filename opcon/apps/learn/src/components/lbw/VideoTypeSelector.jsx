import styled from 'styled-components'

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
`

const Option = styled.div`
  padding: 20px 16px;
  border-radius: 12px;
  border: 2px solid ${({ $selected }) => ($selected ? '#FF6B6B' : 'var(--color-secondary-20, #dadde2)')};
  background: ${({ $selected }) => ($selected ? 'rgba(255,107,107,0.08)' : 'var(--color-neutral-10, #fff)')};
  cursor: pointer;
  text-align: center;
  transition: all 0.15s;

  &:hover {
    border-color: #FF6B6B;
  }
`

const OptionIcon = styled.div`
  font-size: 28px;
  margin-bottom: 10px;
`

const OptionTitle = styled.div`
  font-size: 14px;
  font-weight: 700;
  color: var(--color-secondary-90, #262f44);
  margin-bottom: 6px;
`

const OptionDesc = styled.div`
  font-size: 12px;
  color: var(--color-secondary-50, #848c9d);
  line-height: 1.4;
`

const VIDEO_TYPES = [
  { value: 'ego', icon: '👁️', title: '1인칭 (Ego View)', desc: '로봇/사람 시점에서 촬영한 영상' },
  { value: 'exo', icon: '📷', title: '3인칭 (Exo View)', desc: '외부에서 촬영한 작업 영상' },
  { value: 'mixed', icon: '🎬', title: '혼합', desc: '1인칭 + 3인칭 복합 영상' },
]

export default function VideoTypeSelector({ selected, onSelect }) {
  return (
    <Grid>
      {VIDEO_TYPES.map((type) => (
        <Option key={type.value} $selected={selected === type.value} onClick={() => onSelect(type.value)}>
          <OptionIcon>{type.icon}</OptionIcon>
          <OptionTitle>{type.title}</OptionTitle>
          <OptionDesc>{type.desc}</OptionDesc>
        </Option>
      ))}
    </Grid>
  )
}
