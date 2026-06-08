import styled from 'styled-components'
import { inputStyle } from '@repo/ui/styles'
import { rotateAnimation } from '@repo/ui/styles'

export const StyledSearch = styled.div`
  ${inputStyle};

  .searchButton {
    display: inline-flex;
    justify-content: center;
    align-items: center;
  }

  .loading {
    display: inline-flex;
    justify-content: center;
    align-items: center;
    color: var(--color-secondary-50);
    animation: ${rotateAnimation} 1s linear infinite;
  }
`
