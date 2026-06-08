import React, { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import Dropdown from '../Dropdown'
import { DropdownContainer } from './styles'
import { useOrganizationSelector } from '@repo/hooks'
import { useOrganizationStore } from '@repo/stores'

const OrganizationSelector = ({ onChange, supportAlls = [true, true], supportNone = [false, true], disabled }) => {
  const { t } = useTranslation('common')
  const { company, isLoading, defaultOrg } = useOrganizationSelector()

  const depth = company?.orgDepth || 2
  const configs = [
    { label: t('group'), placeholder: t('selectGroup'), minWidth: '250px' },
    { label: t('site'), placeholder: t('selectSite'), minWidth: '250px' }
  ]

  const {
    selectedOrgs: selectedValues,
    setSelectedOrgs: setSelectedValues,
    setActualOrgs,
    allOrgs,
    forcedNoneCount
  } = useOrganizationStore()

  const getActualSelectedOrgs = (values) => {
    if (!values || values.length === 0 || values[0] === 'none') return []

    let currentActuals = allOrgs.filter((item) => !item.parentId)
    for (let i = 0; i < depth; i++) {
      const val = values[i]
      if (!val || val === 'none') {
        break
      } else if (val === 'all') {
        if (i > 0) {
          const parentIds = currentActuals.map((item) => String(item.id))
          currentActuals = allOrgs.filter((item) => item.parentId && parentIds.includes(String(item.parentId)))
        }
      } else {
        currentActuals = allOrgs.filter((item) => String(item.code) === String(val))
      }
    }
    return currentActuals
  }

  useEffect(() => {
    if (allOrgs.length > 0 && onChange) {
      const orgs = getActualSelectedOrgs(selectedValues)
      setActualOrgs(orgs)
      const matchesOrg = (itemOrg) => {
        if (!itemOrg) return false
        return orgs.some((org) => String(org.id) === String(itemOrg.id))
      }
      onChange({ values: selectedValues, actualOrgs: orgs, matchesOrg })
    }
  }, [selectedValues, allOrgs, depth])

  if (isLoading && allOrgs.length === 0) {
    return null
  }

  const getOptionsForLevel = (levelIndex, parentId, currentItems) => {
    if (allOrgs.length === 0) {
      return [{ name: 'None', value: 'none' }]
    }

    const parentItem =
      parentId && parentId !== 'all' && parentId !== 'none' ? allOrgs.find((item) => item.code === parentId) : null

    const showNone = levelIndex === 0 && supportNone[levelIndex]
    parentId === 'all' ||
      (parentItem && parentItem.roleName !== null && parentItem.roleName !== '' && parentItem.roleName !== undefined)
    const showAll = currentItems.length > 1 && supportAlls[levelIndex]

    const options = []
    if (showNone) {
      options.push({ name: 'None', value: 'none' })
    }
    if (showAll) {
      options.push({ name: 'All', value: 'all' })
    }
    options.push(
      ...currentItems.map((item) => ({
        name: item.displayName,
        value: item.code
      }))
    )
    return options
  }

  const getNextLevelItems = (selectedValue, currentItems) => {
    if (selectedValue === 'all') {
      const currentIds = currentItems.map((item) => item.id)
      return allOrgs.filter((item) => currentIds.includes(item.parentId))
    } else if (selectedValue && selectedValue !== 'none') {
      const selectedItem = allOrgs.find((item) => item.code === selectedValue)
      return allOrgs.filter((item) => item.parentId === selectedItem?.id)
    }
    return []
  }

  const handleValueChange = (index, value) => {
    const newValues = [...selectedValues]
    newValues[index] = value

    let currentItems = allOrgs.filter((item) => !item.parentId)

    for (let i = 0; i < depth; i++) {
      const parentId = i > 0 ? newValues[i - 1] : null

      if (i > index) {
        const options = getOptionsForLevel(i, parentId, currentItems)
        newValues[i] = options.length > 0 ? options[0].value : ''
      }

      currentItems = getNextLevelItems(newValues[i], currentItems)
    }

    setSelectedValues(newValues)
  }

  const getLevelInfo = () => {
    const levels = []
    let currentItems = allOrgs.filter((item) => item.parentId === defaultOrg?.id)

    for (let i = 0; i < depth; i++) {
      const parentId = i > 0 ? selectedValues[i - 1] : null
      const selectedValue = selectedValues[i]
      const config = configs[i] || {}

      const options = getOptionsForLevel(i, parentId, currentItems)

      levels.push({
        options,
        selectedValue,
        label: config.label || `Level ${i + 1}`,
        placeholder: i === 0 && allOrgs.length === 0 ? t('noOrganization') : config.placeholder,
        minWidth: config.minWidth || ''
      })

      currentItems = getNextLevelItems(selectedValue, currentItems)
    }
    return levels
  }

  const levelInfos = getLevelInfo()

  const isDisabled = (info, index) => {
    if (disabled) return true
    if (forcedNoneCount > 0) return true
    // if (info.options.length === 1) return true
    if (index > 0 && (!selectedValues[index - 1] || selectedValues[index - 1] === 'none')) return true
    return false
  }

  return (
    <DropdownContainer>
      {levelInfos.map((info, index) => (
        <Dropdown
          key={index}
          label={info.label}
          minWidth={info.minWidth}
          size="lg"
          value={info.selectedValue}
          placeholder={info.placeholder}
          options={info.options}
          onChange={(val) => handleValueChange(index, val)}
          disabled={isDisabled(info, index)}
        />
      ))}
    </DropdownContainer>
  )
}

export default OrganizationSelector

