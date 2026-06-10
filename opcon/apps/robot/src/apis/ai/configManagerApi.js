import {
    axiosConfigManager,
    pathFunConfig,
    pathLlmConfig,
    pathAssigneesConfig,
    pathReportConfig,
    unwrapData,
    toStringArray,
    toOptionalTrimmedString,
    normalizeProviderKey
} from './shared'

const normalizeFuncItem = (item, index) => {
    const source = item && typeof item === 'object' ? item : {}
    const rawId = source.id ?? source.funcId ?? source._id ?? `func-${index + 1}`
    const name = String(source.func ?? source.name ?? '').trim()

    return {
        id: rawId,
        name,
        description: String(source.description ?? '').trim(),
        tags: toStringArray(source.tags),
        actions: toStringArray(source.actions),
        assignees: toStringArray(source.assignees),
        prompt: String(source.prompt ?? '').trim(),
        createdAt: source.createdAt ?? null,
        updatedAt: source.updatedAt ?? null
    }
}

const normalizeFuncsPayload = (payload) => {
    const base = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.items)
            ? payload.items
            : Array.isArray(payload?.funcs)
                ? payload.funcs
                : []

    return base.map(normalizeFuncItem)
}

const normalizeLlmConfigItem = (item) => {
    const source = item && typeof item === 'object' ? item : {}

    return {
        provider: normalizeProviderKey(source.provider),
        instruction: String(source.instruction ?? source.prompt ?? '').trim(),
        isActive: Boolean(source.isActive ?? source.is_active),
        createdAt: source.createdAt ?? null,
        updatedAt: source.updatedAt ?? null
    }
}

const normalizeAssigneeItem = (item, index) => {
    const source = item && typeof item === 'object' ? item : {}

    return {
        id: source.id ?? source.email ?? `assignee-${index + 1}`,
        func: String(source.func ?? source.function ?? source.feature ?? source.name ?? '').trim(),
        email: String(source.email ?? '').trim(),
        name: String(source.name ?? '').trim(),
        team: String(source.team ?? '').trim(),
        profile: String(source.profile ?? '').trim(),
        tags: toStringArray(source.tags),
        job: String(source.job ?? source.profile ?? '').trim()
    }
}

const normalizeAssigneesPayload = (payload) => {
    const base = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.items)
            ? payload.items
            : Array.isArray(payload?.assignees)
                ? payload.assignees
                : []

    return base.map(normalizeAssigneeItem)
}

const normalizeFuncAssigneesItem = (item) => {
    const source = item && typeof item === 'object' ? item : {}

    return {
        func: String(source.func ?? source.name ?? source.id ?? '').trim(),
        assignees: normalizeAssigneesPayload(source.assignees)
    }
}

const normalizeFuncAssigneesPayload = (payload) => {
    const base = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.items)
            ? payload.items
            : Array.isArray(payload?.funcs)
                ? payload.funcs
                : []

    return base.map(normalizeFuncAssigneesItem)
}

const toAssigneesInput = (payload = {}) => {
    const base = Array.isArray(payload?.assignees)
        ? payload.assignees
        : Array.isArray(payload)
            ? payload
            : []

    return {
        assignees: base.map((item) => ({
            email: String(item?.email ?? '').trim(),
            name: String(item?.name ?? '').trim(),
            team: String(item?.team ?? '').trim(),
            profile: String(item?.profile ?? item?.job ?? '').trim(),
            tags: toStringArray(item?.tags)
        }))
    }
}

const toFuncCreateInput = (payload = {}) => {
    return {
        name: String(payload?.name ?? payload?.func ?? '').trim(),
        description: payload?.description,
        prompt: payload?.prompt,
        tags: payload?.tags,
        assignees: payload?.assignees
    }
}

const toFuncUpsertBody = (payload = {}) => {
    const body = {}

    const name = toOptionalTrimmedString(payload.name ?? payload.func)
    if (name) {
        body.name = name
        body.func = name
    }

    const description = toOptionalTrimmedString(payload.description)
    if (description !== undefined) body.description = description

    const prompt = toOptionalTrimmedString(payload.prompt)
    if (prompt !== undefined) body.prompt = prompt

    body.tags = toStringArray(payload.tags)
    body.assignees = toStringArray(payload.assignees)

    return body
}

/**
 * func 목록 조회
 *
 * 지원 shape 예:
 * 1) [{ id, feature, ... }]
 * 2) { data: [{ id, feature, ... }] }
 * 3) { code: 200, data: { features: ['navigation', 'HW'] } }
 */
export const getFunctions = async () => {
    try {
        const response = await axiosConfigManager.get(pathFunConfig)
        const payload = unwrapData(response.data)

        const collectNames = (source) => {
            if (!Array.isArray(source)) return []

            return source
                .map((item) => {
                    if (typeof item === 'string') return item
                    if (!item || typeof item !== 'object') return ''
                    return item.func ?? item.name ?? item.feature ?? ''
                })
                .map((value) => String(value ?? '').trim())
                .filter(Boolean)
        }

        const candidates = [
            payload,
            payload?.funcs,
            payload?.features,
            payload?.items,
            payload?.list,
            payload?.data,
            payload?.data?.funcs,
            payload?.data?.features,
            payload?.data?.items,
            payload?.data?.list
        ]

        const names = candidates.flatMap((candidate) => collectNames(candidate))

        return Array.from(new Set(names))
    } catch (e) {
        return []
    }
}

export const getFuncs = async () => {
    const url = pathFunConfig
    const response = await axiosConfigManager.get(url)
    const payload = unwrapData(response.data)

    return {
        ...response,
        data: normalizeFuncsPayload(payload)
    }
}

export const getFuncById = async (id) => {
    const url = `${pathFunConfig}/${encodeURIComponent(String(id))}`
    const response = await axiosConfigManager.get(url)
    const payload = unwrapData(response.data)
    const normalized = normalizeFuncItem(payload, 0)

    return {
        ...response,
        data: normalized
    }
}

export const setFuncCatalog = async (funcs = []) => {
    const url = pathFunConfig
    return axiosConfigManager.put(url, { funcs })
}

export const createFunc = async (payload = {}) => {
    const url = pathFunConfig
    const input = toFuncCreateInput(payload)
    const response = await axiosConfigManager.post(url, toFuncUpsertBody(input))
    const payloadData = unwrapData(response.data)

    return {
        ...response,
        data: normalizeFuncItem(payloadData, 0)
    }
}

export const updateFuncById = async (id, payload = {}) => {
    const url = `${pathFunConfig}/${encodeURIComponent(String(id))}`
    const input = toFuncCreateInput(payload)
    const response = await axiosConfigManager.put(url, toFuncUpsertBody(input))
    const payloadData = unwrapData(response.data)

    return {
        ...response,
        data: normalizeFuncItem(payloadData, 0)
    }
}

export const deleteFuncById = async (id) => {
    const url = `${pathFunConfig}/${encodeURIComponent(String(id))}`
    return axiosConfigManager.delete(url)
}

export const getLlmProviderConfigs = async () => {
    const url = `${pathLlmConfig}/provider`
    const response = await axiosConfigManager.get(url)
    const payload = unwrapData(response.data)

    const base = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.items)
            ? payload.items
            : []

    return {
        ...response,
        data: base.map(normalizeLlmConfigItem)
    }
}

export const getLlmConfigByProvider = async (provider) => {
    const normalizedProvider = normalizeProviderKey(provider)
    const url = `${pathLlmConfig}/${encodeURIComponent(normalizedProvider)}`
    const response = await axiosConfigManager.get(url)
    const payload = unwrapData(response.data)

    return {
        ...response,
        data: normalizeLlmConfigItem(payload)
    }
}

export const upsertLlmConfigByProvider = async (provider, instruction) => {
    const normalizedProvider = normalizeProviderKey(provider)
    const url = `${pathLlmConfig}/${encodeURIComponent(normalizedProvider)}`
    const response = await axiosConfigManager.put(url, {
        instruction: String(instruction ?? '')
    })
    const payload = unwrapData(response.data)

    return {
        ...response,
        data: normalizeLlmConfigItem(payload)
    }
}

export const getActiveLlmProvider = async () => {
    const url = `${pathLlmConfig}/active-provider`
    const response = await axiosConfigManager.get(url)
    const payload = unwrapData(response.data)

    return {
        ...response,
        data: {
            provider: normalizeProviderKey(payload?.provider)
        }
    }
}

export const setActiveLlmProvider = async (provider) => {
    const normalizedProvider = normalizeProviderKey(provider)
    const url = `${pathLlmConfig}/active-provider`
    const response = await axiosConfigManager.put(url, {
        provider: normalizedProvider
    })
    const payload = unwrapData(response.data)

    return {
        ...response,
        data: {
            provider: normalizeProviderKey(payload?.provider)
        }
    }
}

export const getAssignees = async () => {
    const url = pathAssigneesConfig
    const response = await axiosConfigManager.get(url)
    const payload = unwrapData(response.data)

    return {
        ...response,
        data: normalizeAssigneesPayload(payload)
    }
}

export const getAssigneeById = async (id) => {
    const url = `${pathAssigneesConfig}/id/${encodeURIComponent(String(id))}`
    const response = await axiosConfigManager.get(url)
    const payload = unwrapData(response.data)

    return {
        ...response,
        data: normalizeAssigneeItem(payload, 0)
    }
}

export const getAssigneesByTeam = async (team) => {
    const url = `${pathAssigneesConfig}/team/${encodeURIComponent(String(team))}`
    const response = await axiosConfigManager.get(url)
    const payload = unwrapData(response.data)

    return {
        ...response,
        data: normalizeAssigneesPayload(payload)
    }
}

export const getAssigneesByFunc = async (func) => {
    const url = `${pathAssigneesConfig}/funcs/${encodeURIComponent(String(func))}`
    const response = await axiosConfigManager.get(url)
    const payload = unwrapData(response.data)

    return {
        ...response,
        data: normalizeAssigneesPayload(payload)
    }
}

export const getFuncAssigneesByFunc = async (func) => {
    const url = `${pathAssigneesConfig}/funcs/${encodeURIComponent(String(func))}`
    const response = await axiosConfigManager.get(url)
    const payload = unwrapData(response.data)

    return {
        ...response,
        data: normalizeFuncAssigneesItem(payload)
    }
}

export const putFuncAssignees = async (func, payload = {}) => {
    const url = `${pathAssigneesConfig}/funcs/${encodeURIComponent(String(func))}`
    const response = await axiosConfigManager.put(url, toAssigneesInput(payload))
    const payloadData = unwrapData(response.data)

    return {
        ...response,
        data: normalizeFuncAssigneesItem(payloadData)
    }
}

export const deleteFuncAssignees = async (func) => {
    const url = `${pathAssigneesConfig}/funcs/${encodeURIComponent(String(func))}`
    return axiosConfigManager.delete(url)
}

const normalizeReportConfigItem = (item) => {
    const source = item && typeof item === 'object' ? item : {}

    return {
        id: source.id ?? 0,
        key: String(source.key ?? 'default').trim(),
        name: String(source.name ?? source.key ?? 'default').trim(),
        subjectTemplate: String(source.subjectTemplate ?? '').trim(),
        htmlTemplate: String(source.htmlTemplate ?? '').trim(),
        description: String(source.description ?? '').trim(),
        enabled: Boolean(source.enabled),
        createdAt: source.createdAt ?? null,
        updatedAt: source.updatedAt ?? null
    }
}
``

export const getReportConfig = async () => {
    try {
        const response = await axiosConfigManager.get(pathReportConfig)
        const payload = unwrapData(response.data)
        return {
            ...response,
            data: normalizeReportConfigItem(payload)
        }
    } catch (e) {
        console.log(e)
        return null
    }
}
export const updateReportConfig = async (payload = {}) => {
    try {
        const response = await axiosConfigManager.put(pathReportConfig, {
            subjectTemplate: String(payload?.subjectTemplate ?? '').trim(),
            htmlTemplate: String(payload?.htmlTemplate ?? '').trim(),
            description: String(payload?.description ?? '').trim(),
            enabled: Boolean(payload?.enabled ?? true)
        })

        const responsePayload = unwrapData(response.data)

        return {
            ...response,
            data: normalizeReportConfigItem(responsePayload)
        }
    } catch (e) {
        console.log(e)
        return null
    }
}
``