import { useLocation } from 'react-router-dom'
import { StyledHeader, StyledHeaderButton, StyledProfileContainer, StyledProfileDropdown } from './styles'
import Button from '../../common/Button'
import LanguageSelect from '../LanguageSelect'
import IconButton from '../../common/IconButton'
import Logo from '../Logo'
import SvgMenu from '../../../assets/svgs/menu.svg'
import SvgNotification from '../../../assets/svgs/notification.svg'
import { useResponsiveStore, useSideBarStore, useUserStore } from '@repo/stores'
import ServiceMenuIcon from '../ServiceMenuIcon'
import { getAppPrefix } from '@repo/utils'
import { useTranslation } from 'react-i18next'
import useToggle from '@repo/hooks/useToggle'
import useClickOutSide from '@repo/hooks/useClickOutSide'
import { useRef } from 'react'
import Icon from '../../common/Icon'

// import { removeCookie } from '@/utlls/cookie';

const Header = () => {
  const { t } = useTranslation('layout')
  const { toggleSideBar } = useSideBarStore()
  const { responsiveMode } = useResponsiveStore()
  const email = useUserStore((state) => state.session?.email)
  const { pathname } = useLocation()
  const fullPathname = typeof window !== 'undefined' ? window.location.pathname : pathname
  const { logout } = useUserStore.getState()

  const currentAppPrefix = getAppPrefix(fullPathname)

  const { state: isProfileOpen, toggle: toggleProfile, off: closeProfile } = useToggle()
  const profileRef = useRef(null)
  useClickOutSide(profileRef, closeProfile)

  const handleLogout = () => {
    useUserStore.getState().logout()
    window.location.href = '/login'
  }

  return (
    <StyledHeader className="header">
      <div className="containerHeader">
        <div className="content left">
          <StyledHeaderButton type="button" onClick={toggleSideBar} aria-label="Open Sidebar" className="hideOnMobile">
            <SvgMenu />
          </StyledHeaderButton>
          <Logo />
          {currentAppPrefix !== '/ebme' && <ServiceMenuIcon t={t} />}
        </div>
        <div className="content right">
          <LanguageSelect />
          <StyledHeaderButton type="button" className="notification" aria-label="View Notifications">
            <i className="icon">
              <SvgNotification />
            </i>
          </StyledHeaderButton>
          <StyledProfileContainer ref={profileRef}>
            {responsiveMode === 'PC' ? (
              <Button type="button" theme="dark" onClick={toggleProfile}>
                <span>{email}</span>
                <span style={{ marginLeft: '4px', display: 'flex', alignItems: 'center' }}>
                  <Icon name={isProfileOpen ? "arrow_up" : "arrow_down"} size={16} />
                </span>
              </Button>
            ) : (
              <IconButton type="button" className="mobile" theme="dark" name="profile" onClick={toggleProfile} />
            )}
            {isProfileOpen && (
              <StyledProfileDropdown>
                <button type="button" onClick={handleLogout}>
                  <Icon name="sign_out" size={16} />
                  Logout
                </button>
              </StyledProfileDropdown>
            )}
          </StyledProfileContainer>
        </div>
      </div>
    </StyledHeader>
  )
}

export default Header
