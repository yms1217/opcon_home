import React, { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { SectionRobot, Title, OrganizationSelector } from '@repo/ui'
import {
  DashboardWrapper,
  DashSection,
  DivPageBody,
  DivDashState,
  DivSectionTitle,
  H3SectionTitle,
  DivStateList,
  ArticleStateItem,
  H4StateText,
  DivStateCount,
  StrongStateNumber,
  SpanStateUnit,
  DivMarginTop,
  DivMapCard,
  DivDashAlarm,
  DivDashAlarmTable,
  SectionMap
} from './styles'
import { deviceApis, siteApis } from '@/apis'
import { useNavigate } from 'react-router-dom'
import { robotStore } from '@/utils/robotStore'

import Location from './KakaoMap'
import TableAlarm from './AlarmTable'
import imgRun1x from './assets/img_card_state_run.png'
import imgRun2x from './assets/img_card_state_run_2x.png'
import imgWait1x from './assets/img_card_state_wait.png'
import imgWait2x from './assets/img_card_state_wait_2x.png'
import imgCharge1x from './assets/img_card_state_charge.png'
import imgCharge2x from './assets/img_card_state_charge_2x.png'
import imgError1x from './assets/img_card_state_error.png'
import imgError2x from './assets/img_card_state_error_2x.png'
import imgNetwork1x from './assets/img_card_state_network.png'
import imgNetwork2x from './assets/img_card_state_network_2x.png'
import AiEventSummaryPanel from './components/AiEventSummaryPanel' // temp

const Dashboard = () => {
  const { t } = useTranslation('robot')
  const style_state_img = {
    width: '5.4rem',
    maxWidth: '64px',
    borderRadius: '1.5rem',
    boxShadow: '0 0.5rem 1rem rgba(0, 0, 0, 0.15)',
    height: 'auto',
    position: 'absolute',
    top: '1.5rem',
    left: '1.5rem'
  }
  const [markers, setMarkers] = useState([])
  const [devices, setDevices] = useState([])
  const [sites, setSites] = useState([])
  const [orgFilter, setOrgFilter] = useState({ values: ['all', 'all'] })
  const [deviceCount, setDeviceCount] = useState({ opr: 0, sta: 0, chr: 0, err: 0, off: 0 })
  const navigate = useNavigate()
  const { setDeviceState } = robotStore.getState()

  function makeMarker() {
    const siteMap = new Map()

    devices.forEach((device) => {
      const siteId = device.assign?.siteId
      if (!siteId) return

      const site = sites.find((s) => s.siteId === siteId)
      if (!site) return
      if (!site.siteLatitude || !site.siteLongitude) return

      // filter 조건
      if (orgFilter.values[0] === 'none' || orgFilter.values[1] === 'none') return

      if (orgFilter.values[0] !== 'all' && orgFilter.values[0] !== site.groupId) return

      if (orgFilter.values[1] !== 'all' && orgFilter.values[1] !== site.siteId) return

      // 상태 값 계산
      const state = {
        operation: device.deviceState === 'OPERATION' ? 1 : 0,
        wait: device.deviceState === 'STANDBY' ? 1 : 0,
        charge: device.deviceState === 'CHARGE' ? 1 : 0,
        error: device.deviceState === 'ERROR' ? 1 : 0,
        offline: device.deviceState === 'OFFLINE' ? 1 : 0
      }

      // Map 집계
      if (!siteMap.has(siteId)) {
        siteMap.set(siteId, {
          id: site.siteId,
          name: site.siteName,
          lat: site.siteLatitude,
          lng: site.siteLongitude,
          count: 0,
          operation: 0,
          wait: 0,
          charge: 0,
          error: 0,
          offline: 0
        })
      }

      const data = siteMap.get(siteId)

      data.count += 1
      data.operation += state.operation
      data.wait += state.wait
      data.charge += state.charge
      data.error += state.error
      data.offline += state.offline
    })

    // ✅ title 생성 함수
    const makeTitle = (m) => {
      const parts = []

      if (m.operation > 0) parts.push(`${t('operation')}:${m.operation}`)
      if (m.wait > 0) parts.push(`${t('wait')}:${m.wait}`)
      if (m.charge > 0) parts.push(`${t('charge')}:${m.charge}`)
      if (m.error > 0) parts.push(`${t('error')}:${m.error}`)
      if (m.offline > 0) parts.push(`${t('offline')}:${m.offline}`)

      const status = parts.length ? `[${parts.join(', ')}]` : ''

      return `${m.name} - ${m.count}${t('unit')} ${status}`
    }

    const markers = Array.from(siteMap.values()).map((m) => ({
      title: makeTitle(m),
      lat: m.lat,
      lng: m.lng
    }))

    setMarkers(markers)
  }

  const loadRobotInfo = useCallback(async (searchParams = {}) => {
    try {
      const dataRobot = (await deviceApis.getDevices()).content
      setDevices(dataRobot)
      const dataSite = (await siteApis.getSites({})).content
      setSites(dataSite)
    } catch (err) {
      console.error('Error loadGetGroupsSites:', err)
    } finally {
    }
  }, [])

  useEffect(() => {
    loadRobotInfo()
  }, [])

  const handleSelectOrg = useCallback((info) => {
    setOrgFilter(info)
  }, [])

  function matchOrgGroup(_device) {
    return orgFilter.values[0] === 'all'
      ? true
      : orgFilter.values[0] === 'none'
        ? !_device.assign?.groupId
        : _device.assign?.groupId === orgFilter.values[0]
  }

  function matchOrgSite(_device) {
    return orgFilter.values[1] === 'all'
      ? true
      : orgFilter.values[1] === 'none'
        ? !_device.assign?.siteId
        : _device.assign?.siteId === orgFilter.values[1]
  }

  useEffect(() => {
    let _deviceCount = { opr: 0, sta: 0, chr: 0, err: 0, off: 0 }
    for (let i = 0; i < devices.length; i++) {
      if (matchOrgGroup(devices[i]) && matchOrgSite(devices[i])) {
        switch (devices[i].deviceState ?? '') {
          case 'STANDBY':
            _deviceCount.sta = _deviceCount.sta + 1
            break
          case 'CHARGE':
            _deviceCount.chr = _deviceCount.chr + 1
            break
          case 'OPERATION':
            _deviceCount.opr = _deviceCount.opr + 1
            break
          case 'OFFLINE':
            _deviceCount.off = _deviceCount.off + 1
            break
          case 'ERROR':
            _deviceCount.err = _deviceCount.err + 1
            break
        }
      }
    }
    setDeviceCount(_deviceCount)
  }, [orgFilter, devices])

  useEffect(() => {
    makeMarker()
  }, [devices, sites, orgFilter])

  function clickDeviceState(state) {
    setDeviceState(state)
    navigate('/robot/management')
  }

  return (
    <>
      <DashboardWrapper>
        <Title>{t('dashboard')}</Title>
        <OrganizationSelector
          onChange={handleSelectOrg}
          supportAlls={[true, true]}
          supportNone={[true, true]}
          disableCenter
        />
        <DivPageBody>
          <DivDashState>
            <DashSection>
              <DivSectionTitle>
                <H3SectionTitle>{t('stateStatus')}</H3SectionTitle>
              </DivSectionTitle>
              <DivStateList>
                <ArticleStateItem
                  data-value="OPERATION"
                  onClick={() => {
                    clickDeviceState('OPERATION')
                  }}
                >
                  <H4StateText>{t('operation')}</H4StateText>
                  <DivStateCount>
                    <img
                      src={imgRun1x}
                      srcSet={`${imgRun2x} 2x, ${imgRun1x} 1x`}
                      width={64}
                      height={64}
                      style={style_state_img}
                    />
                    <StrongStateNumber id="operation_cnt">
                      {deviceCount.opr}
                      <SpanStateUnit>{t('unit')}</SpanStateUnit>
                    </StrongStateNumber>
                  </DivStateCount>
                </ArticleStateItem>
                <ArticleStateItem
                  data-value="STANDBY"
                  onClick={() => {
                    clickDeviceState('STANDBY')
                  }}
                >
                  <H4StateText>{t('standby')}</H4StateText>
                  <DivStateCount>
                    <img
                      src={imgWait1x}
                      srcSet={`${imgWait2x} 2x, ${imgWait1x} 1x`}
                      width={64}
                      height={64}
                      style={style_state_img}
                    />
                    <StrongStateNumber id="standby_cnt">
                      {deviceCount.sta}
                      <SpanStateUnit>{t('unit')}</SpanStateUnit>
                    </StrongStateNumber>
                  </DivStateCount>
                </ArticleStateItem>
                <ArticleStateItem
                  data-value="CHARGE"
                  onClick={() => {
                    clickDeviceState('CHARGE')
                  }}
                >
                  <H4StateText>{t('charge')}</H4StateText>
                  <DivStateCount>
                    <img
                      src={imgCharge1x}
                      srcSet={`${imgCharge2x} 2x, ${imgCharge1x} 1x`}
                      width={64}
                      height={64}
                      style={style_state_img}
                    />
                    <StrongStateNumber id="charge_cnt">
                      {deviceCount.chr}
                      <SpanStateUnit>{t('unit')}</SpanStateUnit>
                    </StrongStateNumber>
                  </DivStateCount>
                </ArticleStateItem>
                <ArticleStateItem
                  data-value="ERROR"
                  onClick={() => {
                    clickDeviceState('ERROR')
                  }}
                >
                  <H4StateText>{t('error')}</H4StateText>
                  <DivStateCount>
                    <img
                      src={imgError1x}
                      srcSet={`${imgError2x} 2x, ${imgError1x} 1x`}
                      width={64}
                      height={64}
                      style={style_state_img}
                    />
                    <StrongStateNumber id="error_cnt">
                      {deviceCount.err}
                      <SpanStateUnit>{t('unit')}</SpanStateUnit>
                    </StrongStateNumber>
                  </DivStateCount>
                </ArticleStateItem>
                <ArticleStateItem
                  data-value="OFFLINE"
                  onClick={() => {
                    clickDeviceState('OFFLINE')
                  }}
                >
                  <H4StateText>{t('networkDisconnection')}</H4StateText>
                  <DivStateCount>
                    <img
                      src={imgNetwork1x}
                      srcSet={`${imgNetwork2x} 2x, ${imgNetwork1x} 1x`}
                      width={64}
                      height={64}
                      style={style_state_img}
                    />
                    <StrongStateNumber id="offline_cnt">
                      {deviceCount.off}
                      <SpanStateUnit>{t('unit')}</SpanStateUnit>
                    </StrongStateNumber>
                  </DivStateCount>
                </ArticleStateItem>
              </DivStateList>
            </DashSection>
            <DivMarginTop></DivMarginTop>
            <DashSection>
              <DivSectionTitle>
                <H3SectionTitle>{t('regionStatus')}</H3SectionTitle>
              </DivSectionTitle>
              <SectionMap>
                <DivMapCard>
                  <Location markers={markers} />
                </DivMapCard>
              </SectionMap>
            </DashSection>
          </DivDashState>
          <DivDashAlarm>
            <DashSection>
              {/* 임시 */}
              <AiEventSummaryPanel />
              <div>
                <H3SectionTitle>{t('inspectionNotification')}</H3SectionTitle>
              </div>
              <SectionRobot>
                <DivDashAlarmTable>
                  <TableAlarm />
                </DivDashAlarmTable>
              </SectionRobot>
            </DashSection>
          </DivDashAlarm>
        </DivPageBody>
      </DashboardWrapper>
    </>
  )
}

export default Dashboard
