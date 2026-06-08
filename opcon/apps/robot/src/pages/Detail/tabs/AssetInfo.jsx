import React, { useState, useCallback, useEffect } from 'react'
import { Table, Modal, Button } from '@repo/ui'
import { toYmdHmKST } from '@/utils/dateUtils'
import { EditButton } from '@/utils/style'
import { useModalState } from '@repo/hooks'
import { deviceApis } from '@/apis'
import ModalEditRobot from '../modal/ModalEditRobot'

const AssetInfo = ({ t, deviceId, robot }) => {
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
      <Table
        className="no-table-head"
        noTableHead
        columns={[
          {
            name: 'label',
            cell: (row) => row.label
          },
          {
            name: 'value',
            cell: (row) => (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>{row.value}</span>
                {row.editable && (
                  <EditButton type="button" onClick={openModalEditRobot}>
                    {t('modify')}
                  </EditButton>
                )}
              </div>
            )
          }
        ]}
        data={[
          { label: t('robotName'), value: deviceInfo.deviceName, editable: true },
          { label: t('model'), value: robot.model },
          {
            label: t('group'),
            value: deviceInfo.assign?.groupName ? deviceInfo.assign.groupName : t('unassigned')
          },
          {
            label: t('site'),
            value: deviceInfo.assign?.siteName ? deviceInfo.assign.siteName : t('unassigned')
          },
          { label: t('S/W 버전'), value: robot.softwareVersion },
          {
            label: 'Serial Number',
            value: deviceInfo.deviceSerialNumber ? deviceInfo.deviceSerialNumber : robot.serialNumber,
            copyable: true
          },
          {
            label: 'MAC Address',
            value: deviceInfo.deviceMacAddress ? deviceInfo.deviceMacAddress : robot.macAddress,
            copyable: true
          },
          {
            label: t('registerDate'),
            value: deviceInfo?.registeredAt ? toYmdHmKST(deviceInfo.registeredAt) : '-'
          }
        ]}
      />
      <ModalEditRobot
        isOpen={EditRobotModal.isOpen}
        onClose={EditRobotModal.onClose}
        onConfirm={conformModalEditRobot}
        t={t}
        deviceId={deviceId}
        deviceInfo={deviceInfo}
      />
      <Modal
        isOpen={isConfirmModalOpen}
        size="xs"
        onClose={() => setIsConfirmModalOpen(false)}
        renderButtonComponent={
          <div style={{ display: 'flex', gap: '1rem', width: '100%', justifyContent: 'center' }}>
            <Button variant="contained" theme="primary" onClick={conformModal}>
              {t('confirm')}
            </Button>
          </div>
        }
      >
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <p className="typographyBody2" style={{ whiteSpace: 'pre-wrap', textAlign: 'center' }}>
            {confirmMessage}
          </p>
        </div>
      </Modal>
    </>
  )
}

export default AssetInfo
