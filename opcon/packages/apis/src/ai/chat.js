const BASE_URL = 'http://54.116.181.2:3007'

/**
 * 사이트 어시스턴트 채팅 요청
 *
 * @param {Object} params
 * @param {string} params.message - 사용자 메시지
 * @param {string} [params.currentPath] - 현재 페이지 경로
 * @param {string} [params.currentApp] - 현재 앱 식별자
 * @returns {Promise<any>}
 */
export async function postSiteAssistantChat({
    message,
    currentPath,
    currentApp
}) {

    try {
        const response = await fetch(`${BASE_URL}/chat/site-assistant`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message,
                currentPath,
                currentApp
            })
        })
        const ret = await response.json()
        console.log(`response`, ret)
        return ret
    } catch (e) {
        console.log(e)
        return null
    }


}