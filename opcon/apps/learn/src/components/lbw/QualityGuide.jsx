import QualityIndicator from '../common/QualityIndicator'

const PROS = [
  '데이터 수집 속도 빠름',
  '다양한 환경 데이터 확보 가능',
  '로봇 HW 비종속적',
]

const CONS = [
  '정교한 손가락 수준 작업 retargeting 어려움',
  '영상 품질 이슈 (Motion blur, Occlusion)',
  '힘/촉각 정보 획득 불가',
]

const RECOMMENDATION =
  '이 방법은 "빠른 대량 확보"에 적합하며, "정밀 조작 파인튜닝"에는 Teleoperation을 권장합니다.'

export default function QualityGuide() {
  return (
    <QualityIndicator
      pros={PROS}
      cons={CONS}
      recommendation={RECOMMENDATION}
    />
  )
}
