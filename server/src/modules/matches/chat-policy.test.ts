import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AppError } from '../../shared/errors/AppError'
import { MATCH_CHAT_MAX_LENGTH, sanitizeMatchChatMessage } from './chat-policy'

test('chat policy trims and collapses whitespace', () => {
  assert.equal(sanitizeMatchChatMessage('  vamos\n\t mid   ahora  '), 'vamos mid ahora')
})

test('chat policy removes zero-width and unsafe control characters', () => {
  assert.equal(sanitizeMatchChatMessage('gg\u200B wp\u0000!'), 'gg wp!')
})

test('chat policy rejects empty messages after sanitization', () => {
  assert.throws(
    () => sanitizeMatchChatMessage(' \n\t\u200B '),
    (error) => {
      assert.ok(error instanceof AppError)
      assert.equal(error.code, 'VALIDATION_ERROR')
      return true
    },
  )
})

test('chat policy rejects messages over the maximum length', () => {
  assert.throws(
    () => sanitizeMatchChatMessage('x'.repeat(MATCH_CHAT_MAX_LENGTH + 1)),
    (error) => {
      assert.ok(error instanceof AppError)
      assert.equal(error.message, `El mensaje no puede superar ${MATCH_CHAT_MAX_LENGTH} caracteres.`)
      return true
    },
  )
})

test('chat policy rejects obvious repeated-character spam', () => {
  assert.throws(
    () => sanitizeMatchChatMessage('g' + 'o'.repeat(30)),
    (error) => {
      assert.ok(error instanceof AppError)
      assert.equal(error.message, 'El mensaje parece spam. Bajá la repetición y probá de nuevo.')
      return true
    },
  )
})
