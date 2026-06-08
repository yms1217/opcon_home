import { useState } from 'react'
import styled from 'styled-components'
import StepWizard from '../components/common/StepWizard'
import VideoTypeSelector from '../components/lbw/VideoTypeSelector'
import PurposeSelector from '../components/lbw/PurposeSelector'
import QualityGuide from '../components/lbw/QualityGuide'
import VideoUploader from '../components/lbw/VideoUploader'
import MetadataForm from '../components/common/MetadataForm'
import { ForgeLink } from '../components/common/ForgeEmbed'
import Card from '../components/common/Card'
import { createDataset, uploadToDataset } from '../services/forgeApi'

const Page = styled.div`
  padding: 32px;
  max-width: 900px;
`

const PageTitle = styled.h1`
  margin: 0 0 8px 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--color-secondary-90, #262f44);
`

const PageSub = styled.p`
  margin: 0 0 32px 0;
  font-size: 14px;
  color: var(--color-secondary-50, #848c9d);
`

const StepContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
`

const StepTitle = styled.h3`
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-secondary-90, #262f44);
`

const METADATA_FIELDS = [
  { key: 'taskName', label: 'Task명', required: true, placeholder: '예: 신발 정리' },
  { key: 'videoCount', label: '영상 수', type: 'number', placeholder: '0' },
  {
    key: 'format',
    label: '주요 포맷',
    type: 'select',
    options: [
      { value: 'mp4', label: 'MP4' },
      { value: 'mov', label: 'MOV' },
      { value: 'avi', label: 'AVI' },
    ],
  },
  { key: 'notes', label: '메모', placeholder: '추가 정보' },
]

const SubmitBtn = styled.button`
  width: 100%;
  padding: 14px;
  border-radius: 10px;
  background: ${({ disabled }) => (disabled ? 'var(--color-secondary-20, #dadde2)' : 'var(--color-primary-60, #2f929f)')};
  color: ${({ disabled }) => (disabled ? 'var(--color-secondary-50, #848c9d)' : '#fff')};
  border: none;
  font-size: 15px;
  font-weight: 700;
  cursor: ${({ disabled }) => (disabled ? 'not-allowed' : 'pointer')};
  margin-top: 8px;

  &:hover:not(:disabled) {
    opacity: 0.88;
  }
`

const StatusMsg = styled.div`
  margin-top: 12px;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 13px;
  background: ${({ $type }) =>
    $type === 'error' ? 'rgba(255,107,107,0.1)' : 'rgba(81,207,102,0.1)'};
  border: 1px solid ${({ $type }) =>
    $type === 'error' ? '#FF6B6B44' : '#51CF6644'};
  color: ${({ $type }) => ($type === 'error' ? '#FF6B6B' : '#51CF66')};
`

const STEPS = ['영상 유형 선택', '활용 목적 선택', '품질 기대치', '영상 업로드']

export default function LearnByWatchingPage() {
  const [step, setStep] = useState(0)
  const [videoType, setVideoType] = useState(null)
  const [purposes, setPurposes] = useState([])
  const [files, setFiles] = useState([])
  const [metadata, setMetadata] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [datasetId, setDatasetId] = useState(null)

  const togglePurpose = (value) => {
    setPurposes((p) => p.includes(value) ? p.filter((x) => x !== value) : [...p, value])
  }

  const handleSubmit = async () => {
    if (files.length === 0) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const ds = await createDataset({
        name: metadata.taskName || `lbw-${Date.now()}`,
        source: 'lbw',
        videoType,
        purposes,
        ...metadata,
      })
      await uploadToDataset(ds.id, files)
      setDatasetId(ds.id)
      setSubmitted(true)
    } catch (e) {
      setSubmitError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Page>
      <PageTitle>Learn-by-Watching으로 영상에서 시작</PageTitle>
      <PageSub>사람 작업 영상으로부터 학습 데이터를 생성합니다</PageSub>

      <Card>
        <StepWizard
          steps={STEPS}
          currentStep={step}
          onNext={() => setStep((s) => s + 1)}
          onBack={() => setStep((s) => s - 1)}
          nextDisabled={
            (step === 0 && !videoType) ||
            (step === 1 && purposes.length === 0)
          }
        >
          {step === 0 && (
            <StepContent>
              <StepTitle>어떤 유형의 영상인가요?</StepTitle>
              <VideoTypeSelector selected={videoType} onSelect={setVideoType} />
            </StepContent>
          )}

          {step === 1 && (
            <StepContent>
              <StepTitle>어떤 목적으로 활용하시겠습니까? (복수 선택 가능)</StepTitle>
              <PurposeSelector selected={purposes} onToggle={togglePurpose} />
            </StepContent>
          )}

          {step === 2 && (
            <StepContent>
              <StepTitle>이 방법의 장점과 한계를 확인하세요</StepTitle>
              <QualityGuide />
            </StepContent>
          )}

          {step === 3 && (
            <StepContent>
              <StepTitle>영상 파일을 업로드하세요</StepTitle>
              <VideoUploader files={files} onChange={setFiles} />

              <div style={{ marginTop: 8 }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: 14, color: 'var(--color-secondary-70, #555e72)' }}>
                  최소 메타데이터
                </h4>
                <MetadataForm
                  fields={METADATA_FIELDS}
                  values={metadata}
                  onChange={(key, val) => setMetadata((m) => ({ ...m, [key]: val }))}
                />
              </div>

              <div style={{ marginTop: 8 }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: 14, color: 'var(--color-secondary-70, #555e72)' }}>
                  Forge 전송
                </h4>
                {!submitted ? (
                  <>
                    <SubmitBtn
                      onClick={handleSubmit}
                      disabled={files.length === 0 || submitting}
                    >
                      {submitting ? '전송 중...' : 'Forge로 전송 및 모션 추출 시작'}
                    </SubmitBtn>
                    {files.length === 0 && (
                      <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--color-secondary-50, #848c9d)' }}>
                        영상 파일을 먼저 업로드하세요
                      </p>
                    )}
                    {submitError && <StatusMsg $type="error">오류: {submitError}</StatusMsg>}
                  </>
                ) : (
                  <>
                    <StatusMsg>✅ 영상이 Forge로 전송되었습니다 (ID: {datasetId})</StatusMsg>
                    <div style={{ marginTop: 12 }}>
                      <ForgeLink
                        path={`/data-generator/video-to-motion?datasetId=${datasetId}`}
                        title="Forge Video to Motion 보기"
                        description="업로드된 영상에서 모션 데이터를 자동으로 추출합니다"
                      />
                    </div>
                  </>
                )}
              </div>
            </StepContent>
          )}
        </StepWizard>
      </Card>
    </Page>
  )
}
