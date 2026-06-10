import { useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  ModalBackdrop,
  ModalContainer,
  ModalHeader,
  ModalTitleWrap,
  ModalTitle,
  ModalDescription,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
  FooterActions,
  FormSection,
  FormSectionHeader,
  FormSectionTitle,
  FormGrid,
  FieldGroup,
  FieldLabel,
  FieldInput,
  FieldTextarea,
  SecondaryButton,
  DangerGhostButton,
  EmptyStateSmall,
  EditableList,
  HookMethodSelect,
  ModalErrorMessage
} from './modal.styles'
import { PrimaryButton } from '../styles'

const cloneAction = (item) => JSON.parse(JSON.stringify(item))

const normalizeAction = (actionItem) => {
  const cloned = cloneAction(actionItem)

  return {
    ...cloned,
    key: String(cloned?.key || ''),
    name: String(cloned?.name || ''),
    description: String(cloned?.description || ''),
    enable: Boolean(cloned?.enable)
  }
}

const ActionDetailModal = ({
  actionItem,
  errorMessage,
  isCreateMode,
  onClose,
  onSave,
  onDelete
}) => {
  const [draft, setDraft] = useState(() => normalizeAction(actionItem))
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)

  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [])

  const updateField = useCallback((key, value) => {
    setDraft((prev) => ({
      ...prev,
      [key]: value
    }))
  }, [])

  const handleDeleteClick = useCallback(() => {
    setIsDeleteConfirmOpen(true)
  }, [])

  const handleCancelDelete = useCallback(() => {
    setIsDeleteConfirmOpen(false)
  }, [])

  const handleConfirmDelete = useCallback(() => {
    onDelete(draft.id)
  }, [draft.id, onDelete])

  const isSavable = String(draft.key || '').trim().length > 0

  if (typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <ModalBackdrop>
      <ModalContainer onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitleWrap>
            <ModalTitle>
              {isCreateMode ? '액션 등록' : `${draft.name || '액션'} 상세`}
            </ModalTitle>
            <ModalDescription>
              액션 key, 이름, 설명, 사용 여부만 관리합니다.
            </ModalDescription>
          </ModalTitleWrap>

          <ModalCloseButton type="button" onClick={onClose}>
            x
          </ModalCloseButton>
        </ModalHeader>

        <ModalBody>
          <FormSection>
            <FormSectionHeader>
              <FormSectionTitle>기본 정보</FormSectionTitle>
            </FormSectionHeader>

            <EditableList>
              <FormGrid>
                <FieldGroup>
                  <FieldLabel>액션 Key</FieldLabel>
                  <FieldInput
                    value={draft.key}
                    onChange={(e) => updateField('key', e.target.value)}
                    placeholder="예: robot_reset"
                  />
                </FieldGroup>

                <FieldGroup>
                  <FieldLabel>액션명</FieldLabel>
                  <FieldInput
                    value={draft.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    placeholder="예: 로봇 초기화"
                  />
                </FieldGroup>

                <FieldGroup $span2>
                  <FieldLabel>설명</FieldLabel>
                  <FieldTextarea
                    value={draft.description}
                    onChange={(e) => updateField('description', e.target.value)}
                    placeholder="예: 장애 상황에서 로봇을 초기화합니다."
                  />
                </FieldGroup>

                <FieldGroup>
                  <FieldLabel>사용 여부</FieldLabel>
                  <HookMethodSelect
                    value={draft.enable ? 'true' : 'false'}
                    onChange={(e) => updateField('enable', e.target.value === 'true')}
                  >
                    <option value="true">사용</option>
                    <option value="false">미사용</option>
                  </HookMethodSelect>
                </FieldGroup>
              </FormGrid>
            </EditableList>
          </FormSection>

          {errorMessage ? <ModalErrorMessage>{errorMessage}</ModalErrorMessage> : null}
        </ModalBody>

        <ModalFooter>
          {!isCreateMode ? (
            isDeleteConfirmOpen ? (
              <FooterActions>
                <EmptyStateSmall>정말 삭제하시겠습니까?</EmptyStateSmall>
                <SecondaryButton type="button" onClick={handleCancelDelete}>
                  취소
                </SecondaryButton>
                <DangerGhostButton type="button" onClick={handleConfirmDelete}>
                  삭제 확인
                </DangerGhostButton>
              </FooterActions>
            ) : (
              <DangerGhostButton type="button" onClick={handleDeleteClick}>
                액션 삭제
              </DangerGhostButton>
            )
          ) : (
            <div />
          )}

          <FooterActions>
            <SecondaryButton type="button" onClick={onClose}>
              닫기
            </SecondaryButton>
            <PrimaryButton
              type="button"
              onClick={() => onSave(draft)}
              disabled={!isSavable}
            >
              저장
            </PrimaryButton>
          </FooterActions>
        </ModalFooter>
      </ModalContainer>
    </ModalBackdrop>,
    document.body
  )
}

export default ActionDetailModal
