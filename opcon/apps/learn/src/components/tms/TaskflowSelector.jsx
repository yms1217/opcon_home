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

const TaskHeader = styled.div`
  padding: 10px 14px;
  margin-bottom: 8px;
  border-radius: 8px;
  background: rgba(47,146,159,0.07);
  border: 1px solid rgba(47,146,159,0.2);
  font-size: 13px;
  color: var(--color-primary-60, #2f929f);
  font-weight: 600;
`

const Empty = styled.div`
  padding: 32px;
  text-align: center;
  color: var(--color-secondary-50, #848c9d);
  font-size: 13px;
`

const Loading = styled.div`
  padding: 24px;
  text-align: center;
  color: var(--color-secondary-50, #848c9d);
`

export default function TaskflowSelector({ selected, onSelect, suggestedTask }) {
  const [taskflows, setTaskflows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getTaskflows()
      .then(setTaskflows)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Loading>Taskflow 목록 불러오는 중...</Loading>

  const visible = suggestedTask
    ? taskflows.filter((tf) => tf.name === suggestedTask)
    : taskflows

  return (
    <>
      {suggestedTask && (
        <TaskHeader>🎯 Task "{suggestedTask}"의 Taskflow 목록</TaskHeader>
      )}
      <List>
        {visible.length === 0 ? (
          <Empty>"{suggestedTask}" Task에 해당하는 Taskflow가 없습니다</Empty>
        ) : (
          visible.map((tf) => (
            <Item key={tf.id} $selected={selected?.id === tf.id} onClick={() => onSelect(tf)}>
              <ItemInfo>
                <ItemName>{tf.name}</ItemName>
                <ItemMeta>{tf.description} · Step {tf.stepCount}개</ItemMeta>
              </ItemInfo>
              <ItemRight>최근 실행: {tf.lastRun}</ItemRight>
            </Item>
          ))
        )}
      </List>
    </>
  )
}
