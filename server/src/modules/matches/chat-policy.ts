import { Errors } from '../../shared/errors/AppError'

export const MATCH_CHAT_MAX_LENGTH = 500
const MAX_REPEATED_CHAR_RUN = 24

const ZERO_WIDTH_CHARS = /[\u200B-\u200D\uFEFF]/g
const DISALLOWED_CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g
const WHITESPACE_RUN = /[\t\r\n ]+/g

export function sanitizeMatchChatMessage(input: unknown) {
  if (typeof input !== 'string') {
    throw Errors.VALIDATION('El mensaje de chat no es válido.')
  }

  const sanitized = input
    .normalize('NFKC')
    .replace(ZERO_WIDTH_CHARS, '')
    .replace(DISALLOWED_CONTROL_CHARS, '')
    .replace(WHITESPACE_RUN, ' ')
    .trim()

  if (!sanitized) {
    throw Errors.VALIDATION('El mensaje de chat está vacío.')
  }

  if (sanitized.length > MATCH_CHAT_MAX_LENGTH) {
    throw Errors.VALIDATION(`El mensaje no puede superar ${MATCH_CHAT_MAX_LENGTH} caracteres.`)
  }

  if (hasExcessiveRepeatedCharacters(sanitized)) {
    throw Errors.VALIDATION('El mensaje parece spam. Bajá la repetición y probá de nuevo.')
  }

  return sanitized
}

function hasExcessiveRepeatedCharacters(value: string) {
  let previous = ''
  let run = 0

  for (const char of value.toLowerCase()) {
    if (!/[a-z0-9!?¿¡$%#@*]/i.test(char)) {
      previous = ''
      run = 0
      continue
    }

    if (char === previous) {
      run += 1
      if (run >= MAX_REPEATED_CHAR_RUN) return true
    } else {
      previous = char
      run = 1
    }
  }

  return false
}
