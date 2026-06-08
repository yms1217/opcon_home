import { lazy } from 'react'

const SvgLanguageKr = lazy(() => import('../../../assets/svgs/languages_kr.svg'))
const SvgLanguageUs = lazy(() => import('../../../assets/svgs/languages_us.svg'))
const SvgLanguageJp = lazy(() => import('../../../assets/svgs/languages_jp.svg'))

const languageOptions = [
  {
    key: 'ko',
    name: '한국어',
    icon: SvgLanguageKr
  },
  {
    key: 'en',
    name: 'English',
    icon: SvgLanguageUs
  },
  {
    key: 'ja',
    name: '日本語',
    icon: SvgLanguageJp
  }
]

export default languageOptions
