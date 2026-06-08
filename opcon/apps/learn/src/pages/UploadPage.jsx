import { useState, useRef } from 'react'
import styled from 'styled-components'
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

const Section = styled.div`
  margin-bottom: 28px;
`

const SectionTitle = styled.h3`
  margin: 0 0 14px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-secondary-70, #555e72);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-secondary-20, #dadde2);
`

const TypeGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
`

const TypeItem = styled.div`
  padding: 14px 18px;
  border-radius: 10px;
  border: 2px solid ${({ $selected }) => ($selected ? '#868E96' : 'var(--color-secondary-20, #dadde2)')};
  background: ${({ $selected }) => ($selected ? 'rgba(134,142,150,0.1)' : 'var(--color-neutral-10, #fff)')};
  cursor: pointer;
  font-size: 13px;
  color: var(--color-secondary-90, #262f44);
  transition: all 0.15s;

  &:hover { border-color: #868E96; }
`

const DropZone = styled.div`
  border: 2px dashed ${({ $dragOver }) => ($dragOver ? '#868E96' : 'var(--color-secondary-20, #dadde2)')};
  border-radius: 12px;
  padding: 40px 24px;
  text-align: center;
  cursor: pointer;
  background: var(--color-neutral-10, #fff);
  transition: all 0.2s;

  &:hover { border-color: #868E96; }
`

const FormatCheckResult = styled.div`
  padding: 14px 18px;
  border-radius: 8px;
  background: ${({ $pass }) => ($pass ? 'rgba(81,207,102,0.1)' : 'rgba(255,107,107,0.1)')};
  border: 1px solid ${({ $pass }) => ($pass ? '#51CF6644' : '#FF6B6B44')};
  font-size: 13px;
  color: ${({ $pass }) => ($pass ? '#51CF66' : '#FF6B6B')};
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

const DATA_TYPES = [
  'Teleop dataset',
  'Fleet/TMS 로그 dataset',
  'Human video dataset',
  '외부 benchmark / 공개 dataset',
]

const METADATA_FIELDS = [
  { key: 'taskName', label: 'Task명', required: true, placeholder: '예: Pick & Place' },
  {
    key: 'robotType',
    label: 'Robot type',
    type: 'select',
    options: [
      { value: 'RSP-7', label: 'RSP-7' },
      { value: 'RSP-9', label: 'RSP-9' },
    ],
  },
  {
    key: 'modality',
    label: '모달리티',
    type: 'select',
    options: [
      { value: 'vision', label: 'Vision' },
      { value: 'state', label: 'State' },
      { value: 'force', label: 'Force' },
      { value: 'vision+state', label: 'Vision + State' },
    ],
  },
  {
    key: 'hasLabel',
    label: '성공/실패 라벨 유무',
    type: 'select',
    options: [
      { value: 'yes', label: '있음' },
      { value: 'no', label: '없음' },
    ],
  },
  {
    key: 'purpose',
    label: '학습 용도',
    type: 'select',
    options: [
      { value: 'pre-training', label: 'Pre-Training' },
      { value: 'fine-tuning', label: 'Fine-tuning' },
      { value: 'benchmark', label: 'Benchmark' },
    ],
  },
]

export default function UploadPage() {
  const [dataType, setDataType] = useState(null)
  const [metadata, setMetadata] = useState({})
  const [files, setFiles] = useState([])
  const [dragOver, setDragOver] = useState(false)
  const [formatCheck, setFormatCheck] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [datasetId, setDatasetId] = useState(null)
  const inputRef = useRef(null)

  const addFiles = (newFiles) => {
    const arr = Array.from(newFiles)
    setFiles((f) => [...f, ...arr])
    setFormatCheck(arr.every((f) => f.name.endsWith('.json') || f.name.endsWith('.hdf5') || f.name.endsWith('.zip')))
  }

  const handleSubmit = async () => {
    if (!dataType || files.length === 0) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const ds = await createDataset({
        name: metadata.taskName || `upload-${Date.now()}`,
        source: 'upload',
        dataType,
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
      <PageTitle>기존 데이터 업로드</PageTitle>
      <PageSub>이미 확보된 dataset을 업로드하고 Forge로 연결합니다</PageSub>

      <Card>
        <Section>
          <SectionTitle>데이터 유형 선택</SectionTitle>
          <TypeGrid>
            {DATA_TYPES.map((type) => (
              <TypeItem key={type} $selected={dataType === type} onClick={() => setDataType(type)}>
                {type}
              </TypeItem>
            ))}
          </TypeGrid>
        </Section>

        <Section>
          <SectionTitle>메타데이터 입력</SectionTitle>
          <MetadataForm
            fields={METADATA_FIELDS}
            values={metadata}
            onChange={(key, val) => setMetadata((m) => ({ ...m, [key]: val }))}
          />
        </Section>

        <Section>
          <SectionTitle>파일 업로드</SectionTitle>
          <DropZone
            $dragOver={dragOver}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files) }}
            onClick={() => inputRef.current?.click()}
          >
            <div style={{ fontSize: 32, marginBottom: 12 }}>📤</div>
            <div style={{ fontSize: 14, color: 'var(--color-secondary-90, #262f44)', fontWeight: 600, marginBottom: 6 }}>
              파일을 드래그하거나 클릭하여 업로드
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-secondary-50, #848c9d)' }}>
              JSON, HDF5, ZIP 지원 · {files.length > 0 && `${files.length}개 선택됨`}
            </div>
            <input
              ref={inputRef}
              type="file"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => addFiles(e.target.files)}
            />
          </DropZone>

          {formatCheck !== null && (
            <FormatCheckResult $pass={formatCheck} style={{ marginTop: 12 }}>
              {formatCheck
                ? '✅ 지원되는 포맷입니다. Forge로 전송할 수 있습니다.'
                : '⚠️ 일부 파일이 지원되지 않는 포맷입니다. JSON, HDF5, ZIP을 사용하세요.'}
            </FormatCheckResult>
          )}
        </Section>

        <Section>
          <SectionTitle>Forge 전송</SectionTitle>
          {!submitted ? (
            <>
              <SubmitBtn
                onClick={handleSubmit}
                disabled={!dataType || files.length === 0 || formatCheck === false || submitting}
              >
                {submitting ? '전송 중...' : 'Forge로 전송'}
              </SubmitBtn>
              {!dataType && (
                <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--color-secondary-50, #848c9d)' }}>
                  데이터 유형을 먼저 선택하세요
                </p>
              )}
              {submitError && <StatusMsg $type="error">오류: {submitError}</StatusMsg>}
            </>
          ) : (
            <>
              <StatusMsg>✅ 데이터셋이 생성되어 Forge로 전송되었습니다 (ID: {datasetId})</StatusMsg>
              <div style={{ marginTop: 12 }}>
                <ForgeLink
                  path={`/datasets/${datasetId}`}
                  title="Forge Dataset 보기"
                  description="생성된 데이터셋을 Forge에서 확인합니다"
                />
              </div>
            </>
          )}
        </Section>
      </Card>
    </Page>
  )
}
