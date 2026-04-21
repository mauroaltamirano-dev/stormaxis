import { Link } from "@tanstack/react-router";
import { useAuthStore } from "../stores/auth.store";
import {
  Swords,
  Trophy,
  Shield,
  Skull,
  Activity,
  Gavel,
  Cpu,
  ChevronRight,
} from "lucide-react";

const RANKS = [
  { name: "BRONCE", color: "#8b6914", range: "0–799" },
  { name: "PLATA", color: "#c0c0c0", range: "800–1199" },
  { name: "ORO", color: "#f0a500", range: "1200–1599" },
  { name: "PLATINO", color: "#00c8ff", range: "1600–1999" },
  { name: "DIAMANTE", color: "#7c4dff", range: "2000–2399" },
  { name: "MASTER", color: "#ff4757", range: "2400–2799" },
  { name: "GRAND MASTER", color: "#ff9100", range: "2800+" },
];

const HOW_IT_WORKS = [
  {
    step: "01",
    icon: Skull,
    title: "REGISTRO DIRECTO",
    desc: "Vinculá tus cuentas de Battle.net o Discord. Cero vueltas. Un solo perfil válido.",
  },
  {
    step: "02",
    icon: Swords,
    title: "MATCHMAKING SEVERO",
    desc: "Emparejamiento estricto por MMR real. Acá no hay partidas infladas, jugás contra tus iguales.",
  },
  {
    step: "03",
    icon: Gavel,
    title: "DRAFT Y VETOS",
    desc: "Fase de capitanes con baneos de mapas. El match se decide desde la lobby.",
  },
  {
    step: "04",
    icon: Trophy,
    title: "GLORIA",
    desc: "Los resultados se votan y el impacto en tu ELO es inmediato. Solo los mejores ascienden.",
  },
];

/* Shared inner container style — ensures content is always centered with consistent gutters */
const inner: React.CSSProperties = {
  display: "block",
  width: "100%",
  maxWidth: "1400px",
  marginLeft: "auto",
  marginRight: "auto",
  paddingLeft: "clamp(2rem, 6vw, 6rem)",
  paddingRight: "clamp(2rem, 6vw, 6rem)",
  boxSizing: "border-box",
};

export function Landing() {
  const { user } = useAuthStore();

  return (
    <main
      style={{
        minHeight: "100vh",
        backgroundColor: "#05070A",
        color: "#f1f5f9",
        overflowX: "hidden",
        fontFamily: "var(--font-body)",
        width: "100%",
        alignSelf: "stretch",
      }}
    >
      {/* Background grid + glow */}
      <div
        style={{
          pointerEvents: "none",
          position: "fixed",
          inset: 0,
          zIndex: 0,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at top, rgba(0,200,255,0.07), transparent 50%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0.04,
            backgroundImage:
              "linear-gradient(rgba(255,255,255,1) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,1) 1px,transparent 1px)",
            backgroundSize: "80px 80px",
          }}
        />
      </div>

      {/* ─── NAV ─── */}
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
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          backgroundColor: "rgba(5,7,10,0.92)",
          backdropFilter: "blur(12px)",
        }}
      >
        <Link
          to="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "1rem",
            textDecoration: "none",
          }}
        >
          <img
            src="/brand/logo.png"
            alt="NexusGG"
            style={{ width: "40px", height: "40px", objectFit: "contain" }}
          />
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "1.4rem",
              fontWeight: 700,
              letterSpacing: "0.25em",
              color: "#00c8ff",
              textTransform: "uppercase",
            }}
          >
            NexusGG
          </span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
          {user ? (
            <Link
              to="/dashboard"
              style={{
                border: "1px solid rgba(0,200,255,0.4)",
                background: "rgba(0,200,255,0.1)",
                color: "#00c8ff",
                padding: "0.6rem 1.75rem",
                fontFamily: "var(--font-display)",
                fontSize: "0.8rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.15em",
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
                  color: "#cbd5e1",
                  fontFamily: "var(--font-display)",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.15em",
                  textDecoration: "none",
                }}
              >
                Iniciar Sesión
              </Link>
              <Link
                to="/register"
                style={{
                  border: "1px solid rgba(0,200,255,0.5)",
                  background: "rgba(0,200,255,0.1)",
                  color: "#00c8ff",
                  padding: "0.6rem 1.75rem",
                  fontFamily: "var(--font-display)",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.15em",
                  textDecoration: "none",
                }}
              >
                Unirse
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* ─── HERO ─── */}
      <section
        style={{
          position: "relative",
          width: "100%",
          minHeight: "88vh",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          paddingTop: "120px",
          paddingBottom: "80px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          backgroundColor: "#07090F",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: "url('/images/Enforcers_1920x1200.jpg')",
            backgroundSize: "cover",
            backgroundPosition: "center 15%",
            opacity: 0.45,
            filter: "grayscale(100%)",
            mixBlendMode: "luminosity",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(100deg, rgba(5,7,10,0.98) 0%, rgba(5,7,10,0.65) 55%, rgba(5,7,10,0.97) 100%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse at 20% 50%, rgba(0,200,255,0.05), transparent 60%)",
          }}
        />

        <div style={{ ...inner, position: "relative", zIndex: 1 }}>
          {/* Season badge */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.75rem",
              border: "1px solid rgba(0,200,255,0.3)",
              background: "rgba(0,200,255,0.08)",
              padding: "0.5rem 1.25rem",
              marginBottom: "2.5rem",
            }}
          >
            <span
              style={{
                width: "8px",
                height: "8px",
                background: "#00c8ff",
                borderRadius: "0",
                animation: "blink 2s infinite",
              }}
            />
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "0.75rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.3em",
                color: "#00c8ff",
              }}
            >
              Temporada 1 · Activa
            </span>
          </div>

          {/* H1 */}
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(4rem, 9vw, 8rem)",
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "0.02em",
              color: "#ffffff",
              lineHeight: 1.05,
              margin: "0 0 2.5rem 0",
              maxWidth: "900px",
            }}
          >
            Domina <br />
            el{" "}
            <span
              style={{
                background: "linear-gradient(90deg, #00c8ff, #7c4dff)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Nexo
            </span>
          </h1>

          {/* Subtitle */}
          <p
            style={{
              fontSize: "clamp(1rem, 1.5vw, 1.25rem)",
              color: "#cbd5e1",
              borderLeft: "4px solid #00c8ff",
              paddingLeft: "1.5rem",
              paddingTop: "0.5rem",
              paddingBottom: "0.5rem",
              lineHeight: 1.7,
              maxWidth: "640px",
              marginBottom: "3.5rem",
              background:
                "linear-gradient(90deg, rgba(0,200,255,0.05), transparent)",
            }}
          >
            Matchmaking sin compasión. Sistema de ELO estricto. Veto de mapas en
            tiempo real. La plataforma definitiva para los que juegan en serio.
          </p>

          {/* CTAs */}
          <div
            style={{
              display: "flex",
              gap: "1.25rem",
              flexWrap: "wrap",
              marginBottom: "5rem",
            }}
          >
            <Link
              to="/register"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.75rem",
                background: "#00c8ff",
                color: "#000",
                padding: "1.1rem 3rem",
                fontFamily: "var(--font-display)",
                fontSize: "1rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.2em",
                textDecoration: "none",
              }}
            >
              Entrar a la Arena <ChevronRight size={20} />
            </Link>
            <a
              href="#sistema"
              style={{
                display: "inline-flex",
                alignItems: "center",
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(0,0,0,0.4)",
                color: "#fff",
                padding: "1.1rem 3rem",
                fontFamily: "var(--font-display)",
                fontSize: "1rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.2em",
                textDecoration: "none",
              }}
            >
              Ver Sistemas
            </a>
          </div>

          {/* Stats */}
          <div
            style={{
              borderTop: "1px solid rgba(255,255,255,0.1)",
              paddingTop: "2.5rem",
              display: "grid",
              gridTemplateColumns: "repeat(3, auto)",
              gap: "4rem",
              width: "fit-content",
            }}
          >
            {[
              ["8.2K", "Jugadores"],
              ["14K", "Partidas"],
              ["3", "Regiones"],
            ].map(([val, label]) => (
              <div key={label}>
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "clamp(2.5rem, 4vw, 3.5rem)",
                    fontWeight: 700,
                    color: label === "Jugadores" ? "#00c8ff" : "#fff",
                    lineHeight: 1,
                  }}
                >
                  {val}
                </div>
                <div
                  style={{
                    fontSize: "0.7rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.25em",
                    color: "#64748b",
                    marginTop: "0.5rem",
                    fontWeight: 700,
                  }}
                >
                  {label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CÓMO FUNCIONA ─── */}
      <section
        id="sistema"
        style={{ width: "100%", padding: "clamp(4rem, 8vw, 8rem) 0" }}
      >
        <div style={inner}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 2fr",
              gap: "2rem",
            }}
          >
            {/* Left callout */}
            <div
              style={{
                border: "1px solid rgba(255,255,255,0.1)",
                background: "#080B12",
                padding: "clamp(2.5rem, 5vw, 5rem)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div>
                <span
                  style={{
                    display: "inline-block",
                    background: "rgba(255,255,255,0.08)",
                    color: "#fff",
                    padding: "0.35rem 1rem",
                    fontFamily: "var(--font-display)",
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.2em",
                  }}
                >
                  Protocolo Operativo
                </span>
                <h2
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "clamp(3rem, 5vw, 4.5rem)",
                    fontWeight: 900,
                    textTransform: "uppercase",
                    color: "#fff",
                    lineHeight: 1.1,
                    margin: "2rem 0 1.5rem 0",
                  }}
                >
                  ENTRAR.
                  <br />
                  PELEAR.
                  <br />
                  <span style={{ color: "#00c8ff" }}>ASCENDER.</span>
                </h2>
                <p
                  style={{
                    color: "#94a3b8",
                    fontSize: "1rem",
                    lineHeight: 1.75,
                    borderLeft: "2px solid rgba(255,255,255,0.15)",
                    paddingLeft: "1.5rem",
                  }}
                >
                  Nuestra arquitectura está diseñada para mitigar el caos de las
                  rankeds públicas. No hay lugar para el azar. Todo está
                  documentado.
                </p>
              </div>
              <Cpu
                size={72}
                color="rgba(0,200,255,0.2)"
                style={{ marginTop: "3rem" }}
              />
            </div>

            {/* Right grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1.5rem",
              }}
            >
              {HOW_IT_WORKS.map((block) => (
                <article
                  key={block.step}
                  style={{
                    border: "1px solid rgba(255,255,255,0.1)",
                    background: "#0B0E17",
                    padding: "clamp(2rem, 3vw, 3rem)",
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: "1rem",
                      right: "1.5rem",
                      fontFamily: "var(--font-display)",
                      fontSize: "2.5rem",
                      fontWeight: 900,
                      color: "rgba(255,255,255,0.04)",
                    }}
                  >
                    {block.step}
                  </div>
                  <block.icon
                    size={36}
                    color="#00c8ff"
                    style={{ marginBottom: "1.75rem" }}
                  />
                  <h3
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: "1.35rem",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: "#fff",
                      marginBottom: "1rem",
                    }}
                  >
                    {block.title}
                  </h3>
                  <p
                    style={{
                      color: "#94a3b8",
                      fontSize: "0.95rem",
                      lineHeight: 1.7,
                    }}
                  >
                    {block.desc}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── MAP VETO ─── */}
      <section
        style={{
          width: "100%",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          background: "#080B12",
          overflow: "hidden",
        }}
      >
        <div style={inner}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "0",
            }}
          >
            {/* Left */}
            <div
              style={{
                padding:
                  "clamp(4rem, 7vw, 7rem) clamp(2rem, 4vw, 4rem) clamp(4rem, 7vw, 7rem) 0",
              }}
            >
              <p
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.3em",
                  color: "#00c8ff",
                  marginBottom: "1.25rem",
                }}
              >
                Telemetría en Vivo
              </p>
              <h2
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "clamp(2.5rem, 4vw, 3.5rem)",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  color: "#fff",
                  lineHeight: 1.1,
                  marginBottom: "1.75rem",
                }}
              >
                El Match Empieza
                <br />
                Antes del Juego
              </h2>
              <p
                style={{
                  color: "#94a3b8",
                  fontSize: "1rem",
                  lineHeight: 1.75,
                  marginBottom: "2.5rem",
                  maxWidth: "480px",
                }}
              >
                Desde que entrás a la cola hasta que se dicta un ganador, el
                flujo es en vivo. Los capitanes tienen turnos cronometrados para
                vetar mapas. Si dudás, perdés la ventaja del draft.
              </p>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "1rem",
                }}
              >
                {[
                  "Cola de matchmaking sincrónica",
                  "Veto de mapas con reloj de 30s",
                  "Chat táctico interactivo",
                  "Ajuste de ELO inmediato",
                ].map((feat) => (
                  <div
                    key={feat}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "1rem",
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      color: "#e2e8f0",
                    }}
                  >
                    <Activity size={18} color="#00c8ff" />
                    {feat}
                  </div>
                ))}
              </div>
            </div>

            {/* Right – Draft terminal */}
            <div
              style={{
                borderLeft: "1px solid rgba(255,255,255,0.05)",
                padding:
                  "clamp(4rem, 7vw, 7rem) 0 clamp(4rem, 7vw, 7rem) clamp(2rem, 4vw, 4rem)",
                display: "flex",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "#0A0D14",
                  padding: "clamp(2rem, 3vw, 3rem)",
                  position: "relative",
                  width: "100%",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    right: 0,
                    width: "80px",
                    height: "2px",
                    background:
                      "linear-gradient(to left, transparent, #00c8ff)",
                  }}
                />
                <p
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.2em",
                    color: "#64748b",
                    marginBottom: "2rem",
                  }}
                >
                  Terminal de Draft · Map Veto
                </p>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "2rem",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: "0.9rem",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      color: "#00c8ff",
                    }}
                  >
                    Turno: Alpha Squad
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: "2.5rem",
                      fontWeight: 900,
                      color: "#f0a500",
                    }}
                  >
                    0:27
                  </span>
                </div>
                <div
                  style={{
                    height: "4px",
                    background: "rgba(255,255,255,0.05)",
                    marginBottom: "2rem",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: "85%",
                      background: "linear-gradient(to right, #f0a500, #ef4444)",
                    }}
                  />
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: "0.75rem",
                  }}
                >
                  {[
                    "Jardín del Terror",
                    "Hondonada Maldita",
                    "Templo Celeste",
                    "Torres de la Perdición",
                    "Paso de Alterac",
                  ].map((map, i) => {
                    const banned = i === 2;
                    return (
                      <div
                        key={map}
                        style={{
                          border: `1px solid ${banned ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.1)"}`,
                          background: banned
                            ? "rgba(239,68,68,0.08)"
                            : "rgba(255,255,255,0.03)",
                          padding: "1rem",
                          textAlign: "center",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "0.65rem",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.1em",
                            color: banned ? "rgba(239,68,68,0.7)" : "#94a3b8",
                            textDecoration: banned ? "line-through" : "none",
                          }}
                        >
                          {map}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── RANGOS ─── */}
      <section
        style={{
          position: "relative",
          width: "100%",
          padding: "clamp(4rem, 8vw, 8rem) 0",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: "url('/images/BC-2018-1_1920x1200.jpg')",
            backgroundSize: "cover",
            backgroundPosition: "center",
            opacity: 0.2,
            filter: "grayscale(100%)",
            mixBlendMode: "luminosity",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to bottom, rgba(5,7,10,0.92), rgba(5,7,10,0.98))",
          }}
        />

        <div style={{ ...inner, position: "relative", zIndex: 1 }}>
          <div
            style={{
              display: "flex",
              gap: "4rem",
              alignItems: "flex-end",
              justifyContent: "space-between",
              borderBottom: "1px solid rgba(255,255,255,0.1)",
              paddingBottom: "3.5rem",
              marginBottom: "3.5rem",
              flexWrap: "wrap",
            }}
          >
            <div style={{ maxWidth: "580px" }}>
              <p
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.3em",
                  color: "#00c8ff",
                  marginBottom: "1.25rem",
                }}
              >
                Escalafón Táctico
              </p>
              <h2
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "clamp(3rem, 5vw, 4.5rem)",
                  fontWeight: 900,
                  textTransform: "uppercase",
                  color: "#fff",
                  lineHeight: 1.05,
                  marginBottom: "1.75rem",
                }}
              >
                Tu Lugar <br />
                en la Cadena
              </h2>
              <p
                style={{
                  color: "#cbd5e1",
                  fontSize: "1rem",
                  lineHeight: 1.75,
                  maxWidth: "480px",
                }}
              >
                Sistema ELO estricto. La fórmula ajusta tu MMR basándose en el
                nivel real de tu squad y el enemigo. Las matemáticas no mienten.
              </p>
            </div>
            <div
              style={{
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(0,0,0,0.5)",
                padding: "1.5rem",
                minWidth: "280px",
                maxWidth: "380px",
                flexShrink: 0,
              }}
            >
              <p
                style={{
                  fontSize: "0.65rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.2em",
                  color: "#64748b",
                  marginBottom: "1rem",
                  textAlign: "center",
                }}
              >
                Referencia Pública
              </p>
              <img
                src="/images/ranked.webp"
                alt="Rangos HOTS"
                style={{ width: "100%", opacity: 0.9, mixBlendMode: "screen" }}
              />
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: "1rem",
            }}
          >
            {RANKS.map((rank) => (
              <div
                key={rank.name}
                style={{
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "#0F141F",
                  padding: "1.5rem 1.25rem",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: "10px",
                    height: "10px",
                    background: rank.color,
                    marginBottom: "1.25rem",
                  }}
                />
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "1.1rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "#fff",
                    marginBottom: "0.5rem",
                  }}
                >
                  {rank.name}
                </div>
                <div
                  style={{
                    fontSize: "0.65rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    color: "#64748b",
                    fontFamily: "monospace",
                  }}
                >
                  {rank.range}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── DISCORD ─── */}
      <section
        style={{
          position: "relative",
          width: "100%",
          padding: "clamp(5rem, 10vw, 10rem) 0",
          borderTop: "1px solid rgba(88,101,242,0.2)",
          borderBottom: "1px solid rgba(88,101,242,0.2)",
          background: "rgba(88,101,242,0.04)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse at center, rgba(88,101,242,0.12), transparent 65%)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            ...inner,
            position: "relative",
            zIndex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
          }}
        >
          <Shield
            size={72}
            color="#5865F2"
            style={{ marginBottom: "2.5rem" }}
          />
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(3rem, 7vw, 5.5rem)",
              fontWeight: 900,
              textTransform: "uppercase",
              color: "#fff",
              letterSpacing: "0.05em",
              marginBottom: "1.75rem",
            }}
          >
            Cuartel General
          </h2>
          <p
            style={{
              color: "#cbd5e1",
              fontSize: "clamp(0.95rem, 1.5vw, 1.15rem)",
              lineHeight: 1.75,
              maxWidth: "580px",
              marginBottom: "3.5rem",
            }}
          >
            Toda operación de alto nivel requiere coordinación militar. Entrá a
            nuestra red de Discord para formar squads, reportar incidencias y
            enterarte en vivo de la siguiente rotación de mapas.
          </p>
          <a
            href={import.meta.env.VITE_DISCORD_INVITE || "#"}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "1rem",
              border: "1px solid #5865F2",
              background: "rgba(88,101,242,0.15)",
              color: "#fff",
              padding: "1.25rem 3.5rem",
              fontFamily: "var(--font-display)",
              fontSize: "0.9rem",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.2em",
              textDecoration: "none",
              boxShadow: "0 0 30px rgba(88,101,242,0.2)",
            }}
          >
            <svg width="22" height="22" viewBox="0 0 71 55" fill="currentColor">
              <path d="M60.1 4.9A58.6 58.6 0 0 0 45.5.4a.2.2 0 0 0-.2.1 40.8 40.8 0 0 0-1.8 3.7 54.1 54.1 0 0 0-16.2 0A37.4 37.4 0 0 0 25.5.5a.2.2 0 0 0-.2-.1A58.5 58.5 0 0 0 10.7 4.9a.2.2 0 0 0-.1.1C1.5 18.1-.9 31-.3 43.6a.2.2 0 0 0 .1.2 58.8 58.8 0 0 0 17.7 8.9.2.2 0 0 0 .2-.1 42 42 0 0 0 3.6-5.9.2.2 0 0 0-.1-.3 38.7 38.7 0 0 1-5.5-2.6.2.2 0 0 1 0-.4l1.1-.9a.2.2 0 0 1 .2 0c11.5 5.3 24 5.3 35.4 0a.2.2 0 0 1 .2 0l1.1.8a.2.2 0 0 1 0 .4 36.1 36.1 0 0 1-5.5 2.6.2.2 0 0 0-.1.3 47.1 47.1 0 0 0 3.6 5.9.2.2 0 0 0 .2.1 58.7 58.7 0 0 0 17.8-8.9.2.2 0 0 0 .1-.2c.7-14.4-2.1-27.2-9.7-38.6a.2.2 0 0 0-.1-.1ZM23.7 36.4c-3.5 0-6.4-3.2-6.4-7.1s2.8-7.1 6.4-7.1c3.6 0 6.5 3.2 6.4 7.1 0 3.9-2.8 7.1-6.4 7.1Zm23.7 0c-3.5 0-6.4-3.2-6.4-7.1s2.8-7.1 6.4-7.1c3.6 0 6.5 3.2 6.4 7.1 0 3.9-2.8 7.1-6.4 7.1Z" />
            </svg>
            Conectar al Servidor
          </a>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer
        style={{ background: "#040609", padding: "clamp(3rem, 6vw, 5rem) 0" }}
      >
        <div
          style={{
            ...inner,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "2rem",
            alignItems: "flex-end",
            borderBottom: "1px solid rgba(255,255,255,0.04)",
            paddingBottom: "3rem",
            marginBottom: "2.5rem",
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "1rem",
                marginBottom: "1.5rem",
              }}
            >
              <img
                src="/brand/logo.png"
                alt="NexusGG"
                style={{
                  width: "36px",
                  height: "36px",
                  objectFit: "contain",
                  filter: "grayscale(100%)",
                  opacity: 0.5,
                }}
              />
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "1.1rem",
                  fontWeight: 700,
                  letterSpacing: "0.3em",
                  color: "#475569",
                  textTransform: "uppercase",
                }}
              >
                NexusGG
              </span>
            </div>
            <p
              style={{
                fontSize: "0.8rem",
                color: "#475569",
                lineHeight: 1.8,
                fontFamily: "monospace",
              }}
            >
              Operando como infraestructura táctica independiente.
              <br />
              No afiliado con Blizzard Entertainment.
              <br />
              Heroes of the Storm es marca registrada.
            </p>
          </div>
          <div
            style={{
              display: "flex",
              gap: "2.5rem",
              justifyContent: "flex-end",
            }}
          >
            {["Documentación", "Términos", "Privacidad"].map((link) => (
              <a
                key={link}
                href="#"
                style={{
                  fontSize: "0.7rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.15em",
                  color: "#475569",
                  textDecoration: "none",
                  fontWeight: 700,
                }}
              >
                {link}
              </a>
            ))}
          </div>
        </div>
        <div style={inner}>
          <p
            style={{
              fontSize: "0.65rem",
              color: "#334155",
              textTransform: "uppercase",
              letterSpacing: "0.2em",
              textAlign: "center",
            }}
          >
            © {new Date().getFullYear()} NexusGG · All Systems Operational
          </p>
        </div>
      </footer>
    </main>
  );
}
