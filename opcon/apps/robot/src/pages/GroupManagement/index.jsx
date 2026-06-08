import { useMemo, useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { groupApis, siteApis } from '@/apis'
import { ManageActions, EditButton, AddButton } from '@/utils/style'
import {
  StyledPageContent,
  Title,
  SectionRobot,
  Search,
  SearchContainer,
  HeaderTitleGroup,
  Table,
  Button,
  Modal
} from '@repo/ui'
import { useModalState } from '@repo/hooks'
import { useNavigate } from 'react-router-dom'
import ModalEditGroup from './modal/ModalEditGroup'
import ModalEditSite from './modal/ModalEditSite'

const GroupManagement = () => {
  const { t } = useTranslation('robot')
  const { t: tCommon } = useTranslation('common')
  const [searchQuery, setSearchQuery] = useState('')
  const [filteredGroups, setFilteredGroups] = useState([])
  const [currentRow, setCurrentRow] = useState(null)
  const [groupsSites, setGroupsSites] = useState([])
  const [groupId, setGroupId] = useState('')
  const [groupInfo, setGroupInfo] = useState({})
  const [siteId, setSiteId] = useState('')
  const [siteInfo, setSiteInfo] = useState({})
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false)
  const [confirmMessage, setConfirmMessage] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    loadGetGroupsSites()
  }, [])

  const loadGetGroupsSites = useCallback(async () => {
    try {
      const data = await groupApis.getGroups({})
      const dataGroups = data.content

      const data2 = await siteApis.getSites({})
      const dataSites = data2.content

      let _groupsSites = []
      for (let i = 0; i < dataGroups.length; i++) {
        let tempGroup = {}
        tempGroup.groupId = dataGroups[i].groupId
        tempGroup.groupName = dataGroups[i].groupName
        let _sites = []
        for (let j = 0; j < dataSites.length; j++) {
          if (dataSites[j].groupId == dataGroups[i].groupId) {
            let tempSite = {}
            tempSite.siteId = dataSites[j].siteId
            tempSite.siteName = dataSites[j].siteName
            tempSite.siteAddressOne = dataSites[j].siteAddressOne
            tempSite.siteAddressTwo = dataSites[j].siteAddressTwo
            tempSite.siteAddressCity = dataSites[j].siteAddressCity
            tempSite.siteAddressState = dataSites[j].siteAddressState
            tempSite.siteAddressPostalCode = dataSites[j].siteAddressPostalCode
            tempSite.createdAt = dataSites[j].createdAt
            tempSite.updatedAt = dataSites[j].updatedAt
            tempSite.groupId = dataGroups[i].groupId
            _sites.push(tempSite)
          }
        }
        tempGroup.sites = _sites
        _groupsSites.push(tempGroup)
      }
      setGroupsSites(_groupsSites)
    } catch (err) {
      console.error('Error loadGetGroupsSites:', err)
    }
  }, [])

  const columns = useMemo(
    () => [
      { name: t('groupName'), selector: (row) => row.groupName, sortable: true },
      { name: t('siteNumber'), selector: (row) => row.sites?.length ?? 0, sortable: true },
      {
        name: t('management'),
        cell: (row) => {
          const jsonGroupInfo = {
            groupName: row.groupName
          }
          return (
            <ManageActions>
              {/*정지기능 API 준비 안*/}
              <EditButton
                type="button"
                //disabled={isEditDisable}
                onClick={() => openModalEditGroup(row.groupId, jsonGroupInfo)}
              >
                {t('modify')}
              </EditButton>
              <AddButton
                type="button"
                style={{ paddingLeft: '5px', paddingRight: '5px' }}
                //disabled={isEditDisable}
                onClick={() => openModalEditSite(row.groupId, 'new', {})}
              >
                {t('siteAdd')}
              </AddButton>
            </ManageActions>
          )
        },
        sortable: false
      }
    ],
    []
  )

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value)
  }

  const handleResetSearch = () => {
    setSearchQuery('')
  }

  const goSiteDetail = (siteId) => {
    navigate('./sitedetail?siteId=' + siteId)
  }

  const ExpandedSitesTable = ({ data }) => {
    // react-data-table-component의 ExpandedComponent는 해당 row의 data를 받습니다. [1](https://deepwiki.com/jbetancur/react-data-table-component/4.4-expandable-rows)
    const siteColumns = [
      {
        name: t('siteName'),
        selector: (s) => (
          <a style={{ cursor: 'pointer' }} onClick={() => goSiteDetail(s.siteId)}>
            <u>{s.siteName}</u>
          </a>
        ),
        sortable: true
      },
      {
        name: t('address'),
        selector: (s) => (s.siteAddressOne ?? '') + ' ' + (s.siteAddressTwo ?? ''),
        sortable: true
      },
      {
        name: t('management'),
        cell: (row) => {
          return (
            <ManageActions>
              {/*정지기능 API 준비 안*/}
              <EditButton
                type="button"
                //disabled={isEditDisable}
                onClick={() =>
                  openModalEditSite(row.groupId, row.siteId, {
                    siteName: row.siteName,
                    siteAddressPostalCode: row.siteAddressPostalCode,
                    siteAddressState: row.siteAddressState,
                    siteAddressCity: row.siteAddressCity,
                    siteAddressOne: row.siteAddressOne,
                    siteAddressTwo: row.siteAddressTwo
                  })
                }
              >
                {t('modify')}
              </EditButton>
            </ManageActions>
          )
        },
        sortable: false
      }
    ]

    return (
      <div style={{ padding: '12px 16px' }}>
        <Table columns={siteColumns} data={data.sites || []} keyField="siteId" dense noHeader />
      </div>
    )
  }

  const handleClickGroupCreate = () => {
    openModalEditGroup('new', { groupName: '' })
  }

  const EditGroupModal = useModalState()

  const openModalEditGroup = (_groupId, jsonGroupInfo) => {
    setGroupId(_groupId)
    setGroupInfo(jsonGroupInfo)
    EditGroupModal.onOpen()
  }

  const conformModalEditGroup = (result) => {
    EditGroupModal.onClose()
    setConfirmMessage(
      result?.resultNo == 1 ? t('createGruop') : result?.resultNo == 2 ? t('modifyGroup') : t('errorReport')
    )
    setIsConfirmModalOpen(true)
  }

  const EditSiteModal = useModalState()

  const openModalEditSite = (_groupId, _siteId, jsonSiteInfo) => {
    setGroupId(_groupId)
    setSiteId(_siteId)
    setSiteInfo(jsonSiteInfo)
    EditSiteModal.onOpen()
  }

  const conformModalEditSite = (result) => {
    EditSiteModal.onClose()
    setConfirmMessage(
      result?.resultNo == 1 ? t('createSite') : result?.resultNo == 2 ? t('modifySite') : t('errorReport')
    )
    setIsConfirmModalOpen(true)
  }

  const conformModal = () => {
    setIsConfirmModalOpen(false)
    loadGetGroupsSites()
  }

  return (
    <>
      <StyledPageContent className="column">
        <Title>{t('groupManagement')}</Title>
        <SectionRobot style={{ maxWidth: '1600px' }}>
          <HeaderTitleGroup>
            <SearchContainer>
              <Search
                value={searchQuery}
                onChange={handleSearchChange}
                onReset={handleResetSearch}
                placeholder={tCommon('searchPlaceHolder') || 'Search...'}
              />
            </SearchContainer>
            <div className="alignRight" style={{ marginBottom: '0', minWidth: '90px' }}>
              <Button onClick={handleClickGroupCreate}>{t('groupAdd')}</Button>
            </div>
          </HeaderTitleGroup>

          <div style={{ margin: '16px 0', fontSize: '14px', fontWeight: 'bold' }}>
            {t('count')} : {groupsSites.length}
          </div>

          <Table
            columns={columns}
            data={groupsSites}
            noData={tCommon('noData')}
            pagination
            paginationRowsPerPageOptions={[10, 30, 50, 100]}
            expandableRows
            //expandOnRowClicked
            expandableRowsComponent={ExpandedSitesTable}
            onRowClicked={(row) => setCurrentRow(row)}
            expandableRowExpanded={(row) => row === currentRow}
            onRowExpandToggled={(expanded, row) => {
              setCurrentRow(expanded ? row : null)
            }}
            expandableRowDisabled={(row) => !row?.sites || row.sites.length === 0}

            //keyField="id"
          />
        </SectionRobot>
        <ModalEditGroup
          isOpen={EditGroupModal.isOpen}
          onClose={EditGroupModal.onClose}
          onConfirm={conformModalEditGroup}
          t={t}
          groupId={groupId}
          groupInfo={groupInfo}
        />
        <ModalEditSite
          isOpen={EditSiteModal.isOpen}
          onClose={EditSiteModal.onClose}
          onConfirm={conformModalEditSite}
          t={t}
          groupId={groupId}
          siteId={siteId}
          siteInfo={siteInfo}
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
      </StyledPageContent>
    </>
  )
}

export default GroupManagement
