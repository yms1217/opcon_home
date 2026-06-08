import { useEffect, useState, useRef, useCallback } from 'react'
import { Modal, ModalButton, Input } from '@repo/ui'
import { useForm, Controller } from 'react-hook-form'
import { siteApis } from '@/apis'
import { useDaumPostcodePopup } from 'react-daum-postcode'

// 공식 로딩 URL [2](https://postcode.map.kakao.com/)
const POSTCODE_SCRIPT_URL = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js'

const ModalEditSite = ({ isOpen, t, onClose, onConfirm, groupId, siteId, siteInfo }) => {
  const {
    control,
    handleSubmit,
    setValue,
    watch,
    reset,
    setFocus,
    formState: { errors }
  } = useForm({
    mode: 'onSubmit',
    defaultValues: {
      siteName: '',
      zipCode: '',
      sido: '',
      sigungu: '',
      address1: '',
      address2: ''
    }
  })
  const [isBtnValid, setIsBtnValid] = useState(false)
  const [title, setTitle] = useState(t('siteCreate'))

  const siteName = watch('siteName')
  const zipCode = watch('zipCode')
  const sido = watch('sido')
  const sigungu = watch('sigungu')
  const address1 = watch('address1')
  const address2 = watch('address2')
  const address2Ref = useRef(null)

  // 팝업 오픈 함수 (react-daum-postcode) [1](https://www.npmjs.com/package/react-daum-postcode)
  const openPostcode = useDaumPostcodePopup(POSTCODE_SCRIPT_URL)

  useEffect(() => {
    if (isOpen) {
      const isNew = siteId === 'new'
      setTitle(isNew ? t('siteCreate') : t('siteModify'))

      // 모달 열릴 때 초기값 세팅 (siteInfo 기반)
      reset(
        {
          siteName: siteInfo?.siteName ?? '',
          zipCode: siteInfo?.siteAddressPostalCode ?? '',
          sido: siteInfo?.siteAddressState ?? '',
          sigungu: siteInfo?.siteAddressCity ?? '',
          address1: siteInfo?.siteAddressOne ?? '',
          address2: siteInfo?.siteAddressTwo ?? ''
        },
        { keepDirty: false }
      )

      setIsBtnValid(false)
    }
  }, [isOpen, siteId, siteInfo, reset, t])

  // 버튼 활성화 조건(예시): 이름 필수 + 기존값과 달라졌는지
  useEffect(() => {
    setIsBtnValid(siteName?.trim().length > 0 && (siteInfo?.siteName ?? '') !== siteName)
  }, [siteName, siteInfo])

  const handleOpenAddressSearch = useCallback(() => {
    openPostcode({
      onComplete: (data) => {
        // data.zonecode: 우편번호, data.roadAddress / data.address 등 [1](https://www.npmjs.com/package/react-daum-postcode)[2](https://postcode.map.kakao.com/)
        const nextZip = data.zonecode || ''
        const nextAddr1 = data.roadAddress || data.address || ''
        const nextSido = data.sido || ''
        const nextSigungu = data.sigungu || ''

        setValue('zipCode', nextZip, { shouldDirty: true, shouldValidate: true })
        setValue('address1', nextAddr1, { shouldDirty: true, shouldValidate: true })
        setValue('sido', nextSido, { shouldDirty: true, shouldValidate: true })
        setValue('sigungu', nextSigungu, { shouldDirty: true, shouldValidate: true })

        // 상세주소 입력 유도
        requestAnimationFrame(() => {
          setFocus('address2')
        })
      }
    })
  }, [openPostcode, setValue, setFocus])

  const onSubmit = async (values) => {
    try {
      const payload = {
        groupId: groupId,
        siteName: values.siteName,
        siteAddressPostalCode: values.zipCode,
        siteAddressState: values.sido,
        siteAddressCity: values.sigungu,
        siteAddressOne: values.address1,
        siteAddressTwo: values.address2
      }

      if (siteId === 'new') {
        const response = await siteApis.postSites(payload)
        onConfirm?.({ resultNo: response ? 1 : 3 })
      } else if (siteId) {
        const response = await siteApis.putSites(siteId, payload)
        onConfirm?.({ resultNo: response ? 2 : 3 })
      } else {
        onConfirm?.({ resultNo: 3 })
      }
    } catch (error) {
      console.log('error=' + error)
      onConfirm?.({ resultNo: 3 })
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      title={title}
      onClose={onClose}
      closeButton
      renderButtonComponent={
        <>
          <ModalButton onClick={onClose}>{t('cancel')}</ModalButton>
          <ModalButton onClick={handleSubmit(onSubmit)} theme="primary" disabled={!isBtnValid}>
            {t('save')}
          </ModalButton>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        <div style={{ maxHeight: '400px', marginLeft: '1rem' }}>
          <div>
            <p className="typographyBody4" style={{ whiteSpace: 'pre-wrap', marginBottom: '1rem' }}>
              {t('siteName')}
            </p>
            <Controller
              name="siteName"
              control={control}
              rules={{ required: true }}
              render={({ field }) => <Input type="text" placeholder={t('inputSiteName')} size="md" {...field} />}
            />
          </div>
          <div style={{ marginTop: '5px' }}>
            <div>
              <p className="typographyBody4" style={{ whiteSpace: 'pre-wrap', marginBottom: '1rem' }}>
                {t('address')}
              </p>
            </div>
            <div style={{ display: 'none' }}>
              {/* 우편번호 (필수) */}
              <Controller
                name="zipCode"
                control={control}
                render={({ field }) => <Input type="text" size="md" readOnly {...field} />}
              />
              <Controller
                name="sido"
                control={control}
                render={({ field }) => <Input type="text" size="md" readOnly {...field} />}
              />
              <Controller
                name="sigungu"
                control={control}
                render={({ field }) => <Input type="text" size="md" readOnly {...field} />}
              />
            </div>
            <div>
              <Controller
                name="address1"
                control={control}
                rules={{ required: true }}
                render={({ field }) => (
                  <Input
                    type="text"
                    size="md"
                    placeholder={t('searchAddress')}
                    readOnly
                    onClick={handleOpenAddressSearch}
                    {...field}
                  />
                )}
              />
            </div>
            <div style={{ marginTop: '5px' }}>
              {/* 상세주소 (선택/필수는 정책에 맞게) */}
              <Controller
                name="address2"
                control={control}
                render={({ field }) => <Input type="text" size="md" placeholder={t('inputAddress')} {...field} />}
              />
            </div>
          </div>
        </div>
      </form>
    </Modal>
  )
}

export default ModalEditSite
