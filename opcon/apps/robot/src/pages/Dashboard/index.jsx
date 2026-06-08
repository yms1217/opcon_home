import React from 'react'
import { useTranslation } from 'react-i18next'
import { SectionRobot, Title } from '@repo/ui'
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
  DivDashAlarmTable
} from './styles'

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

  return (
    <>
      <DashboardWrapper>
        <Title>{t('dashboard')}</Title>
        <DivPageBody>
          <DivDashState>
            <DashSection>
              <DivSectionTitle>
                <H3SectionTitle>{t('stateStatus')}</H3SectionTitle>
              </DivSectionTitle>
              <DivStateList>
                <ArticleStateItem data-value="OPERATION">
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
                      2<SpanStateUnit>{t('unit')}</SpanStateUnit>
                    </StrongStateNumber>
                  </DivStateCount>
                </ArticleStateItem>
                <ArticleStateItem data-value="STANDBY">
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
                      3<SpanStateUnit>{t('unit')}</SpanStateUnit>
                    </StrongStateNumber>
                  </DivStateCount>
                </ArticleStateItem>
                <ArticleStateItem data-value="CHARGE">
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
                      0<SpanStateUnit>{t('unit')}</SpanStateUnit>
                    </StrongStateNumber>
                  </DivStateCount>
                </ArticleStateItem>
                <ArticleStateItem data-value="ERROR">
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
                      1<SpanStateUnit>{t('unit')}</SpanStateUnit>
                    </StrongStateNumber>
                  </DivStateCount>
                </ArticleStateItem>
                <ArticleStateItem data-value="OFFLINE">
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
                      12<SpanStateUnit>{t('unit')}</SpanStateUnit>
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
              <DivMapCard>
                <Location />
              </DivMapCard>
            </DashSection>
          </DivDashState>
          <DivDashAlarm>
            <DashSection>
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

