import axios from 'axios'
import { API_CONFIG, ENDPOINTS } from './constants'
import { useUserStore } from '../../stores/src/useUserStore'
import { generateUuid36, getTimestampSec } from '@repo/utils'

/* ===============================
 * Refresh 상태 관리
 * =============================== */
let isRefreshing = false
let refreshSubscribers = []

const subscribeTokenRefresh = (cb) => {
  refreshSubscribers.push(cb)
}

const onRefreshed = (newToken) => {
  refreshSubscribers.forEach((cb) => cb(newToken))
  refreshSubscribers = []
}

const forceLogout = () => {
  console.error('forceLogout')
  const store = useUserStore.getState()
  //store.logout()
  //window.location.href = '/login?sessionout=Y'
}

const axiosRefresh = axios.create({
  baseURL: import.meta.env.VITE_AUTH_API_BASE_URL,
  timeout: API_CONFIG.TIMEOUT,
  headers: {
    'Content-Type': 'application/json'
  }
})

const refreshAccessToken = async () => {
  const store = useUserStore.getState()
  const { userId, refreshToken } = store.session || {}

  const response = await axiosRefresh.post(
    ENDPOINTS.AUTH.TOKEN_REFRESH,
    {
      userId,
      refreshToken
    },
    {
      headers: {
        timestamp: getTimestampSec(),
        'message-id': generateUuid36()
      }
    }
  )
  return response.data
}

/* ===============================
 * Axios Client Factory
 * =============================== */
const createClient = (baseURL, options = {}) => {
  const instance = axios.create({
    baseURL,
    timeout: API_CONFIG.TIMEOUT,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  })

  /* ===============================
   * Request Interceptor
   * =============================== */
  instance.interceptors.request.use(
    (config) => {
      const { accessToken } = useUserStore.getState().session || {}

      if (accessToken) {
        config.headers.authorization = `Bearer ${accessToken}`
      }

      config.headers.timestamp = getTimestampSec()
      config.headers['message-id'] = generateUuid36()

      return config
    },
    (error) => Promise.reject(error)
  )

  /* ===============================
   * Response Interceptor (핵심)
   * =============================== */
  instance.interceptors.response.use(
    (response) => response.data,
    async (error) => {
      const { response, config } = error

      if (!response) {
        console.error('Network Error / Timeout')
        return Promise.reject(error)
      }

      const { status, data } = response
      const errorCode = data?.errorCode

      // refresh API 자신이면 바로 로그아웃
      if (config.url?.includes('/auth/refresh')) {
        forceLogout()
        console.error('includes')
        return Promise.reject(error)
      }

      // accessToken 만료만 처리
      if (status === 401 && errorCode === 'GW_401') {
        // 이미 retry한 요청이면 다시 refresh 시도 ❌
        if (config._retry) {
          //forceLogout()
          console.error('config._retry')
          return Promise.reject(error)
        }

        config._retry = true

        if (isRefreshing) {
          return new Promise((resolve) => {
            subscribeTokenRefresh((newToken) => {
              config.headers.authorization = `Bearer ${newToken}`
              resolve(instance(config))
            })
          })
        }

        isRefreshing = true

        try {
          const { accessToken: newAccessToken, refreshToken: newRefreshToken } = await refreshAccessToken()

          const store = useUserStore.getState()
          // store에 다시 저장 (persist → sessionStorage 자동 반영)
          store.updateTokens({
            accessToken: newAccessToken,
            refreshToken: newRefreshToken
          })

          instance.defaults.headers.authorization = `Bearer ${newAccessToken}`
          config.headers.authorization = `Bearer ${newAccessToken}`

          onRefreshed(newAccessToken)

          return instance(config)
        } catch (e) {
          forceLogout()
          return Promise.reject(e)
        } finally {
          isRefreshing = false
        }
      }

      // 나머지 에러는 그대로 전달
      switch (status) {
        case 403:
          console.error('Forbidden - Access denied')
          break
        case 404:
          console.error('Not Found')
          break
        case 500:
          console.error('Internal Server Error')
          break
        default:
          console.error('Unexpected error', data)
      }

      return Promise.reject(error)
    }
  )

  return instance
}

export default createClient

