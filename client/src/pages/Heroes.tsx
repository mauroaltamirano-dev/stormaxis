import type { CSSProperties } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { HERO_BY_ID, HERO_ID_BY_NAME, HOTS_HEROES, MAP_ID_BY_NAME, type HotsHero } from '@nexusgg/shared'
import { Activity, BarChart3, Crosshair, MapIcon, Search, Sparkles, Swords, Trophy } from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/auth.store'
import { PageHeader } from '../components/PageHeader'

const ROLE_TONES: Record<string, string> = {
  TANK: '#38bdf8',
  BRUISER: '#f97316',
  RANGED_ASSASSIN: '#f43f5e',
  MELEE_ASSASSIN: '#eab308',
  HEALER: '#22c55e',
  SUPPORT: '#a78bfa',
}

type ReplayPlayer = {
  name?: string | null
  battleTag?: string | null
  hero?: string | null
  team?: 1 | 2 | null
  won?: boolean
  takedowns?: number | null
  deaths?: number | null
  assists?: number | null
  heroDamage?: number | null
  siegeDamage?: number | null
  healing?: number | null
  experience?: number | null
}

type MatchHistoryEntry = {
  id: string
  team: 1 | 2
  mmrDelta: number | null
  match: {
    id: string
    status: string
    selectedMap: string | null
    winner: 1 | 2 | null
    createdAt: string
    endedAt: string | null
    replayUploads?: Array<{
      id: string
      status: string
      parsedMap: string | null
      parsedWinnerTeam: 1 | 2 | null
      parsedSummary?: {
        players?: ReplayPlayer[]
      } | null
      createdAt: string
    }>
  }
}

type HeroStat = {
  hero: HotsHero
  played: number
  wins: number
  losses: number
  lastPlayedAt: string
  lastMap: string | null
  maps: Record<string, number>
  totals: {
    takedowns: number
    deaths: number
    assists: number
    heroDamage: number
    siegeDamage: number
    healing: number
    experience: number
  }
}

type TabKey = 'pool' | 'maps' | 'signals'

export function Heroes() {
  const { user } = useAuthStore()
  const [matches, setMatches] = useState<MatchHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<TabKey>('pool')

  useEffect(() => {
    if (!user?.username) return
    let cancelled = false
    setLoading(true)
    setError(null)
    api
      .get<MatchHistoryEntry[]>(`/users/${user.username}/matches`)
      .then(({ data }) => {
        if (!cancelled) setMatches(data)
      })
      .catch((err) => {
        if (!cancelled) {
          setMatches([])
          setError(err.response?.data?.error?.message ?? 'No pude cargar tu Hero Lab.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user?.username])

  const completed = useMemo(
    () => matches.filter((entry) => entry.match.status === 'COMPLETED' && entry.match.winner != null),
    [matches],
  )

  const heroStats = useMemo(() => buildHeroStats(completed, user), [completed, user])
  const mapStats = useMemo(() => buildMapStats(completed, user), [completed, user])
  const replayCoverage = completed.length
    ? Math.round((completed.filter((entry) => findOwnReplayPlayer(entry, user)).length / completed.length) * 100)
    : 0
  const favorite = heroStats[0] ?? null
  const filteredStats = heroStats.filter((stat) => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return true
    return (
      stat.hero.name.toLowerCase().includes(normalized) ||
      stat.hero.roleLabel.toLowerCase().includes(normalized) ||
      stat.hero.franchise.toLowerCase().includes(normalized)
    )
  })

  return (
    <main style={styles.page}>
      <PageHeader
        eyebrow="Hero Lab personal"
        title="Tu pool competitivo"
        description="No es un catálogo para mirar héroes: es una lectura personal de qué usaste, en qué mapas, con qué resultados y qué señales dejaron tus replays."
        icon={<Sparkles size={18} />}
        stats={
          <div style={styles.commandStats}>
            <Metric label="Héroes usados" value={String(heroStats.length)} tone="#00c8ff" />
            <Metric label="Partidas" value={String(completed.length)} tone="#f97316" />
            <Metric label="Replay data" value={`${replayCoverage}%`} tone="#a78bfa" />
          </div>
        }
      />

      {error && <div style={styles.error}>{error}</div>}

      <section style={styles.tabsPanel}>
        <div style={styles.tabs}>
          <TabButton active={tab === 'pool'} onClick={() => setTab('pool')} icon={<Swords size={15} />} label="Pool personal" />
          <TabButton active={tab === 'maps'} onClick={() => setTab('maps')} icon={<MapIcon size={15} />} label="Mapas" />
          <TabButton active={tab === 'signals'} onClick={() => setTab('signals')} icon={<Activity size={15} />} label="Señales" />
        </div>
        <div style={styles.searchBox}>
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filtrar héroes usados..."
            style={styles.searchInput}
          />
        </div>
      </section>

      {loading ? (
        <EmptyState title="Analizando historial" text="Leyendo tus partidas y replays parseados..." />
      ) : tab === 'pool' ? (
        <section style={styles.poolLayout}>
          <aside style={styles.featureCard}>
            <div style={styles.kicker}>Héroe más usado</div>
            {favorite ? (
              <>
                <HeroPortrait hero={favorite.hero} tone={ROLE_TONES[favorite.hero.role] ?? '#7dd3fc'} large />
                <h2 style={styles.featureHeroName}>{favorite.hero.name}</h2>
                <div style={styles.featureMeta}>{favorite.hero.roleLabel} · {favorite.hero.franchise}</div>
                <div style={styles.featureStatsGrid}>
                  <Mini label="Partidas" value={favorite.played} />
                  <Mini label="WR" value={`${winrate(favorite.wins, favorite.losses)}%`} />
                  <Mini label="KDA" value={formatKda(favorite)} />
                  <Mini label="Daño avg" value={formatNumber(avg(favorite.totals.heroDamage, favorite.played))} />
                </div>
              </>
            ) : (
              <p style={styles.mutedText}>Todavía no hay héroes detectados. Subí replays en partidas completadas para poblar este panel.</p>
            )}
          </aside>

          <div style={styles.heroGridCompact}>
            {filteredStats.length ? filteredStats.map((stat) => <HeroUsageCard key={stat.hero.id} stat={stat} />) : (
              <EmptyState title="Sin héroes detectados" text="El historial puede existir sin replay parseado; cuando subas replays, acá aparecen tus picks reales." />
            )}
          </div>
        </section>
      ) : tab === 'maps' ? (
        <section style={styles.mapGrid}>
          {mapStats.length ? mapStats.map((map) => <MapCard key={map.name} stat={map} />) : (
            <EmptyState title="Sin mapas jugados" text="Cuando completes partidas, vamos a cruzar tus mapas con picks, winrate y replay stats." />
          )}
        </section>
      ) : (
        <section style={styles.signalsGrid}>
          <SignalCard icon={<Trophy size={18} />} label="Consistencia" value={favorite ? `${favorite.played} partidas con ${favorite.hero.name}` : 'Sin muestra'} text="Detecta si estás concentrando demasiado tu pool o si ya hay variedad competitiva." />
          <SignalCard icon={<Crosshair size={18} />} label="Daño promedio" value={favorite ? formatNumber(avg(favorite.totals.heroDamage, favorite.played)) : '—'} text="Se calcula desde replay stats, no desde datos simulados." />
          <SignalCard icon={<BarChart3 size={18} />} label="Cobertura de replays" value={`${replayCoverage}%`} text="Mientras más partidas tengan replay cargado, más precisa es la lectura por héroe/mapa." />
        </section>
      )}
    </main>
  )
}

function HeroUsageCard({ stat }: { stat: HeroStat }) {
  const tone = ROLE_TONES[stat.hero.role] ?? '#94a3b8'
  return (
    <article style={heroUsageCardStyle(tone)}>
      <HeroPortrait hero={stat.hero} tone={tone} />
      <div style={styles.heroUsageBody}>
        <div style={{ ...styles.rolePill, borderColor: `${tone}66`, color: tone }}>{stat.hero.roleLabel}</div>
        <h2 style={styles.heroName}>{stat.hero.name}</h2>
        <div style={styles.heroMeta}>{stat.played} partidas · {winrate(stat.wins, stat.losses)}% WR · último mapa: {stat.lastMap ?? '—'}</div>
        <div style={styles.heroBars}>
          <Inline label="Takedowns" value={formatNumber(avg(stat.totals.takedowns, stat.played))} tone="#facc15" />
          <Inline label="Hero dmg" value={formatNumber(avg(stat.totals.heroDamage, stat.played))} tone="#38bdf8" />
          <Inline label="XP" value={formatNumber(avg(stat.totals.experience, stat.played))} tone="#f97316" />
        </div>
      </div>
    </article>
  )
}

function HeroPortrait({ hero, tone, large = false }: { hero: HotsHero; tone: string; large?: boolean }) {
  const [srcIndex, setSrcIndex] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const sources = getHeroImageSources(hero)
  const src = sources[srcIndex]
  return (
    <div style={large ? styles.featurePortraitFrame : styles.portraitFrame}>
      {src && (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          style={{ ...(large ? styles.featurePortrait : styles.portrait), opacity: loaded ? 0.9 : 0 }}
          onLoad={() => setLoaded(true)}
          onError={() => {
            setLoaded(false)
            setSrcIndex((current) => current + 1)
          }}
        />
      )}
      {!loaded && <div style={{ ...styles.initialFallback, color: tone }}>{hero.name.slice(0, 2).toUpperCase()}</div>}
    </div>
  )
}

function getHeroImageSources(hero: HotsHero) {
  const base = hero.portrait.replace(/\.(webp|avif)$/i, '')
  const ext = hero.portrait.match(/\.(webp|avif)$/i)?.[1]?.toLowerCase()
  return [hero.portrait, `${base}.${ext === 'avif' ? 'webp' : 'avif'}`]
}

function buildHeroStats(matches: MatchHistoryEntry[], user: { username: string; bnetBattletag?: string | null } | null) {
  const byHero = new Map<string, HeroStat>()
  for (const entry of matches) {
    const player = findOwnReplayPlayer(entry, user)
    if (!player?.hero) continue
    const hero = findHeroByName(player.hero)
    if (!hero) continue
    const current = byHero.get(hero.id) ?? {
      hero,
      played: 0,
      wins: 0,
      losses: 0,
      lastPlayedAt: entry.match.createdAt,
      lastMap: entry.match.selectedMap,
      maps: {},
      totals: { takedowns: 0, deaths: 0, assists: 0, heroDamage: 0, siegeDamage: 0, healing: 0, experience: 0 },
    }
    current.played += 1
    if (entry.match.winner === entry.team) current.wins += 1
    else current.losses += 1
    if (new Date(entry.match.createdAt) > new Date(current.lastPlayedAt)) {
      current.lastPlayedAt = entry.match.createdAt
      current.lastMap = entry.match.selectedMap
    }
    const map = entry.match.selectedMap ?? 'Mapa no registrado'
    current.maps[map] = (current.maps[map] ?? 0) + 1
    current.totals.takedowns += numeric(player.takedowns)
    current.totals.deaths += numeric(player.deaths)
    current.totals.assists += numeric(player.assists)
    current.totals.heroDamage += numeric(player.heroDamage)
    current.totals.siegeDamage += numeric(player.siegeDamage)
    current.totals.healing += numeric(player.healing)
    current.totals.experience += numeric(player.experience)
    byHero.set(hero.id, current)
  }
  return [...byHero.values()].sort((a, b) => b.played - a.played || winrate(b.wins, b.losses) - winrate(a.wins, a.losses))
}

function findOwnReplayPlayer(entry: MatchHistoryEntry, user: { username: string; bnetBattletag?: string | null } | null) {
  const replay = entry.match.replayUploads?.[0]
  const players = replay?.parsedSummary?.players ?? []
  if (!players.length) return null
  const sameTeam = players.filter((player) => player.team === entry.team)
  const normalizedUser = normalize(user?.username)
  const normalizedBtag = normalize(user?.bnetBattletag)
  return sameTeam.find((player) => normalizedBtag && normalize(player.battleTag) === normalizedBtag) ??
    sameTeam.find((player) => normalizedUser && (normalize(player.name) === normalizedUser || normalize(player.battleTag).includes(normalizedUser))) ??
    sameTeam[0] ?? null
}

function findHeroByName(name: string) {
  const direct = HERO_ID_BY_NAME[name]
  if (direct) return HERO_BY_ID[direct]
  const normalized = normalize(name)
  return HOTS_HEROES.find((hero) => normalize(hero.name) === normalized || normalize(hero.id) === normalized) ?? null
}

function buildMapStats(matches: MatchHistoryEntry[], user: { username: string; bnetBattletag?: string | null } | null) {
  const byMap = new Map<string, { name: string; played: number; wins: number; losses: number; heroes: Record<string, number> }>()
  for (const entry of matches) {
    const name = entry.match.selectedMap ?? 'Mapa no registrado'
    const current = byMap.get(name) ?? { name, played: 0, wins: 0, losses: 0, heroes: {} }
    current.played += 1
    if (entry.match.winner === entry.team) current.wins += 1
    else current.losses += 1
    const player = findOwnReplayPlayer(entry, user)
    if (player?.hero) current.heroes[player.hero] = (current.heroes[player.hero] ?? 0) + 1
    byMap.set(name, current)
  }
  return [...byMap.values()].sort((a, b) => b.played - a.played)
}

function MapCard({ stat }: { stat: ReturnType<typeof buildMapStats>[number] }) {
  const mapId = MAP_ID_BY_NAME[stat.name]
  const image = mapId ? `/maps/${mapId}.webp` : null
  const topHero = Object.entries(stat.heroes).sort((a, b) => b[1] - a[1])[0]?.[0]
  return (
    <article style={styles.mapCard}>
      {image && <img src={image} alt="" loading="lazy" decoding="async" style={styles.mapImage} />}
      <div style={styles.mapShade} />
      <div style={styles.mapBody}>
        <h2>{stat.name}</h2>
        <p>{stat.played} partidas · {winrate(stat.wins, stat.losses)}% WR · pick frecuente: {topHero ?? 'sin replay'}</p>
      </div>
    </article>
  )
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return <button type="button" onClick={onClick} style={tabButtonStyle(active)}>{icon}{label}</button>
}

function Metric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return <div style={{ ...styles.metric, borderColor: `${tone}44`, background: `${tone}10` }}><span>{label}</span><strong style={{ color: tone }}>{value}</strong></div>
}
function Mini({ label, value }: { label: string; value: string | number }) { return <div style={styles.mini}><span>{label}</span><strong>{value}</strong></div> }
function Inline({ label, value, tone }: { label: string; value: string; tone: string }) { return <div style={styles.inlineMetric}><span>{label}</span><strong style={{ color: tone }}>{value}</strong></div> }
function SignalCard({ icon, label, value, text }: { icon: React.ReactNode; label: string; value: string; text: string }) { return <article style={styles.signalCard}><div style={styles.signalIcon}>{icon}</div><span>{label}</span><strong>{value}</strong><p>{text}</p></article> }
function EmptyState({ title, text }: { title: string; text: string }) { return <div style={styles.empty}><strong>{title}</strong><p>{text}</p></div> }

function normalize(value?: string | null) { return (value ?? '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, '') }
function numeric(value?: number | null) { return typeof value === 'number' && Number.isFinite(value) ? value : 0 }
function avg(total: number, count: number) { return count > 0 ? Math.round(total / count) : 0 }
function winrate(wins: number, losses: number) { const total = wins + losses; return total ? Math.round((wins / total) * 100) : 0 }
function formatNumber(value: number) { return new Intl.NumberFormat('es-AR').format(value) }
function formatKda(stat: HeroStat) { return `${formatNumber(avg(stat.totals.takedowns, stat.played))}/${formatNumber(avg(stat.totals.deaths, stat.played))}/${formatNumber(avg(stat.totals.assists, stat.played))}` }

function tabButtonStyle(active: boolean): CSSProperties {
  return { border: `1px solid ${active ? '#00c8ff' : 'rgba(148,163,184,0.16)'}`, background: active ? 'rgba(0,200,255,0.13)' : 'rgba(2,6,23,0.42)', color: active ? '#7dd3fc' : 'rgba(226,232,240,0.66)', padding: '0.68rem 0.78rem', cursor: 'pointer', display: 'inline-flex', gap: '0.45rem', alignItems: 'center', fontFamily: 'var(--font-display)', fontSize: '0.72rem', fontWeight: 950, letterSpacing: '0.09em', textTransform: 'uppercase' }
}
function heroUsageCardStyle(tone: string): CSSProperties {
  return { minWidth: 0, border: `1px solid ${tone}30`, background: `linear-gradient(135deg, ${tone}12, rgba(2,6,23,0.86) 42%, rgba(2,6,23,0.62))`, display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr)', overflow: 'hidden', boxShadow: `inset 0 1px 0 rgba(255,255,255,0.045), 0 18px 42px rgba(0,0,0,0.18), 0 0 26px ${tone}0c`, animation: 'heroCardIn 360ms ease both' }
}

const styles: Record<string, CSSProperties> = {
  page: { display: 'grid', gap: '1rem', padding: 'clamp(0.2rem, 1.4vw, 1rem)' },
  heroPanel: { position: 'relative', overflow: 'hidden', border: '1px solid rgba(0,200,255,0.18)', background: 'linear-gradient(135deg, rgba(2,6,23,0.96), rgba(4,13,26,0.88)), radial-gradient(circle at 14% 12%, rgba(0,200,255,0.22), transparent 28%), radial-gradient(circle at 84% 18%, rgba(249,115,22,0.16), transparent 30%)', padding: 'clamp(1rem, 2.6vw, 1.65rem)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 22px 54px rgba(0,0,0,0.24)' },
  scanline: { position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: 'linear-gradient(90deg, rgba(125,211,252,0.05) 1px, transparent 1px), linear-gradient(0deg, rgba(125,211,252,0.035) 1px, transparent 1px)', backgroundSize: '42px 42px', maskImage: 'linear-gradient(180deg, rgba(0,0,0,0.9), transparent 82%)' },
  kicker: { position: 'relative', zIndex: 1, display: 'inline-flex', gap: '0.45rem', alignItems: 'center', color: '#7dd3fc', fontFamily: 'var(--font-display)', fontSize: '0.72rem', fontWeight: 950, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: '0.65rem' },
  headerGrid: { position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(260px, 0.55fr)', gap: '1rem', alignItems: 'end' },
  title: { margin: 0, color: '#f8fafc', fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 5vw, 4.6rem)', lineHeight: 0.9, fontWeight: 950, letterSpacing: '0.075em', textTransform: 'uppercase' },
  subtitle: { maxWidth: '880px', color: 'rgba(226,232,240,0.66)', lineHeight: 1.65, margin: '0.85rem 0 0' },
  commandStats: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.52rem' },
  metric: { border: '1px solid rgba(255,255,255,0.08)', padding: '0.65rem', display: 'grid', gap: '0.1rem', textTransform: 'uppercase' },
  tabsPanel: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(260px, 380px)', gap: '0.75rem', border: '1px solid rgba(148,163,184,0.14)', background: 'rgba(3,8,18,0.72)', padding: '0.82rem' },
  tabs: { display: 'flex', flexWrap: 'wrap', gap: '0.45rem' },
  searchBox: { display: 'flex', alignItems: 'center', gap: '0.62rem', border: '1px solid rgba(125,211,252,0.24)', background: 'rgba(2,6,23,0.58)', color: '#7dd3fc', padding: '0 0.75rem' },
  searchInput: { width: '100%', border: 'none', outline: 'none', background: 'transparent', color: '#f8fafc', minHeight: '44px', fontSize: '0.92rem' },
  poolLayout: { display: 'grid', gridTemplateColumns: 'minmax(240px, 320px) minmax(0, 1fr)', gap: '0.9rem', alignItems: 'start' },
  featureCard: { border: '1px solid rgba(125,211,252,0.18)', background: 'linear-gradient(180deg, rgba(8,18,32,0.88), rgba(2,6,23,0.72))', padding: '1rem', display: 'grid', gap: '0.75rem' },
  featurePortraitFrame: { position: 'relative', overflow: 'hidden', minHeight: '230px', display: 'grid', placeItems: 'center', background: 'radial-gradient(circle at 50% 22%, rgba(255,255,255,0.12), transparent 42%)' },
  featurePortrait: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' },
  featureHeroName: { margin: 0, color: '#f8fafc', fontFamily: 'var(--font-display)', fontSize: '2rem', lineHeight: 0.95, textTransform: 'uppercase' },
  featureMeta: { color: 'rgba(226,232,240,0.62)', fontSize: '0.82rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' },
  featureStatsGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.5rem' },
  mini: { border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.035)', padding: '0.58rem', display: 'grid', gap: '0.1rem' },
  heroGridCompact: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: '0.75rem' },
  portraitFrame: { position: 'relative', minHeight: '128px', display: 'grid', placeItems: 'center', background: 'radial-gradient(circle at 50% 22%, rgba(255,255,255,0.12), transparent 42%)' },
  portrait: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' },
  initialFallback: { fontFamily: 'var(--font-display)', fontSize: '2.2rem', fontWeight: 950, letterSpacing: '0.08em', opacity: 0.95 },
  heroUsageBody: { minWidth: 0, display: 'grid', alignContent: 'center', gap: '0.42rem', padding: '0.8rem' },
  rolePill: { width: 'fit-content', border: '1px solid rgba(255,255,255,0.12)', padding: '0.22rem 0.42rem', fontSize: '0.58rem', fontWeight: 950, letterSpacing: '0.12em', textTransform: 'uppercase' },
  heroName: { margin: 0, color: '#f8fafc', fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 950, letterSpacing: '0.05em', textTransform: 'uppercase' },
  heroMeta: { color: 'rgba(226,232,240,0.58)', fontSize: '0.76rem', lineHeight: 1.35 },
  heroBars: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.35rem' },
  inlineMetric: { border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(2,6,23,0.42)', padding: '0.42rem', display: 'grid', gap: '0.08rem', fontSize: '0.68rem' },
  mapGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.8rem' },
  mapCard: { position: 'relative', overflow: 'hidden', minHeight: '190px', border: '1px solid rgba(125,211,252,0.16)', background: 'rgba(2,6,23,0.8)' },
  mapImage: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.7 },
  mapShade: { position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(2,6,23,0.14), rgba(2,6,23,0.94))' },
  mapBody: { position: 'absolute', inset: 'auto 0 0 0', padding: '1rem', color: '#f8fafc' },
  signalsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.8rem' },
  signalCard: { border: '1px solid rgba(148,163,184,0.16)', background: 'rgba(3,8,18,0.74)', padding: '1rem', display: 'grid', gap: '0.45rem' },
  signalIcon: { color: '#7dd3fc' },
  empty: { border: '1px dashed rgba(125,211,252,0.24)', background: 'rgba(2,6,23,0.42)', padding: '1rem', color: 'rgba(226,232,240,0.72)' },
  mutedText: { color: 'rgba(226,232,240,0.62)', lineHeight: 1.55 },
  error: { border: '1px solid rgba(248,113,113,0.28)', background: 'rgba(127,29,29,0.16)', color: '#fecaca', padding: '0.75rem 0.9rem' },
}
