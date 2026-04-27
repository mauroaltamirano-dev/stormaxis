import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { db } from '../../infrastructure/database/client'
import { applyReplayWinnerResolution } from './matches.service'

const originalFindUnique = db.match.findUnique.bind(db.match)

type MockMatch = {
  status: string
  winner: number | null
  players: Array<{ userId: string | null; isBot: boolean }>
}

function mockMatch(match: MockMatch | null) {
  ;(db.match as any).findUnique = async () => match
}

afterEach(() => {
  ;(db.match as any).findUnique = originalFindUnique
})

const TRUSTED_REPLAY_VALIDATION = {
  mapMatches: true,
  expectedHumanPlayers: 10,
  matchedPlayers: 10,
  minimumMatchedPlayers: 6,
  battleTagMatchedPlayers: 8,
  battleTagMismatches: 0,
  teamMismatches: 0,
  identityConfidence: 'high' as const,
  trustScore: 92,
}

function buildUpload(overrides: Partial<Parameters<typeof applyReplayWinnerResolution>[1]> = {}) {
  return {
    status: 'PARSED',
    parsedWinnerTeam: 1 as const,
    parsedSummary: {
      validation: TRUSTED_REPLAY_VALIDATION,
    },
    ...overrides,
  }
}

function votingMatch(overrides: Partial<MockMatch> = {}): MockMatch {
  return {
    status: 'COMPLETED',
    winner: null,
    players: Array.from({ length: 10 }, (_, index) => ({
      userId: `user-${index + 1}`,
      isBot: false,
    })),
    ...overrides,
  }
}

test('replay decision keeps manual flow when parser did not produce a parsed replay', async () => {
  mockMatch(votingMatch())

  const decision = await applyReplayWinnerResolution('match-1', buildUpload({ status: 'FAILED' }))

  assert.equal(decision.status, 'parser_failed')
  assert.equal(decision.autoApplied, false)
  assert.equal(decision.replayWinner, 1)
})

test('replay decision requires the replay map to match the platform match', async () => {
  mockMatch(votingMatch())

  const decision = await applyReplayWinnerResolution(
    'match-1',
    buildUpload({
      parsedSummary: {
        validation: {
          ...TRUSTED_REPLAY_VALIDATION,
          mapMatches: false,
        },
      },
    }),
  )

  assert.equal(decision.status, 'awaiting_manual_vote')
  assert.equal(decision.mapMatches, false)
  assert.equal(decision.eligibleForAutoWinner, false)
})

test('replay decision requires enough trusted identity before auto result', async () => {
  mockMatch(votingMatch())

  const decision = await applyReplayWinnerResolution(
    'match-1',
    buildUpload({
      parsedSummary: {
        validation: {
          ...TRUSTED_REPLAY_VALIDATION,
          trustScore: 45,
        },
      },
    }),
  )

  assert.equal(decision.status, 'awaiting_manual_vote')
  assert.equal(decision.trustScore, 45)
  assert.equal(decision.eligibleForAutoWinner, false)
})

test('replay decision verifies an already resolved winner when replay agrees', async () => {
  mockMatch(votingMatch({ winner: 1 }))

  const decision = await applyReplayWinnerResolution('match-1', buildUpload())

  assert.equal(decision.status, 'verified_existing_result')
  assert.equal(decision.existingWinner, 1)
  assert.equal(decision.eligibleForAutoWinner, true)
})

test('replay decision flags discrepancy when replay winner differs from platform winner', async () => {
  mockMatch(votingMatch({ winner: 2 }))

  const decision = await applyReplayWinnerResolution('match-1', buildUpload())

  assert.equal(decision.status, 'winner_mismatch')
  assert.equal(decision.existingWinner, 2)
  assert.equal(decision.replayWinner, 1)
  assert.equal(decision.autoApplied, false)
})
