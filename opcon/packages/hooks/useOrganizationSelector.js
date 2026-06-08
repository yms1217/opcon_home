import { useState, useEffect } from 'react'
import { organizationApis } from '@repo/apis'
import { useOrganizationStore } from '@repo/stores'

export const useOrganizationSelector = (email = 'test.site@lge.com') => {
  const [organizations, setOrganizations] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [company, setCompany] = useState({})
  const {
    setAllOrgs,
    setCompany: setStoreCompany,
    defaultOrg,
    setDefaultOrg: setStoreDefaultOrg
  } = useOrganizationStore()

  const makeTree = (orgList) => {
    if (defaultOrg === null || Object.keys(defaultOrg).length === 0) {
      const foundDefault = orgList.find((item) => item.parentId === null)
      if (foundDefault) setStoreDefaultOrg(foundDefault)
    }
    const currentDefaultId = defaultOrg?.id || orgList.find((item) => item.parentId === null)?.id
    const parentOrgs = orgList.filter((item) => item.parentId === currentDefaultId)
    const childOrgs = orgList.filter(
      (item) => item.parentId !== null && item.parentId !== 1 && item.parentId !== currentDefaultId
    )
    return [...parentOrgs, ...childOrgs]
  }

  useEffect(() => {
    setIsLoading(true)
    Promise.all([
      // For demo
      organizationApis.retrieveOrganizationTree({ userId: 'test.site@lge.com' }),
      organizationApis.retrieveCompany({ userId: 'test.site@lge.com' })
      // organizationApis.retrieveOrganizationTree({ userId: email }),
      // organizationApis.retrieveCompany({ userId: email })
    ])
      .then(([orgResponse, companyResponse]) => {
        const editedOrgTree = makeTree(orgResponse.results)
        setOrganizations(editedOrgTree)
        setAllOrgs(editedOrgTree)
        setCompany(companyResponse.results[0])
        setStoreCompany(companyResponse.results[0])
      })
      .catch((error) => {
        console.error('Failed to fetch organization selector data:', error)
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [email])
  return {
    company,
    organizations,
    isLoading,
    defaultOrg
  }
}

