import { createReadStream } from 'fs'
import { promises as fs } from 'fs'
import path from 'path'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

type ReplayStorageDriver = 'local' | 's3' | 'r2'
type ReplayRawRetention = 'delete_after_parse' | 'keep'

type StoreReplayInput = {
  filePath: string
  matchId: string
  sha256: string
  originalName: string
  contentType?: string
}

type StoredReplayFile = {
  storagePath: string
  driver: ReplayStorageDriver
  retention: ReplayRawRetention
  removeLocalAfterStore: boolean
}

const replayStorageDriver = normalizeDriver(process.env.REPLAY_STORAGE_DRIVER)
const replayRawRetention = normalizeRetention(process.env.REPLAY_RAW_RETENTION)

export function getReplayUploadTempDir() {
  if (process.env.REPLAY_UPLOAD_DIR) return process.env.REPLAY_UPLOAD_DIR
  return replayStorageDriver === 'local' && replayRawRetention === 'keep'
    ? path.join(process.cwd(), 'uploads', 'replays')
    : path.join(process.cwd(), 'uploads', 'replays-tmp')
}

export async function storeReplayFile(input: StoreReplayInput): Promise<StoredReplayFile> {
  if (replayRawRetention === 'delete_after_parse') {
    return {
      storagePath: `snapshot://${input.matchId}/${input.sha256}`,
      driver: replayStorageDriver,
      retention: replayRawRetention,
      removeLocalAfterStore: true,
    }
  }

  if (replayStorageDriver === 'local') {
    return {
      storagePath: path.relative(process.cwd(), input.filePath),
      driver: 'local',
      retention: replayRawRetention,
      removeLocalAfterStore: false,
    }
  }

  const config = getObjectStorageConfig(replayStorageDriver)
  const safeName = path
    .basename(input.originalName)
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .slice(0, 120)
  const key = `${config.prefix}matches/${input.matchId}/${input.sha256}-${safeName}`

  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  })

  const stat = await fs.stat(input.filePath)
  await client.send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    Body: createReadStream(input.filePath),
    ContentLength: stat.size,
    ContentType: input.contentType ?? 'application/octet-stream',
    Metadata: {
      matchId: input.matchId,
      sha256: input.sha256,
      originalName: input.originalName.slice(0, 250),
    },
  }))

  return {
    storagePath: `${replayStorageDriver}://${config.bucket}/${key}`,
    driver: replayStorageDriver,
    retention: replayRawRetention,
    removeLocalAfterStore: true,
  }
}

function normalizeDriver(value: string | undefined): ReplayStorageDriver {
  const normalized = value?.trim().toLowerCase()
  if (normalized === 's3' || normalized === 'r2') return normalized
  return 'local'
}

function normalizeRetention(value: string | undefined): ReplayRawRetention {
  return value?.trim().toLowerCase() === 'keep' ? 'keep' : 'delete_after_parse'
}

function getObjectStorageConfig(driver: Exclude<ReplayStorageDriver, 'local'>) {
  const bucket = requiredEnv('REPLAY_STORAGE_BUCKET')
  const accessKeyId = requiredEnv('REPLAY_STORAGE_ACCESS_KEY_ID')
  const secretAccessKey = requiredEnv('REPLAY_STORAGE_SECRET_ACCESS_KEY')
  const endpoint = process.env.REPLAY_STORAGE_ENDPOINT || undefined
  const region =
    process.env.REPLAY_STORAGE_REGION ||
    (driver === 'r2' ? 'auto' : 'us-east-1')
  const rawPrefix = process.env.REPLAY_STORAGE_PREFIX || 'replays/'
  const prefix = rawPrefix && !rawPrefix.endsWith('/') ? `${rawPrefix}/` : rawPrefix

  return {
    bucket,
    accessKeyId,
    secretAccessKey,
    endpoint,
    region,
    prefix,
    forcePathStyle: process.env.REPLAY_STORAGE_FORCE_PATH_STYLE !== 'false',
  }
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} is required when REPLAY_STORAGE_DRIVER=${replayStorageDriver}`)
  }
  return value
}
