import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAiAssistantStore } from '@repo/stores'
import { getAppPrefix } from '@repo/utils'
import Icon from '../../common/Icon'
import Button from '../../common/Button'
import {
    StyledAiAssistantComposer,
    StyledAiAssistantComposerActions,
    StyledAiAssistantContextBadge,
    StyledAiAssistantContextList,
    StyledAiAssistantDock,
    StyledAiAssistantDockBody,
    StyledAiAssistantDockHeader,
    StyledAiAssistantDockToggle,
    StyledAiAssistantEmpty,
    StyledAiAssistantLoadingBubble,
    StyledAiAssistantLoadingDots,
    StyledAiAssistantLoadingRow,
    StyledAiAssistantLoadingText,
    StyledAiAssistantMessage,
    StyledAiAssistantMessageBubble,
    StyledAiAssistantMessageList,
    StyledAiAssistantMessageMeta,
    StyledAiAssistantPanelIntro,
    StyledAiAssistantPanelTitle,
    StyledAiAssistantTextarea
} from './styles'
import { postSiteAssistantChat } from '@repo/apis/ai/chat.js'

const buildMessageId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID()
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

const normalizeAppPrefix = (pathname) => {
    const rawAppPrefix = getAppPrefix(pathname)

    if (!rawAppPrefix || rawAppPrefix === '/') {
        return ''
    }

    return String(rawAppPrefix).replace(/^\//, '')
}

const buildRouteContext = (location) => ({
    pathname: location.pathname,
    search: location.search,
    hash: location.hash,
    appPrefix: normalizeAppPrefix(location.pathname),
    title: typeof document !== 'undefined' ? document.title : ''
})

const extractAssistantText = (result) => {
    const payload = result?.data ?? result ?? null

    if (!payload) {
        return '응답을 받았지만 표시할 수 있는 내용이 없습니다.'
    }

    if (typeof payload === 'string') return payload
    if (typeof payload?.message === 'string' && payload.message.trim()) return payload.message.trim()
    if (typeof payload?.content === 'string' && payload.content.trim()) return payload.content.trim()
    if (typeof payload?.text === 'string' && payload.text.trim()) return payload.text.trim()
    if (typeof payload?.answer === 'string' && payload.answer.trim()) return payload.answer.trim()

    try {
        return JSON.stringify(payload, null, 2)
    } catch {
        return '응답을 해석하지 못했습니다.'
    }
}

const AiAssistantPanel = () => {
    const location = useLocation()

    const isOpen = useAiAssistantStore((state) => state.isOpen)
    const openPanel = useAiAssistantStore((state) => state.openPanel)
    const closePanel = useAiAssistantStore((state) => state.closePanel)
    const messages = useAiAssistantStore((state) => state.messages)
    const appendMessage = useAiAssistantStore((state) => state.appendMessage)
    const resetMessages = useAiAssistantStore((state) => state.resetMessages)

    const [draft, setDraft] = useState('')
    const [isSending, setIsSending] = useState(false)

    const messageListRef = useRef(null)
    const textareaRef = useRef(null)  // 핵심

    const routeContext = useMemo(() => buildRouteContext(location), [location])

    /** ✅ 스크롤 유지 */
    useEffect(() => {
        if (messageListRef.current) {
            messageListRef.current.scrollTop = messageListRef.current.scrollHeight
        }
    }, [messages, isSending, isOpen])

    /** ✅ 패널 열리면 focus */
    useEffect(() => {
        if (isOpen) {
            textareaRef.current?.focus()
        }
    }, [isOpen])

    /** ✅ submit (event 제거) */
    const handleSubmit = async () => {
        const content = draft.trim()

        if (!content || isSending) return

        const createdAt = new Date().toISOString()
        const context = {
            ...routeContext,
            sentAt: createdAt
        }

        appendMessage({
            id: buildMessageId(),
            role: 'user',
            content,
            createdAt,
            context
        })

        setDraft('')
        setIsSending(true)

        try {
            const result = await postSiteAssistantChat({
                message: content,
                currentPath: routeContext.pathname,
                currentApp: routeContext.appPrefix || undefined
            })

            const assistantText = extractAssistantText(result)

            appendMessage({
                id: buildMessageId(),
                role: 'assistant',
                content: assistantText,
                createdAt: new Date().toISOString(),
                context
            })
        } catch (error) {
            appendMessage({
                id: buildMessageId(),
                role: 'assistant',
                content:
                    error?.message ||
                    '답변을 가져오지 못했습니다.',
                createdAt: new Date().toISOString(),
                context
            })
        } finally {
            setIsSending(false)

            /** ✅ 핵심: 포커스 복구 */
            textareaRef.current?.focus()
        }
    }

    /** ✅ Enter 처리 */
    const handleTextareaKeyDown = (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()

            if (!draft.trim() || isSending) return

            handleSubmit()
        }
    }

    const handleTogglePanel = () => {
        if (isOpen) {
            closePanel?.()
        } else {
            openPanel?.()
        }
    }

    return (
        <StyledAiAssistantDock $isOpen={isOpen}>
            <StyledAiAssistantDockHeader>
                <StyledAiAssistantPanelTitle>
                    <Icon name="support" size={18} />
                    {isOpen ? 'AI Assistant' : null}
                </StyledAiAssistantPanelTitle>

                <StyledAiAssistantDockToggle onClick={handleTogglePanel}>
                    <Icon name={isOpen ? 'arrow_right' : 'arrow_left'} />
                </StyledAiAssistantDockToggle>
            </StyledAiAssistantDockHeader>

            {isOpen && (
                <StyledAiAssistantDockBody>

                    <StyledAiAssistantPanelIntro>
                        현재 화면 기반으로 질문에 답변합니다.
                    </StyledAiAssistantPanelIntro>

                    <StyledAiAssistantContextList>
                        <StyledAiAssistantContextBadge>
                            앱: {routeContext.appPrefix || 'root'}
                        </StyledAiAssistantContextBadge>
                        <StyledAiAssistantContextBadge>
                            화면: {routeContext.pathname}
                        </StyledAiAssistantContextBadge>
                    </StyledAiAssistantContextList>

                    <StyledAiAssistantMessageList ref={messageListRef}>
                        {messages.length === 0 && !isSending && (
                            <StyledAiAssistantEmpty>
                                질문을 입력해보세요.
                            </StyledAiAssistantEmpty>
                        )}

                        {messages.map((m) => (
                            <StyledAiAssistantMessage key={m.id} $role={m.role}>
                                <StyledAiAssistantMessageMeta>
                                    {m.role === 'user' ? '나' : 'AI Assistant'}
                                </StyledAiAssistantMessageMeta>
                                <StyledAiAssistantMessageBubble $role={m.role}>
                                    {m.content}
                                </StyledAiAssistantMessageBubble>
                            </StyledAiAssistantMessage>
                        ))}

                        {isSending && (
                            <StyledAiAssistantMessage $role="assistant">
                                <StyledAiAssistantLoadingBubble>
                                    <StyledAiAssistantLoadingRow>
                                        <StyledAiAssistantLoadingDots>
                                            <span />
                                            <span />
                                            <span />
                                        </StyledAiAssistantLoadingDots>
                                        <StyledAiAssistantLoadingText>
                                            작성 중...
                                        </StyledAiAssistantLoadingText>
                                    </StyledAiAssistantLoadingRow>
                                </StyledAiAssistantLoadingBubble>
                            </StyledAiAssistantMessage>
                        )}
                    </StyledAiAssistantMessageList>

                    <StyledAiAssistantComposer
                        onSubmit={(e) => {
                            e.preventDefault()
                            handleSubmit()
                        }}
                    >
                        <StyledAiAssistantTextarea
                            ref={textareaRef}
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onKeyDown={handleTextareaKeyDown}
                            rows={4}
                            readOnly={isSending}
                        />

                        <StyledAiAssistantComposerActions>
                            <Button type="submit" disabled={!draft.trim() || isSending}>
                                {isSending ? '전송 중...' : '보내기'}
                            </Button>
                        </StyledAiAssistantComposerActions>

                        <Button
                            type="button"
                            theme="text"
                            onClick={resetMessages}
                            disabled={isSending}
                        >
                            대화 지우기
                        </Button>

                    </StyledAiAssistantComposer>
                </StyledAiAssistantDockBody>
            )}
        </StyledAiAssistantDock>
    )
}

export default AiAssistantPanel