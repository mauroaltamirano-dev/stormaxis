import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const db = new PrismaClient()

async function main() {
  console.log('Seeding NexusGG...')

  // Admin user
  const admin = await db.user.upsert({
    where: { email: 'admin@nexusgg.gg' },
    create: {
      username: 'NexusAdmin',
      email: 'admin@nexusgg.gg',
      password: await bcrypt.hash('admin1234', 12),
      role: 'ADMIN',
      mmr: 3000,
      rank: 'GRAND_MASTER',
    },
    update: {},
  })

  // Test players with various MMR levels
  const testPlayers = [
    { username: 'StormKing', email: 'stormking@test.gg', mmr: 2840, rank: 'GRAND_MASTER' },
    { username: 'VoidWalker', email: 'void@test.gg', mmr: 2790, rank: 'MASTER_I' },
    { username: 'ArcaneX', email: 'arcane@test.gg', mmr: 2715, rank: 'MASTER_I' },
    { username: 'MakoX', email: 'mako@test.gg', mmr: 2680, rank: 'MASTER_I' },
    { username: 'ZeroX', email: 'zerox@test.gg', mmr: 2340, rank: 'DIAMANTE_I' },
    { username: 'NekroS', email: 'nekros@test.gg', mmr: 1680, rank: 'PLATINO_III' },
    { username: 'SilverVex', email: 'silvervex@test.gg', mmr: 1350, rank: 'ORO_II' },
    { username: 'TrixR', email: 'trixr@test.gg', mmr: 1620, rank: 'PLATINO_III' },
    { username: 'ShadowPyre', email: 'shadow@test.gg', mmr: 2621, rank: 'MASTER_I' },
    { username: 'IronFist', email: 'iron@test.gg', mmr: 980, rank: 'PLATA_III' },
  ]

  for (const p of testPlayers) {
    await db.user.upsert({
      where: { email: p.email },
      create: {
        username: p.username,
        email: p.email,
        password: await bcrypt.hash('test1234', 12),
        mmr: p.mmr,
        rank: p.rank,
        wins: Math.floor(Math.random() * 50) + 10,
        losses: Math.floor(Math.random() * 40) + 5,
      },
      update: {},
    })
  }

  console.log(`✓ Seeded admin: ${admin.username}`)
  console.log(`✓ Seeded ${testPlayers.length} test players`)
  console.log('  All test passwords: test1234')
  console.log('  Admin password: admin1234')
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect())
