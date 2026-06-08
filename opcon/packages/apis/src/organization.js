import createClient from './client'
import { ENDPOINTS } from './constants'

const axiosOta = createClient(import.meta.env.VITE_API_BASE_URL)
const mockUpData = false //import.meta.env.VITE_MODE !== 'local'

const retrieveCompany = async ({ userId }) => {
  const params = { userId }
  try {
    if (mockUpData) {
      return new Promise((resolve) => {
        const processedData = {
          id: 1,
          displayName: `LGE Robot Inc`,
          orgLinkage: true,
          orgDepth: 2,
          requestedAt: new Date(
            new Date().getTime() + Math.floor(Math.random() * 1000 * 60 * 60 * 24 * 30)
          ).toISOString()
        }
        setTimeout(() => {
          resolve({ message: 'OK', error: false, code: '0000', results: processedData })
        }, 500)
      })
    } else {
      const response = await axiosOta.get(ENDPOINTS.COMPANY, { params })
      return response
    }
  } catch (error) {
    console.error('Failed to retrieve company:', error)
    throw error
  }
}

const retrieveOrganizationUser = async ({ id, userId }) => {
  // For test
  const params = { userId: 'test.site@lge.com' }
  // const params = { userId }
  if (id) params.id = String(id)
  try {
    if (mockUpData) {
      return new Promise((resolve) => {
        const processedData = [
          {
            id: 1,
            displayName: `Default Organization`,
            memo: `Default Organization`,
            parentId: null,
            roleName: 'admin',
            requestedAt: new Date(
              new Date().getTime() + Math.floor(Math.random() * 1000 * 60 * 60 * 24 * 30)
            ).toISOString()
          },
          {
            id: 3,
            displayName: `HS Robot Platform Group`,
            memo: `HS Robot Platform Group`,
            parentId: null,
            roleName: 'admin',
            requestedAt: new Date(
              new Date().getTime() + Math.floor(Math.random() * 1000 * 60 * 60 * 24 * 30)
            ).toISOString()
          },
          {
            id: 4,
            displayName: `HSRobotPlatform`,
            memo: 'HSRobotPlatform',
            parentId: null,
            requestedAt: new Date(
              new Date().getTime() + Math.floor(Math.random() * 1000 * 60 * 60 * 24 * 30)
            ).toISOString(),
            roleName: 'member'
          },
          {
            id: 5,
            displayName: `HSRobotPlatform Site`,
            memo: 'HSRobotPlatform Site',
            parentId: 4,
            requestedAt: new Date(
              new Date().getTime() + Math.floor(Math.random() * 1000 * 60 * 60 * 24 * 30)
            ).toISOString(),
            roleName: 'member'
          },
          {
            id: 6,
            displayName: `LG Science Park Site`,
            memo: `LG Science Park Site`,
            parentId: 4,
            roleName: 'member',
            requestedAt: new Date(
              new Date().getTime() + Math.floor(Math.random() * 1000 * 60 * 60 * 24 * 30)
            ).toISOString()
          }
        ]
        setTimeout(() => {
          resolve({
            message: 'OK',
            error: false,
            code: '0000',
            results: id ? processedData.filter((item) => item.id === Number(id)) : processedData
          })
        }, 500)
      })
    } else {
      const response = await axiosOta.get(ENDPOINTS.ORGANIZATION.USER, { params })
      return response
    }
  } catch (error) {
    console.error('Failed to retrieve organization user:', error)
    throw error
  }
}

const retrieveOrganizationTree = async ({ id, userId }) => {
  // For test
  const params = { userId: 'test.site@lge.com' }
  // const params = { userId }
  if (id) params.id = String(id)
  try {
    if (mockUpData) {
      return new Promise((resolve) => {
        const processedData = [
          {
            id: 1,
            displayName: `Default Organization`,
            memo: `Default Organization`,
            parentId: null,
            roleName: 'admin',
            requestedAt: new Date(
              new Date().getTime() + Math.floor(Math.random() * 1000 * 60 * 60 * 24 * 30)
            ).toISOString()
          },
          {
            id: 3,
            displayName: `HS Robot Platform Group`,
            memo: `HS Robot Platform Group`,
            parentId: 1,
            roleName: 'admin',
            requestedAt: new Date(
              new Date().getTime() + Math.floor(Math.random() * 1000 * 60 * 60 * 24 * 30)
            ).toISOString()
          },
          {
            id: 4,
            displayName: `HSRobotPlatform`,
            memo: 'HSRobotPlatform',
            parentId: 1,
            requestedAt: new Date(
              new Date().getTime() + Math.floor(Math.random() * 1000 * 60 * 60 * 24 * 30)
            ).toISOString(),
            roleName: 'member'
          },
          {
            id: 5,
            displayName: `HSRobotPlatform Site`,
            memo: 'HSRobotPlatform Site',
            parentId: 4,
            requestedAt: new Date(
              new Date().getTime() + Math.floor(Math.random() * 1000 * 60 * 60 * 24 * 30)
            ).toISOString(),
            roleName: 'member'
          },
          {
            id: 6,
            displayName: `LG Science Park Site`,
            memo: `LG Science Park Site`,
            parentId: 4,
            roleName: 'member',
            requestedAt: new Date(
              new Date().getTime() + Math.floor(Math.random() * 1000 * 60 * 60 * 24 * 30)
            ).toISOString()
          }
        ]
        setTimeout(() => {
          resolve({
            message: 'OK',
            error: false,
            code: '0000',
            results: id ? processedData.filter((item) => item.id === Number(id)) : processedData
          })
        }, 500)
      })
    } else {
      const response = await axiosOta.get(ENDPOINTS.ORGANIZATION.TREE, { params })
      return response
    }
  } catch (error) {
    console.error('Failed to retrieve organization tree:', error)
    throw error
  }
}

const saveOrganization = async (data) => {
  try {
    if (mockUpData) {
      return { message: 'OK', error: false, code: '0000', results: data }
    } else {
      const response = await axiosOta.put(ENDPOINTS.ORGANIZATION.BASE, data)
      return response
    }
  } catch (error) {
    console.error('Failed to save organization:', error)
    throw error
  }
}

const requestJoin = async ({ id, userId }) => {
  try {
    if (mockUpData) {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({ message: 'OK', error: false, code: '0000', results: {} })
        }, 1000)
      })
    } else {
      const response = await axiosOta.post(ENDPOINTS.ORGANIZATION.JOIN, { data: { id, userId } })
      return response
    }
  } catch (error) {
    console.error('Failed to request join:', error)
    throw error
  }
}

const withdraw = async ({ id, userId }) => {
  try {
    if (mockUpData) {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({ message: 'OK', error: false, code: '0000', results: {} })
        }, 1000)
      })
    } else {
      const response = await axiosOta.post(ENDPOINTS.ORGANIZATION.WITHDRAW, { data: { id, userId } })
      return response
    }
  } catch (error) {
    console.error('Failed to withdraw:', error)
    throw error
  }
}

const sendResponse = async ({ id, userId, isApproved, reason }) => {
  try {
    if (mockUpData) {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({ message: 'OK', error: false, code: '0000', results: {} })
        }, 1000)
      })
    } else {
      const response = await axiosOta.post(ENDPOINTS.ORGANIZATION.JOIN, { data: { id, userId, isApproved, reason } })
      return response
    }
  } catch (error) {
    console.error('Failed to send response:', error)
    throw error
  }
}

export const organizationApis = {
  retrieveCompany,
  retrieveOrganizationUser,
  retrieveOrganizationTree,
  saveOrganization,
  requestJoin,
  withdraw,
  sendResponse
}

