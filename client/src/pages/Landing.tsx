import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
} from "framer-motion";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Award,
  Check,
  ChevronRight,
  Crosshair,
  Flame,
  Gamepad2,
  Layers,
  Lock,
  Radio,
  Shield,
  Sparkles,
  Swords,
  Target,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { useAuthStore } from "../stores/auth.store";
import { getRoleIconSources, getRoleMeta } from "../lib/roles";
import { LEVEL_BANDS, RANKS, type RankLevel } from "../lib/ranks";

/* ─── Data real del producto ─────────────────────────────── */

type LevelEntry = {
  level: RankLevel;
  name: string;
  min: number;
  max: number | null;
  color: string;
  subtitle: string;
  iconSrc: string;
};

const LEVEL_SUBTITLES: Record<RankLevel, string> = {
  1: "Punto de partida",
  2: "Hierro de cola",
  3: "Duelo serio",
  4: "Oficio real",
  5: "Macro afilada",
  6: "Presión limpia",
  7: "Control total",
  8: "Pico mecánico",
  9: "Circuito alto",
  10: "Cima del Nexo",
};

const LEVELS: LevelEntry[] = RANKS.map((entry) => {
  const band = LEVEL_BANDS.find((candidate) => candidate.level === entry.level);

  return {
    level: entry.level,
    name: entry.label,
    min: band?.min ?? 0,
    max: band?.max ?? null,
    color: entry.color,
    subtitle: LEVEL_SUBTITLES[entry.level],
    iconSrc: entry.iconSrc,
  };
});

const ROLES = [
  { key: "TANK", label: "Tank", tag: "Frontline · Engage" },
  { key: "OFFLANE", label: "Offlane", tag: "Solo lane · Bruiser" },
  { key: "RANGED", label: "Ranged", tag: "Carry · Daño sostenido" },
  { key: "HEALER", label: "Healer", tag: "Soporte · Sustain" },
  { key: "FLEX", label: "Flex", tag: "Pivot · Comodín" },
] as const;

const MAPS = [
  { slug: "alterac-pass", name: "Paso de Alterac" },
  { slug: "battlefield-eternity", name: "Campo de la Eternidad" },
  { slug: "braxis-holdout", name: "Reducto de Braxis" },
  { slug: "cursed-hollow", name: "Hondonada Maldita" },
  { slug: "dragon-shire", name: "Comarca del Dragón" },
  { slug: "garden-of-terror", name: "Jardín del Terror" },
  { slug: "hanamura-temple", name: "Templo de Hanamura" },
  { slug: "infernal-shrines", name: "Santuarios Infernales" },
  { slug: "sky-temple", name: "Templo Celeste" },
  { slug: "tomb-of-spider-queen", name: "Tumba de la Reina Araña" },
  { slug: "towers-of-doom", name: "Torres de la Perdición" },
  { slug: "volskaya-foundry", name: "Fundición Volskaya" },
];

const FLOW_STEPS = [
  {
    icon: Users,
    title: "Entrás a la cola",
    desc: "Solo o con party chica. Tus roles del perfil se usan como fuente principal.",
  },
  {
    icon: Layers,
    title: "El sistema arma partida",
    desc: "10 jugadores con MMR cercano, equipos balanceados y capitanes asignados por MMR.",
  },
  {
    icon: Check,
    title: "Accept flow",
    desc: "Ventana de aceptación. Si alguien rechaza o hace timeout, los que aceptaron vuelven a cola.",
  },
  {
    icon: Swords,
    title: "Match room",
    desc: "Sala viva con chat, equipos visibles, capitanes marcados y estado en tiempo real.",
  },
  {
    icon: Target,
    title: "Veto de mapas",
    desc: "Los capitanes vetan alternadamente con timer de 30 segundos. Si dudás, pierde el turno.",
  },
  {
    icon: Gamepad2,
    title: "Partida custom en HOTS",
    desc: "Los jugadores crean la partida personalizada dentro del juego con el mapa final.",
  },
  {
    icon: Radio,
    title: "Confirmación de conexión",
    desc: "Jugadores confirman disponibilidad. La telemetría sigue corriendo por Socket.io.",
  },
  {
    icon: Flame,
    title: "Los capitanes solicitan finalizar",
    desc: "Cuando termina la partida, los capitanes activan el cierre del match.",
  },
  {
    icon: Award,
    title: "Votación del ganador",
    desc: "Los 10 jugadores votan. 8 votos iguales cierran el match automáticamente.",
  },
  {
    icon: TrendingUp,
    title: "MMR actualizado",
    desc: "ELO con K-factor variable, historial guardado y progreso de nivel inmediato.",
  },
];

const ADVANTAGES = [
  {
    icon: Crosshair,
    title: "Especialistas en HOTS",
    desc: "No es FACEIT genérico reciclado. Cada decisión del producto está pensada para cómo se juega Heroes of the Storm: mapas, roles, objetivos, capitanes.",
  },
  {
    icon: Zap,
    title: "Real-time en todo el flujo",
    desc: "Socket.io por match. La cola, el accept, el veto, el chat y el cierre no son refresco de botón: es un circuito operativo en vivo.",
  },
  {
    icon: Shield,
    title: "Anti-smurf desde el día 1",
    desc: "Validación de edad de cuenta en Discord, linking con Battle.net, tracking de IP y device fingerprint. El ranking se respeta o no sirve.",
  },
  {
    icon: Sparkles,
    title: "Comunidad, no farm",
    desc: "Discord como cuartel general, soporte real, feedback directo con los developers y roadmap transparente. Esto se construye con los testers, no a espaldas.",
  },
];

const BETA_POINTS = [
  "Acceso anticipado al matchmaking SA antes del lanzamiento público",
  "Tus partidas cuentan desde ahora: MMR real, no mocks",
  "Logs visibles y feedback directo con el equipo por Discord",
  "Bugs encontrados acá moldean la v1: sos parte del sistema",
];

/* ─── Helpers ────────────────────────────────────────────── */

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

function useParallax(offset: number) {
  const { scrollY } = useScroll();
  return useTransform(scrollY, [0, 600], [0, offset]);
}

/* ─── Componentes locales ────────────────────────────────── */

function BetaPill({ compact = false }: { compact?: boolean }) {
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.55rem",
        padding: compact ? "0.28rem 0.7rem" : "0.42rem 1rem",
        border: "1px solid rgba(240,165,0,0.45)",
        background: "rgba(240,165,0,0.08)",
        color: "#fbbf24",
        fontFamily: "var(--font-display)",
        fontSize: compact ? "0.62rem" : "0.72rem",
        fontWeight: 900,
        letterSpacing: "0.22em",
        textTransform: "uppercase",
        boxShadow: "0 0 22px rgba(240,165,0,0.08)",
      }}
    >
      <span
        style={{
          width: compact ? "6px" : "7px",
          height: compact ? "6px" : "7px",
          background: "#fbbf24",
          boxShadow: "0 0 10px #fbbf24",
          animation: "blink 1.6s infinite",
        }}
      />
      Beta Tester · SA
    </motion.span>
  );
}

function RankSigil({
  entry,
  size = 72,
  frame = "plate",
}: {
  entry: LevelEntry;
  size?: number;
  frame?: "plate" | "orb";
}) {
  const [iconFailed, setIconFailed] = useState(false);
  const color = entry.color;
  const isOrb = frame === "orb";

  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "grid",
        placeItems: "center",
        borderRadius: isOrb ? "999px" : "22px",
        border: `1px solid ${color}66`,
        background: isOrb
          ? `radial-gradient(circle at 50% 22%, ${color}32, rgba(2,6,14,0.96) 72%)`
          : `linear-gradient(180deg, ${color}16, rgba(2,6,14,0.94) 72%)`,
        boxShadow: `0 0 26px ${color}20, inset 0 0 18px ${color}14`,
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: isOrb ? "8%" : "10%",
          borderRadius: isOrb ? "999px" : "18px",
          background: `radial-gradient(circle at 50% 22%, ${color}20, transparent 68%)`,
          filter: `blur(${isOrb ? 8 : 6}px)`,
          opacity: 0.95,
        }}
      />
      {iconFailed ? (
        <span
          style={{
            position: "relative",
            zIndex: 1,
            fontFamily: "var(--font-display)",
            fontSize: `${Math.floor(size * 0.34)}px`,
            fontWeight: 900,
            color: "#fff",
            textShadow: `0 0 12px ${color}`,
          }}
        >
          {entry.level}
        </span>
      ) : (
        <img
          src={entry.iconSrc}
          alt={entry.name}
          onError={() => setIconFailed(true)}
          style={{
            position: "relative",
            zIndex: 1,
            width: `${Math.round(size * (isOrb ? 0.78 : 0.82))}px`,
            height: `${Math.round(size * (isOrb ? 0.78 : 0.82))}px`,
            objectFit: "contain",
            filter: `drop-shadow(0 0 14px ${color}55)`,
          }}
        />
      )}
    </div>
  );
}

function RankPlate({ entry }: { entry: LevelEntry }) {
  const color = entry.color;
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        minHeight: "82px",
        display: "grid",
        gridTemplateColumns: "64px minmax(0, 1fr)",
        alignItems: "center",
        gap: "0.8rem",
        padding: "0.7rem 1rem",
        background: `linear-gradient(135deg, rgba(2,6,14,0.96), ${color}18 52%, rgba(2,6,14,0.88))`,
        boxShadow: `0 0 30px ${color}20, inset 0 0 24px rgba(255,255,255,0.03)`,
        clipPath: "polygon(8% 0, 100% 0, 100% 76%, 91% 100%, 0 100%, 0 24%)",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: "1px",
          border: `1px solid ${color}55`,
          clipPath: "polygon(8% 0, 100% 0, 100% 76%, 91% 100%, 0 100%, 0 24%)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          left: "18%",
          right: "10%",
          height: "2px",
          background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
          boxShadow: `0 0 14px ${color}`,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: "auto -4% -22% auto",
          width: "160px",
          height: "160px",
          borderRadius: "999px",
          background: `radial-gradient(circle, ${color}16, transparent 68%)`,
          filter: "blur(10px)",
          pointerEvents: "none",
        }}
      />

      <RankSigil entry={entry} size={58} frame="plate" />

      <div style={{ minWidth: 0, position: "relative", zIndex: 1 }}>
        <div
          style={{
            color: "rgba(232,244,255,0.42)",
            fontSize: "0.58rem",
            fontWeight: 900,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
          }}
        >
          Rango {entry.level} · {entry.subtitle}
        </div>
        <div
          style={{
            marginTop: "0.1rem",
            color,
            fontFamily: "var(--font-display)",
            fontSize: "1.35rem",
            fontWeight: 900,
            lineHeight: 1,
            letterSpacing: "0.02em",
            textTransform: "uppercase",
            textShadow: `0 0 18px ${color}66`,
          }}
        >
          {entry.name}
        </div>
        <div
          style={{
            marginTop: "0.22rem",
            color: "rgba(232,244,255,0.58)",
            fontSize: "0.7rem",
            fontFamily: "monospace",
            letterSpacing: "0.05em",
          }}
        >
          {entry.min}
          {entry.max != null ? `–${entry.max}` : "+"} MMR
        </div>
      </div>
    </div>
  );
}

function LevelOrb({ entry, size = 96 }: { entry: LevelEntry; size?: number }) {
  const color = entry.color;
  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "grid",
        placeItems: "center",
        border: `1px solid ${color}`,
        borderRadius: "999px",
        background: `radial-gradient(circle at 50% 30%, ${color}44, rgba(2,6,14,0.96))`,
        boxShadow: `0 0 34px ${color}40, inset 0 0 18px ${color}22`,
        flexShrink: 0,
      }}
    >
      <RankSigil entry={entry} size={Math.floor(size * 0.78)} frame="orb" />
      <span
        style={{
          position: "absolute",
          inset: "-4px",
          borderRadius: "999px",
          border: `1px dashed ${color}55`,
          animation: "spin-slow 30s linear infinite",
        }}
      />
    </div>
  );
}

function RoleCard({ role }: { role: (typeof ROLES)[number] }) {
  const meta = getRoleMeta(role.key);
  const icons = getRoleIconSources(role.key);
  const color = meta?.accent ?? "#00c8ff";

  return (
    <motion.article
      variants={fadeUp}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.25 }}
      style={{
        position: "relative",
        border: `1px solid ${color}33`,
        background: `linear-gradient(160deg, ${color}10, rgba(2,6,14,0.92) 70%)`,
        padding: "1.6rem 1.4rem",
        overflow: "hidden",
        clipPath: "polygon(0 0, 100% 0, 100% 88%, 92% 100%, 0 100%)",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "44%",
          height: "3px",
          background: `linear-gradient(90deg, ${color}, transparent)`,
          boxShadow: `0 0 12px ${color}`,
        }}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          marginBottom: "1.1rem",
        }}
      >
        <div
          style={{
            width: "54px",
            height: "54px",
            display: "grid",
            placeItems: "center",
            border: `1px solid ${color}55`,
            background: `${color}18`,
            filter: `drop-shadow(0 0 10px ${color}55)`,
          }}
        >
          {icons && (
            <img
              src={icons.primary}
              alt={role.label}
              onError={(event) => {
                if (!icons.fallback || event.currentTarget.dataset.fb === "1")
                  return;
                event.currentTarget.dataset.fb = "1";
                event.currentTarget.src = icons.fallback;
              }}
              style={{ width: "30px", height: "30px", objectFit: "contain" }}
            />
          )}
        </div>
        <div>
          <div
            style={{
              color,
              fontFamily: "var(--font-display)",
              fontSize: "1.4rem",
              fontWeight: 900,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              lineHeight: 1,
            }}
          >
            {role.label}
          </div>
          <div
            style={{
              marginTop: "0.3rem",
              color: "rgba(232,244,255,0.55)",
              fontSize: "0.72rem",
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            {role.tag}
          </div>
        </div>
      </div>
      <div
        style={{
          borderTop: "1px solid rgba(255,255,255,0.06)",
          paddingTop: "0.9rem",
          fontSize: "0.72rem",
          color: "rgba(232,244,255,0.42)",
          fontFamily: "monospace",
          letterSpacing: "0.05em",
        }}
      >
        Accent · {color.toUpperCase()}
      </div>
    </motion.article>
  );
}

function MapCard({
  map,
  index,
}: {
  map: (typeof MAPS)[number];
  index: number;
}) {
  return (
    <motion.div
      variants={fadeUp}
      whileHover={{ y: -6, transition: { duration: 0.25 } }}
      style={{
        position: "relative",
        aspectRatio: "16 / 10",
        border: "1px solid rgba(0,200,255,0.12)",
        background: "#060913",
        overflow: "hidden",
        cursor: "default",
      }}
    >
      <img
        src={`/maps/${map.slug}.webp`}
        alt={map.name}
        loading="lazy"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          filter: "saturate(1.1) contrast(1.05)",
          transition: "transform 600ms ease",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(2,6,14,0.20) 0%, rgba(2,6,14,0.05) 45%, rgba(2,6,14,0.92) 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "0.7rem",
          left: "0.8rem",
          fontFamily: "var(--font-display)",
          fontSize: "0.62rem",
          fontWeight: 900,
          letterSpacing: "0.2em",
          color: "rgba(232,244,255,0.75)",
          textTransform: "uppercase",
          textShadow: "0 1px 6px rgba(0,0,0,0.8)",
        }}
      >
        {String(index + 1).padStart(2, "0")}
      </div>
      <div
        style={{
          position: "absolute",
          inset: "auto 0.9rem 0.85rem",
          color: "#fff",
          fontFamily: "var(--font-display)",
          fontSize: "1rem",
          fontWeight: 900,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          textShadow: "0 2px 10px rgba(0,0,0,0.85)",
        }}
      >
        {map.name}
      </div>
    </motion.div>
  );
}

function FlowStep({
  step,
  index,
}: {
  step: (typeof FLOW_STEPS)[number];
  index: number;
}) {
  const Icon = step.icon;
  return (
    <motion.article
      variants={fadeUp}
      style={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: "64px 1fr",
        gap: "1.2rem",
        padding: "1.2rem",
        border: "1px solid rgba(0,200,255,0.10)",
        background:
          "linear-gradient(135deg, rgba(0,200,255,0.05), rgba(17,25,39,0.75) 70%)",
      }}
    >
      <div
        style={{
          position: "relative",
          width: "60px",
          height: "60px",
          display: "grid",
          placeItems: "center",
          border: "1px solid rgba(0,200,255,0.35)",
          background: "rgba(0,200,255,0.08)",
          flexShrink: 0,
        }}
      >
        <Icon size={22} color="#00c8ff" />
        <span
          style={{
            position: "absolute",
            top: "-10px",
            right: "-10px",
            minWidth: "26px",
            height: "26px",
            padding: "0 6px",
            display: "grid",
            placeItems: "center",
            border: "1px solid rgba(240,165,0,0.5)",
            background: "#0a0f1c",
            color: "#fbbf24",
            fontFamily: "var(--font-display)",
            fontSize: "0.72rem",
            fontWeight: 900,
            letterSpacing: "0.05em",
          }}
        >
          {String(index + 1).padStart(2, "0")}
        </span>
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            color: "#fff",
            fontFamily: "var(--font-display)",
            fontSize: "1.05rem",
            fontWeight: 900,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
          }}
        >
          {step.title}
        </div>
        <p
          style={{
            marginTop: "0.45rem",
            color: "rgba(232,244,255,0.56)",
            fontSize: "0.88rem",
            lineHeight: 1.55,
          }}
        >
          {step.desc}
        </p>
      </div>
    </motion.article>
  );
}

/* ─── Página ─────────────────────────────────────────────── */

export function Landing() {
  const { user } = useAuthStore();
  const prefersReduced = useReducedMotion();
  const heroY = useParallax(prefersReduced ? 0 : 120);

  const [activeLevelIdx, setActiveLevelIdx] = useState(4);
  const activeLevel = LEVELS[activeLevelIdx];
  const nextLevel = LEVELS[activeLevelIdx + 1] ?? null;

  useEffect(() => {
    if (prefersReduced) return;
    const id = window.setInterval(() => {
      setActiveLevelIdx((idx) => (idx + 1) % LEVELS.length);
    }, 3200);
    return () => window.clearInterval(id);
  }, [prefersReduced]);

  const progressPct = useMemo(() => {
    if (!activeLevel) return 0;
    if (activeLevel.max == null) return 100;
    return 64;
  }, [activeLevel]);

  return (
    <main
      style={{
        position: "relative",
        minHeight: "100vh",
        background: "#05070A",
        color: "#f1f5f9",
        overflowX: "hidden",
        fontFamily: "var(--font-body)",
        width: "100%",
        alignSelf: "stretch",
      }}
    >
      {/* Background global */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 18% 10%, rgba(0,200,255,0.08), transparent 45%), radial-gradient(circle at 82% 78%, rgba(124,77,255,0.08), transparent 45%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0.045,
            backgroundImage:
              "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)",
            backgroundSize: "80px 80px",
          }}
        />
      </div>

      {/* ─── NAV ─── */}
      <Navbar user={user} />

      {/* ─── HERO ─── */}
      <section
        id="hero"
        style={{
          position: "relative",
          width: "100%",
          minHeight: "94vh",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          paddingTop: "128px",
          paddingBottom: "80px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          backgroundColor: "#07090F",
          overflow: "hidden",
        }}
      >
        <motion.div
          style={{
            position: "absolute",
            inset: 0,
            y: heroY,
            backgroundImage: "url('/images/Enforcers_1920x1200.jpg')",
            backgroundSize: "cover",
            backgroundPosition: "center 15%",
            opacity: 0.55,
            filter: "grayscale(100%) contrast(1.08)",
            mixBlendMode: "luminosity",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(100deg, rgba(5,7,10,0.97) 0%, rgba(5,7,10,0.55) 55%, rgba(5,7,10,0.97) 100%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse at 22% 55%, rgba(0,200,255,0.08), transparent 60%)",
          }}
        />

        <div
          className="landing-section-inner"
          style={{ position: "relative", zIndex: 1 }}
        >
          <motion.div initial="hidden" animate="visible" variants={stagger}>
            <motion.div
              variants={fadeUp}
              style={{
                marginBottom: "2rem",
                display: "flex",
                gap: "0.75rem",
                flexWrap: "wrap",
              }}
            >
              <BetaPill />
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.55rem",
                  padding: "0.42rem 1rem",
                  border: "1px solid rgba(0,200,255,0.35)",
                  background: "rgba(0,200,255,0.06)",
                  color: "#00c8ff",
                  fontFamily: "var(--font-display)",
                  fontSize: "0.72rem",
                  fontWeight: 900,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                }}
              >
                <Activity size={12} /> Heroes of the Storm · Competitivo
              </span>
            </motion.div>

            <motion.h1
              variants={fadeUp}
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(3.6rem, 8.5vw, 8rem)",
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "0.01em",
                color: "#ffffff",
                lineHeight: 1.02,
                margin: "0 0 2rem 0",
                maxWidth: "960px",
              }}
            >
              El circuito
              <br />
              competitivo{" "}
              <span
                style={{
                  background:
                    "linear-gradient(90deg, #00c8ff 20%, #7c4dff 80%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                del Nexo.
              </span>
            </motion.h1>

            <motion.p
              variants={fadeUp}
              style={{
                fontSize: "clamp(1rem, 1.4vw, 1.2rem)",
                color: "#cbd5e1",
                borderLeft: "3px solid #00c8ff",
                paddingLeft: "1.5rem",
                lineHeight: 1.7,
                maxWidth: "620px",
                marginBottom: "2.5rem",
                background:
                  "linear-gradient(90deg, rgba(0,200,255,0.06), transparent)",
                paddingTop: "0.6rem",
                paddingBottom: "0.6rem",
              }}
            >
              Matchmaking 5v5 con MMR real, veto de mapas en vivo y draft entre
              capitanes. Hecho por y para jugadores de{" "}
              <strong style={{ color: "#fff" }}>Heroes of the Storm</strong>.
              Inspirado en FACEIT y GamersClub — pero con identidad propia para
              el Nexo.
            </motion.p>

            <motion.div
              variants={fadeUp}
              style={{
                display: "flex",
                gap: "1rem",
                flexWrap: "wrap",
                marginBottom: "4rem",
              }}
            >
              <Link
                to={user ? "/dashboard" : "/register"}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.7rem",
                  background: "linear-gradient(90deg, #00c8ff, #7dd3fc)",
                  color: "#000",
                  padding: "1.05rem 2.8rem",
                  fontFamily: "var(--font-display)",
                  fontSize: "0.95rem",
                  fontWeight: 900,
                  textTransform: "uppercase",
                  letterSpacing: "0.2em",
                  textDecoration: "none",
                  boxShadow: "0 0 40px rgba(0,200,255,0.25)",
                  clipPath: "polygon(5% 0, 100% 0, 95% 100%, 0 100%)",
                }}
              >
                {user ? "Entrar al Dashboard" : "Sumarse a la beta"}
                <ChevronRight size={18} />
              </Link>
              <a
                href="#niveles"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.7rem",
                  border: "1px solid rgba(255,255,255,0.22)",
                  background: "rgba(0,0,0,0.45)",
                  color: "#fff",
                  padding: "1.05rem 2.8rem",
                  fontFamily: "var(--font-display)",
                  fontSize: "0.95rem",
                  fontWeight: 900,
                  textTransform: "uppercase",
                  letterSpacing: "0.2em",
                  textDecoration: "none",
                }}
              >
                Ver sistemas <ArrowRight size={16} />
              </a>
            </motion.div>

            <motion.div
              variants={fadeUp}
              style={{
                borderTop: "1px solid rgba(255,255,255,0.1)",
                paddingTop: "2rem",
                display: "grid",
                gridTemplateColumns: "repeat(4, auto)",
                gap: "3rem",
                width: "fit-content",
              }}
            >
              <HeroStat value="BETA" label="Fase actual" tone="#fbbf24" />
              <HeroStat value="5v5" label="Formato draft" tone="#00c8ff" />
              <HeroStat
                value={String(LEVELS.length)}
                label="Rangos competitivos"
                tone="#7c4dff"
              />
              <HeroStat value="SA" label="Región activa" tone="#fff" />
            </motion.div>
          </motion.div>
        </div>

        {/* Glow line bottom */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: "2px",
            background:
              "linear-gradient(90deg, transparent, #00c8ff 50%, transparent)",
            opacity: 0.4,
          }}
        />
      </section>

      {/* ─── BETA PROGRAM ─── */}
      <section
        id="beta"
        style={{
          position: "relative",
          width: "100%",
          padding: "clamp(4rem, 8vw, 7rem) 0",
          background:
            "linear-gradient(180deg, rgba(240,165,0,0.03), transparent)",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <div className="landing-section-inner">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            variants={stagger}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1fr)",
              gap: "3rem",
              alignItems: "center",
            }}
          >
            <motion.div variants={fadeUp}>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.6rem",
                  marginBottom: "1.5rem",
                  padding: "0.35rem 0.9rem",
                  border: "1px solid rgba(240,165,0,0.4)",
                  background: "rgba(240,165,0,0.06)",
                  color: "#fbbf24",
                  fontFamily: "var(--font-display)",
                  fontSize: "0.68rem",
                  fontWeight: 900,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                }}
              >
                <AlertCircle size={12} /> Programa de beta testing
              </div>
              <h2
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "clamp(2.4rem, 5vw, 4rem)",
                  fontWeight: 900,
                  textTransform: "uppercase",
                  color: "#fff",
                  lineHeight: 1.08,
                  marginBottom: "1.6rem",
                  letterSpacing: "0.01em",
                }}
              >
                Esto todavía se está construyendo.
                <br />
                <span style={{ color: "#fbbf24" }}>
                  Vení a construirlo con nosotros.
                </span>
              </h2>
              <p
                style={{
                  color: "#cbd5e1",
                  fontSize: "1rem",
                  lineHeight: 1.75,
                  maxWidth: "560px",
                  marginBottom: "2rem",
                }}
              >
                NexusGG está en beta activa para la región SA. Las partidas
                cuentan. El MMR es real. El roadmap se decide con los testers.
                No es un mock ni una demo: es infraestructura viva que estamos
                iterando todas las semanas.
              </p>
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  display: "grid",
                  gap: "0.75rem",
                  marginBottom: "2.2rem",
                }}
              >
                {BETA_POINTS.map((point) => (
                  <li
                    key={point}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "28px 1fr",
                      alignItems: "center",
                      gap: "0.9rem",
                      color: "#e8f4ff",
                      fontSize: "0.92rem",
                      lineHeight: 1.5,
                    }}
                  >
                    <span
                      style={{
                        width: "22px",
                        height: "22px",
                        display: "grid",
                        placeItems: "center",
                        border: "1px solid rgba(74,222,128,0.4)",
                        background: "rgba(74,222,128,0.1)",
                        color: "#4ade80",
                      }}
                    >
                      <Check size={12} strokeWidth={3} />
                    </span>
                    {point}
                  </li>
                ))}
              </ul>
              <Link
                to={user ? "/dashboard" : "/register"}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.7rem",
                  border: "1px solid rgba(240,165,0,0.6)",
                  background: "rgba(240,165,0,0.08)",
                  color: "#fbbf24",
                  padding: "0.9rem 2rem",
                  fontFamily: "var(--font-display)",
                  fontSize: "0.85rem",
                  fontWeight: 900,
                  textTransform: "uppercase",
                  letterSpacing: "0.2em",
                  textDecoration: "none",
                  boxShadow: "0 0 24px rgba(240,165,0,0.15)",
                }}
              >
                Reclamar acceso beta <ChevronRight size={16} />
              </Link>
            </motion.div>

            <motion.div
              variants={fadeUp}
              style={{
                position: "relative",
                border: "1px solid rgba(0,200,255,0.18)",
                background:
                  "linear-gradient(160deg, rgba(0,200,255,0.08), rgba(2,6,14,0.92) 70%)",
                padding: "2rem",
                overflow: "hidden",
                clipPath:
                  "polygon(5% 0, 100% 0, 100% 92%, 95% 100%, 0 100%, 0 8%)",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  right: 0,
                  width: "40%",
                  height: "2px",
                  background: "linear-gradient(to left, transparent, #00c8ff)",
                }}
              />
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "0.68rem",
                  fontWeight: 900,
                  letterSpacing: "0.22em",
                  color: "#7dd3fc",
                  textTransform: "uppercase",
                  marginBottom: "1.5rem",
                }}
              >
                Live telemetry · Demo
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "1.2rem",
                  marginBottom: "1.5rem",
                }}
              >
                <LevelOrb entry={activeLevel} size={100} />
                <div>
                  <div
                    style={{
                      color: "#fff",
                      fontFamily: "var(--font-display)",
                      fontSize: "1.5rem",
                      fontWeight: 900,
                      letterSpacing: "0.02em",
                    }}
                  >
                    {activeLevel.name}
                  </div>
                  <div
                    style={{
                      marginTop: "0.25rem",
                      color: activeLevel.color,
                      fontSize: "0.82rem",
                      fontWeight: 700,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                    }}
                  >
                    Rango {activeLevel.level} · {activeLevel.min}
                    {activeLevel.max != null ? `–${activeLevel.max}` : "+"} MMR
                  </div>
                </div>
              </div>

              {/* Progress track estilo producto */}
              <div
                style={{
                  marginTop: "0.6rem",
                  display: "flex",
                  justifyContent: "space-between",
                  color: "rgba(232,244,255,0.46)",
                  fontSize: "0.72rem",
                  fontWeight: 900,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                <span>Progreso al próximo rango</span>
                <strong style={{ color: activeLevel.color }}>
                  {nextLevel ? `→ ${nextLevel.name}` : "Rango máximo"}
                </strong>
              </div>
              <div
                style={{
                  position: "relative",
                  height: "12px",
                  marginTop: "0.45rem",
                  overflow: "hidden",
                  border: "1px solid rgba(232,244,255,0.08)",
                  background: "rgba(2,6,14,0.8)",
                }}
              >
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPct}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  style={{
                    position: "absolute",
                    inset: "0 auto 0 0",
                    background: `linear-gradient(90deg, ${activeLevel.color}, #00c8ff)`,
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    backgroundImage:
                      "linear-gradient(90deg, rgba(2,6,14,0.4) 1px, transparent 1px)",
                    backgroundSize: "14px 100%",
                  }}
                />
              </div>

              <div
                style={{
                  marginTop: "1.5rem",
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "0.6rem",
                }}
              >
                <DemoStat label="Wins" value="18" tone="#4ade80" />
                <DemoStat label="Losses" value="12" tone="#fb7185" />
                <DemoStat label="WR" value="60%" tone="#38bdf8" />
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ─── POSITIONING / ADVANTAGES ─── */}
      <section
        id="sistema"
        style={{
          width: "100%",
          padding: "clamp(4rem, 8vw, 8rem) 0",
          position: "relative",
        }}
      >
        <div className="landing-section-inner">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            variants={stagger}
          >
            <motion.div
              variants={fadeUp}
              style={{ marginBottom: "3rem", maxWidth: "720px" }}
            >
              <p
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "0.7rem",
                  fontWeight: 900,
                  textTransform: "uppercase",
                  letterSpacing: "0.3em",
                  color: "#00c8ff",
                  marginBottom: "1.25rem",
                }}
              >
                Por qué NexusGG
              </p>
              <h2
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "clamp(2.4rem, 5vw, 4rem)",
                  fontWeight: 900,
                  textTransform: "uppercase",
                  color: "#fff",
                  lineHeight: 1.05,
                  marginBottom: "1.5rem",
                }}
              >
                FACEIT existe. GamersClub existe. Para HOTS, no había nada
                serio.
                <span style={{ color: "#00c8ff" }}> Hasta ahora.</span>
              </h2>
              <p
                style={{ color: "#94a3b8", fontSize: "1rem", lineHeight: 1.75 }}
              >
                Replicar FACEIT genérico no sirve. Heroes of the Storm tiene
                capitanes, objetivos de mapa, mercenarios, talentos dinámicos y
                un meta propio. Cada decisión del producto está pensada para
                eso.
              </p>
            </motion.div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "1.3rem",
              }}
            >
              {ADVANTAGES.map((adv) => {
                const Icon = adv.icon;
                return (
                  <motion.article
                    key={adv.title}
                    variants={fadeUp}
                    whileHover={{ y: -6 }}
                    style={{
                      position: "relative",
                      border: "1px solid rgba(0,200,255,0.12)",
                      background:
                        "linear-gradient(160deg, rgba(0,200,255,0.05), rgba(17,25,39,0.92))",
                      padding: "1.8rem 1.5rem",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "46%",
                        height: "2px",
                        background:
                          "linear-gradient(90deg, #00c8ff, transparent)",
                        boxShadow: "0 0 14px #00c8ff",
                      }}
                    />
                    <Icon
                      size={30}
                      color="#00c8ff"
                      style={{ marginBottom: "1.2rem" }}
                    />
                    <h3
                      style={{
                        color: "#fff",
                        fontFamily: "var(--font-display)",
                        fontSize: "1.1rem",
                        fontWeight: 900,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        marginBottom: "0.85rem",
                      }}
                    >
                      {adv.title}
                    </h3>
                    <p
                      style={{
                        color: "rgba(232,244,255,0.54)",
                        fontSize: "0.9rem",
                        lineHeight: 1.65,
                      }}
                    >
                      {adv.desc}
                    </p>
                  </motion.article>
                );
              })}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── NIVELES ─── */}
      <section
        id="niveles"
        style={{
          position: "relative",
          width: "100%",
          padding: "clamp(4rem, 8vw, 8rem) 0",
          borderTop: "1px solid rgba(255,255,255,0.05)",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: "url('/images/Mephisto_1920x1200.jpg')",
            backgroundSize: "cover",
            backgroundPosition: "center",
            opacity: 0.18,
            filter: "grayscale(100%) contrast(1.1)",
            mixBlendMode: "luminosity",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, rgba(5,7,10,0.94), rgba(5,7,10,0.98))",
          }}
        />

        <div
          className="landing-section-inner"
          style={{ position: "relative", zIndex: 1 }}
        >
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            variants={stagger}
          >
            <motion.div
              variants={fadeUp}
              style={{
                display: "flex",
                gap: "3rem",
                alignItems: "flex-end",
                justifyContent: "space-between",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
                paddingBottom: "2.5rem",
                marginBottom: "2.5rem",
                flexWrap: "wrap",
              }}
            >
              <div style={{ maxWidth: "600px" }}>
                <p
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "0.7rem",
                    fontWeight: 900,
                    textTransform: "uppercase",
                    letterSpacing: "0.3em",
                    color: "#00c8ff",
                    marginBottom: "1rem",
                  }}
                >
                  Escalafón · {LEVELS.length} rangos
                </p>
                <h2
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "clamp(2.6rem, 5vw, 4.4rem)",
                    fontWeight: 900,
                    textTransform: "uppercase",
                    color: "#fff",
                    lineHeight: 1.05,
                    marginBottom: "1.2rem",
                  }}
                >
                  Tu lugar
                  <br />
                  en el circuito.
                </h2>
                <p
                  style={{
                    color: "#cbd5e1",
                    fontSize: "1rem",
                    lineHeight: 1.75,
                  }}
                >
                  Cada rango es una banda de MMR real. El sistema ajusta tu
                  rating con K-factor variable según el rango de tu squad y el
                  enemigo. No se inflan partidas. No hay atajos. Subís porque te
                  lo ganaste.
                </p>
              </div>
              <div
                style={{
                  border: "1px solid rgba(240,165,0,0.35)",
                  background: "rgba(240,165,0,0.05)",
                  padding: "1rem 1.3rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.8rem",
                  maxWidth: "340px",
                }}
              >
                <Lock size={18} color="#fbbf24" />
                <div>
                  <div
                    style={{
                      color: "#fbbf24",
                      fontFamily: "var(--font-display)",
                      fontSize: "0.78rem",
                      fontWeight: 900,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                    }}
                  >
                    Anti-smurf activo
                  </div>
                  <div
                    style={{
                      color: "rgba(232,244,255,0.56)",
                      fontSize: "0.78rem",
                      marginTop: "0.2rem",
                    }}
                  >
                    Account age · Discord link · IP tracking
                  </div>
                </div>
              </div>
            </motion.div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: "0.9rem",
              }}
            >
              {LEVELS.map((entry) => (
                <motion.div
                  key={entry.level}
                  variants={fadeUp}
                  whileHover={{ y: -4, transition: { duration: 0.2 } }}
                >
                  <RankPlate entry={entry} />
                </motion.div>
              ))}
            </div>

            <motion.div
              variants={fadeUp}
              style={{
                marginTop: "3rem",
                padding: "1.3rem 1.6rem",
                border: "1px solid rgba(0,200,255,0.15)",
                background: "rgba(0,200,255,0.04)",
                display: "flex",
                alignItems: "center",
                gap: "1rem",
                flexWrap: "wrap",
                justifyContent: "space-between",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "1rem" }}
              >
                <TrendingUp size={22} color="#00c8ff" />
                <div>
                  <div
                    style={{
                      color: "#fff",
                      fontFamily: "var(--font-display)",
                      fontWeight: 900,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                    }}
                  >
                    ELO con K-factor variable
                  </div>
                  <div
                    style={{
                      color: "rgba(232,244,255,0.5)",
                      fontSize: "0.84rem",
                      marginTop: "0.2rem",
                    }}
                  >
                    Los cambios de MMR pesan más al principio y se estabilizan
                    a medida que te acercás a Immortal.
                  </div>
                </div>
              </div>
              <a
                href="#flujo"
                style={{
                  color: "#7dd3fc",
                  fontFamily: "var(--font-display)",
                  fontSize: "0.8rem",
                  fontWeight: 900,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  textDecoration: "none",
                }}
              >
                Ver cómo funciona el flujo →
              </a>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ─── ROLES ─── */}
      <section
        id="roles"
        style={{
          width: "100%",
          padding: "clamp(4rem, 8vw, 8rem) 0",
          position: "relative",
        }}
      >
        <div className="landing-section-inner">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            variants={stagger}
          >
            <motion.div
              variants={fadeUp}
              style={{ marginBottom: "2.5rem", maxWidth: "680px" }}
            >
              <p
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "0.7rem",
                  fontWeight: 900,
                  textTransform: "uppercase",
                  letterSpacing: "0.3em",
                  color: "#00c8ff",
                  marginBottom: "1rem",
                }}
              >
                Roles del jugador
              </p>
              <h2
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "clamp(2.4rem, 5vw, 3.8rem)",
                  fontWeight: 900,
                  textTransform: "uppercase",
                  color: "#fff",
                  lineHeight: 1.08,
                  marginBottom: "1.2rem",
                }}
              >
                Definí tu identidad táctica.
              </h2>
              <p
                style={{ color: "#94a3b8", fontSize: "1rem", lineHeight: 1.7 }}
              >
                Configurás un{" "}
                <strong style={{ color: "#fff" }}>rol principal</strong> y uno{" "}
                <strong style={{ color: "#fff" }}>secundario</strong> en tu
                perfil. El matchmaking los usa como fuente principal para
                balancear equipos. Nada de sopa de roles al entrar a cola.
              </p>
            </motion.div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: "1.2rem",
              }}
            >
              {ROLES.map((role) => (
                <RoleCard key={role.key} role={role} />
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── FLUJO MANUAL ─── */}
      <section
        id="flujo"
        style={{
          position: "relative",
          width: "100%",
          padding: "clamp(4rem, 8vw, 8rem) 0",
          background:
            "linear-gradient(180deg, rgba(17,25,39,0.5), transparent)",
          borderTop: "1px solid rgba(255,255,255,0.05)",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <div className="landing-section-inner">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.15 }}
            variants={stagger}
          >
            <motion.div
              variants={fadeUp}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
                gap: "3rem",
                marginBottom: "3rem",
                alignItems: "end",
              }}
            >
              <div>
                <p
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "0.7rem",
                    fontWeight: 900,
                    textTransform: "uppercase",
                    letterSpacing: "0.3em",
                    color: "#00c8ff",
                    marginBottom: "1rem",
                  }}
                >
                  Flujo manual asistido
                </p>
                <h2
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "clamp(2.4rem, 5vw, 3.8rem)",
                    fontWeight: 900,
                    textTransform: "uppercase",
                    color: "#fff",
                    lineHeight: 1.08,
                  }}
                >
                  10 pasos.
                  <br />
                  Sincronizados.
                </h2>
              </div>
              <div>
                <p
                  style={{
                    color: "#cbd5e1",
                    fontSize: "1rem",
                    lineHeight: 1.75,
                  }}
                >
                  Blizzard no ofrece API pública útil para partidas
                  personalizadas de HOTS. En lugar de fingir que sí, NexusGG usa
                  un{" "}
                  <strong style={{ color: "#fff" }}>
                    flujo manual asistido
                  </strong>
                  : nosotros orquestamos todo lo que podemos automatizar y el
                  resto está guiado paso a paso. Transparencia sobre magia rota.
                </p>
              </div>
            </motion.div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                gap: "0.9rem",
              }}
            >
              {FLOW_STEPS.map((step, idx) => (
                <FlowStep key={step.title} step={step} index={idx} />
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── MAP POOL ─── */}
      <section
        id="mapas"
        style={{
          width: "100%",
          padding: "clamp(4rem, 8vw, 8rem) 0",
          position: "relative",
        }}
      >
        <div className="landing-section-inner">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.15 }}
            variants={stagger}
          >
            <motion.div
              variants={fadeUp}
              style={{
                display: "flex",
                gap: "2rem",
                alignItems: "flex-end",
                justifyContent: "space-between",
                marginBottom: "2.5rem",
                flexWrap: "wrap",
              }}
            >
              <div style={{ maxWidth: "600px" }}>
                <p
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "0.7rem",
                    fontWeight: 900,
                    textTransform: "uppercase",
                    letterSpacing: "0.3em",
                    color: "#00c8ff",
                    marginBottom: "1rem",
                  }}
                >
                  Map pool competitivo
                </p>
                <h2
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "clamp(2.4rem, 5vw, 3.8rem)",
                    fontWeight: 900,
                    textTransform: "uppercase",
                    color: "#fff",
                    lineHeight: 1.05,
                    marginBottom: "1rem",
                  }}
                >
                  12 mapas.
                  <br />
                  Un veto cronometrado.
                </h2>
                <p
                  style={{
                    color: "#94a3b8",
                    fontSize: "1rem",
                    lineHeight: 1.7,
                  }}
                >
                  El rotation oficial de HOTS. Los capitanes vetan
                  alternadamente con timer de 30s hasta que queda uno. Si el
                  capitán duda, pierde el turno y el veto se sortea.
                </p>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.8rem",
                  border: "1px solid rgba(255,255,255,0.08)",
                  padding: "0.8rem 1.1rem",
                  background: "rgba(2,6,14,0.45)",
                }}
              >
                <Target size={18} color="#00c8ff" />
                <div>
                  <div
                    style={{
                      color: "#fff",
                      fontFamily: "var(--font-display)",
                      fontSize: "0.78rem",
                      fontWeight: 900,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                    }}
                  >
                    Timer · 30 segundos
                  </div>
                  <div
                    style={{
                      color: "rgba(232,244,255,0.48)",
                      fontSize: "0.76rem",
                      marginTop: "0.15rem",
                    }}
                  >
                    Auto-veto si el capitán no reacciona
                  </div>
                </div>
              </div>
            </motion.div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "0.9rem",
              }}
            >
              {MAPS.map((map, idx) => (
                <MapCard key={map.slug} map={map} index={idx} />
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── DISCORD ─── */}
      <section
        id="discord"
        style={{
          position: "relative",
          width: "100%",
          padding: "clamp(5rem, 10vw, 9rem) 0",
          borderTop: "1px solid rgba(88,101,242,0.25)",
          borderBottom: "1px solid rgba(88,101,242,0.25)",
          background: "rgba(88,101,242,0.05)",
          overflow: "hidden",
          textAlign: "center",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse at center, rgba(88,101,242,0.14), transparent 65%)",
            pointerEvents: "none",
          }}
        />
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          variants={stagger}
          className="landing-section-inner"
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <motion.div variants={fadeUp}>
            <Shield
              size={68}
              color="#5865F2"
              style={{ marginBottom: "2rem" }}
            />
          </motion.div>
          <motion.h2
            variants={fadeUp}
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(2.5rem, 6vw, 5rem)",
              fontWeight: 900,
              textTransform: "uppercase",
              color: "#fff",
              letterSpacing: "0.04em",
              lineHeight: 1.05,
              marginBottom: "1.5rem",
            }}
          >
            Cuartel general
          </motion.h2>
          <motion.p
            variants={fadeUp}
            style={{
              color: "#cbd5e1",
              fontSize: "clamp(0.95rem, 1.4vw, 1.12rem)",
              lineHeight: 1.75,
              maxWidth: "560px",
              marginBottom: "2.5rem",
            }}
          >
            Acá no hay soporte vía email olvidado. Anuncios, reportes, rotación
            de mapas, feedback del roadmap y coordinación de squads: todo pasa
            por Discord, en vivo.
          </motion.p>
          <motion.a
            variants={fadeUp}
            href={import.meta.env.VITE_DISCORD_INVITE || "#"}
            target="_blank"
            rel="noopener noreferrer"
            whileHover={{ scale: 1.03 }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.9rem",
              border: "1px solid #5865F2",
              background: "rgba(88,101,242,0.18)",
              color: "#fff",
              padding: "1.15rem 3rem",
              fontFamily: "var(--font-display)",
              fontSize: "0.9rem",
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "0.2em",
              textDecoration: "none",
              boxShadow: "0 0 32px rgba(88,101,242,0.25)",
            }}
          >
            <svg width="22" height="22" viewBox="0 0 71 55" fill="currentColor">
              <path d="M60.1 4.9A58.6 58.6 0 0 0 45.5.4a.2.2 0 0 0-.2.1 40.8 40.8 0 0 0-1.8 3.7 54.1 54.1 0 0 0-16.2 0A37.4 37.4 0 0 0 25.5.5a.2.2 0 0 0-.2-.1A58.5 58.5 0 0 0 10.7 4.9a.2.2 0 0 0-.1.1C1.5 18.1-.9 31-.3 43.6a.2.2 0 0 0 .1.2 58.8 58.8 0 0 0 17.7 8.9.2.2 0 0 0 .2-.1 42 42 0 0 0 3.6-5.9.2.2 0 0 0-.1-.3 38.7 38.7 0 0 1-5.5-2.6.2.2 0 0 1 0-.4l1.1-.9a.2.2 0 0 1 .2 0c11.5 5.3 24 5.3 35.4 0a.2.2 0 0 1 .2 0l1.1.8a.2.2 0 0 1 0 .4 36.1 36.1 0 0 1-5.5 2.6.2.2 0 0 0-.1.3 47.1 47.1 0 0 0 3.6 5.9.2.2 0 0 0 .2.1 58.7 58.7 0 0 0 17.8-8.9.2.2 0 0 0 .1-.2c.7-14.4-2.1-27.2-9.7-38.6a.2.2 0 0 0-.1-.1ZM23.7 36.4c-3.5 0-6.4-3.2-6.4-7.1s2.8-7.1 6.4-7.1c3.6 0 6.5 3.2 6.4 7.1 0 3.9-2.8 7.1-6.4 7.1Zm23.7 0c-3.5 0-6.4-3.2-6.4-7.1s2.8-7.1 6.4-7.1c3.6 0 6.5 3.2 6.4 7.1 0 3.9-2.8 7.1-6.4 7.1Z" />
            </svg>
            Conectar al Discord
          </motion.a>
        </motion.div>
      </section>

      {/* ─── CTA FINAL ─── */}
      <section
        style={{
          position: "relative",
          width: "100%",
          padding: "clamp(5rem, 10vw, 9rem) 0",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: "url('/images/greymane_1920x1200.jpg')",
            backgroundSize: "cover",
            backgroundPosition: "center",
            opacity: 0.22,
            filter: "grayscale(100%) contrast(1.1)",
            mixBlendMode: "luminosity",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, rgba(5,7,10,0.95), rgba(5,7,10,0.72), rgba(5,7,10,0.98))",
          }}
        />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="landing-section-inner"
          style={{ position: "relative", zIndex: 1, textAlign: "center" }}
        >
          <BetaPill />
          <h2
            style={{
              marginTop: "1.5rem",
              fontFamily: "var(--font-display)",
              fontSize: "clamp(2.6rem, 7vw, 5.5rem)",
              fontWeight: 900,
              textTransform: "uppercase",
              color: "#fff",
              lineHeight: 1,
              letterSpacing: "0.02em",
              marginBottom: "1.3rem",
            }}
          >
            Entrá.
            <br />
            <span style={{ color: "#00c8ff" }}>Peleá.</span>{" "}
            <span style={{ color: "#fbbf24" }}>Ascendé.</span>
          </h2>
          <p
            style={{
              color: "#cbd5e1",
              fontSize: "clamp(0.95rem, 1.4vw, 1.15rem)",
              maxWidth: "580px",
              margin: "0 auto 2.5rem",
              lineHeight: 1.75,
            }}
          >
            La beta está abierta para Sudamérica. Ranking real desde la primera
            partida. Seguinos el roadmap desde adentro.
          </p>
          <div
            style={{
              display: "inline-flex",
              gap: "1rem",
              flexWrap: "wrap",
              justifyContent: "center",
            }}
          >
            <Link
              to={user ? "/dashboard" : "/register"}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.7rem",
                background: "linear-gradient(90deg, #00c8ff, #7dd3fc)",
                color: "#000",
                padding: "1.15rem 3rem",
                fontFamily: "var(--font-display)",
                fontSize: "0.95rem",
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "0.22em",
                textDecoration: "none",
                boxShadow: "0 0 42px rgba(0,200,255,0.3)",
                clipPath: "polygon(5% 0, 100% 0, 95% 100%, 0 100%)",
              }}
            >
              {user ? "Entrar al Dashboard" : "Entrar a la arena"}
              <ChevronRight size={18} />
            </Link>
          </div>
        </motion.div>
      </section>

      {/* ─── FOOTER ─── */}
      <Footer />
    </main>
  );
}

/* ─── Nav + Footer + auxiliares ──────────────────────────── */

function Navbar({ user }: { user: { username?: string | null } | null }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 40);
    handler();
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const navLinks = [
    { href: "#beta", label: "Beta" },
    { href: "#niveles", label: "Rangos" },
    { href: "#roles", label: "Roles" },
    { href: "#flujo", label: "Flujo" },
    { href: "#mapas", label: "Mapas" },
  ];

  return (
    <nav
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        height: "72px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 clamp(1.5rem, 5vw, 5rem)",
        borderBottom: `1px solid ${scrolled ? "rgba(0,200,255,0.14)" : "rgba(255,255,255,0.06)"}`,
        backgroundColor: scrolled ? "rgba(5,7,10,0.94)" : "rgba(5,7,10,0.72)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        transition: "background-color 200ms, border-color 200ms",
      }}
    >
      <Link
        to="/"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.9rem",
          textDecoration: "none",
        }}
      >
        <div
          style={{
            width: "40px",
            height: "40px",
            display: "grid",
            placeItems: "center",
            border: "1px solid rgba(0,200,255,0.35)",
            background:
              "linear-gradient(135deg, rgba(0,200,255,0.18), rgba(124,77,255,0.12))",
            clipPath:
              "polygon(12% 0, 100% 0, 100% 78%, 82% 100%, 0 100%, 0 18%)",
          }}
        >
          <img
            src="/brand/logo.png"
            alt="NexusGG"
            style={{ width: "28px", height: "28px", objectFit: "contain" }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.7rem" }}>
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "1.3rem",
              fontWeight: 800,
              letterSpacing: "0.22em",
              color: "#fff",
              textTransform: "uppercase",
            }}
          >
            NexusGG
          </span>
          <BetaPill compact />
        </div>
      </Link>

      <div
        style={{
          display: "none",
          alignItems: "center",
          gap: "1.8rem",
        }}
        className="nav-links-desktop"
      >
        {navLinks.map((link) => (
          <a
            key={link.href}
            href={link.href}
            style={{
              color: "rgba(232,244,255,0.62)",
              fontFamily: "var(--font-display)",
              fontSize: "0.76rem",
              fontWeight: 800,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              textDecoration: "none",
            }}
          >
            {link.label}
          </a>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        {user ? (
          <Link
            to="/dashboard"
            style={{
              border: "1px solid rgba(0,200,255,0.4)",
              background: "rgba(0,200,255,0.1)",
              color: "#00c8ff",
              padding: "0.55rem 1.4rem",
              fontFamily: "var(--font-display)",
              fontSize: "0.76rem",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.18em",
              textDecoration: "none",
            }}
          >
            Dashboard
          </Link>
        ) : (
          <>
            <Link
              to="/login"
              style={{
                color: "rgba(232,244,255,0.72)",
                fontFamily: "var(--font-display)",
                fontSize: "0.76rem",
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                textDecoration: "none",
              }}
            >
              Iniciar sesión
            </Link>
            <Link
              to="/register"
              style={{
                border: "1px solid rgba(0,200,255,0.55)",
                background:
                  "linear-gradient(90deg, rgba(0,200,255,0.16), rgba(0,200,255,0.06))",
                color: "#00c8ff",
                padding: "0.55rem 1.4rem",
                fontFamily: "var(--font-display)",
                fontSize: "0.76rem",
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                textDecoration: "none",
                boxShadow: "0 0 18px rgba(0,200,255,0.12)",
              }}
            >
              Unirse
            </Link>
          </>
        )}
      </div>

      <style>{`
        @media (min-width: 820px) {
          .nav-links-desktop { display: flex !important; }
        }
      `}</style>
    </nav>
  );
}

function Footer() {
  const cols = [
    {
      title: "Plataforma",
      links: [
        { label: "Beta program", href: "#beta" },
        { label: "Sistema de rangos", href: "#niveles" },
        { label: "Flujo manual", href: "#flujo" },
        { label: "Mapas", href: "#mapas" },
      ],
    },
    {
      title: "Comunidad",
      links: [
        { label: "Discord", href: import.meta.env.VITE_DISCORD_INVITE || "#" },
        { label: "Roadmap", href: "#" },
        { label: "Changelog", href: "#" },
        { label: "Reportar un bug", href: "#" },
      ],
    },
    {
      title: "Legal",
      links: [
        { label: "Términos", href: "#" },
        { label: "Privacidad", href: "#" },
        { label: "Anti-smurf policy", href: "#" },
        { label: "Política de fair play", href: "#" },
      ],
    },
  ];

  return (
    <footer
      style={{
        background: "#040609",
        padding: "clamp(3rem, 6vw, 5rem) 0 2rem",
        borderTop: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      <div
        className="landing-section-inner"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.4fr) repeat(3, minmax(0, 1fr))",
          gap: "2.5rem",
          paddingBottom: "2.5rem",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          marginBottom: "1.8rem",
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.85rem",
              marginBottom: "1.2rem",
            }}
          >
            <img
              src="/brand/logo.png"
              alt="NexusGG"
              style={{
                width: "32px",
                height: "32px",
                objectFit: "contain",
                filter: "grayscale(100%)",
                opacity: 0.55,
              }}
            />
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1rem",
                fontWeight: 800,
                letterSpacing: "0.28em",
                color: "#64748b",
                textTransform: "uppercase",
              }}
            >
              NexusGG
            </span>
            <BetaPill compact />
          </div>
          <p
            style={{
              fontSize: "0.78rem",
              color: "#475569",
              lineHeight: 1.8,
              fontFamily: "monospace",
              maxWidth: "380px",
            }}
          >
            Operando como infraestructura táctica independiente para Heroes of
            the Storm.
            <br />
            No afiliado con Blizzard Entertainment. Heroes of the Storm® es
            marca registrada de Blizzard Entertainment, Inc.
          </p>
        </div>

        {cols.map((col) => (
          <div key={col.title}>
            <div
              style={{
                color: "#94a3b8",
                fontFamily: "var(--font-display)",
                fontSize: "0.68rem",
                fontWeight: 900,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                marginBottom: "1rem",
              }}
            >
              {col.title}
            </div>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                display: "grid",
                gap: "0.55rem",
              }}
            >
              {col.links.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    style={{
                      color: "#475569",
                      fontSize: "0.82rem",
                      textDecoration: "none",
                      fontWeight: 600,
                      letterSpacing: "0.02em",
                    }}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div
        className="landing-section-inner"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <p
          style={{
            fontSize: "0.7rem",
            color: "#334155",
            textTransform: "uppercase",
            letterSpacing: "0.22em",
            fontWeight: 700,
          }}
        >
          © {new Date().getFullYear()} NexusGG · All Systems Operational
        </p>
        <p
          style={{
            fontSize: "0.7rem",
            color: "#334155",
            fontFamily: "monospace",
            letterSpacing: "0.08em",
          }}
        >
          beta-sa · build.live
        </p>
      </div>
    </footer>
  );
}

function HeroStat({
  value,
  label,
  tone,
}: {
  value: string;
  label: string;
  tone: string;
}) {
  return (
    <div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "clamp(2rem, 3.5vw, 3rem)",
          fontWeight: 900,
          color: tone,
          lineHeight: 1,
          letterSpacing: "0.02em",
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: "0.66rem",
          textTransform: "uppercase",
          letterSpacing: "0.25em",
          color: "#64748b",
          marginTop: "0.5rem",
          fontWeight: 800,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function DemoStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div
      style={{
        padding: "0.7rem 0.5rem",
        textAlign: "center",
        border: "1px solid rgba(232,244,255,0.07)",
        background: "rgba(255,255,255,0.025)",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "1.35rem",
          fontWeight: 900,
          color: tone,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div
        style={{
          marginTop: "0.35rem",
          color: "rgba(232,244,255,0.36)",
          fontSize: "0.62rem",
          fontWeight: 900,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
    </div>
  );
}
