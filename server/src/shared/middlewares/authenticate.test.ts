import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Request, Response } from 'express'
import { AppError } from '../errors/AppError'
import { requireAdmin, type AuthRequest } from './authenticate'

function runRequireAdmin(role?: string) {
  let nextCalled = false
  let nextError: unknown
  const req = { userRole: role } as AuthRequest & Request

  requireAdmin(req, {} as Response, (err?: unknown) => {
    nextCalled = true
    nextError = err
  })

  return { nextCalled, nextError }
}

test('admin guard allows ADMIN users', () => {
  const result = runRequireAdmin('ADMIN')

  assert.equal(result.nextCalled, true)
  assert.equal(result.nextError, undefined)
})

test('admin guard blocks authenticated non-admin users', () => {
  assert.throws(
    () => runRequireAdmin('USER'),
    (error) => {
      assert.ok(error instanceof AppError)
      assert.equal(error.code, 'FORBIDDEN')
      assert.equal(error.statusCode, 403)
      return true
    },
  )
})

test('admin guard blocks requests without a resolved role', () => {
  assert.throws(
    () => runRequireAdmin(undefined),
    (error) => {
      assert.ok(error instanceof AppError)
      assert.equal(error.code, 'FORBIDDEN')
      assert.equal(error.statusCode, 403)
      return true
    },
  )
})
