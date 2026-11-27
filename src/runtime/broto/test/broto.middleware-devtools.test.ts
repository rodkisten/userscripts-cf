import { describe, expect, it, vi } from 'vitest'
import { store } from '@rodkisten/broto'

describe('Broto store middleware and devtools bridge', () => {
  it('runs middleware before subscribers and exposes post-middleware devtools events', () => {
    const calls: string[] = []
    const devtools = vi.fn()
    const state = store({ count: 0 }, {
      middleware: [
        (event, api, next) => {
          calls.push(`before:${event.type}:${api.snapshot().count}`)
          next({ ...event, cause: event.cause || 'middleware' })
          calls.push(`after:${event.type}:${api.snapshot().count}`)
        },
      ],
      devtools: { listener: devtools },
    })

    const subscriber = vi.fn()
    state.subscribe(subscriber)
    state.setPath('count', 1)

    expect(calls).toEqual(['before:path:set:1', 'after:path:set:1'])
    expect(devtools).toHaveBeenCalledWith(expect.objectContaining({ type: 'path:set', cause: 'middleware' }))
    expect(subscriber).toHaveBeenCalledWith(expect.objectContaining({ type: 'path:set', cause: 'middleware' }))
  })

  it('can add middleware and devtools listeners after creation', () => {
    const state = store({ name: 'Rod' })
    const seen: string[] = []
    const stopMiddleware = state.use((event, _api, next) => {
      seen.push(`mw:${event.type}`)
      next(event)
    })
    const stopDevtools = state.subscribeDevtools((event) => seen.push(`dev:${event.type}`))

    state.patch({ name: 'Cipó' })
    stopMiddleware()
    stopDevtools()
    state.patch({ name: 'Broto' })

    expect(seen).toEqual(['mw:patch', 'dev:patch'])
  })
})
