import { useState, useEffect, useCallback, useRef } from 'react'
import { Amplify } from 'aws-amplify'
import { Hub } from 'aws-amplify/utils'
import { PubSub } from '@aws-amplify/pubsub'

// Module-scoped variables to share state across all hook instances
let pubsubInstance = null
let isAmplifyConfigured = false
let globalIsConnected = false
const globalSubscribers = {} // { topic: [handlers] }
const globalAmplifySubscriptions = {} // { topic: subscription }

export const useMqtt = (options = {}) => {
  const brokerUrl = options.brokerUrl
  const region = options.region
  const identityPoolId = options.identityPoolId

  const [isConnected, setIsConnected] = useState(globalIsConnected)
  // Track handlers added by THIS specific instance for cleanup
  const localHandlersRef = useRef([]) // [ { topic, handler, unsubscribe } ]

  useEffect(() => {
    if (!brokerUrl || !identityPoolId || !region) return

    if (!isAmplifyConfigured) {
      try {
        Amplify.configure({
          Auth: {
            Cognito: {
              identityPoolId,
              allowGuestAccess: true
            }
          }
        })
        isAmplifyConfigured = true
        console.log('Amplify configured for MQTT')
      } catch (err) {
        console.error('Amplify initialization error:', err)
        return
      }
    }

    if (!pubsubInstance) {
      pubsubInstance = new PubSub({
        region,
        endpoint: brokerUrl
      })
      console.log('PubSub instance created')
    }

    // Listen for connection state changes (shared across instances)
    const stopListening = Hub.listen('pubsub', (data) => {
      const { event } = data.payload
      if (event === 'connectionStateChange') {
        const connectionState = data.payload.data.connectionState
        console.log('MQTT connection state:', connectionState)
        globalIsConnected = connectionState === 'Connected'
        setIsConnected(globalIsConnected)
      }
    })

    return () => {
      stopListening()
      // Cleanup ONLY handlers created by this instance
      if (localHandlersRef.current.length > 0) {
        console.log('useMqtt instance unmounting, cleaning up local handlers:', localHandlersRef.current.length)
        // Copy the array to avoid modification during iteration
        const handlersToCleanup = [...localHandlersRef.current]
        handlersToCleanup.forEach(({ unsubscribe }) => {
          if (unsubscribe) {
            unsubscribe()
          }
        })
      }
    }
  }, [brokerUrl, identityPoolId, region])

  const subscribe = useCallback((topic, handler) => {
    console.log(`MQTT subscribe attempt: ${topic}`)
    if (!pubsubInstance) {
      console.warn('PubSub is not initialized yet (pubsubInstance is null).')
      return { unsubscribe: () => {} }
    }

    if (!globalSubscribers[topic]) {
      globalSubscribers[topic] = []

      try {
        const subscription = pubsubInstance.subscribe({ topics: topic }).subscribe({
          next: (data) => {
            console.log(`MQTT received data for ${topic}:`, data)
            const payload = data.value || data
            payload.topic = topic
            const handlers = globalSubscribers[topic] || []
            handlers.forEach((hdlr) => hdlr(payload))
          },
          error: (err) => console.error(`Subscription error for ${topic}:`, err),
          complete: () => console.log(`Subscription completed for ${topic}`)
        })

        globalAmplifySubscriptions[topic] = subscription
        console.log(`MQTT successfully subscribed to topic (new subscription): ${topic}`)
      } catch (err) {
        console.error(`Failed to subscribe to ${topic}:`, err)
      }
    } else {
      console.log(`MQTT adding handler to existing subscription: ${topic}`)
    }

    globalSubscribers[topic].push(handler)

    const unsubscribe = () => {
      console.log(`MQTT unsubscribe called for topic: ${topic}`)
      if (globalSubscribers[topic]) {
        globalSubscribers[topic] = globalSubscribers[topic].filter((h) => h !== handler)

        if (globalSubscribers[topic].length === 0) {
          if (globalAmplifySubscriptions[topic]) {
            globalAmplifySubscriptions[topic].unsubscribe()
            delete globalAmplifySubscriptions[topic]
            console.log(`MQTT unsubscribed from topic (no more handlers): ${topic}`)
          }
          delete globalSubscribers[topic]
        } else {
          console.log(`MQTT removed handler, remaining handlers for ${topic}: ${globalSubscribers[topic].length}`)
        }
      }
      // Also remove from local handlers tracking
      localHandlersRef.current = localHandlersRef.current.filter((item) => item.handler !== handler)
    }

    // Track this subscription locally for auto-cleanup on unmount
    localHandlersRef.current.push({ topic, handler, unsubscribe })

    return unsubscribe
  }, [])

  return { isConnected, subscribe }
}

