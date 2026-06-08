/*global kakao*/
import React from 'react'
import { Table } from '@repo/ui'

const filteredDevices = [
  { siteName: 'robot1', deviceType: 'type1', errorText: '[error] 에러가 발생하엿습니다.', createTime: '01/26 17"53' },
  { siteName: 'robot1', deviceType: 'type1', errorText: '[error] 메세지가 발생하였습니다.', createTime: '01/26 17"53' },
  {
    siteName: 'robot2',
    deviceType: 'type1',
    errorText: '[error] 메세지1이 발생하엿습니다.',
    createTime: '01/26 17"53'
  },
  { siteName: 'robot1', deviceType: 'type1', errorText: '[error] 메세지가 발생하엿습니다.', createTime: '01/26 17"53' },
  { siteName: 'robot3', deviceType: 'type1', errorText: '[error] 메세지가 발생하엿습니다.', createTime: '01/26 17"53' },
  { siteName: 'robot4', deviceType: 'type2', errorText: '[error] 에러가 발생하엿습니다.', createTime: '01/26 17"53' },
  { siteName: 'robot5', deviceType: 'type2', errorText: '[error] 에러가 발생하엿습니다.', createTime: '01/26 17"53' },
  { siteName: 'robot6', deviceType: 'type1', errorText: '[error] 에러가 발생하엿습니다.', createTime: '01/26 17"53' },
  { siteName: 'robot7', deviceType: 'type1', errorText: '[error] 에러가 발생하엿습니다.', createTime: '01/26 17"53' },
  { siteName: 'robot7', deviceType: 'type1', errorText: '[error] 에러가 발생하엿습니다.', createTime: '01/26 17"53' },
  { siteName: 'robot1', deviceType: 'type1', errorText: '[error] 에러가 발생하엿습니다.', createTime: '01/26 17"53' },
  { siteName: 'robot1', deviceType: 'type1', errorText: '[error] 에러가 발생하엿습니다.', createTime: '01/26 17"53' },
  { siteName: 'robot1', deviceType: 'type1', errorText: '[error] 에러가 발생하엿습니다.', createTime: '01/26 17"53' }
]
const TableAlarm = () => {
  const columeData = () => {
    return {
      columns: [
        {
          name: '사이트 명',
          selector: (row) => row.siteName,
          sortable: true,
          width: '15%'
        },
        {
          name: '로봇 타입',
          selector: (row) => row.deviceType,
          sortable: true,
          width: '15%'
        },
        {
          name: '에러 문구',
          selector: (row) => row.errorText,
          sortable: true
        },
        {
          name: '발생 시간',
          selector: (row) => row.createTime,
          sortable: true,
          width: '20%'
        }
      ],
      conditionalRowStyles: []
    }
  }
  const isLoading = false
  const handleRowClick = (row) => {
    console.log(row)
  }

  return (
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
  )
}

export default TableAlarm
