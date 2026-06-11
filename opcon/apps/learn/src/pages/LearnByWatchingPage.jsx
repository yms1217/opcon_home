import { useState, useEffect } from 'react'
import styled from 'styled-components'
import StepWizard from '../components/common/StepWizard'
import VideoTypeSelector from '../components/lbw/VideoTypeSelector'
import PurposeSelector from '../components/lbw/PurposeSelector'
import QualityGuide from '../components/lbw/QualityGuide'
import VideoUploader from '../components/lbw/VideoUploader'
import MetadataForm from '../components/common/MetadataForm'
import { ForgeLink } from '../components/common/ForgeEmbed'
import Card from '../components/common/Card'
import { createNasDataset, uploadToNas, sendNasToForge } from '../services/nasApi'
import { sendNasToMotionRetargeting } from '../services/motionRetargetingApi'
import { useLearning } from '../context/LearningContext'

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

const StepDesc = styled.p`
  margin: -8px 0 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-secondary-50, #848c9d);
`

const PipelineGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
`

const PipelineCard = styled.button`
  padding: 18px;
  border-radius: 12px;
  border: 1px solid ${({ $selected }) => ($selected ? 'var(--color-primary-60, #2f929f)' : 'var(--color-secondary-20, #dadde2)')};
  background: ${({ $selected }) => ($selected ? 'rgba(47,146,159,0.08)' : 'var(--color-neutral-10, #fff)')};
  text-align: left;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    border-color: var(--color-primary-60, #2f929f);
    background: rgba(47,146,159,0.04);
  }
`

const PipelineTitle = styled.div`
  font-size: 14px;
  font-weight: 700;
  color: var(--color-secondary-90, #262f44);
  margin-bottom: 6px;
`

const PipelineDesc = styled.div`
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-secondary-50, #848c9d);
`

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
  line-height: 1.6;
  background: ${({ $type }) =>
    $type === 'error' ? 'rgba(255,107,107,0.1)' : 'rgba(81,207,102,0.1)'};
  border: 1px solid ${({ $type }) =>
    $type === 'error' ? '#FF6B6B44' : '#51CF6644'};
  color: ${({ $type }) => ($type === 'error' ? '#FF6B6B' : '#2b8a3e')};
`

const InfoCard = styled.div`
  padding: 14px 16px;
  border-radius: 10px;
  border: 1px solid var(--color-secondary-20, #dadde2);
  background: var(--color-neutral-30, #f7f8fa);
`

const InfoTitle = styled.div`
  font-size: 13px;
  font-weight: 700;
  color: var(--color-secondary-90, #262f44);
  margin-bottom: 6px;
`

const InfoText = styled.div`
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-secondary-50, #848c9d);
`

const METADATA_FIELDS = [
  { key: 'taskName', label: 'Task명', required: true, placeholder: '예: 자재 팔레타이징' },
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
  {
    key: 'targetRobot',
    label: '대상 로봇',
    type: 'select',
    options: [
      { value: 'cloid', label: 'CLOiD' },
      { value: 'generic', label: '일반 로봇' },
    ],
  },
  { key: 'notes', label: '메모', placeholder: '추가 정보' },
]

const STEPS = ['영상 유형 선택', '활용 목적 선택', '품질 기대치', '처리 방식 선택', '영상 업로드']

const PIPELINES = [
  {
    value: 'cloid-retargeting',
    title: 'CLOiD Motion Retargeting',
    description:
      'LG 자체 영상 기반 모션 생성 경로입니다. 작업자 영상에서 3D Motion을 추출하고 CLOiD 특화 Trajectory Retargeting 및 Sim2Real 절차로 이어집니다.',
  },
  {
    value: 'forge-video-to-motion',
    title: 'Forge Video-to-Motion',
    description:
      '일반 Video-to-Motion 경로입니다. NAS 저장 후 Forge 생성 도구로 전달하여 후속 모션 추출 작업을 이어갑니다.',
  },
]

export default function LearnByWatchingPage() {
  const { state } = useLearning()
  const [step, setStep] = useState(0)
  const [videoType, setVideoType] = useState(null)
  const [purposes, setPurposes] = useState([])
  const [pipeline, setPipeline] = useState('cloid-retargeting')
  const [files, setFiles] = useState([])
  const [metadata, setMetadata] = useState({
    taskName: state.selectedTask || '',
    targetRobot: 'cloid',
  })
  const [submitting, setSubmitting] = useState(false)
  const [nasDataset, setNasDataset] = useState(null)
  const [transferring, setTransferring] = useState(false)
  const [transferred, setTransferred] = useState(false)
  const [processingJob, setProcessingJob] = useState(null)
  const [submitError, setSubmitError] = useState(null)

  useEffect(() => {
    setMetadata((m) => ({
      ...m,
      targetRobot: pipeline === 'cloid-retargeting' ? 'cloid' : (m.targetRobot || 'generic'),
    }))
  }, [pipeline])

  const togglePurpose = (value) => {
    setPurposes((p) => (p.includes(value) ? p.filter((x) => x !== value) : [...p, value]))
  }

  const handleSaveToNas = async () => {
    if (files.length === 0) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const ds = await createNasDataset({
        name: metadata.taskName || `lbw-${Date.now()}`,
        source: 'lbw',
        pipeline,
        videoType,
        purposes,
        ...metadata,
      })
      await uploadToNas(ds.id, files)
      setNasDataset(ds)
    } catch (e) {
      setSubmitError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleProcess = async () => {
    if (!nasDataset) return
    setTransferring(true)
    setSubmitError(null)
    try {
      if (pipeline === 'forge-video-to-motion') {
        await sendNasToForge(nasDataset.id)
      } else {
        const job = await sendNasToMotionRetargeting(nasDataset.id, {
          taskName: metadata.taskName,
          targetRobot: metadata.targetRobot,
          videoType,
          purposes,
        })
        setProcessingJob(job)
      }
      setTransferred(true)
    } catch (e) {
      setSubmitError(e.message)
    } finally {
      setTransferring(false)
    }
  }

  const processButtonLabel = pipeline === 'cloid-retargeting'
    ? 'LG 모션 리타겟팅 파이프라인으로 전달'
    : 'Forge Video-to-Motion으로 전달'

  return (
    <Page>
      <PageTitle>영상 기반 모션 생성</PageTitle>
      <PageSub>CLOiD용 Motion Retargeting 또는 일반 Video-to-Motion 경로를 선택해 학습용 모션 생성 작업을 진행합니다</PageSub>
      <Card>
        <StepWizard
          steps={STEPS}
          currentStep={step}
          onNext={() => setStep((s) => s + 1)}
          onBack={() => setStep((s) => s - 1)}
          nextDisabled={
            (step === 0 && !videoType) ||
            (step === 1 && purposes.length === 0) ||
            (step === 3 && !pipeline)
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
              <InfoCard>
                <InfoTitle>CLOiD용 경로 참고</InfoTitle>
                <InfoText>
                  CLOiD용 영상 기반 모션 생성은 일반 Video-to-Motion과 달리 작업자 영상에서 3D Motion을 추출한 뒤,
                  Trajectory Retargeting과 Sim2Real 절차를 거치는 내부 경로를 기본으로 고려합니다.
                </InfoText>
              </InfoCard>
            </StepContent>
          )}

          {step === 3 && (
            <StepContent>
              <StepTitle>어떤 처리 방식으로 진행하시겠습니까?</StepTitle>
              <StepDesc>
                CLOiD 대상 작업은 LG 자체 Motion Retargeting 경로를 기본으로 권장하며, 일반적인 영상 변환은 Forge Video-to-Motion을 사용할 수 있습니다.
              </StepDesc>
              <PipelineGrid>
                {PIPELINES.map((item) => (
                  <PipelineCard
                    key={item.value}
                    type="button"
                    $selected={pipeline === item.value}
                    onClick={() => setPipeline(item.value)}
                  >
                    <PipelineTitle>{item.title}</PipelineTitle>
                    <PipelineDesc>{item.description}</PipelineDesc>
                  </PipelineCard>
                ))}
              </PipelineGrid>
            </StepContent>
          )}

          {step === 4 && (
            <StepContent>
              <StepTitle>영상 업로드 및 처리 요청</StepTitle>
              <VideoUploader files={files} onChange={setFiles} />

              <div style={{ marginTop: 8 }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: 14, color: 'var(--color-secondary-70, #555e72)' }}>
                  최소 메타데이터
                </h4>
                <MetadataForm
                  fields={METADATA_FIELDS}
                  values={metadata}
                  onChange={(key, val) => setMetadata((m) => ({ ...m, [key]: val }))}
                  lockedKeys={state.selectedTask ? ['taskName'] : []}
                />
              </div>

              <div style={{ marginTop: 8 }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: 14, color: 'var(--color-secondary-70, #555e72)' }}>
                  처리 요청
                </h4>

                {!nasDataset ? (
                  <>
                    <SubmitBtn onClick={handleSaveToNas} disabled={files.length === 0 || submitting}>
                      {submitting ? 'NAS 저장 중...' : 'NAS에 저장'}
                    </SubmitBtn>
                    {files.length === 0 && (
                      <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--color-secondary-50, #848c9d)' }}>
                        영상 파일을 먼저 업로드하세요
                      </p>
                    )}
                    {submitError && <StatusMsg $type="error">오류: {submitError}</StatusMsg>}
                  </>
                ) : !transferred ? (
                  <>
                    <StatusMsg>✅ NAS 저장 완료 (ID: {nasDataset.id})</StatusMsg>
                    <SubmitBtn onClick={handleProcess} disabled={transferring} style={{ marginTop: 8 }}>
                      {transferring ? '처리 요청 중...' : processButtonLabel}
                    </SubmitBtn>
                    {submitError && <StatusMsg $type="error" style={{ marginTop: 8 }}>오류: {submitError}</StatusMsg>}
                  </>
                ) : pipeline === 'cloid-retargeting' ? (
                  <>
                    <StatusMsg>
                      ✅ LG 모션 리타겟팅 처리 요청 완료
                      {processingJob?.jobId && <><br />Job ID: {processingJob.jobId}</>}
                      <br />작업자 영상 → 3D Motion 추출 → Trajectory Retargeting → Sim2Real 경로로 후속 처리가 이어집니다.
                    </StatusMsg>
                    <InfoCard style={{ marginTop: 12 }}>
                      <InfoTitle>추가 안내</InfoTitle>
                      <InfoText>
                        현재 페이지에서는 NAS 저장과 처리 요청 구간까지 연결합니다. 내부 Motion Retargeting 후속 상태 조회/결과 확인 화면은 별도 연계가 필요합니다.
                        {processingJob?.status && <><br />현재 반환 상태: {processingJob.status}</>}
                      </InfoText>
                    </InfoCard>
                  </>
                ) : (
                  <>
                    <StatusMsg>✅ Forge 전달 요청 완료</StatusMsg>
                    <div style={{ marginTop: 12 }}>
                      <ForgeLink
                        path={`/data-generator/video-to-motion?datasetId=${nasDataset.id}`}
                        title="Forge Video-to-Motion 보기"
                        description="전달된 영상에서 모션 데이터를 생성합니다"
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
