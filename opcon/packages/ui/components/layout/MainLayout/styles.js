import styled from 'styled-components'

export const Container = styled.div`
  display: flex;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background-color: var(--color-background);
`

export const ContentWrapper = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  height: 100%;
  overflow: hidden;
`

export const MainContent = styled.main`
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  position: relative;
`

export const StyledLayout = styled.div`
  --header-height: 6rem;
  --sidebar-width: ${({ $compact }) => `${$compact ? 8 : 24}rem`};

  position: relative;
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-areas:
    'header  header    '
    'sideBar scrollArea';
  grid-template-rows: var(--header-height) 1fr;
  grid-template-columns: var(--sidebar-width) 1fr;

  & > .header {
    position: relative;
    grid-area: header;
    z-index: 100;
  }

  & > .sideBar {
    position: relative;
    grid-area: sideBar;
    z-index: 90;
  }

  & > .scrollArea {
    position: relative;
    grid-area: scrollArea;
    z-index: 80;

    & > .main {
      display: flex;
      flex-direction: column;
      padding: 2.4rem 32px;
    }
  }

  @media all and (max-width: 767px) {
    grid-template-columns: 0 1fr;

    & > .sideBar {
      position: absolute;
      width: var(--sidebar-width);
      left: ${({ $compact }) => `${$compact ? 'calc(var(--sidebar-width) * -1)' : 0}`};
      transition: 0.3s;
    }

    & > .scrollArea > .main {
      padding: 16px;
    }
  }
`
