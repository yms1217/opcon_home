import React, { useState, useCallback, useEffect } from 'react'
import { Section } from '@repo/ui'
import { toYmdHmKST } from '@/utils/dateUtils'
import { EditButton } from '@/utils/style'
import { useModalState } from '@repo/hooks'
import { deviceApis } from '@/apis'
import ModalEditRobot from '../modal/ModalEditRobot'

const WebConsole = ({ t, deviceId, robot }) => {
  const EditRobotModal = useModalState()
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false)
  const [deviceInfo, setDeviceInfo] = useState({})
  const [confirmMessage, setConfirmMessage] = useState('')

  useEffect(() => {
    loadDeviceInfo()
  }, [])

  const loadDeviceInfo = useCallback(async (searchParams = {}) => {
    try {
      const data = await deviceApis.getDeviceInfo(deviceId)
      setDeviceInfo(data)
    } catch (err) {
      console.error('Error loadDeviceInfo:', err)
    } finally {
    }
  }, [])

  const openModalEditRobot = () => {
    EditRobotModal.onOpen()
  }

  const conformModalEditRobot = (result) => {
    EditRobotModal.onClose()
    setConfirmMessage(result?.resultNo == 2 ? t('chanegRobotName') : t('errorReport'))
    setIsConfirmModalOpen(true)
  }

  const conformModal = () => {
    setIsConfirmModalOpen(false)
    loadDeviceInfo()
  }

  return (
    <>
      <div>
        <div className="flex">
          <Section></Section>
          <Section></Section>
          <Section></Section>
        </div>
        <div className="flex">
          <Section></Section>
          <Section></Section>
          <Section></Section>
        </div>
      </div>
    </>
  )
}

export default WebConsole
