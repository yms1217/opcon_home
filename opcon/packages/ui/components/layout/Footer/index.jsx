import { StyledFnb, StyledFooter } from './styles'
import { Button } from '@repo/ui'
// import { Link } from '@repo/ui/components/common/Link'
import { useLocation } from 'react-router-dom'
import useToggle from '@repo/hooks/useToggle'
import { useTranslation } from 'react-i18next'
// import CustomerContactModal from '@repo/ui/components/common/CustomerContactModal'
const defaultRoutes = [
  { name: 'customerInquiry', path: '/customer-inquiry/', prefix: '', icon: 'link_request', as: 'Link' },
  { name: 'customerInquiry2', path: '/customer-inquiry2/', prefix: '', icon: 'link_request' }
]

const Footer = ({ routes = defaultRoutes }) => {
  const { t } = useTranslation('layout')
  const location = useLocation()
  const { pathname } = location

  const {
    state: showCustomerContactModal,
    on: onOpenCustomerContactModal,
    off: onCloseCustomerContactModal
  } = useToggle()

  const handelClickEvent = (name) => {
    alert(`Clicked footer button! ${t(`Footer.${name}`)}`)
  }

  return (
    <>
      <StyledFooter>
        <StyledFnb>
          <ul className="fnbList">
            {routes.map(({ name, path, as = 'Button' }, index) => {
              return (
                <li key={name} className="fnbItem">
                  <Button
                    type="button"
                    theme="text"
                    as={as || 'Button'}
                    to={path}
                    onClick={() => {
                      // Click event only works for button.
                      as === 'Button' && handelClickEvent(name)
                    }}
                    className={`typographyButton5 ${pathname.includes(path) ? 'active' : ''}`}
                  >
                    {t(`Footer.${name}`)}
                  </Button>
                </li>
              )
            })}
          </ul>
        </StyledFnb>
      </StyledFooter>
      {/* <CustomerContactModal isOpen={showCustomerContactModal} onClose={onCloseCustomerContactModal} /> */}
    </>
  )
}

export default Footer
