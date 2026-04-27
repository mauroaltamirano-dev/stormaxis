import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import type { Request, Response } from 'express'
import { AppError } from '../../shared/errors/AppError'
import { requireTrustedCookieRequest } from './auth.router'

const ORIGINAL_ENV = {
  NODE_ENV: process.env.NODE_ENV,
  CLIENT_URL: process.env.CLIENT_URL,
  CLIENT_URLS: process.env.CLIENT_URLS,
}

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_ENV.NODE_ENV
  process.env.CLIENT_URL = ORIGINAL_ENV.CLIENT_URL
  process.env.CLIENT_URLS = ORIGINAL_ENV.CLIENT_URLS
})

function makeRequest(headers: Record<string, string | undefined>): Request {
  return {
    get(name: string) {
      const normalized = name.toLowerCase()
      const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === normalized)
      return entry?.[1]
    },
  } as Request
}

function runGuard(headers: Record<string, string | undefined>) {
  let nextError: unknown
  requireTrustedCookieRequest(makeRequest(headers), {} as Response, (err?: unknown) => {
    nextError = err
  })
  return nextError
}

test('allows production cookie request from an allowed Origin', () => {
  process.env.NODE_ENV = 'production'
  process.env.CLIENT_URLS = 'https://app.stormaxis.gg,https://stormaxis-hots.pages.dev'

  const error = runGuard({ origin: 'https://app.stormaxis.gg' })

  assert.equal(error, undefined)
})

test('blocks production cookie request from an unknown Origin', () => {
  process.env.NODE_ENV = 'production'
  process.env.CLIENT_URLS = 'https://app.stormaxis.gg'

  const error = runGuard({ origin: 'https://evil.example' })

  assert.ok(error instanceof AppError)
  assert.equal(error.code, 'FORBIDDEN')
  assert.equal(error.statusCode, 403)
})

test('allows production cookie request from an allowed Referer when Origin is absent', () => {
  process.env.NODE_ENV = 'production'
  process.env.CLIENT_URL = 'https://app.stormaxis.gg'
  delete process.env.CLIENT_URLS

  const error = runGuard({ referer: 'https://app.stormaxis.gg/profile?tab=accounts' })

  assert.equal(error, undefined)
})

test('blocks production cookie request without Origin or Referer', () => {
  process.env.NODE_ENV = 'production'
  process.env.CLIENT_URL = 'https://app.stormaxis.gg'
  delete process.env.CLIENT_URLS

  const error = runGuard({})

  assert.ok(error instanceof AppError)
  assert.equal(error.code, 'FORBIDDEN')
})

test('allows local tooling without Origin or Referer outside production', () => {
  process.env.NODE_ENV = 'development'
  process.env.CLIENT_URL = 'http://localhost:5173'
  delete process.env.CLIENT_URLS

  const error = runGuard({})

  assert.equal(error, undefined)
})
