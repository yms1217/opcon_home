import { useEffect, useMemo, useState } from 'react'
import {
  getEventById,
  getAnalysisByEventId,
  getAssignees
} from '@/apis/ai/aiApis'
import { severityLabelMap, statusLabelMap } from '../constants'
import { getRecommendedActions, getClassificationScore } from '../utils'
import {
  PanelRoot,
  PanelHeader,
  PanelTitleRow,
  PanelTitle,
  PanelBadge,
  PanelCloseButton,
  PanelBody,
  Section,
  SectionTitleRow,
  SectionTitle,
  SectionBody,
  InfoTable,
  InfoRow,
  InfoKey,
  InfoValue,
  InfoValueBetween,
  InfoValueCenter,
  AnalysisBox,
  AssigneeList,
  AssigneeCard,
  AssigneeIdentityRow,
  AssigneeName,
  AssigneeMeta,
  AssigneeMetaLine,
  Avatar,
  AvatarImage,
  ActionCardList,
  ActionCard,
  ActionConfirmOverlay,
  ActionConfirmCard,
  ActionConfirmText,
  ActionConfirmActions,
  ActionConfirmButton,
  ActionConfirmPrimaryButton,
  MutedText,
  LoadingBox,
  ErrorBox,
  LogButton,
  LogModalOverlay,
  LogModal,
  LogModalHeader,
  LogModalTitle,
  LogModalCloseButton,
  LogModalBody,
  LogBundle,
  LogBundleHeader,
  LogLineRow,
  LogIndex,
  LogLevel,
  LogMessage,
  EmptyLogText
} from './styles'

const normalizeResponse = (response) => response?.data ?? response ?? null

const isLikelyImageSource = (value) => {
  const profile = String(value ?? '').trim()
  if (!profile) return false

  return /^(https?:\/\/|data:image\/|\/|\.\/|\.\.\/)/i.test(profile) || /\.(png|jpe?g|gif|webp|svg)$/i.test(profile)
}

const toInitial = (name) => {
  const trimmed = String(name ?? '').trim()
  if (!trimmed) return '?'
  return trimmed.slice(0, 1).toUpperCase()
}

const statusStyleMap = {
  received: {
    backgroundColor: '#edf1f5',
    color: '#5f6b7c',
    borderColor: '#d9e2ec'
  },
  prepared: {
    backgroundColor: '#edf1f5',
    color: '#5f6b7c',
    borderColor: '#d9e2ec'
  },
  prepare_failed: {
    backgroundColor: '#fff3e5',
    color: '#e67e22',
    borderColor: '#ffd8b5'
  },
  analyze_failed: {
    backgroundColor: '#fff3e5',
    color: '#e67e22',
    borderColor: '#ffd8b5'
  },
  failed: {
    backgroundColor: '#ffe8e8',
    color: '#d93025',
    borderColor: '#ffc9c9'
  },
  analyzing: {
    backgroundColor: '#e8f7ee',
    color: '#2e7d32',
    borderColor: '#cbeed6'
  },
  analyzed: {
    backgroundColor: '#e8f7ee',
    color: '#2e7d32',
    borderColor: '#cbeed6'
  },
  completed: {
    backgroundColor: '#e8f7ee',
    color: '#2e7d32',
    borderColor: '#cbeed6'
  }
}

const severityStyleMap = {
  critical: {
    backgroundColor: '#ffe8e8',
    color: '#d93025',
    borderColor: '#ffc9c9'
  },
  high: {
    backgroundColor: '#ffe8e8',
    color: '#d93025',
    borderColor: '#ffc9c9'
  },
  medium: {
    backgroundColor: '#fff3e5',
    color: '#e67e22',
    borderColor: '#ffd8b5'
  },
  low: {
    backgroundColor: '#fff3e5',
    color: '#e67e22',
    borderColor: '#ffd8b5'
  }
}

const defaultBadgeStyle = {
  backgroundColor: '#edf1f5',
  color: '#5f6b7c',
  borderColor: '#d9e2ec'
}

const getStatusBadgeStyle = (event, analysis) => {
  const value =
    event?.status ??
    event?.actionStatus ??
    analysis?.status ??
    ''

  const normalizedValue = String(value || '').trim().toLowerCase()
  return statusStyleMap[normalizedValue] || defaultBadgeStyle
}

const getSeverityBadgeStyle = (event, analysis) => {
  const value =
    event?.severity ??
    event?.level ??
    analysis?.severity ??
    analysis?.level ??
    ''

  const normalizedValue = String(value || '').trim().toLowerCase()
  return severityStyleMap[normalizedValue] || defaultBadgeStyle
}

const getSeverityLabel = (event, analysis) => {
  const value =
    event?.severity ??
    event?.level ??
    analysis?.severity ??
    analysis?.level ??
    ''

  if (!value) return '-'

  const normalizedValue = String(value).trim().toLowerCase()
  return severityLabelMap[normalizedValue] || String(value)
}

const getStatusLabel = (event, analysis) => {
  const value =
    event?.status ??
    event?.actionStatus ??
    analysis?.status ??
    ''

  if (!value) return '-'

  const normalizedValue = String(value).trim().toLowerCase()
  return statusLabelMap[normalizedValue] || String(value)
}

const getFunctionLabel = (event, analysis) => {
  const value =
    event?.func ??
    event?.function ??
    analysis?.func ??
    analysis?.function ??
    ''

  if (!value) return '-'
  return String(value)
}

const getFunctionKey = (event, analysis) => {
  const value =
    event?.func ??
    event?.function ??
    analysis?.func ??
    analysis?.function ??
    ''

  return String(value ?? '').trim()
}

const getOccurredAt = (event) => {
  return event?.occurredAt ?? event?.createdAt ?? event?.timestamp ?? '-'
}

const getRobotId = (event) => {
  return event?.robotId ?? event?.robot?.id ?? '-'
}

const getSummary = (event, analysis) => {
  const value =
    analysis?.summary ??
    event?.summary ??
    event?.message ??
    ''

  if (!value) return '요약 정보가 없습니다.'
  return String(value)
}

const getReason = (event, analysis) => {
  const value =
    analysis?.reason ??
    event?.reason ??
    ''

  if (!value) return '원인 정보가 없습니다.'
  return String(value)
}

const getAssignee = (event, analysis, apiAssignees = []) => {
  if (Array.isArray(apiAssignees) && apiAssignees.length > 0) {
    return apiAssignees.join(', ')
  }

  const value =
    analysis?.assignee ??
    analysis?.owner ??
    analysis?.manager ??
    event?.assignee ??
    event?.owner ??
    ''

  return String(value)
}

const getAssigneesFromConfig = (payload, functionKey = '') => {
  const base = Array.isArray(payload) ? payload : []
  const normalizedFunctionKey = String(functionKey ?? '').trim().toLowerCase()

  const filtered = normalizedFunctionKey
    ? base.filter((item) => String(item?.func ?? '').trim().toLowerCase() === normalizedFunctionKey)
    : base

  const names = filtered
    .map((item) => String(item?.name ?? item?.email ?? '').trim())
    .filter(Boolean)

  return [...new Set(names)]
}

const getAssigneeProfilesFromConfig = (payload, functionKey = '') => {
  const base = Array.isArray(payload) ? payload : []
  const normalizedFunctionKey = String(functionKey ?? '').trim().toLowerCase()

  const filtered = normalizedFunctionKey
    ? base.filter((item) => String(item?.func ?? '').trim().toLowerCase() === normalizedFunctionKey)
    : base

  return filtered
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null

      const name = String(item.name ?? item.email ?? '').trim()
      const email = String(item.email ?? '').trim()
      const team = String(item.team ?? '').trim()
      const profile = String(item.profile ?? item.job ?? '').trim()
      const key = String(item.id ?? email ?? `${name}-${index + 1}`)

      return {
        key,
        name: name || '-',
        email: email || '-',
        team: team || '-',
        profile: profile || '프로필 정보 없음'
      }
    })
    .filter(Boolean)
}

const getSolution = (event, analysis) => {
  const value =
    analysis?.solution ??
    analysis?.solutions ??
    analysis?.resolution ??
    analysis?.recovery ??
    event?.solution ??
    ''

  if (Array.isArray(value)) {
    const filtered = value.filter(Boolean)
    return filtered.length > 0 ? filtered.join('\n') : '솔루션 정보가 없습니다.'
  }

  if (typeof value === 'string' && value.trim()) {
    return value
  }

  return '솔루션 정보가 없습니다.'
}

const getRawErrorLogBundle = (event, analysis) => {
  return (
    event?.errorLogBundle ??
    analysis?.errorLogBundle ??
    event?.errorLog ??
    analysis?.errorLog ??
    null
  )
}

const getParsedErrorLogBundle = (value) => {
  if (Array.isArray(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)

      if (Array.isArray(parsed)) {
        return parsed
      }

      if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.context)) {
          return [parsed]
        }
      }

      return []
    } catch {
      return [
        {
          context: [
            {
              index: '-',
              level: 'INFO',
              message: value
            }
          ],
          errorIndex: null
        }
      ]
    }
  }

  if (value && typeof value === 'object') {
    if (Array.isArray(value.context)) {
      return [value]
    }

    return []
  }

  return []
}

const EventDetailPanel = ({ eventId, open, onClose, actionOptions = [] }) => {
  const [event, setEvent] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [apiAssignees, setApiAssignees] = useState([])
  const [funcAssigneeProfiles, setFuncAssigneeProfiles] = useState([])
  const [pendingActionName, setPendingActionName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [isLogModalOpen, setIsLogModalOpen] = useState(false)

  useEffect(() => {
    if (!open || !eventId) {
      setEvent(null)
      setAnalysis(null)
      setApiAssignees([])
      setFuncAssigneeProfiles([])
      setPendingActionName('')
      setErrorMessage('')
      setIsLoading(false)
      setIsLogModalOpen(false)
      return
    }

    let isMounted = true

    const load = async () => {
      setIsLoading(true)
      setErrorMessage('')

      try {
        const [eventResponse, analysisResponse, assigneesResponse] = await Promise.allSettled([
          getEventById(eventId),
          getAnalysisByEventId(eventId),
          getAssignees()
        ])

        if (!isMounted) return

        const nextEvent =
          eventResponse.status === 'fulfilled'
            ? normalizeResponse(eventResponse.value)
            : null

        const nextAnalysis =
          analysisResponse.status === 'fulfilled'
            ? normalizeResponse(analysisResponse.value)
            : null

        const nextAssignees =
          assigneesResponse.status === 'fulfilled'
            ? normalizeResponse(assigneesResponse.value)
            : []

        const functionKey = getFunctionKey(nextEvent, nextAnalysis)
        const filteredAssignees = getAssigneesFromConfig(nextAssignees, functionKey)
        const nextFuncAssigneeProfiles = getAssigneeProfilesFromConfig(nextAssignees, functionKey)

        setEvent(nextEvent)
        setAnalysis(nextAnalysis)
        setApiAssignees(filteredAssignees)
        setFuncAssigneeProfiles(nextFuncAssigneeProfiles)

        if (!nextEvent && !nextAnalysis) {
          setErrorMessage('상세 데이터를 불러오지 못했습니다.')
        }
      } catch {
        if (!isMounted) return
        setEvent(null)
        setAnalysis(null)
        setApiAssignees([])
        setFuncAssigneeProfiles([])
        setErrorMessage('상세 데이터를 불러오지 못했습니다.')
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    load()

    return () => {
      isMounted = false
    }
  }, [eventId, open])

  const severityLabel = useMemo(() => getSeverityLabel(event, analysis), [event, analysis])
  const statusLabel = useMemo(() => getStatusLabel(event, analysis), [event, analysis])
  const severityBadgeStyle = useMemo(
    () => getSeverityBadgeStyle(event, analysis),
    [event, analysis]
  )
  const statusBadgeStyle = useMemo(
    () => getStatusBadgeStyle(event, analysis),
    [event, analysis]
  )
  const functionLabel = useMemo(() => getFunctionLabel(event, analysis), [event, analysis])
  const classificationScore = useMemo(() => {
    const seed = `${eventId ?? ''}-${functionLabel ?? ''}`
    return getClassificationScore(seed)
  }, [eventId, functionLabel])
  const occurredAt = useMemo(() => getOccurredAt(event), [event])
  const robotId = useMemo(() => getRobotId(event), [event])
  const summary = useMemo(() => getSummary(event, analysis), [event, analysis])
  const reason = useMemo(() => getReason(event, analysis), [event, analysis])
  const assignee = useMemo(
    () => getAssignee(event, analysis, apiAssignees),
    [event, analysis, apiAssignees]
  )
  const solution = useMemo(() => getSolution(event, analysis), [event, analysis])
  const recommendedActions = useMemo(() => {
    const seed = `${eventId ?? ''}-${functionLabel ?? ''}`
    return getRecommendedActions(actionOptions, seed)
  }, [actionOptions, eventId, functionLabel])

  const rawErrorLogBundle = useMemo(
    () => getRawErrorLogBundle(event, analysis),
    [event, analysis]
  )

  const parsedErrorLogBundle = useMemo(
    () => getParsedErrorLogBundle(rawErrorLogBundle),
    [rawErrorLogBundle]
  )

  return (
    <>
      <PanelRoot>
        <PanelHeader>
          <PanelTitleRow>
            <PanelTitle>{eventId ? `Event #${eventId}` : 'Event Detail'}</PanelTitle>
            <PanelBadge style={severityBadgeStyle}>{severityLabel}</PanelBadge>
          </PanelTitleRow>

          <PanelCloseButton type="button" onClick={onClose}>
            ✕
          </PanelCloseButton>
        </PanelHeader>

        <PanelBody>
          {isLoading ? <LoadingBox>상세 정보를 불러오는 중...</LoadingBox> : null}

          {!isLoading && errorMessage ? (
            <ErrorBox>{errorMessage}</ErrorBox>
          ) : null}

          {!isLoading && !errorMessage ? (
            <>
              <Section>
                <SectionTitleRow>
                  <SectionTitle>이벤트 정보</SectionTitle>
                </SectionTitleRow>

                <SectionBody>
                  <InfoTable>
                    <InfoRow>
                      <InfoKey>Robot ID</InfoKey>
                      <InfoValue>{robotId}</InfoValue>
                    </InfoRow>

                    <InfoRow>
                      <InfoKey>Function</InfoKey>
                      <InfoValue>{functionLabel}</InfoValue>
                    </InfoRow>

                    <InfoRow>
                      <InfoKey>분류 점수</InfoKey>
                      <InfoValue>{classificationScore}</InfoValue>
                    </InfoRow>

                    <InfoRow>
                      <InfoKey>상태</InfoKey>
                      <InfoValue>
                        <PanelBadge as="span" style={statusBadgeStyle}>
                          {statusLabel}
                        </PanelBadge>
                      </InfoValue>
                    </InfoRow>

                    <InfoRow>
                      <InfoKey>심각도</InfoKey>
                      <InfoValue>
                        <PanelBadge as="span" style={severityBadgeStyle}>
                          {severityLabel}
                        </PanelBadge>
                      </InfoValue>
                    </InfoRow>

                    <InfoRow>
                      <InfoKey>로그</InfoKey>
                      <InfoValueBetween>
                        <span>
                          {parsedErrorLogBundle.length > 0 ? '오류 로그 있음' : '오류 로그 없음'}
                        </span>

                        <LogButton
                          type="button"
                          $disabled={parsedErrorLogBundle.length === 0}
                          onClick={() => {
                            if (parsedErrorLogBundle.length === 0) return
                            setIsLogModalOpen(true)
                          }}
                          disabled={parsedErrorLogBundle.length === 0}
                        >
                          로그 보기
                        </LogButton>
                      </InfoValueBetween>
                    </InfoRow>

                    <InfoRow $last>
                      <InfoKey>발생 일시</InfoKey>
                      <InfoValue>{occurredAt}</InfoValue>
                    </InfoRow>
                  </InfoTable>
                </SectionBody>
              </Section>

              <Section>
                <SectionTitleRow>
                  <SectionTitle>요약</SectionTitle>
                </SectionTitleRow>

                <SectionBody>
                  <AnalysisBox>{summary}</AnalysisBox>
                </SectionBody>
              </Section>

              <Section>
                <SectionTitleRow>
                  <SectionTitle>원인</SectionTitle>
                </SectionTitleRow>

                <SectionBody>
                  <AnalysisBox>{reason}</AnalysisBox>
                </SectionBody>
              </Section>
              
              <Section>
                <SectionTitleRow>
                  <SectionTitle>제안 솔루션</SectionTitle>
                </SectionTitleRow>

                <SectionBody>
                  <AnalysisBox>{solution}</AnalysisBox>
                </SectionBody>
              </Section>

              <Section>
                <SectionTitleRow>
                  <SectionTitle>추천 Action</SectionTitle>
                </SectionTitleRow>

                <SectionBody>
                  {recommendedActions.length > 0 ? (
                    <ActionCardList>
                      {recommendedActions.map((item, index) => {
                        const actionName = String(item?.name ?? item?.key ?? `Action ${index + 1}`).trim()
                        const actionKey = String(item?.id ?? item?.key ?? `${eventId}-${index}`)

                        return (
                          <ActionCard
                            key={actionKey}
                            type="button"
                            title={actionName}
                            onClick={() => {
                              setPendingActionName(actionName)
                            }}
                          >
                            {actionName}
                          </ActionCard>
                        )
                      })}
                    </ActionCardList>
                  ) : (
                    <AnalysisBox>
                      <MutedText>추천 Action이 없습니다.</MutedText>
                    </AnalysisBox>
                  )}
                </SectionBody>
              </Section>

              <Section>
                <SectionTitleRow>
                  <SectionTitle>담당자</SectionTitle>
                </SectionTitleRow>

                <SectionBody>
                  {funcAssigneeProfiles.length > 0 ? (
                    <AssigneeList>
                      {funcAssigneeProfiles.map((assigneeItem) => (
                        <AssigneeCard key={assigneeItem.key} >
                          <AssigneeIdentityRow>
                            <Avatar>
                              {isLikelyImageSource(assigneeItem.profile) ? (
                                <AvatarImage
                                  src={assigneeItem.profile}
                                  alt={`${assigneeItem.name || 'assignee'} profile`}
                                />
                              ) : (
                                toInitial(assigneeItem.name)
                              )}
                            </Avatar>

                            <AssigneeMeta>
                              <AssigneeName>{assigneeItem.name}</AssigneeName>
                              <AssigneeMetaLine>{assigneeItem.team}</AssigneeMetaLine>
                            </AssigneeMeta>
                          </AssigneeIdentityRow>
                        </AssigneeCard>
                      ))}
                    </AssigneeList>
                  ) : (
                    <AnalysisBox>
                      {assignee ? assignee : <MutedText>담당자 정보가 없습니다.</MutedText>}
                    </AnalysisBox>
                  )}
                </SectionBody>
              </Section>


            </>
          ) : null}
        </PanelBody>
      </PanelRoot>

      {isLogModalOpen ? (
        <LogModalOverlay onClick={() => setIsLogModalOpen(false)}>
          <LogModal onClick={(e) => e.stopPropagation()}>
            <LogModalHeader>
              <LogModalTitle>로그</LogModalTitle>
              <LogModalCloseButton
                type="button"
                onClick={() => setIsLogModalOpen(false)}
              >
                ✕
              </LogModalCloseButton>
            </LogModalHeader>

            <LogModalBody>
              {parsedErrorLogBundle.length > 0 ? (
                parsedErrorLogBundle.map((bundle, bundleIndex) => (
                  <LogBundle key={`bundle-${bundleIndex}`}>
                    <LogBundleHeader>
                      Error Context #{bundleIndex + 1}
                    </LogBundleHeader>

                    {(bundle?.context || []).map((log) => {
                      const isErrorLine = log?.index === bundle?.errorIndex

                      return (
                        <LogLineRow
                          key={`${bundleIndex}-${log?.index}-${log?.message}`}
                          $error={isErrorLine}
                        >
                          <LogIndex $error={isErrorLine}>
                            #{log?.index ?? '-'}
                          </LogIndex>

                          <LogLevel $level={log?.level} $error={isErrorLine}>
                            {log?.level ?? '-'}
                          </LogLevel>

                          <LogMessage>{log?.message ?? '-'}</LogMessage>
                        </LogLineRow>
                      )
                    })}
                  </LogBundle>
                ))
              ) : (
                <EmptyLogText>표시할 로그가 없습니다.</EmptyLogText>
              )}
            </LogModalBody>
          </LogModal>
        </LogModalOverlay>
      ) : null}

      {pendingActionName ? (
        <ActionConfirmOverlay onClick={() => setPendingActionName('')}>
          <ActionConfirmCard onClick={(e) => e.stopPropagation()}>
            <ActionConfirmText>{pendingActionName} 실행하시겠습니까?</ActionConfirmText>

            <ActionConfirmActions>
              <ActionConfirmButton type="button" onClick={() => setPendingActionName('')}>
                취소
              </ActionConfirmButton>
              <ActionConfirmPrimaryButton type="button" onClick={() => setPendingActionName('')}>
                확인
              </ActionConfirmPrimaryButton>
            </ActionConfirmActions>
          </ActionConfirmCard>
        </ActionConfirmOverlay>
      ) : null}
    </>
  )
}

export default EventDetailPanel
