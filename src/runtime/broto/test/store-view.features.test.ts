import { describe, expect, it, vi } from 'vitest'
import { effect, flushSync, store } from '@rodkisten/broto'

describe('Broto store view fine-grained selectors', () => {
  it('exposes path-backed computed signals through state.view', () => {
    const state = store({ user: { name: 'Rod', meta: { city: 'SP' } }, count: 1 })
    const spy = vi.fn()

    effect(() => spy(state.view.user.name()))
    expect(spy).toHaveBeenLastCalledWith('Rod')

    state.user.name.set('Cipó')
    flushSync()
    expect(spy).toHaveBeenLastCalledWith('Cipó')

    state.view.user.name.set('Fabrica')
    flushSync()
    expect(state.user.name()).toBe('Fabrica')
    expect(spy).toHaveBeenLastCalledWith('Fabrica')
  })

  it('creates selector signals with $() and path()', () => {
    const state = store({ user: { name: 'Rod' }, count: 1 })
    const name = state.path('user.name')
    const label = state.$((snapshot) => `${snapshot.user.name}:${snapshot.count}`)

    expect(name()).toBe('Rod')
    expect(label()).toBe('Rod:1')

    state.patch({ user: { name: 'Broto' }, count: 2 })
    flushSync()

    expect(name()).toBe('Broto')
    expect(label()).toBe('Broto:2')
  })
})
