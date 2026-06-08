import { useState, useEffect } from 'react'
import styled from 'styled-components'
import { getTaskflows } from '../../services/tmsApi'

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 360px;
  overflow-y: auto;
`

const Item = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-radius: 10px;
  border: 2px solid ${({ $selected }) => ($selected ? '#4A90D9' : 'var(--color-secondary-20, #dadde2)')};
  background: ${({ $selected }) => ($selected ? 'rgba(74,144,217,0.08)' : 'var(--color-neutral-10, #fff)')};
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    border-color: #4A90D9;
  }
`

const ItemInfo = styled.div``

const ItemName = styled.div`
  font-size: 15px;
  font-weight: 600;
  color: var(--color-secondary-90, #262f44);
  margin-bottom: 4px;
`

const ItemMeta = styled.div`
  font-size: 12px;
  color: var(--color-secondary-50, #848c9d);
`

const ItemRight = styled.div`
  font-size: 12px;
  color: var(--color-secondary-50, #848c9d);
`

const Loading = styled.div`
  padding: 24px;
  text-align: center;
  color: var(--color-secondary-50, #848c9d);
`

export default function TaskflowSelector({ selected, onSelect }) {
  const [taskflows, setTaskflows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getTaskflows()
      .then(setTaskflows)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Loading>Taskflow 목록 불러오는 중...</Loading>

  return (
    <List>
      {taskflows.map((tf) => (
        <Item key={tf.id} $selected={selected?.id === tf.id} onClick={() => onSelect(tf)}>
          <ItemInfo>
            <ItemName>{tf.name}</ItemName>
            <ItemMeta>{tf.description} · Step {tf.stepCount}개</ItemMeta>
          </ItemInfo>
          <ItemRight>최근 실행: {tf.lastRun}</ItemRight>
        </Item>
      ))}
    </List>
  )
}
