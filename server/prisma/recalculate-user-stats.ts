import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      wins: true,
      losses: true,
      matchPlayers: {
        where: {
          isBot: false,
          match: {
            status: 'COMPLETED',
            winner: { not: null },
          },
        },
        select: {
          team: true,
          match: {
            select: {
              winner: true,
            },
          },
        },
      },
    },
    orderBy: { username: 'asc' },
  })

  let changed = 0

  for (const user of users) {
    const wins = user.matchPlayers.filter((entry) => entry.match.winner === entry.team).length
    const losses = user.matchPlayers.length - wins
    const needsUpdate = user.wins !== wins || user.losses !== losses

    if (!needsUpdate) continue
    changed += 1

    console.log(
      `${dryRun ? '[dry-run] ' : ''}${user.username}: ${user.wins}W/${user.losses}L -> ${wins}W/${losses}L`,
    )

    if (!dryRun) {
      await prisma.user.update({
        where: { id: user.id },
        data: { wins, losses },
      })
    }
  }

  console.log(
    `${dryRun ? 'Would update' : 'Updated'} ${changed} user${changed === 1 ? '' : 's'} from completed match history.`,
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
