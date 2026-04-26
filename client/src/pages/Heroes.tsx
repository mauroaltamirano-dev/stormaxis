import type { CSSProperties } from 'react'
import { useMemo, useState } from 'react'
import { HOTS_HEROES, HERO_ROLES } from '@nexusgg/shared'
import { Search, Shield, Sparkles, Swords } from 'lucide-react'

const ROLE_TONES: Record<string, string> = {
  TANK: '#38bdf8',
  BRUISER: '#f97316',
  RANGED_ASSASSIN: '#f43f5e',
  MELEE_ASSASSIN: '#eab308',
  HEALER: '#22c55e',
  SUPPORT: '#a78bfa',
}

export function Heroes() {
  const [query, setQuery] = useState('')
  const [role, setRole] = useState('ALL')

  const filteredHeroes = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return HOTS_HEROES.filter((hero) => {
      const matchesRole = role === 'ALL' || hero.role === role
      const matchesQuery =
        !normalized ||
        hero.name.toLowerCase().includes(normalized) ||
        hero.franchise.toLowerCase().includes(normalized) ||
        hero.roleLabel.toLowerCase().includes(normalized)
      return matchesRole && matchesQuery
    })
  }, [query, role])

  const roleCounts = useMemo(() => {
    return HOTS_HEROES.reduce<Record<string, number>>((acc, hero) => {
      acc[hero.role] = (acc[hero.role] ?? 0) + 1
      return acc
    }, {})
  }, [])

  return (
    <main style={styles.page}>
      <section style={styles.heroPanel}>
        <div style={styles.scanline} />
        <div style={styles.kicker}><Sparkles size={16} /> Nexus armory</div>
        <div style={styles.headerGrid}>
          <div>
            <h1 style={styles.title}>Catálogo de héroes</h1>
            <p style={styles.subtitle}>
              Base canónica de StormAxis para perfiles, replay stats, filtros de búsqueda y futuros rankings por héroe.
            </p>
          </div>
          <div style={styles.commandStats}>
            <Metric label="Héroes" value={String(HOTS_HEROES.length)} tone="#00c8ff" />
            <Metric label="Roles" value={String(HERO_ROLES.length)} tone="#f97316" />
            <Metric label="Universos" value="6" tone="#a78bfa" />
          </div>
        </div>
      </section>

      <section style={styles.toolbar}>
        <div style={styles.searchBox}>
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por héroe, universo o rol..."
            style={styles.searchInput}
          />
        </div>
        <div style={styles.roleFilters}>
          <button type="button" onClick={() => setRole('ALL')} style={filterStyle(role === 'ALL', '#e2e8f0')}>
            Todos <span>{HOTS_HEROES.length}</span>
          </button>
          {HERO_ROLES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setRole(entry.id)}
              style={filterStyle(role === entry.id, ROLE_TONES[entry.id] ?? '#94a3b8')}
            >
              {entry.label} <span>{roleCounts[entry.id] ?? 0}</span>
            </button>
          ))}
        </div>
      </section>

      <section style={styles.grid}>
        {filteredHeroes.map((hero, index) => {
          const tone = ROLE_TONES[hero.role] ?? '#94a3b8'
          return (
            <article key={hero.id} style={{ ...heroCardStyle(tone), animationDelay: `${Math.min(index, 14) * 26}ms` }}>
              <div style={styles.portraitFrame}>
                <img
                  src={hero.portrait}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  style={styles.portrait}
                  onError={(event) => {
                    event.currentTarget.style.display = 'none'
                  }}
                />
                <div style={{ ...styles.initialFallback, color: tone }}>{hero.name.slice(0, 2).toUpperCase()}</div>
              </div>
              <div style={styles.cardBody}>
                <div style={{ ...styles.rolePill, borderColor: `${tone}66`, color: tone }}>{hero.roleLabel}</div>
                <h2 style={styles.heroName}>{hero.name}</h2>
                <div style={styles.heroMeta}>
                  <span><Swords size={13} /> {hero.franchise}</span>
                  <span><Shield size={13} /> {hero.id}</span>
                </div>
              </div>
            </article>
          )
        })}
      </section>
    </main>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div style={{ ...styles.metric, borderColor: `${tone}44`, background: `${tone}10` }}>
      <span>{label}</span>
      <strong style={{ color: tone }}>{value}</strong>
    </div>
  )
}

function filterStyle(active: boolean, tone: string): CSSProperties {
  return {
    border: `1px solid ${active ? tone : 'rgba(148,163,184,0.16)'}`,
    background: active ? `${tone}18` : 'rgba(2,6,23,0.42)',
    color: active ? tone : 'rgba(226,232,240,0.66)',
    padding: '0.58rem 0.72rem',
    cursor: 'pointer',
    fontFamily: 'var(--font-display)',
    fontSize: '0.68rem',
    fontWeight: 950,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    display: 'inline-flex',
    gap: '0.42rem',
    alignItems: 'center',
  }
}

function heroCardStyle(tone: string): CSSProperties {
  return {
    position: 'relative',
    overflow: 'hidden',
    minHeight: '270px',
    border: `1px solid ${tone}30`,
    background: `linear-gradient(155deg, ${tone}16, rgba(2,6,23,0.9) 46%, rgba(2,6,23,0.62))`,
    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.045), 0 18px 42px rgba(0,0,0,0.22), 0 0 30px ${tone}0c`,
    display: 'grid',
    gridTemplateRows: '1fr auto',
    animation: 'heroCardIn 420ms ease both',
  }
}

const styles: Record<string, CSSProperties> = {
  page: {
    display: 'grid',
    gap: '1rem',
    padding: 'clamp(0.2rem, 1.4vw, 1rem)',
  },
  heroPanel: {
    position: 'relative',
    overflow: 'hidden',
    border: '1px solid rgba(0,200,255,0.18)',
    background: 'linear-gradient(135deg, rgba(2,6,23,0.96), rgba(4,13,26,0.88)), radial-gradient(circle at 14% 12%, rgba(0,200,255,0.22), transparent 28%), radial-gradient(circle at 84% 18%, rgba(249,115,22,0.16), transparent 30%)',
    padding: 'clamp(1rem, 2.6vw, 1.65rem)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 22px 54px rgba(0,0,0,0.24)',
  },
  scanline: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    backgroundImage: 'linear-gradient(90deg, rgba(125,211,252,0.05) 1px, transparent 1px), linear-gradient(0deg, rgba(125,211,252,0.035) 1px, transparent 1px)',
    backgroundSize: '42px 42px',
    maskImage: 'linear-gradient(180deg, rgba(0,0,0,0.9), transparent 82%)',
  },
  kicker: {
    position: 'relative',
    zIndex: 1,
    display: 'inline-flex',
    gap: '0.45rem',
    alignItems: 'center',
    color: '#7dd3fc',
    fontFamily: 'var(--font-display)',
    fontSize: '0.72rem',
    fontWeight: 950,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    marginBottom: '0.65rem',
  },
  headerGrid: {
    position: 'relative',
    zIndex: 1,
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(260px, 0.55fr)',
    gap: '1rem',
    alignItems: 'end',
  },
  title: {
    margin: 0,
    color: '#f8fafc',
    fontFamily: 'var(--font-display)',
    fontSize: 'clamp(2rem, 5vw, 4.6rem)',
    lineHeight: 0.9,
    fontWeight: 950,
    letterSpacing: '0.075em',
    textTransform: 'uppercase',
  },
  subtitle: {
    maxWidth: '840px',
    color: 'rgba(226,232,240,0.66)',
    lineHeight: 1.65,
    margin: '0.85rem 0 0',
  },
  commandStats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: '0.52rem',
  },
  metric: {
    border: '1px solid rgba(255,255,255,0.08)',
    padding: '0.65rem',
    display: 'grid',
    gap: '0.1rem',
    textTransform: 'uppercase',
  },
  toolbar: {
    display: 'grid',
    gap: '0.75rem',
    border: '1px solid rgba(148,163,184,0.14)',
    background: 'rgba(3,8,18,0.72)',
    padding: '0.82rem',
  },
  searchBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.62rem',
    border: '1px solid rgba(125,211,252,0.24)',
    background: 'rgba(2,6,23,0.58)',
    color: '#7dd3fc',
    padding: '0 0.75rem',
  },
  searchInput: {
    width: '100%',
    border: 'none',
    outline: 'none',
    background: 'transparent',
    color: '#f8fafc',
    minHeight: '44px',
    fontSize: '0.92rem',
  },
  roleFilters: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.45rem',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
    gap: '0.85rem',
  },
  portraitFrame: {
    position: 'relative',
    minHeight: '170px',
    display: 'grid',
    placeItems: 'center',
    background: 'radial-gradient(circle at 50% 22%, rgba(255,255,255,0.12), transparent 42%)',
  },
  portrait: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    opacity: 0.72,
  },
  initialFallback: {
    fontFamily: 'var(--font-display)',
    fontSize: '3rem',
    fontWeight: 950,
    letterSpacing: '0.08em',
    opacity: 0.95,
  },
  cardBody: {
    position: 'relative',
    zIndex: 1,
    display: 'grid',
    gap: '0.45rem',
    padding: '0.9rem',
    background: 'linear-gradient(180deg, transparent, rgba(2,6,23,0.86) 18%)',
  },
  rolePill: {
    width: 'fit-content',
    border: '1px solid rgba(255,255,255,0.12)',
    padding: '0.22rem 0.42rem',
    fontSize: '0.58rem',
    fontWeight: 950,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
  },
  heroName: {
    margin: 0,
    color: '#f8fafc',
    fontFamily: 'var(--font-display)',
    fontSize: '1.35rem',
    fontWeight: 950,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  },
  heroMeta: {
    display: 'flex',
    gap: '0.55rem',
    flexWrap: 'wrap',
    color: 'rgba(226,232,240,0.58)',
    fontSize: '0.72rem',
  },
}
