import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { StyledPageContent, Title, Section, Tabs, Tab, Table } from '@repo/ui'
import { DetailWrapper, DivErrorList, SectionList } from './styles'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { deviceApis } from '@/apis'
import { toast } from 'react-toastify'
import { toYmdHmKST } from '@/utils/dateUtils'
import AssetInfo from './tabs/AssetInfo'
import ErrorList from './tabs/ErrorList'
import WebConsole from './tabs/WebConsole'
import '../../index.css'
import { Button } from '@repo/ui'
import {
  AlertTriangle,
  Play,
  GamePad,
  Battery,
  Wifi,
  Settings,
  Clock,
  Edit,
  Save,
  Cancel,
  Upload,
  OperationStatus
} from '@/assets/icon'

const Detail = () => {
  const { t } = useTranslation('robot')
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const deviceId = searchParams.get('deviceId')
  const [deviceInfo, setDeviceInfo] = useState({})

  const robots = [
    {
      id: 'r1',
      name: 'robot1',
      model: 'RX-200',
      status: '운영',
      group: 'Group A',
      site: 'Site A-1',
      serialNumber: 'SN-20240001',
      macAddress: 'AA:BB:CC:01:23:01',
      softwareVersion: 'v2.4.1',
      lastUpdated: '2026-03-10 14:23',
      battery: 78,
      network: '안정',
      mode: '자율주행',
      registeredDate: '2025-06-15',
      errors: [
        { time: '4/1 14:10', level: 'WARN', message: '경로 재계산 수행됨', type: 'type1' },
        { time: '3/30 13:45', level: 'ERROR', message: '센서 데이터 지연 감지', type: 'type1' }
      ],
      mapId: 'map1'
    }
  ]
  const [isEditingName, setIsEditingName] = useState(false)

  const robot = robots[0]
  const [editedName, setEditedName] = useState('')

  const levelColor = {
    INFO: 'bg-[#dbeafe] text-[#2563eb]',
    WARN: 'bg-[#fef3c7] text-[#d97706]',
    ERROR: 'bg-[#fee2e2] text-[#dc2626]',
    FATAL: 'bg-[#fecaca] text-[#991b1b]'
  }

  function getStatus(status, target) {
    let className = ''
    let text = ''
    switch (status) {
      case 'OPERATION':
        className = 'bg-[#dbeafe] text-[#2563eb]'
        text = t('operation')
        break
      case 'WAIT':
        className = 'bg-[#f3f4f6] text-[#6b7280]'
        text = t('wait')
        break
      case 'CHARGE':
        className = 'bg-[#d1fae5] text-[#059669]'
        text = t('charge')
        break
      case 'ERROR':
        className = 'bg-[#fee2e2] text-[#dc2626]'
        text = t('error')
        break
      case 'OFFLINE':
        className = 'bg-[#fef3c7] text-[#d97706]'
        text = t('offline')
        break
      case 'REGISTERED':
        className = 'bg-[#f3f4f6] text-[#6b7280]'
        text = t('register')
        break
      case 'ACTIVE':
        className = 'bg-[#d1fae5] text-[#059669]'
        text = t('active')
        break
      case 'DELETE':
        className = 'bg-[#fee2e2] text-[#dc2626]'
        text = t('delete')
        break
      default:
        className = 'bg-[#ede9fe] text-[#6d28d9]'
        text = t('noData')
        break
    }

    if (target == 'badge') {
      return className
    } else if (target == 'text') {
      return text
    }
  }

  useEffect(() => {
    let canceled = false
    ;(async () => {
      try {
        const data = await deviceApis.getDeviceInfo(deviceId)
        if (!canceled && data) {
          setDeviceInfo(data)
          setEditedName(data.deviceName)
        }
      } catch (e) {
        console.error('Error loadGetDevices:', e)
      }
    })()
    return () => {
      canceled = true
    }
  }, [deviceId])

  const handleLogPlayClick = () => {
    if (!deviceId) return
    const popup = window.open('../logreplay?deviceId=' + deviceId, '_blank', 'noopener,noreferrer')
  }

  const handleClick = () => {
    if (!deviceId) return
    const popup = window.open('../ReplayControls?deviceId=' + deviceId, '_blank', 'noopener,noreferrer')
  }

  const handleSaveName = () => {
    let canceled = false
    ;(async () => {
      try {
        const response = await deviceApis.putDeviceInfo(deviceId, editedName)
        if (!canceled && response) {
          deviceInfo.deviceName = editedName
          setDeviceInfo(deviceInfo)
          toast.success(t('chanegRobotName'), { autoClose: 2000 })
        }
      } catch (e) {
        console.error('Error loadGetDevices:', e)
        toast.error(t('noChangeByError'), { autoClose: 2000 })
      } finally {
        canceled = true
        setIsEditingName(false)
      }
    })()
  }

  const handleCancelEdit = () => {
    setEditedName(deviceInfo.deviceName)
    setIsEditingName(false)
  }

  return (
    <StyledPageContent className="column">
      <Title>{t('robotDetail')}</Title>

      <div className="flex flex-col gap-4">
        <Section gap="1rem">
          <label className="typographyBody4" style={{ fontWeight: 'bold' }}>
            {t('상태 요약')}
          </label>
          <SectionList>
            {[
              {
                icon: OperationStatus,
                label: t('operateStatus'),
                value: getStatus(deviceInfo.deviceStatus ?? '', 'text')
                //warn: robot.battery <= 30
              },
              {
                icon: Battery,
                label: t('bettery'),
                value: `78%`,
                warn: robot.battery <= 30
              },
              {
                icon: Wifi,
                label: t('network'),
                value: '안정',
                warn: robot.network !== '안정'
              },
              { icon: Settings, label: t('mode'), value: '자율주행', warn: false },
              {
                icon: Clock,
                label: t('finalUpdate'),
                value: deviceInfo?.updatedAt ? toYmdHmKST(deviceInfo.updatedAt) : '-',
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
        <Section>
          <Tabs defaultActiveId="tabAssetInfo">
            <Tab id="tabAssetInfo" label={t('basicInformation')}>
              <AssetInfo t={t} deviceId={deviceId} deviceInfo={deviceInfo} robot={robot} />
            </Tab>
            <Tab id="tabError" label={t('recentErrorSummary')}>
              <ErrorList t={t} deviceId={deviceId} />
            </Tab>
            {/* <Tab id="tabWebConsole" label={t('Web Console')}>
              <WebConsole t={t} deviceId={deviceId} deviceInfo={deviceInfo} robot={robot} />
            </Tab> */}
          </Tabs>
        </Section>
      </div>
    </StyledPageContent>
  )
}

export default Detail

