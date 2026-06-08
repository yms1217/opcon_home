import { API_CONFIG } from '@repo/apis'

export const ENDPOINTS = {
  ROBOT: {
    AUTH: `${API_CONFIG.PREFIX_AUTH}`,
    DEVICES: `${API_CONFIG.PREFIX_ROBOT}/devices`,
    FILES: `${API_CONFIG.PREFIX_ROBOT}/files`,
    GROUPS: `${API_CONFIG.PREFIX_ROBOT}/groups`,
    MAPS: `${API_CONFIG.PREFIX_ROBOT}/maps`,
    SITES: `${API_CONFIG.PREFIX_ROBOT}/sites`,
    USERS: `${API_CONFIG.PREFIX_ROBOT}/users`
  }
}

export const GETSIZE = '100'

