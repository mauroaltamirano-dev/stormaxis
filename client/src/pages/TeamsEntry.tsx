import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Plus, Search, Users } from "lucide-react";
import { api } from "../lib/api";
import { CountryBadge } from "../components/CountryBadge";
import { PageHeader } from "../components/PageHeader";
import { buildActionClassName } from "../components/ui";
import { getRankMetaFromMmr } from "../lib/ranks";

type TeamMember = {
  userId: string;
  role: "OWNER" | "CAPTAIN" | "MEMBER";
  user: {
    mmr: number;
    isBot?: boolean;
  };
};

type TeamSummary = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  bannerUrl?: string | null;
  description?: string | null;
  countryCode?: string | null;
  ownerId: string;
  members: TeamMember[];
};

type JoinRequest = {
  id: string;
  teamId: string;
  status: string;
};

type TeamsEntryHubResponse = {
  myTeam: TeamSummary | null;
  myRole: "OWNER" | "CAPTAIN" | "MEMBER" | null;
  sentJoinRequests: JoinRequest[];
  teamDirectory: TeamSummary[];
};

export default function TeamsEntry() {
  const [data, setData] = useState<TeamsEntryHubResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [description, setDescription] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    api.get<TeamsEntryHubResponse>("/teams/hub")
      .then(({ data }) => { if (alive) setData(data); })
      .catch((err) => { if (alive) setError(err.response?.data?.message ?? "No se pudo cargar equipos."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const pendingByTeamId = useMemo(() => new Set((data?.sentJoinRequests ?? []).filter((request) => request.status === "PENDING").map((request) => request.teamId)), [data?.sentJoinRequests]);
  const visibleTeams = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const teams = (data?.teamDirectory ?? []).filter((team) => team.id !== data?.myTeam?.id);
    if (!normalizedQuery) return teams;
    return teams.filter((team) => [team.name, team.description ?? "", team.countryCode ?? ""].some((value) => value.toLowerCase().includes(normalizedQuery)));
  }, [data?.myTeam?.id, data?.teamDirectory, query]);

  async function createTeam() {
    if (teamName.trim().length < 2) {
      setError("Ingresá un nombre de equipo válido.");
      return;
    }
    setCreating(true);
    setError(null);
    setNotice(null);
    try {
      const { data: created } = await api.post<{ team: TeamSummary }>("/teams", {
        name: teamName.trim(),
        logoUrl: logoUrl.trim() || null,
        bannerUrl: bannerUrl.trim() || null,
        description: description.trim() || null,
      });
      setNotice("Equipo creado. Abriendo perfil...");
      await navigate({ to: "/teams/$slug", params: { slug: created.team.slug } });
    } catch (err: any) {
      setError(err.response?.data?.error?.message ?? err.response?.data?.message ?? "No se pudo crear el equipo.");
    } finally {
      setCreating(false);
    }
  }

  if (loading) return <TeamsEntrySkeleton />;

  return (
    <div className="storm-page" style={styles.page}>
      <PageHeader
        eyebrow="Equipos"
        title="Centro de equipos"
        icon={<Users size={18} />}
        description="Gestioná tu equipo desde su perfil público y explorá el resto de equipos registrados en StormAxis."
      />

      {error ? <div style={styles.error}>{error}</div> : null}
      {notice ? <div style={styles.notice}>{notice}</div> : null}

      <section style={styles.directoryPanel}>
        <div style={styles.directoryHead}>
          <div>
            <p style={styles.eyebrow}>Mi equipo</p>
            <h2 style={styles.sectionTitle}>{data?.myTeam ? "Tu escuadra activa" : "Crear equipo"}</h2>
          </div>
        </div>
        {data?.myTeam ? (
          <MyTeamAccessCard team={data.myTeam} role={data.myRole} />
        ) : (
          <NoTeamCreatePanel
            open={createOpen}
            busy={creating}
            teamName={teamName}
            logoUrl={logoUrl}
            bannerUrl={bannerUrl}
            description={description}
            setOpen={setCreateOpen}
            setTeamName={setTeamName}
            setLogoUrl={setLogoUrl}
            setBannerUrl={setBannerUrl}
            setDescription={setDescription}
            onCreate={createTeam}
          />
        )}
      </section>

      <section style={styles.directoryPanel}>
        <div style={styles.directoryHead}>
          <div>
            <p style={styles.eyebrow}>Directorio público</p>
            <h2 style={styles.sectionTitle}>Equipos creados</h2>
          </div>
          <label style={styles.searchBox}>
            <Search size={15} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar equipo..." style={styles.searchInput} />
          </label>
        </div>

        {visibleTeams.length === 0 ? (
          <div style={styles.emptyState}>No hay equipos para mostrar todavía.</div>
        ) : (
          <div style={styles.teamGrid}>
            {visibleTeams.map((team) => (
              <TeamDirectoryCard key={team.id} team={team} pending={pendingByTeamId.has(team.id)} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function NoTeamCreatePanel({
  open, busy, teamName, logoUrl, bannerUrl, description,
  setOpen, setTeamName, setLogoUrl, setBannerUrl, setDescription, onCreate,
}: {
  open: boolean;
  busy: boolean;
  teamName: string;
  logoUrl: string;
  bannerUrl: string;
  description: string;
  setOpen: (value: boolean) => void;
  setTeamName: (value: string) => void;
  setLogoUrl: (value: string) => void;
  setBannerUrl: (value: string) => void;
  setDescription: (value: string) => void;
  onCreate: () => void;
}) {
  if (!open) {
    return (
      <div style={styles.createEmpty}>
        <div>
          <p style={styles.copy}>Todavía no pertenecés a ningún equipo. Creá uno para configurar perfil, invitar miembros y administrar solicitudes desde su perfil público.</p>
        </div>
        <button type="button" style={styles.createButton} onClick={() => setOpen(true)}>
          <Plus size={15} /> Crear equipo
        </button>
      </div>
    );
  }

  return (
    <div style={styles.createForm}>
      <label style={styles.field}>Nombre del equipo<input style={styles.input} value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Ej: Zer0k" disabled={busy} /></label>
      <label style={styles.field}>Logo URL<input style={styles.input} value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://..." disabled={busy} /></label>
      <label style={styles.field}>Banner URL<input style={styles.input} value={bannerUrl} onChange={(e) => setBannerUrl(e.target.value)} placeholder="https://..." disabled={busy} /></label>
      <label style={{ ...styles.field, gridColumn: "1 / -1" }}>Descripción<textarea style={styles.textarea} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Contá qué busca tu equipo..." disabled={busy} /></label>
      <div style={styles.createActions}>
        <button type="button" style={styles.cancelButton} onClick={() => setOpen(false)} disabled={busy}>Cancelar</button>
        <button type="button" style={styles.createButton} onClick={onCreate} disabled={busy}>{busy ? "Creando..." : "Crear equipo"}</button>
      </div>
    </div>
  );
}

function MyTeamAccessCard({ team, role }: { team: TeamSummary; role: "OWNER" | "CAPTAIN" | "MEMBER" | null }) {
  const avgMmr = getAverageMmr(team.members);
  const rankMeta = getRankMetaFromMmr(avgMmr);
  const canManage = role === "OWNER" || role === "CAPTAIN";
  return (
    <section style={styles.myTeamHero}>
      <div style={styles.banner}>
        {team.bannerUrl ? <img src={team.bannerUrl} alt="" style={styles.bannerImg} /> : null}
      </div>
      <div style={styles.myTeamContent}>
        <TeamLogo team={team} size={78} />
        <div style={styles.myTeamCopy}>
          <span style={styles.eyebrow}>{role ? `Rol ${role}` : "Tu equipo"}</span>
          <h2 style={styles.heroTitle}>{team.name}</h2>
          <p style={styles.copy}>{canManage ? "Desde el perfil del equipo podés editar configuración, roster, invitaciones y solicitudes." : "Entrá al perfil para ver roster, estadísticas y estado competitivo."}</p>
          <div style={styles.metaRow}>
            <span style={styles.metaPill}><CountryBadge countryCode={team.countryCode} compact /> País</span>
            <span style={styles.metaPill}><Users size={13} /> {team.members.length} miembros</span>
            <span style={styles.metaPill}><img src={rankMeta.iconSrc} alt="" style={styles.rankMini} /> {avgMmr.toLocaleString("es-AR")} MMR prom.</span>
          </div>
        </div>
        <Link className={buildActionClassName({ variant: "primary", size: "md" })} to="/teams/$slug" params={{ slug: team.slug }}>
          Entrar al perfil <ArrowRight size={15} />
        </Link>
      </div>
    </section>
  );
}

function TeamDirectoryCard({ team, pending }: { team: TeamSummary; pending: boolean }) {
  const avgMmr = getAverageMmr(team.members);
  const rankMeta = getRankMetaFromMmr(avgMmr);
  return (
    <article style={styles.teamCard}>
      <div style={styles.cardBanner}>{team.bannerUrl ? <img src={team.bannerUrl} alt="" style={styles.bannerImg} /> : null}</div>
      <div style={styles.cardBody}>
        <TeamLogo team={team} size={48} />
        <div style={styles.cardCopy}>
          <h3 style={styles.cardTitle}>{team.name}</h3>
          <p style={styles.cardDesc}>{team.description || "Equipo competitivo de StormAxis."}</p>
          <div style={styles.metaRowCompact}>
            <span style={styles.metaPill}><CountryBadge countryCode={team.countryCode} compact /></span>
            <span style={styles.metaPill}><Users size={12} /> {team.members.length}</span>
            <span style={styles.metaPill}><img src={rankMeta.iconSrc} alt="" style={styles.rankMini} /> {avgMmr.toLocaleString("es-AR")}</span>
            {pending ? <span style={styles.pendingPill}>Pendiente</span> : null}
          </div>
        </div>
      </div>
      <Link className={buildActionClassName({ variant: "secondary", size: "sm" })} to="/teams/$slug" params={{ slug: team.slug }}>
        Ver perfil
      </Link>
    </article>
  );
}

function TeamLogo({ team, size }: { team: TeamSummary; size: number }) {
  return (
    <div style={{ ...styles.logo, width: size, height: size, fontSize: Math.max(16, size * 0.32) }}>
      {team.logoUrl ? <img src={team.logoUrl} alt={team.name} style={styles.logoImg} /> : team.name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function TeamsEntrySkeleton() {
  return (
    <div className="storm-page" style={styles.page} aria-busy="true">
      <section style={styles.loadingCard}>
        <span style={styles.pulse} />
        <p style={styles.eyebrow}>StormAxis Teams</p>
        <h1 style={styles.heroTitle}>Cargando equipos…</h1>
      </section>
    </div>
  );
}

function getAverageMmr(members: TeamMember[]) {
  const real = members.filter((member) => !member.user.isBot);
  if (!real.length) return 0;
  return Math.round(real.reduce((sum, member) => sum + member.user.mmr, 0) / real.length);
}

const styles: Record<string, CSSProperties> = {
  page: { display: "grid", gap: "1.1rem" },
  error: { border: "1px solid rgba(255,90,120,.28)", borderRadius: 14, padding: "0.85rem 1rem", color: "#ff9bb0", background: "rgba(255,65,94,.08)", fontWeight: 800 },
  notice: { border: "1px solid rgba(34,197,94,.26)", borderRadius: 14, padding: "0.85rem 1rem", color: "#bbf7d0", background: "rgba(34,197,94,.08)", fontWeight: 800 },
  loadingCard: { minHeight: 320, display: "grid", placeItems: "center", alignContent: "center", gap: ".8rem", border: "1px solid rgba(93,207,255,.22)", borderRadius: 24, background: "linear-gradient(145deg, rgba(10,22,46,.94), rgba(6,14,30,.92))" },
  pulse: { width: 42, height: 42, borderRadius: "50%", border: "3px solid rgba(55,217,255,.18)", borderTopColor: "#37d9ff", animation: "spin 900ms linear infinite" },
  eyebrow: { margin: 0, color: "#37d9ff", fontSize: ".72rem", fontWeight: 950, letterSpacing: ".18em", textTransform: "uppercase" },
  sectionTitle: { margin: ".2rem 0 0", color: "#f8fbff", fontFamily: "var(--font-display)", fontSize: "1.45rem", fontWeight: 950, letterSpacing: ".06em", textTransform: "uppercase" },
  heroTitle: { margin: ".2rem 0", color: "#fff", fontFamily: "var(--font-display)", fontSize: "clamp(1.8rem, 4vw, 3rem)", lineHeight: .95, fontWeight: 950, letterSpacing: ".04em", textTransform: "uppercase" },
  copy: { margin: 0, color: "rgba(210,224,255,.68)", lineHeight: 1.5 },
  myTeamHero: { position: "relative", overflow: "hidden", border: "1px solid rgba(93,207,255,.22)", borderRadius: 24, background: "linear-gradient(145deg, rgba(10,22,46,.96), rgba(6,14,30,.94))", boxShadow: "0 26px 70px rgba(0,0,0,.34)" },
  banner: { position: "absolute", inset: 0, opacity: .26, background: "radial-gradient(circle at 20% 20%, rgba(55,217,255,.2), transparent 32%), radial-gradient(circle at 82% 16%, rgba(155,85,255,.22), transparent 34%)" },
  bannerImg: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
  myTeamContent: { position: "relative", display: "grid", gridTemplateColumns: "auto minmax(0,1fr) auto", alignItems: "center", gap: "1rem", padding: "clamp(1.1rem, 3vw, 1.8rem)" },
  myTeamCopy: { minWidth: 0, display: "grid", gap: ".45rem" },
  logo: { display: "grid", placeItems: "center", overflow: "hidden", borderRadius: 18, border: "1px solid rgba(93,207,255,.32)", background: "linear-gradient(135deg, rgba(55,217,255,.14), rgba(139,92,246,.16))", color: "#37d9ff", fontWeight: 950, boxShadow: "0 0 24px rgba(55,217,255,.14)" },
  logoImg: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
  metaRow: { display: "flex", flexWrap: "wrap", gap: ".45rem" },
  metaRowCompact: { display: "flex", flexWrap: "wrap", gap: ".35rem", alignItems: "center" },
  metaPill: { minHeight: 24, display: "inline-flex", alignItems: "center", gap: ".35rem", border: "1px solid rgba(126,170,255,.16)", borderRadius: 999, padding: ".18rem .55rem", background: "rgba(9,20,40,.58)", color: "rgba(218,230,255,.82)", fontSize: ".72rem", fontWeight: 850 },
  pendingPill: { minHeight: 24, display: "inline-flex", alignItems: "center", border: "1px solid rgba(255,207,112,.26)", borderRadius: 999, padding: ".18rem .55rem", background: "rgba(255,184,77,.09)", color: "#ffcf70", fontSize: ".72rem", fontWeight: 900 },
  rankMini: { width: 18, height: 18, objectFit: "contain" },
  directoryPanel: { display: "grid", gap: "1rem", border: "1px solid rgba(93,207,255,.18)", borderRadius: 22, padding: "1rem", background: "linear-gradient(145deg, rgba(10,22,46,.82), rgba(6,14,30,.84))" },
  directoryHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" },
  searchBox: { minWidth: "min(340px,100%)", height: 42, display: "flex", alignItems: "center", gap: ".55rem", border: "1px solid rgba(126,170,255,.18)", borderRadius: 12, padding: "0 .85rem", background: "rgba(4,10,24,.72)", color: "rgba(180,205,245,.72)" },
  searchInput: { flex: 1, minWidth: 0, border: 0, outline: 0, background: "transparent", color: "#e8f2ff", fontWeight: 800 },
  teamGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: ".85rem" },
  teamCard: { minWidth: 0, overflow: "hidden", display: "grid", gap: ".75rem", border: "1px solid rgba(126,170,255,.16)", borderRadius: 18, padding: ".75rem", background: "rgba(5,12,28,.64)" },
  cardBanner: { height: 72, margin: "-.75rem -.75rem 0", background: "radial-gradient(circle at 20% 20%, rgba(55,217,255,.18), transparent 34%), linear-gradient(135deg, rgba(12,28,54,.9), rgba(17,17,44,.9))" },
  cardBody: { display: "grid", gridTemplateColumns: "auto minmax(0,1fr)", gap: ".75rem", alignItems: "center" },
  cardCopy: { minWidth: 0, display: "grid", gap: ".35rem" },
  cardTitle: { margin: 0, color: "#fff", fontSize: "1rem", fontWeight: 950, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  cardDesc: { minHeight: 34, margin: 0, color: "rgba(190,207,240,.62)", fontSize: ".8rem", lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" },
  emptyState: { minHeight: 180, display: "grid", placeItems: "center", border: "1px dashed rgba(126,170,255,.2)", borderRadius: 16, color: "rgba(190,207,240,.68)", fontWeight: 800 },
  createEmpty: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap", border: "1px dashed rgba(126,170,255,.2)", borderRadius: 16, padding: "1rem", background: "rgba(5,12,28,.46)" },
  createForm: { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: ".85rem", border: "1px solid rgba(126,170,255,.16)", borderRadius: 16, padding: "1rem", background: "rgba(5,12,28,.56)" },
  field: { display: "grid", gap: ".35rem", color: "rgba(190,207,240,.78)", fontSize: ".72rem", fontWeight: 950, letterSpacing: ".12em", textTransform: "uppercase" },
  input: { width: "100%", minHeight: 42, border: "1px solid rgba(126,170,255,.18)", borderRadius: 11, background: "rgba(4,10,24,.72)", color: "#e8f2ff", padding: "0 .85rem", outline: 0, fontWeight: 800 },
  textarea: { width: "100%", minHeight: 92, border: "1px solid rgba(126,170,255,.18)", borderRadius: 11, background: "rgba(4,10,24,.72)", color: "#e8f2ff", padding: ".75rem .85rem", outline: 0, fontWeight: 800, resize: "vertical" },
  createActions: { gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", gap: ".6rem", flexWrap: "wrap" },
  createButton: { minHeight: 38, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: ".45rem", border: "1px solid rgba(55,217,255,.34)", borderRadius: 10, background: "linear-gradient(135deg, rgba(39,124,255,.86), rgba(155,85,255,.72))", color: "#fff", padding: "0 .95rem", fontWeight: 950, cursor: "pointer" },
  cancelButton: { minHeight: 38, border: "1px solid rgba(126,170,255,.16)", borderRadius: 10, background: "rgba(5,12,28,.58)", color: "rgba(218,230,255,.82)", padding: "0 .95rem", fontWeight: 900, cursor: "pointer" },
};
