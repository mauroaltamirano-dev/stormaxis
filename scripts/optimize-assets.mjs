#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const ROOT = process.cwd()
const TARGET_DIRS = ['public/images', 'public/ranked', 'public/brand']
const MAX_THUMB_WIDTH = 320

const SOURCE_EXTS = new Set(['.jpg', '.jpeg', '.png'])

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)))
      continue
    }
    files.push(fullPath)
  }
  return files
}

async function ensureDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

async function fileSize(filePath) {
  const stat = await fs.stat(filePath)
  return stat.size
}

async function processFile(inputPath) {
  const ext = path.extname(inputPath).toLowerCase()
  if (!SOURCE_EXTS.has(ext)) return null

  const withoutExt = inputPath.slice(0, -ext.length)
  const outputs = {
    fullWebp: `${withoutExt}.webp`,
    fullAvif: `${withoutExt}.avif`,
    thumbWebp: `${withoutExt}.thumb.webp`,
    thumbAvif: `${withoutExt}.thumb.avif`,
  }

  const base = sharp(inputPath, { failOn: 'none' })

  await Promise.all([
    ensureDir(outputs.fullWebp).then(() =>
      base.clone().webp({ quality: 78, effort: 4 }).toFile(outputs.fullWebp),
    ),
    ensureDir(outputs.fullAvif).then(() =>
      base.clone().avif({ quality: 50, effort: 4 }).toFile(outputs.fullAvif),
    ),
    ensureDir(outputs.thumbWebp).then(() =>
      base
        .clone()
        .resize({ width: MAX_THUMB_WIDTH, withoutEnlargement: true })
        .webp({ quality: 72, effort: 4 })
        .toFile(outputs.thumbWebp),
    ),
    ensureDir(outputs.thumbAvif).then(() =>
      base
        .clone()
        .resize({ width: MAX_THUMB_WIDTH, withoutEnlargement: true })
        .avif({ quality: 45, effort: 4 })
        .toFile(outputs.thumbAvif),
    ),
  ])

  const [sourceSize, fullWebpSize, fullAvifSize, thumbWebpSize, thumbAvifSize] = await Promise.all([
    fileSize(inputPath),
    fileSize(outputs.fullWebp),
    fileSize(outputs.fullAvif),
    fileSize(outputs.thumbWebp),
    fileSize(outputs.thumbAvif),
  ])

  return {
    inputPath: path.relative(ROOT, inputPath),
    sourceSize,
    fullWebpSize,
    fullAvifSize,
    thumbWebpSize,
    thumbAvifSize,
  }
}

async function main() {
  const sourceFiles = []
  for (const dir of TARGET_DIRS) {
    const fullDir = path.join(ROOT, dir)
    try {
      sourceFiles.push(...(await walk(fullDir)))
    } catch {
      // ignore missing directory
    }
  }

  const reports = []
  for (const file of sourceFiles) {
    const report = await processFile(file)
    if (report) reports.push(report)
  }

  let totalSource = 0
  let totalWebp = 0
  let totalAvif = 0

  for (const item of reports) {
    totalSource += item.sourceSize
    totalWebp += item.fullWebpSize
    totalAvif += item.fullAvifSize
  }

  console.log(`Processed ${reports.length} assets in ${TARGET_DIRS.join(', ')}`)
  console.log(`Source total: ${formatSize(totalSource)}`)
  console.log(`WebP total:   ${formatSize(totalWebp)}`)
  console.log(`AVIF total:   ${formatSize(totalAvif)}`)
  console.log(`WebP saving:  ${((1 - totalWebp / Math.max(totalSource, 1)) * 100).toFixed(1)}%`)
  console.log(`AVIF saving:  ${((1 - totalAvif / Math.max(totalSource, 1)) * 100).toFixed(1)}%`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
