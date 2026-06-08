import { StyledTag } from './styles'

const Tag = ({ children, theme = 'light' }) => {
  return <StyledTag $theme={theme}>{children}</StyledTag>
}

export default Tag
