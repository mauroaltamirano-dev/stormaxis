#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const SRC_DIR = path.join(ROOT, 'client', 'src')
const PUBLIC_DIR = path.join(ROOT, 'public')
const MAX_REFERENCED_MB = Number(process.env.MAX_REFERENCED_MB || 10)
const MAX_SINGLE_MB = Number(process.env.MAX_SINGLE_MB || 2)

const CODE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.css'])
const ASSET_GROUPS = ['images', 'brand', 'ranked', 'maps', 'roles']
const refRegex = /(?:url\(['"]?)(\/(?:images|brand|ranked|maps|roles)\/[^'"\)\s]+)|(?:src=\"(\/(?:images|brand|ranked|maps|roles)\/[^"\s]+))/g

function walk(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (CODE_EXTS.has(path.extname(entry.name))) out.push(full)
  }
  return out
}

function bytesToMB(bytes) {
  return bytes / (1024 * 1024)
}

const files = walk(SRC_DIR)
const refs = new Set()
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8')
  let match
  while ((match = refRegex.exec(text))) {
    const raw = (match[1] || match[2] || '').trim()
    if (!raw.startsWith('/')) continue
    refs.add(raw.slice(1))
  }
}

const resolved = []
const missing = []
for (const rel of refs) {
  const group = ASSET_GROUPS.find((prefix) => rel.startsWith(prefix + '/'))
  if (!group) continue
  const fullPath = path.join(PUBLIC_DIR, rel)
  if (!fs.existsSync(fullPath)) {
    missing.push(rel)
    continue
  }
  const size = fs.statSync(fullPath).size
  resolved.push({ rel, size })
}

resolved.sort((a, b) => b.size - a.size)
const totalBytes = resolved.reduce((sum, item) => sum + item.size, 0)
const totalMB = bytesToMB(totalBytes)
const largest = resolved[0]
const tooLarge = resolved.filter((item) => bytesToMB(item.size) > MAX_SINGLE_MB)

console.log('Image budget report')
console.log('===================')
console.log(`Referenced assets: ${resolved.length}`)
console.log(`Total referenced bytes: ${totalBytes} (${totalMB.toFixed(2)} MB)`)
if (largest) {
  console.log(`Largest asset: ${largest.rel} (${bytesToMB(largest.size).toFixed(2)} MB)`)
}
console.log('Top assets:')
for (const item of resolved.slice(0, 12)) {
  console.log(`- ${item.rel}: ${bytesToMB(item.size).toFixed(3)} MB`)
}
if (missing.length > 0) {
  console.log('\nMissing references:')
  for (const rel of missing) console.log(`- ${rel}`)
}

let failed = false
if (totalMB > MAX_REFERENCED_MB) {
  console.error(`\nFAIL: Total referenced image weight ${totalMB.toFixed(2)} MB exceeds budget ${MAX_REFERENCED_MB.toFixed(2)} MB`)
  failed = true
}
if (tooLarge.length > 0) {
  console.error(`\nFAIL: ${tooLarge.length} assets exceed single-file budget ${MAX_SINGLE_MB.toFixed(2)} MB`)
  for (const item of tooLarge) {
    console.error(`- ${item.rel}: ${bytesToMB(item.size).toFixed(2)} MB`)
  }
  failed = true
}
if (missing.length > 0) {
  console.error(`\nFAIL: ${missing.length} referenced assets are missing in public/`)
  failed = true
}

if (failed) process.exit(1)
console.log(`\nPASS: Within budgets (total <= ${MAX_REFERENCED_MB} MB, single <= ${MAX_SINGLE_MB} MB)`)
