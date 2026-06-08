import axios from 'axios'
import { API_CONFIG, ENDPOINTS } from './constants'

// Create base instance
const createClient = (baseURL, options = {}) => {
  const instance = axios.create({
    baseURL: baseURL,
    timeout: API_CONFIG.TIMEOUT,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  })

  // Request Interceptor: Inject Token
  instance.interceptors.request.use(
    (config) => {
      const token = localStorage.getItem('token')
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
      return config
    },
    (error) => {
      return Promise.reject(error)
    }
  )

  // Response Interceptor: Standardized Error Handling
  instance.interceptors.response.use(
    (response) => {
      return response.data
    },
    (error) => {
      const { response } = error

      if (response) {
        switch (response.status) {
          case 401:
            console.error('Unauthorized - Redirecting to login...')
            break
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
            console.error('An unexpected error occurred', response.data)
        }
      } else {
        console.error('Network Error / Timeout')
      }

      return Promise.reject(error)
    }
  )

  return instance
}

export default createClient
