import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  StyledPageContent,
  SectionRobot,
  Title,
  Table,
  NoData,
  Dropdown,
  Search,
  HeaderTitleGroup,
  Button
} from '@repo/ui'
import { P, SearchContainer } from './styles'
import { useTranslation } from 'react-i18next'
import { deviceApis, groupApis, siteApis } from '@/apis'
import { toYmdHmKST } from '@/utils/dateUtils'
import ButtonRun from './ButtonRun'
import { useModalState } from '@repo/hooks'
import ModalModifyRobot from './modal/ModalModifyRobot'
import ModalResult from './modal/ModalResult'
import { useNavigate } from 'react-router-dom'
import '../../index.css'
import { GroupSiteFilter, UNREGISTERED } from '../../common/GroupSiteFilter'
import { AppProvider, useAppContext } from '@/common/AppContext'
import { X } from 'lucide-react'

const Management = () => {
  const [refreshKey, setRefreshKey] = useState(0)
  const { t } = useTranslation('robot')
  const [devices, setDevices] = useState([])
  const [filteredDevices, setFilteredDevices] = useState([])
  const isLoading = false
  const [deviceId, setDeviceId] = useState('')
  const [deviceName, setDeviceName] = useState('')
  const [deviceNameModResult, setDeviceNameModResult] = useState(false)
  const navigate = useNavigate()
  //const [groups, setGourps] = useState([])
  //const [sites, setSites] = useState([])
  const [groupsSites, setGroupsSites] = useState([])
  const { selectedGroup, selectedSite } = useAppContext()

  const [registrationStatusFilter, setRegistrationStatusFilter] = useState('')
  const [operationStatusFilter, setOperationStatusFilter] = useState('')

  function setTableList(tList) {
    let loopList = []
    for (var i = 0; i < tList.length; i++) {
      if (!tList[i].updatedAt) {
        tList[i].registeredAt = toYmdHmKST(tList[i].registeredAt)
      } else {
        tList[i].updatedAt = toYmdHmKST(tList[i].updatedAt)
      }
      loopList.push(tList[i])
    }

    setFilteredDevices(loopList)
  }

  const loadGetGroupsSites = useCallback(async (searchParams = {}) => {
    try {
      const data = await groupApis.getGroups({})
      //console.info('data :', data)
      //setGourps(data.content)
      const dataGourps = data.content

      const data2 = await siteApis.getSites({})
      //console.info('data2 :', data2)
      //setSites(data2.content)
      const dataSites = data2.content

      let _groupsSites = []
      for (let i = 0; i < dataGourps.length; i++) {
        let tempGroup = {}
        tempGroup.id = dataGourps[i].groupId
        tempGroup.name = dataGourps[i].groupName
        let _sites = []
        for (let j = 0; j < dataSites.length; j++) {
          if (dataSites[j].groupId == dataGourps[i].groupId) {
            let tempSite = {}
            tempSite.id = dataSites[j].siteId
            tempSite.name = dataSites[j].siteName
            _sites.push(tempSite)
          }
        }
        tempGroup.sites = _sites
        _groupsSites.push(tempGroup)
      }

      setGroupsSites(_groupsSites)
    } catch (err) {
      console.error('Error loadGetGroupsSites:', err)
    } finally {
    }
  }, [])

  const loadGetDevices = useCallback(async (searchParams = {}) => {
    try {
      const data = await deviceApis.getDevices()
      //console.info('data :', data)
      setDevices(data.content)
      setTableList(data.content)
    } catch (err) {
      console.error('Error loadGetDevices:', err)
    } finally {
    }
  }, [])

  useEffect(() => {
    loadGetGroupsSites()
  }, [])

  useEffect(() => {
    loadGetDevices()
  }, [loadGetDevices, refreshKey])

  function getStatusBadge(status) {
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

    return <span className={`px-4 py-[3px] rounded-full text-[10px] ${className}`}>{text}</span>
  }

  const columeData = () => {
    return {
      columns: [
        {
          name: t('robotName'),
          selector: (row) =>
            row.deviceStatus === 'DELETED' ? (
              row.deviceName
            ) : (
              <a style={{ cursor: 'pointer' }} onClick={() => openModalModifyRobot(row.deviceId, row.deviceName)}>
                <u>{row.deviceName ? row.deviceName : t('noName')}</u>
              </a>
            ),
          sortable: true
        },
        {
          name: t('model'),
          selector: (row) => <P>{'RX-200'}</P>,
          sortable: true
        },
        {
          name: t('registerStatus'),
          selector: (row) => row.deviceRegStatus ?? '', // 정렬용 원시값
          cell: (row) => getStatusBadge(row.deviceRegStatus ?? ''),
          sortable: true
        },
        {
          name: t('operateStatus'),
          selector: (row) => row.deviceStatus ?? '', // 정렬용 원시값
          cell: (row) => getStatusBadge(row.deviceStatus ?? ''),
          sortable: true
        },
        {
          name: t('group'),
          selector: (row) => (row.assign?.groupName ? row.assign.groupName : <P>{t('unassigned')}</P>),
          sortable: true
        },
        {
          name: t('site'),
          selector: (row) => (row.assign?.siteName ? row.assign.siteName : <P>{t('unassigned')}</P>),
          sortable: true
        },
        {
          name: t('serialNumber'),
          selector: (row) => (row.deviceSerialNumber ? row.deviceSerialNumber : <P>{'SN-00000000'}</P>),
          sortable: true
        },
        {
          name: t('macAddress'),
          selector: (row) => (row.deviceMacAddress ? row.deviceMacAddress : <P>{'00:00:00:00:00:00'}</P>),
          sortable: true
        },
        {
          name: t('finalUpdate'),
          selector: (row) => (!row.updatedAt ? row.registeredAt : row.updatedAt),
          sortable: true
        }
      ],
      conditionalRowStyles: []
    }
  }

  const handleRowClick = (row) => {
    console.log(row)
  }
  const [searchQuery, setSearchQuery] = useState('')
  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value)
  }
  const handleSearchKeyPress = (e) => {
    if (e.key === 'Enter') {
      filterTableList()
    }
  }

  const handleBtnClick = () => {
    filterTableList()
  }

  const handleResetClick = () => {
    setSearchQuery('')
  }

  function setSearchDevices() {
    const filteredList = devices.filter((item) =>
      item.deviceName ? item.deviceName.toLowerCase().includes(searchQuery.toLowerCase()) : false
    )
    setTableList(filteredList)

    console.info('selectedGroup :', selectedGroup)
  }

  const ModifyRobotModal = useModalState()
  const ResultModal = useModalState()

  const openModalModifyRobot = (_deviceId, _deviceName) => {
    navigate('./detail?deviceId=' + _deviceId)
  }

  const requestRenameRobotName = (data) => {
    ModifyRobotModal.onClose()
    openModalResult(data)
  }

  const openModalResult = (data) => {
    setDeviceNameModResult(data.resultYN)
    ResultModal.onOpen()
  }

  const refreshRobotList = () => {
    ResultModal.onClose()
    setRefreshKey((k) => k + 1)
  }

  const registrationStatusFilters = ['REGISTERED', 'ACTIVE', 'DELETE']
  const operationStatusFilters = ['WAIT', 'CHARGE', 'OPERATION', 'OFFLINE', 'ERROR']

  const registrationStatusTranslation = {
    REGISTERED: t('register'),
    ACTIVE: t('active'),
    DELETE: t('delete')
  }

  const operationStatusTranslation = {
    WAIT: t('wait'),
    CHARGE: t('charge'),
    OPERATION: t('operation'),
    OFFLINE: t('offline'),
    ERROR: t('error')
  }

  useEffect(() => {
    filterTableList()
  }, [selectedGroup, selectedSite, searchQuery, registrationStatusFilter, operationStatusFilter])

  function filterTableList() {
    const filteredList = devices.filter((r) => {
      const matchGroup = !selectedGroup
        ? true
        : selectedGroup === UNREGISTERED
          ? !r.assign?.groupName
          : r.assign?.groupName === selectedGroup
      const matchSite = !selectedSite
        ? true
        : selectedSite === UNREGISTERED
          ? !r.assign?.siteName
          : r.assign?.siteName === selectedSite

      const lowerQuery = searchQuery?.toLowerCase()
      const matchSearch =
        !searchQuery ||
        [r.deviceName, r.deviceSerialNumber, r.deviceMacAddress]
          .filter(Boolean)
          .some((v) => v.toLowerCase().includes(lowerQuery))

      const matchRegistrationStatus = !registrationStatusFilter || r.deviceRegStatus === registrationStatusFilter
      const matchOperationStatus = !operationStatusFilter || r.deviceState === operationStatusFilter

      return matchGroup && matchSite && matchSearch && matchRegistrationStatus && matchOperationStatus
    })

    setTableList(filteredList)
  }

  return (
    <>
      <StyledPageContent className="column">
        <Title>{t('robotList')}</Title>
        <SectionRobot>
          <HeaderTitleGroup>
            <GroupSiteFilter groups={groupsSites}>
              <div className="relative flex-1 sm:flex-none">
                <Search
                  size={'xs'}
                  value={searchQuery}
                  onChange={handleSearchChange}
                  //onKeyPress={handleSearchKeyPress}
                  placeholder={t('robotNameSnMac')}
                  //onClick={handleBtnClick}
                  onReset={handleResetClick}
                />
              </div>

              {/* Registration Status Filter */}
              <div className="ml-5 flex flex-col gap-3">
                <span className="text-[10px] text-[#999]">{t('registerStatus')}</span>
                <div className="flex items-center gap-3 flex-wrap">
                  {registrationStatusFilters.map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        setRegistrationStatusFilter(registrationStatusFilter === s ? '' : s)
                      }}
                      style={{ borderRadius: '.25rem', color: registrationStatusFilter === s ? '#ffffff' : '#666' }}
                      className={`px-2 py-[5px] text-[11px] border transition-colors ${
                        registrationStatusFilter === s
                          ? 'bg-[#1a8bc5] text-white border-[#1a8bc5]'
                          : 'bg-white text-[#666] border-[#ddd] hover:bg-[#f0f0f0]'
                      }`}
                    >
                      {registrationStatusTranslation[s]}
                    </button>
                  ))}
                  {registrationStatusFilter && (
                    <button
                      onClick={() => setRegistrationStatusFilter('')}
                      style={{ borderRadius: '.25rem' }}
                      className="p-0.5 ml-0.5 hover:bg-gray-100"
                    >
                      <X className="w-5 h-5 text-[#999]" />
                    </button>
                  )}
                </div>
              </div>

              {/* Operation Status Filter */}
              <div className="ml-5 flex flex-col gap-3">
                <span className="text-[10px] text-[#999]">{t('operateStatus')}</span>
                <div className="flex items-center gap-3 flex-wrap">
                  {operationStatusFilters.map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        setOperationStatusFilter(operationStatusFilter === s ? '' : s)
                      }}
                      style={{ borderRadius: '.25rem', color: operationStatusFilter === s ? '#ffffff' : '#666' }}
                      className={`px-2 py-[5px] text-[11px] border transition-colors ${
                        operationStatusFilter === s
                          ? 'bg-[#1a8bc5] text-white border-[#1a8bc5]'
                          : 'bg-white text-[#666] border-[#ddd] hover:bg-[#f0f0f0]'
                      }`}
                    >
                      {operationStatusTranslation[s]}
                    </button>
                  ))}
                  {operationStatusFilter && (
                    <button
                      onClick={() => setOperationStatusFilter('')}
                      style={{ borderRadius: '.25rem' }}
                      className="p-0.5 ml-0.5 hover:bg-gray-100"
                    >
                      <X className="w-5 h-5 text-[#999]" />
                    </button>
                  )}
                </div>
              </div>
            </GroupSiteFilter>
            {/* <SearchContainer>
              <Search
                value={searchQuery}
                onChange={handleSearchChange}
                onKeyPress={handleSearchKeyPress}
                placeholder={t('robotNameSearch')}
                onClick={handleBtnClick}
                onReset={handleResetClick}
              />
            </SearchContainer> */}
          </HeaderTitleGroup>
          <div style={{ margin: '5px 0 14px 0', fontSize: '14px', fontWeight: 'bold' }}>
            {t('count')} : {filteredDevices.length}
          </div>
          <Table
            columns={columeData().columns}
            data={filteredDevices}
            noData={'No Data'}
            isLoading={isLoading}
            pagination
            paginationRowsPerPageOptions={[10, 20, 30]}
            onRowClicked={handleRowClick}
            conditionalRowStyles={columeData().conditionalRowStyles}
          />
        </SectionRobot>
      </StyledPageContent>
      <ModalModifyRobot
        isOpen={ModifyRobotModal.isOpen}
        onClose={ModifyRobotModal.onClose}
        onConfirm={requestRenameRobotName}
        t={t}
        deviceId={deviceId}
        deviceName={deviceName}
      />
      <ModalResult
        isOpen={ResultModal.isOpen}
        onClose={ResultModal.onClose}
        onConfirm={refreshRobotList}
        t={t}
        resultYN={deviceNameModResult}
      />
    </>
  )
}

export default Management

