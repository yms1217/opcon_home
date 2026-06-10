import { ChipList, Chip } from '../styles'
import {
  FuncCardButton,
  FuncCardHeader,
  FuncTitleWrap,
  FuncTitle,
  BadgeRow,
  Badge,
  CardBody,
  InfoBlock,
  InfoLabel,
  InfoValue,
  EmptyStateSmall
} from './card.styles'

const FuncCard = ({ func, onClick }) => {
  const actionLabel = func.actions.length > 0 ? `${func.actions.length}개` : '없음'
  const assigneeLabel = func.assignees.length > 0 ? `${func.assignees.length}명` : '없음'
  const tagLabel = func.tags.length > 0 ? `${func.tags.length}개` : '없음'

  return (
    <FuncCardButton type="button" onClick={onClick}>
      <FuncCardHeader>
        <FuncTitleWrap>
          <FuncTitle>{func.name || '새 기능'}</FuncTitle>
        </FuncTitleWrap>
      </FuncCardHeader>

      <CardBody>
        <InfoBlock>
          <InfoLabel>분석 Prompt</InfoLabel>
          <InfoValue>{func.prompt || '분석 Prompt를 추가하세요.'}</InfoValue>
        </InfoBlock>

        <InfoBlock>
          <InfoLabel>분류 태그</InfoLabel>
          {func.tags.length > 0 ? (
            <ChipList>
              {func.tags.map((tag) => (
                <Chip key={`${func.id}-tag-${tag}`}>{tag}</Chip>
              ))}
            </ChipList>
          ) : (
            <EmptyStateSmall>분류 태그를 추가하세요.</EmptyStateSmall>
          )}
        </InfoBlock>

        <InfoBlock>
          <InfoLabel>담당자</InfoLabel>
          {func.assignees.length > 0 ? (
            <ChipList>
              {func.assignees.map((assignee) => (
                <Chip key={`${func.id}-assignee-${assignee}`}>{assignee}</Chip>
              ))}
            </ChipList>
          ) : (
            <EmptyStateSmall>담당자를 추가하세요.</EmptyStateSmall>
          )}
        </InfoBlock>
      </CardBody>
    </FuncCardButton>
  )
}

export default FuncCard
