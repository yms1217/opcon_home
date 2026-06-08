import styled from 'styled-components'

const colorMap = {
  success: '#51CF66',
  failed: '#FF6B6B',
  retry: '#FCC419',
  running: '#4A90D9',
  queued: '#868E96',
  completed: '#51CF66',
  'review-pending': '#FCC419',
  approved: '#51CF66',
  rejected: '#FF6B6B',
  accepted: '#51CF66',
  pending: '#FCC419',
}

const Badge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  background: ${({ status }) => `${colorMap[status] || '#868E96'}22`};
  color: ${({ status }) => colorMap[status] || '#868E96'};
  border: 1px solid ${({ status }) => `${colorMap[status] || '#868E96'}44`};

  &::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: ${({ status }) => colorMap[status] || '#868E96'};
  }
`

const STATUS_LABELS = {
  success: '성공',
  failed: '실패',
  retry: '재시도',
  running: '실행 중',
  queued: '대기',
  completed: '완료',
  'review-pending': '검토 대기',
  approved: '승인',
  rejected: '반려',
  accepted: '채택',
  pending: '보류',
}

export default function StatusBadge({ status, label }) {
  return <Badge status={status}>{label || STATUS_LABELS[status] || status}</Badge>
}
