import styled from 'styled-components'

export const DetailWrapper = styled.div`
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  height: 100%;
  display: flex;
`

export const DivErrorList = styled.div`
  border-color: #f0f0f0;
  --tw-divide-y-reverse: 0;
  border-bottom-style: solid;
  border-top-style: solid;
  border-top-width: 0;
  border-bottom-width: calc(1px);

  &:last-child {
    border-bottom-width: 0;
  }
`

export const SectionList = styled.div`
  display: flex;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1.6rem;
`

