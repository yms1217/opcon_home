import React, { useEffect, useCallback, useState, useMemo } from 'react'
import { Table } from '@repo/ui'
import { useTranslation } from 'react-i18next'

const tempList = [
  { type: 'WARN', date: '4/1 14:10', desc: '경로 재계산 수행됨' },
  { type: 'ERROR', date: '3/30 13:45', desc: '센서 데이터 지연 감지' }
]

const ErrorList = ({ t, deviceId }) => {
  const { t: tCommon } = useTranslation('common')
  const [robotErrors, setRobotErrors] = useState([])
  const [filteredList, setFilteredList] = useState([])

  const loadErrorList = useCallback(
    async (searchParams = {}) => {
      setRobotErrors(tempList)
      //   try {
      //     const data = await deviceApis.getDevices()
      //     console.info('data :', data)
      //     setRobotErrors(data.content)
      //     setTableList(data.content)
      //   } catch (err) {
      //     console.error('Error loadGetDevices:', err)
      //   } finally {
      //   }
    },
    [deviceId]
  )

  function setTableList(tList) {
    let loopList = []
    for (var i = 0; i < tList.length; i++) {
      loopList.push(tList[i])
    }

    setFilteredList(loopList)
  }

  useEffect(() => {
    loadErrorList()
  }, [deviceId])

  const columns = [
    {
      name: t('에러타입'),
      selector: (row) => row.type,
      sortable: true
    },
    {
      name: t('일시'),
      selector: (row) => row.date,
      sortable: true
    },
    {
      name: t('내용'),
      selector: (row) => row.desc,
      sortable: true
    }
  ]

  return (
    <>
      <Table
        columns={columns}
        data={robotErrors}
        noData={tCommon('noData')}
        pagination
        paginationRowsPerPageOptions={[10, 30, 50, 100]}
      />
    </>
  )
}

export default ErrorList
