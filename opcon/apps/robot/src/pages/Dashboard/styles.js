import styled from 'styled-components'

export const DashboardWrapper = styled.div`
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  height: 100%;
  display: flex;
`

export const DashSection = styled.section``

export const DivPageBody = styled.div`
  gap: 2.4rem;
  flex-wrap: wrap;
  display: flex;
  margin-top: 10px;
`

export const DivDashState = styled.div`
  width: calc(100% / 3 * 2 - 1.2rem);
  flex-direction: column;
  flex: 1 1 0%;
  display: flex;
`

export const DivSectionTitle = styled.div`
  justify-content: space-between;
  align-items: center;
  display: flex;
}
`

export const H3SectionTitle = styled.h3`
  --tw-text-opacity: 1;
  color: rgb(44 45 56 / var(--tw-text-opacity));
  font-weight: 700;
  font-size: 1.6rem;
  margin-bottom: 1.3rem;
`

export const DivStateList = styled.div`
  cursor: pointer;
  gap: 0.8rem;
  display: flex;
  flex-wrap: wrap;
`

export const ArticleStateItem = styled.article`
  min-height: calc(100% - 36px);
  background: linear-gradient(197.77deg, #fffeff 18.23%, #f1f8ff 84.66%);
  padding: 1.6rem 2rem;
  color: #333;
  justify-content: space-between;
  flex-direction: column;
  height: 14rem;
  flex: 1 1 0%;
  display: flex;
  border-radius: 1rem;
  border: solid 1px rgba(172, 173, 188, 0.3);
  box-shadow: 0 0 15px 0 rgba(173, 173, 173, 0.2);
  position: relative;
`

export const H4StateText = styled.h4`
  padding-left: 7rem;
  font-size: 1.6rem;
  text-align: right;
  word-break: keep-all;
  word-wrap: break-word;
  font-weight: 700;
`

export const DivStateCount = styled.div`
  justify-content: space-between;
  align-items: flex-end;
  display: flex;
`

export const StrongStateNumber = styled.strong`
  font-size: 2.7rem;
  margin-left: auto;
  line-height: 1.16;
`

export const SpanStateUnit = styled.span`
  font-size: 1.2rem;
`

export const DivMarginTop = styled.div`
  margin-top: 2.4rem;
`

export const ArticleMap = styled.article`
  min-height: calc(100% - 36px);
  padding-top: 0.8rem;
  padding-bottom: 0.8rem;
  justify-content: flex-end;
  flex: none;
  width: 100%;
  hegit: 431px;
`

export const DivMapCard = styled.div`
  display: flex;
  position: relative;
  width: 100%;
  height: 100%;
`

export const DivMapWrap = styled.div`
  overflow: hidden;
  width: 100%;
}
`

export const DivDashAlarm = styled.div`
  width: calc(100% / 3);
  display: flex;
  @media all and (max-width: 1580px) {
    width: 100%;
    display: block;
  }
`

export const DivDashAlarmTable = styled.div`
  > * {
    flex-basis: auto;
  }
`

