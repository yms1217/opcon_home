import React, { useState, useCallback, useEffect } from 'react'
import { Table, Modal, Button, ExpandableSection, Section } from '@repo/ui'
import { toYmdHmKST } from '@/utils/dateUtils'
import { parseDeviceInfo } from '@/utils/robotUtils'
import { EditButton } from '@/utils/style'
import { SectionList, ControlDiv, ControlBtn } from '../styles'
import { useModalState } from '@repo/hooks'
import { deviceApis } from '@/apis'
import ModalEditRobot from '../modal/ModalEditRobot'
import { useTranslation } from 'react-i18next'
import {
  Play,
  GamePad,
  Battery,
  Wifi,
  Settings,
  Clock,
  Upload,
  OperationStatus,
  RotateCcw,
  PowerOff,
  PlayCircle,
  StopCircle,
  AlertOctagon,
  PauseCircle,
  BatteryCharging
} from '@/assets/icon'

const tempList = [
  { type: 'WARN', date: '4/1 14:10', desc: '경로 재계산 수행됨' },
  { type: 'ERROR', date: '3/30 13:45', desc: '센서 데이터 지연 감지' }
]

const AssetInfo = ({ t, deviceId }) => {
  const EditRobotModal = useModalState()
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false)
  const [deviceInfo, setDeviceInfo] = useState({})
  const [confirmMessage, setConfirmMessage] = useState('')
  const [robotErrors, setRobotErrors] = useState([])
  const { t: tCommon } = useTranslation('common')

  useEffect(() => {
    loadDeviceInfo()
  }, [])

  function getStatus(status, target) {
    let className = ''
    let text = ''
    switch (status) {
      case 'OPERATION':
        text = t('operation')
        break
      case 'STANDBY':
        text = t('wait')
        break
      case 'CHARGE':
        text = t('charge')
        break
      case 'ERROR':
        text = t('error')
        break
      case 'OFFLINE':
        text = t('offline')
        break
      case 'REGISTERED':
        text = t('register')
        break
      case 'ACTIVE':
        text = t('active')
        break
      case 'DELETE':
        text = t('delete')
        break
      default:
        text = t('noData')
        break
    }

    if (target == 'badge') {
      return className
    } else if (target == 'text') {
      return text
    }
  }

  const loadDeviceInfo = useCallback(async (searchParams = {}) => {
    try {
      const data = await deviceApis.getDeviceInfo(deviceId)
      setDeviceInfo(parseDeviceInfo(data))
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

  const handleLogPlayClick = () => {
    if (!deviceId) return
    const popup = window.open('../logreplay?deviceId=' + deviceId, '_blank', 'noopener,noreferrer')
  }

  const handleClick = () => {
    if (!deviceId) return
    const popup = window.open('../ReplayControls?deviceId=' + deviceId, '_blank', 'noopener,noreferrer')
  }

  const errorColumns = [
    {
      name: t('occurDate'),
      selector: (row) => (row.erroredAt ? toYmdHmKST(row.erroredAt) : '-'),
      sortable: true
    },
    {
      name: t('errorCode'),
      selector: (row) => row.errorCode,
      sortable: true
    },
    {
      name: t('errorDetail'),
      selector: (row) => row.errorTitle,
      sortable: true,
      width: '60%',
      wrap: true
    },
    {
      name: t('recoverySatus'),
      selector: (row) => (
        <span style={{ color: row.isRecovered ? '#16a34a' : '#dc2626' }}>
          {row.isRecovered ? t('complete') : t('imcomplete')}
        </span>
      ),
      sortable: true
    },
    {
      name: t('recoveryDate'),
      selector: (row) => (row.recoveredAt ? toYmdHmKST(row.recoveredAt) : '-'),
      sortable: true
    }
  ]

  useEffect(() => {
    if (deviceId) {
      loadErrorList()
    }
  }, [deviceId])

  const loadErrorList = useCallback(
    async (searchParams = {}) => {
      try {
        const data = await deviceApis.getDeviceErrors(deviceId)
        //console.info('data :', data)
        setRobotErrors(data.content)
      } catch (err) {
        console.error('Error loadGetDevices:', err)
      } finally {
      }
    },
    [deviceId]
  )

  const handleRobotAction = (action) => {
    if (!isOnline && action !== 'reboot' && action !== 'shutdown') {
      alert(t('offlineStatue'))
      return
    }
    // TODO: API call for robot action
    console.log(`Robot action: ${action}`)
    alert(`${action} ` + t('sendCommand'))
  }

  const isOnline = deviceInfo.state && deviceInfo.state != 'OFFLINE'

  return (
    <>
      <div className="flex flex-col gap-4">
        <ExpandableSection
          header={
            <div>
              <span>{deviceInfo.name}</span>
              <span style={{ marginLeft: 5 }}>{t('assetInfo')}</span>
              <span style={{ marginLeft: 15 }}>MAC: {deviceInfo.mac}</span>
              <span style={{ marginLeft: 5 }}>|</span>
              <span style={{ marginLeft: 5 }}>S/W: {deviceInfo.version}</span>
            </div>
          }
          expandedHeader={
            <div>
              <span>{deviceInfo.name}</span>
              <span style={{ marginLeft: 5 }}>{t('assetInfo')}</span>
            </div>
          }
        >
          <Section>
            <Table
              className="no-table-head"
              noTableHead
              columns={[
                {
                  name: 'label',
                  cell: (row) => (
                    <div style={{ fontSize: '14px' }}>
                      <span>{row.label}</span>
                    </div>
                  )
                },
                {
                  name: 'value',
                  cell: (row) => (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
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
                { label: t('robotName'), value: deviceInfo.name, editable: true },
                { label: t('model'), value: deviceInfo.model ?? 'no model' },
                {
                  label: t('group'),
                  value: deviceInfo.groupName ? deviceInfo.groupName : t('unassigned')
                },
                {
                  label: t('site'),
                  value: deviceInfo.siteName ? deviceInfo.siteName : t('unassigned')
                },
                { label: t('swVersion'), value: deviceInfo.version ?? '' },
                {
                  label: 'Serial Number',
                  value: deviceInfo.serial ?? '',
                  copyable: true
                },
                {
                  label: 'MAC Address',
                  value: deviceInfo.mac ?? '',
                  copyable: true
                },
                {
                  label: t('registerDate'),
                  value: deviceInfo.registerDate ? toYmdHmKST(deviceInfo.registerDate) : '-'
                }
              ]}
            />
          </Section>
        </ExpandableSection>
        <Section gap="1rem">
          <label className="typographyBody4" style={{ fontWeight: 'bold' }}>
            {t('statusSummary')}
          </label>
          <SectionList>
            {[
              {
                icon: Battery,
                label: t('batterySocSoh'),
                value:
                  (deviceInfo.batterySoc ? deviceInfo.batterySoc + '%' : '-') +
                  ' / ' +
                  (deviceInfo.batterySoh ? deviceInfo.batterySoh + '%' : '-')
                //warn: robot.battery <= 30
              },
              {
                icon: Wifi,
                label: t('network'),
                value: '안정'
                //warn: robot.network !== '안정'
              },
              {
                icon: OperationStatus,
                label: t('operateStatus'),
                value: getStatus(deviceInfo.state ?? '', 'text'),
                warn: deviceInfo.state == 'ERROR'
              },
              {
                icon: Clock,
                label: t('finalUpdate'),
                value: deviceInfo.updateDate ? toYmdHmKST(deviceInfo.updateDate) : '-',
                warn: false
              }
            ].map((item, index) => (
              <Section key={item.label ?? index} className="gap-1.5">
                <div className="mb-10">
                  <item.icon />
                  <span className="ml-5">{item.label}</span>
                </div>
                <span className={`ml-10 ${item.warn ? 'text-[#dc2626]' : 'text-[#333]'}`}>{item.value}</span>
              </Section>
            ))}
          </SectionList>
        </Section>
        <Section className="mt-8">
          <label className="typographyBody4" style={{ fontWeight: 'bold' }}>
            {t('magorAction')}
          </label>
          <div className="mt-5 flex flex-wrap gap-2 sm:gap-2.5">
            <Button theme={'primary'} onClick={handleLogPlayClick}>
              <Play className="w-[14px] h-[14px]" /> {t('drivingLogReplay')}
            </Button>
            <Button theme={'primary'} onClick={handleClick}>
              <GamePad className="w-[14px] h-[14px]" /> {t('manipulationLogReplay')}
            </Button>
            <Button theme={'primary'}>
              <Upload className="w-[14px] h-[14px]" /> {t('logUploadRequest')}
            </Button>
          </div>
        </Section>
        <Section className="mt-8">
          <label className="typographyBody4" style={{ fontWeight: 'bold' }}>
            {t('robotControl')}
          </label>
          <ControlDiv style={{ marginTop: '1.25rem' }}>
            <ControlBtn onClick={() => handleRobotAction('reboot')}>
              <RotateCcw className="w-[14px] h-[14px]" />
              {t('reboot')}
            </ControlBtn>
            <ControlBtn onClick={() => handleRobotAction('shutdown')}>
              <PowerOff className="w-[14px] h-[14px]" />
              {t('powerEnd')}
            </ControlBtn>
            <ControlBtn onClick={() => handleRobotAction('start')} disabled={!isOnline}>
              <PlayCircle className="w-[14px] h-[14px]" />
              {t('start')}
            </ControlBtn>
            <ControlBtn onClick={() => handleRobotAction('stop')} disabled={!isOnline}>
              <StopCircle className="w-[14px] h-[14px]" />
              {t('stop')}
            </ControlBtn>
            <ControlBtn onClick={() => handleRobotAction('emergency_stop')} disabled={!isOnline} $danger>
              <AlertOctagon className="w-[14px] h-[14px]" />
              {t('emergencyStop')}
            </ControlBtn>
            <ControlBtn onClick={() => handleRobotAction('pause_task')} disabled={!isOnline}>
              <PauseCircle className="w-[14px] h-[14px]" />
              {t('workTempStop')}
            </ControlBtn>
            <ControlBtn onClick={() => handleRobotAction('resume_task')} disabled={!isOnline}>
              <PlayCircle className="w-[14px] h-[14px]" />
              {t('workReume')}
            </ControlBtn>
            <ControlBtn onClick={() => handleRobotAction('go_charging')} disabled={!isOnline}>
              <BatteryCharging className="w-[14px] h-[14px]" />
              {t('chargeStationMove')}
            </ControlBtn>
          </ControlDiv>
        </Section>
        <Section>
          <label className="typographyBody4" style={{ fontWeight: 'bold' }}>
            {t('recentErrorSummary')}
          </label>
          <div style={{ marginTop: '1.25rem' }}>
            <Table
              columns={errorColumns}
              data={robotErrors}
              noData={tCommon('noData')}
              pagination
              paginationRowsPerPageOptions={[10, 30, 50, 100]}
            />
          </div>
        </Section>
      </div>

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
