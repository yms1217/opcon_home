import styled, { keyframes } from 'styled-components'

export const StyledAiAssistantDock = styled.aside`
  width: ${({ $isOpen }) => ($isOpen ? '42rem' : '6.4rem')};
  min-width: ${({ $isOpen }) => ($isOpen ? '42rem' : '6.4rem')};
  max-width: ${({ $isOpen }) => ($isOpen ? '42rem' : '6.4rem')};
  height: 100%;
  min-height: 0;
  border-left: 1px solid var(--alpha-black-10);
  background: var(--color-neutral-10);
  box-shadow: -8px 0 24px rgba(18, 24, 40, 0.06);
  transition:
    width 0.24s ease,
    min-width 0.24s ease,
    max-width 0.24s ease;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow: hidden;

  @media all and (max-width: 1280px) {
    width: ${({ $isOpen }) => ($isOpen ? '36rem' : '6rem')};
    min-width: ${({ $isOpen }) => ($isOpen ? '36rem' : '6rem')};
    max-width: ${({ $isOpen }) => ($isOpen ? '36rem' : '6rem')};
  }

  @media all and (max-width: 767px) {
    display: none;
  }
`

export const StyledAiAssistantDockHeader = styled.header`
  min-height: 6.4rem;
  padding: 1.2rem 1.4rem;
  border-bottom: 1px solid var(--alpha-black-10);
  display: flex;
  align-items: center;
  justify-content: ${({ $isOpen }) => ($isOpen ? 'space-between' : 'center')};
  gap: 1rem;
  flex-shrink: 0;
`

export const StyledAiAssistantDockToggle = styled.button`
  width: 3.2rem;
  height: 3.2rem;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: 0;
  background: transparent;

  &:hover {
    background: var(--color-secondary-10);
  }
`

export const StyledAiAssistantDockBody = styled.div`
  flex: 1;
  min-height: 0;
  padding: 1.6rem;
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
`

export const StyledAiAssistantPanelTitle = styled.strong`
  display: inline-flex;
  align-items: center;
  gap: 0.8rem;
  min-width: 0;
  font-size: 1.5rem;
  color: var(--color-secondary-80);
  white-space: nowrap;
  overflow: hidden;
`

export const StyledAiAssistantPanelIntro = styled.p`
  margin-top: 0;
  color: var(--color-neutral-60);
  font-size: 1.2rem;
  line-height: 1.5;
`

export const StyledAiAssistantContextList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
`

export const StyledAiAssistantContextBadge = styled.div`
  padding: 0.6rem 1rem;
  border-radius: 999px;
  background: var(--color-secondary-10);
  color: var(--color-secondary-80);
  font-size: 1.2rem;
  font-weight: 600;
`

export const StyledAiAssistantMessageList = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
  padding-right: 0.4rem;
`

export const StyledAiAssistantMessage = styled.div`
  display: flex;
  flex-direction: column;
  align-items: ${({ $role }) => ($role === 'user' ? 'flex-end' : 'flex-start')};
  gap: 0.6rem;
`

export const StyledAiAssistantMessageBubble = styled.div`
  max-width: 92%;
  border-radius: 1.6rem;
  padding: 1.2rem 1.4rem;
  background: ${({ $role }) =>
        $role === 'user' ? 'var(--color-secondary-80)' : 'var(--color-neutral-20)'};
  color: ${({ $role }) =>
        $role === 'user' ? 'var(--color-neutral-10)' : 'var(--color-neutral-90)'};

  & > p {
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.6;
    font-size: 1.3rem;
  }
`

export const StyledAiAssistantMessageMeta = styled.span`
  color: var(--color-neutral-50);
  font-size: 1.1rem;
`

export const StyledAiAssistantEmpty = styled.div`
  flex: 1;
  min-height: 14rem;
  border: 1px dashed var(--alpha-black-20);
  border-radius: 1.2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: var(--color-neutral-70);
  font-size: 1.3rem;
  line-height: 1.5;
  padding: 1.6rem;
`

const aiDotBounce = keyframes`
  0%, 80%, 100% {
    transform: translateY(0);
    opacity: 0.35;
  }

  40% {
    transform: translateY(-4px);
    opacity: 1;
  }
`

export const StyledAiAssistantLoadingBubble = styled.div`
  max-width: 92%;
  border-radius: 1.6rem;
  padding: 1.2rem 1.4rem;
  background: var(--color-neutral-20);
  color: var(--color-neutral-90);
  border: 1px solid var(--alpha-black-10);
`

export const StyledAiAssistantLoadingRow = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
`

export const StyledAiAssistantLoadingDots = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  flex-shrink: 0;

  & > span {
    width: 0.7rem;
    height: 0.7rem;
    border-radius: 50%;
    background: var(--color-secondary-70);
    animation: ${aiDotBounce} 1.2s infinite ease-in-out;
  }

  & > span:nth-child(1) {
    animation-delay: 0s;
  }

  & > span:nth-child(2) {
    animation-delay: 0.2s;
  }

  & > span:nth-child(3) {
    animation-delay: 0.4s;
  }
`

export const StyledAiAssistantLoadingText = styled.div`
  font-size: 1.3rem;
  line-height: 1.5;
  color: var(--color-neutral-70);
`

export const StyledAiAssistantComposer = styled.form`
  border-top: 1px solid var(--alpha-black-10);
  padding-top: 1.2rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  flex-shrink: 0;
`

export const StyledAiAssistantTextarea = styled.textarea`
  width: 100%;
  min-height: 9.6rem;
  resize: none;
  border: 1px solid var(--alpha-black-20);
  border-radius: 1.2rem;
  padding: 1.2rem 1.4rem;
  background: var(--color-neutral-10);
  color: var(--color-neutral-90);
  font-size: 1.3rem;
  line-height: 1.6;

  &:focus {
    outline: 2px solid var(--color-secondary-30);
    outline-offset: 0;
  }

  &::placeholder {
    color: var(--color-neutral-50);
  }

  &:disabled {
    background: var(--color-neutral-15);
    cursor: not-allowed;
  }
`

export const StyledAiAssistantComposerActions = styled.div`
  display: flex;
  align-items: center;
  justify-content:end;
  gap: 1rem;

  & > button:last-child {
    flex-shrink: 0;
  }

  @media all and (max-width: 767px) {
    align-items: flex-end;
    flex-direction: column;
  }
`
