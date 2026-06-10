import {
  ActionCardButton,
  ActionCardHeader,
  ActionTitle,
  ActionMeta,
  ActionBody,
  ActionLabel,
  ActionHint,
  ActionBadgeRow,
  ActionBadge
} from './card.styles'

const ActionCard = ({ action, onClick }) => {
  return (
    <ActionCardButton type="button" onClick={onClick}>
      <ActionCardHeader>
        <ActionTitle>{action.name || '새 액션'}</ActionTitle>
        <ActionMeta>
          수정일 {String(action.updatedAt || '').replace('T', ' ').slice(0, 16) || '-'}
        </ActionMeta>
      </ActionCardHeader>

      <ActionBadgeRow>
        <ActionBadge $kind={action.enable ? 'configured' : 'empty'}>
          {action.enable ? '사용중' : '미사용'}
        </ActionBadge>
        {action.key ? <ActionBadge $kind="primary">{action.key}</ActionBadge> : null}
      </ActionBadgeRow>

      <ActionBody>
        <ActionLabel>설명</ActionLabel>
        {String(action.description || '').trim() ? (
          <ActionMeta>{action.description}</ActionMeta>
        ) : (
          <ActionHint>설명을 입력하세요.</ActionHint>
        )}
      </ActionBody>
    </ActionCardButton>
  )
}

export default ActionCard
