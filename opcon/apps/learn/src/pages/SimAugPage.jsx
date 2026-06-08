import { useState } from 'react'
import styled from 'styled-components'
import StepWizard from '../components/common/StepWizard'
import { ForgeLink } from '../components/common/ForgeEmbed'
import Card from '../components/common/Card'

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

const OptionGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
`

const Option = styled.div`
  padding: 18px;
  border-radius: 10px;
  border: 2px solid ${({ $selected }) => ($selected ? '#51CF66' : 'var(--color-secondary-20, #dadde2)')};
  background: ${({ $selected }) => ($selected ? 'rgba(81,207,102,0.08)' : 'var(--color-neutral-10, #fff)')};
  cursor: pointer;
  transition: all 0.15s;

  &:hover { border-color: #51CF66; }
`

const OptionTitle = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: var(--color-secondary-90, #262f44);
  margin-bottom: 6px;
`

const OptionDesc = styled.div`
  font-size: 12px;
  color: var(--color-secondary-50, #848c9d);
  line-height: 1.4;
`

const ForgeCards = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`

const INPUT_TYPES = [
  { value: 'augment-existing', title: '기존 데이터셋 기반 증강', desc: '보유한 실제 데이터를 증강합니다' },
  { value: 'image-synthetic', title: '이미지 기반 Synthetic Video', desc: '이미지에서 합성 영상을 생성합니다' },
  { value: 'video-motion', title: '비디오 기반 Motion 생성', desc: '영상에서 모션 데이터를 추출합니다' },
]

const GOALS = [
  { value: 'expand', title: '데이터 수량 확대', desc: '기존 데이터를 다양하게 증폭' },
  { value: 'edge-case', title: 'Edge case 생성', desc: '드문 상황의 데이터 생성' },
  { value: 'env-diversity', title: '환경 다양화', desc: '다양한 배경/조명 데이터' },
  { value: 'scene-rebuild', title: 'Scene Rebuilding', desc: '3D 씬 재구성으로 데이터 생성' },
]

const STEPS = ['입력 데이터 유형', '목표 설정', 'Forge 기능 연결']

export default function SimAugPage() {
  const [step, setStep] = useState(0)
  const [inputType, setInputType] = useState(null)
  const [goals, setGoals] = useState([])

  const toggleGoal = (value) => {
    setGoals((g) => g.includes(value) ? g.filter((x) => x !== value) : [...g, value])
  }

  return (
    <Page>
      <PageTitle>시뮬레이션/증강으로 데이터 확대</PageTitle>
      <PageSub>Forge 생성 도구를 활용하여 기존 데이터를 확대하거나 합성 데이터를 생성합니다</PageSub>

      <Card>
        <StepWizard
          steps={STEPS}
          currentStep={step}
          onNext={() => setStep((s) => s + 1)}
          onBack={() => setStep((s) => s - 1)}
          nextDisabled={(step === 0 && !inputType) || (step === 1 && goals.length === 0)}
        >
          {step === 0 && (
            <div>
              <h3 style={{ margin: '0 0 16px 0', fontSize: 15, color: 'var(--color-secondary-90, #262f44)' }}>
                어떤 유형의 입력 데이터를 사용하시겠습니까?
              </h3>
              <OptionGrid>
                {INPUT_TYPES.map((t) => (
                  <Option key={t.value} $selected={inputType === t.value} onClick={() => setInputType(t.value)}>
                    <OptionTitle>{t.title}</OptionTitle>
                    <OptionDesc>{t.desc}</OptionDesc>
                  </Option>
                ))}
              </OptionGrid>
            </div>
          )}

          {step === 1 && (
            <div>
              <h3 style={{ margin: '0 0 16px 0', fontSize: 15, color: 'var(--color-secondary-90, #262f44)' }}>
                어떤 목표로 증강하시겠습니까? (복수 선택 가능)
              </h3>
              <OptionGrid>
                {GOALS.map((g) => (
                  <Option key={g.value} $selected={goals.includes(g.value)} onClick={() => toggleGoal(g.value)}>
                    <OptionTitle>{g.title}</OptionTitle>
                    <OptionDesc>{g.desc}</OptionDesc>
                  </Option>
                ))}
              </OptionGrid>
            </div>
          )}

          {step === 2 && (
            <div>
              <h3 style={{ margin: '0 0 16px 0', fontSize: 15, color: 'var(--color-secondary-90, #262f44)' }}>
                Forge 생성 도구를 선택하세요
              </h3>
              <ForgeCards>
                <ForgeLink
                  path="/data-generator/mimic"
                  title="Mimic Augmentation"
                  description="실제 데이터를 변형하여 다양한 학습 데이터를 생성합니다"
                />
                <ForgeLink
                  path="/data-generator/wfm-synthetic"
                  title="WFM Synthetic Data"
                  description="World Foundation Model로 합성 데이터를 생성합니다"
                />
                <ForgeLink
                  path="/data-generator/video-to-motion"
                  title="Video to Motion"
                  description="영상에서 모션 데이터를 추출하고 변환합니다"
                />
              </ForgeCards>
            </div>
          )}
        </StepWizard>
      </Card>
    </Page>
  )
}
