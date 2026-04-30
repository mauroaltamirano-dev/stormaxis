import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { AlertCircle, RefreshCw, Sparkles, Swords, Users } from "lucide-react";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";
import { PageHeader } from "../components/PageHeader";
import {
  computeScrimCommandSnapshot,
  getScrimChallengeActionState,
  type Metric,
} from "./teamsScrimsUi";

type TeamMember = {
  id: string;
  userId: string;
  role: "OWNER" | "CAPTAIN" | "MEMBER";
  competitiveRole?: "UNASSIGNED" | "CAPTAIN" | "STARTER" | "SUBSTITUTE" | "COACH" | "STAFF";
  user: { id: string; username: string; avatar: string | null; mmr: number; rank?: string; isBot?: boolean };
};

type Team = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  members: TeamMember[];
};

type ScrimSearch = {
  id: string;
  teamId: string;
  status: string;
  starterUserIds: string[];
  coachUserId: string | null;
  observerUserIds: string[] | null;
  notes: string | null;
  createdAt: string;
  team: Team;
};

type ScrimChallenge = {
  id: string;
  fromTeam: { id: string; name: string; logoUrl?: string | null };
  toTeam: { id: string; name: string; logoUrl?: string | null };
  fromSearch: ScrimSearch;
  toSearch: ScrimSearch;
};

type ScrimsResponse = {
  myTeam: Team | null;
  myRole: "OWNER" | "CAPTAIN" | "MEMBER" | null;
  searches: ScrimSearch[];
  incomingChallenges: ScrimChallenge[];
  outgoingChallenges: ScrimChallenge[];
  onlineUserIds: string[];
};

const panelBase: CSSProperties = {
  border: "1px solid var(--nexus-border)",
  background: "var(--nexus-card)",
};

export default function Scrims() {
  const navigate = useNavigate();
  const [data, setData] = useState<ScrimsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [starters, setStarters] = useState<string[]>([]);
  const [coachUserId, setCoachUserId] = useState("");
  const [observerUserIds, setObserverUserIds] = useState<string[]>([]);

  const onlineUserIds = useMemo(() => new Set(data?.onlineUserIds ?? []), [data?.onlineUserIds]);
  const canManage = data?.myRole === "OWNER" || data?.myRole === "CAPTAIN";
  const myOpenSearch = data?.searches.find((search) => search.teamId === data.myTeam?.id) ?? null;
  const catalog = data?.searches.filter((search) => search.teamId !== data.myTeam?.id) ?? [];
  const myHumanMembers = data?.myTeam?.members.filter((member) => !member.user.isBot) ?? [];
  const myBotCount = data?.myTeam?.members.filter((member) => member.user.isBot).length ?? 0;
  const myOnlineCount = myHumanMembers.filter((member) => onlineUserIds.has(member.userId)).length;

  const commandSnapshot = useMemo(() => computeScrimCommandSnapshot({
    hasTeam: Boolean(data?.myTeam),
    canManage: Boolean(canManage),
    hasPublishedSearch: Boolean(myOpenSearch),
    startersSelected: starters.length,
    incomingChallenges: data?.incomingChallenges.length ?? 0,
    outgoingChallenges: data?.outgoingChallenges.length ?? 0,
    openCatalogRooms: catalog.length,
  }), [
    canManage,
    myOpenSearch,
    starters.length,
    data?.myTeam,
    data?.incomingChallenges.length,
    data?.outgoingChallenges.length,
    catalog.length,
  ]);

  const challengeActionState = useMemo(() => getScrimChallengeActionState({
    hasTeam: Boolean(data?.myTeam),
    canManage: Boolean(canManage),
    hasPublishedSearch: Boolean(myOpenSearch),
  }), [data?.myTeam, canManage, myOpenSearch]);

  async function refresh(options?: { soft?: boolean; silentErrors?: boolean }) {
    const soft = options?.soft ?? Boolean(data);
    if (!soft) setLoading(true);
    if (soft) setRefreshing(true);
    if (!options?.silentErrors) setError(null);
    try {
      const response = await api.get<ScrimsResponse>("/scrims");
      setData(response.data);
    } catch (err: any) {
      if (!options?.silentErrors) setError(err.response?.data?.message ?? "No se pudo cargar scrims.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  useEffect(() => {
    const socket = getSocket();
    const onRefresh = () => { void refresh({ soft: true, silentErrors: true }); };
    socket.on("scrims:search_updated", onRefresh);
    socket.on("scrims:challenge_updated", onRefresh);
    socket.on("teams:updated", onRefresh);
    socket.on("teams:invite_updated", onRefresh);
    socket.on("teams:join_request_updated", onRefresh);
    return () => {
      socket.off("scrims:search_updated", onRefresh);
      socket.off("scrims:challenge_updated", onRefresh);
      socket.off("teams:updated", onRefresh);
      socket.off("teams:invite_updated", onRefresh);
      socket.off("teams:join_request_updated", onRefresh);
    };
  }, []);

  async function runAction(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (err: any) {
      setError(err.response?.data?.message ?? err.message ?? "No se pudo completar la acción.");
    } finally {
      setBusy(false);
    }
  }

  function toggleStarter(userId: string) {
    setStarters((current) => current.includes(userId)
      ? current.filter((id) => id !== userId)
      : current.length < 5
        ? [...current, userId]
        : current,
    );
  }

  function toggleObserver(userId: string) {
    setObserverUserIds((current) => current.includes(userId)
      ? current.filter((id) => id !== userId)
      : current.length < 2
        ? [...current, userId]
        : current,
    );
  }

  function publishSearch() {
    const teamId = data?.myTeam?.id;
    if (!teamId) return;
    void runAction(async () => {
      await api.post("/scrims/searches", {
        teamId,
        starterUserIds: starters,
        coachUserId: coachUserId || null,
        observerUserIds,
        notes,
      });
      setNotice("Búsqueda publicada.");
      setNotes("");
      await refresh();
    });
  }

  function challenge(toSearchId: string) {
    if (!myOpenSearch) return;
    void runAction(async () => {
      await api.post("/scrims/challenges", { fromSearchId: myOpenSearch.id, toSearchId });
      setNotice("Solicitud enviada.");
      await refresh();
    });
  }

  function acceptChallenge(challengeId: string) {
    void runAction(async () => {
      const response = await api.post<{ matchId: string }>(`/scrims/challenges/${challengeId}/accept`);
      navigate({ to: "/match/$matchId", params: { matchId: response.data.matchId } });
    });
  }

  function declineChallenge(challengeId: string) {
    void runAction(async () => {
      await api.post(`/scrims/challenges/${challengeId}/decline`);
      setNotice("Solicitud rechazada.");
      await refresh();
    });
  }

  if (loading) {
    return (
      <div style={styles.page}>
        <section style={styles.skeletonHero}>
          <div style={styles.skeletonLineLg} />
          <div style={styles.skeletonLineMd} />
          <div style={styles.metricGrid}>{Array.from({ length: 3 }).map((_, idx) => <div key={idx} style={styles.metricSkeleton} />)}</div>
        </section>
        <section style={styles.panel}><div style={styles.listSkeleton} /></section>
        <section style={styles.panel}><div style={styles.listSkeleton} /></section>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <PageHeader
        eyebrow="Scrims"
        title="Equipo vs Equipo"
        icon={<Swords size={18} />}
        description="Busca rival, envía desafíos y juega scrims con flujo competitivo completo."
        actions={<Link to="/teams" style={styles.secondaryButton} className="nx-interactive">Gestionar equipo</Link>}
        stats={<div style={styles.headerStats}>
          <Stat label="Salas" value={String(data?.searches.length ?? 0)} />
          <Stat label="Retos" value={String((data?.incomingChallenges.length ?? 0) + (data?.outgoingChallenges.length ?? 0))} />
          <Stat label="Mi equipo" value={data?.myTeam ? "Activo" : "No"} />
        </div>}
      />

      {error && <div style={styles.error}>{error}</div>}
      {notice && <div style={styles.notice}>{notice}</div>}
      {refreshing && !loading && <p style={styles.smallMuted}>Actualizando scrims...</p>}

      <section style={styles.panelAccent}>
        <SectionTitle
          eyebrow="Centro de comando"
          title={commandSnapshot.readinessLabel}
          meta={<StatusChip tone={commandSnapshot.badgeTone}>{commandSnapshot.readinessLabel}</StatusChip>}
          icon={<Sparkles size={14} />}
        />
        <p style={styles.muted}>{challengeActionState.hint}</p>
        <MetricGrid metrics={commandSnapshot.stats} />
      </section>

      {!data?.myTeam ? (
        <section style={styles.panel}>
          <div style={styles.alert}><AlertCircle size={16} /><span>Necesitas un equipo para jugar scrims.</span></div>
          <p style={styles.muted}>Crea o únete a un equipo desde la página de equipos y vuelve aquí para publicar búsqueda o aceptar desafíos.</p>
          <Link to="/teams" style={styles.primaryButton} className="nx-interactive">Ir a Equipos</Link>
        </section>
      ) : (
        <section style={styles.commandGrid}>
          <article style={styles.panel}>
            <SectionTitle eyebrow="Mi equipo" title={data.myTeam.name} meta={<StatusChip tone="info">Rol {data.myRole}</StatusChip>} />
            <div style={styles.pillRow}>
              <StatusChip tone="success">{myOnlineCount}/{myHumanMembers.length || data.myTeam.members.length} humanos online</StatusChip>
              {myBotCount > 0 && <StatusChip tone="info">{myBotCount} bots</StatusChip>}
              <StatusChip tone={myOpenSearch ? "warn" : "muted"}>{myOpenSearch ? "Buscando" : "Standby"}</StatusChip>
            </div>
            <div style={styles.memberGrid}>{data.myTeam.members.map((member) => (
              <MemberCard key={member.userId} member={member} online={onlineUserIds.has(member.userId)} />
            ))}</div>
          </article>

          <article style={styles.panel}>
            <SectionTitle eyebrow="Buscar partida" title={myOpenSearch ? "Sala publicada" : "Seleccionar titulares"} meta={<StatusChip tone="info">5 titulares</StatusChip>} />
            {canManage ? myOpenSearch ? (
              <PublishedSearch search={myOpenSearch} team={data.myTeam} />
            ) : (
              <>
                <RosterPicker
                  members={data.myTeam.members}
                  onlineUserIds={onlineUserIds}
                  starters={starters}
                  coachUserId={coachUserId}
                  observerUserIds={observerUserIds}
                  onStarter={toggleStarter}
                  onCoach={setCoachUserId}
                  onObserver={toggleObserver}
                />
                <textarea style={styles.textarea} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Notas opcionales" />
                <div style={styles.builderFooter}>
                  <span style={styles.muted}>Titulares: <strong style={{ color: starters.length === 5 ? "#22c55e" : "#f59e0b" }}>{starters.length}/5</strong></span>
                  <button style={styles.primaryButton} className="nx-interactive" disabled={busy || starters.length !== 5} onClick={publishSearch}>Publicar búsqueda</button>
                </div>
                <p style={styles.smallMuted}>Cada equipo necesita al menos 1 titular real online.</p>
              </>
            ) : <p style={styles.muted}>No tienes permisos para publicar búsqueda.</p>}
          </article>
        </section>
      )}

      {(data?.incomingChallenges.length ?? 0) > 0 && (
        <section style={styles.panel}>
          <SectionTitle eyebrow="Retos" title="Solicitudes recibidas" />
          <div style={styles.cardGrid}>{data!.incomingChallenges.map((challengeItem) => (
            <ChallengeCard key={challengeItem.id} challenge={challengeItem} busy={busy} onAccept={acceptChallenge} onDecline={declineChallenge} />
          ))}</div>
        </section>
      )}

      <section id="catalog" style={styles.panel}>
        <SectionTitle
          eyebrow="Catálogo"
          title="Salas disponibles"
          meta={<StatusChip tone="muted">{challengeActionState.label}</StatusChip>}
          actions={<button
            type="button"
            style={styles.ghostButton}
            className="nx-interactive"
            disabled={busy || refreshing}
            onClick={() => { void refresh({ soft: true }); }}
          >
            <RefreshCw size={14} /> {refreshing ? "Actualizando..." : "Refrescar lista"}
          </button>}
        />
        {catalog.length === 0 ? <EmptyState /> : <div style={styles.catalogGrid}>{catalog.map((search) => (
          <ScrimRoomCard key={search.id} search={search} disabled={busy || challengeActionState.disabled} onChallenge={challenge} disabledReason={challengeActionState.hint} />
        ))}</div>}
      </section>

      <section style={styles.panel}>
        <SectionTitle eyebrow="Outbox" title="Solicitudes enviadas" />
        {data?.outgoingChallenges.length ? data.outgoingChallenges.map((challengeItem) => <p key={challengeItem.id} style={styles.line}>Pendiente vs <strong>{challengeItem.toTeam.name}</strong></p>) : <EmptyState text="Sin solicitudes pendientes." />}
      </section>
    </div>
  );
}

function SectionTitle({
  eyebrow,
  title,
  meta,
  icon,
  actions,
}: {
  eyebrow: string;
  title: string;
  meta?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
}) {
  return <div style={styles.sectionTitleRow}>
    <div><p style={styles.eyebrow}>{icon ? <span style={{ marginRight: 6 }}>{icon}</span> : null}{eyebrow}</p><h2 style={styles.sectionTitle}>{title}</h2></div>
    <div style={styles.sectionHeaderActions}>
      {meta}
      {actions}
    </div>
  </div>;
}

function MetricGrid({ metrics }: { metrics: Metric[] }) {
  return <div style={styles.metricGrid}>{metrics.map((metric) => (
    <div key={metric.label} style={styles.metricTile}><strong>{metric.value}</strong><span>{metric.label}</span></div>
  ))}</div>;
}

function StatusChip({ tone, children }: { tone: "success" | "warn" | "info" | "muted" | "danger"; children: ReactNode }) {
  const toneStyle = tone === "success"
    ? styles.chipSuccess
    : tone === "warn"
      ? styles.chipWarn
      : tone === "info"
        ? styles.chipInfo
        : tone === "danger"
          ? styles.chipDanger
          : styles.chipMuted;
  return <span style={{ ...styles.chip, ...toneStyle }}>{children}</span>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div style={styles.stat}><strong>{value}</strong><span>{label}</span></div>;
}

function TeamBadge({ name, logoUrl, large = false }: { name: string; logoUrl: string | null; large?: boolean }) {
  const size = large ? 64 : 40;
  return <div style={{ ...styles.teamBadge, width: size, height: size }}>{logoUrl ? <img src={logoUrl} alt="" style={{ width: size, height: size, objectFit: "cover" }} /> : name.slice(0, 2).toUpperCase()}</div>;
}

function Avatar({ user }: { user: { username: string; avatar: string | null } }) {
  return <div style={styles.avatar}>{user.avatar ? <img src={user.avatar} alt="" style={styles.avatarImg} /> : user.username.slice(0, 2).toUpperCase()}</div>;
}

function MemberCard({ member, online }: { member: TeamMember; online: boolean }) {
  const isBot = Boolean(member.user.isBot);
  return <div style={isBot ? styles.memberBot : online ? styles.memberOnline : styles.memberCard}>
    <Avatar user={member.user} />
    <div style={{ minWidth: 0 }}>
      <strong style={styles.truncate}>{member.user.username}</strong>
      <span style={styles.smallMuted}>{member.role}{member.competitiveRole && member.competitiveRole !== "UNASSIGNED" ? ` · ${member.competitiveRole}` : ""}{isBot ? " · BOT" : ` · ${online ? "online" : "offline"}`}</span>
    </div>
  </div>;
}

function RoleToggle({ label, checked, disabled, onChange, type = "checkbox" }: { label: string; checked: boolean; disabled: boolean; onChange: () => void; type?: "checkbox" | "radio" }) {
  return <label style={checked ? styles.toggleChecked : styles.toggle}><input type={type} disabled={disabled} checked={checked} onChange={onChange} />{label}</label>;
}

function RosterPicker({ members, onlineUserIds, starters, coachUserId, observerUserIds, onStarter, onCoach, onObserver }: {
  members: TeamMember[];
  onlineUserIds: Set<string>;
  starters: string[];
  coachUserId: string;
  observerUserIds: string[];
  onStarter: (userId: string) => void;
  onCoach: (userId: string) => void;
  onObserver: (userId: string) => void;
}) {
  return <div style={styles.pickerGrid}>{members.map((member) => {
    const online = onlineUserIds.has(member.userId);
    const isBot = Boolean(member.user.isBot);
    const isStarter = starters.includes(member.userId);
    return <div key={member.userId} style={isStarter ? styles.pickerSelected : styles.pickerCard}>
      <MemberCard member={member} online={online} />
      <div style={styles.toggleRow}>
        <RoleToggle label="Titular" disabled={(!online && !isBot) || (!isStarter && starters.length >= 5)} checked={isStarter} onChange={() => onStarter(member.userId)} />
        <RoleToggle label="Coach" type="radio" disabled={isBot || !online || isStarter} checked={coachUserId === member.userId} onChange={() => onCoach(coachUserId === member.userId ? "" : member.userId)} />
        <RoleToggle label="Obs" disabled={isBot || !online || isStarter || coachUserId === member.userId || (!observerUserIds.includes(member.userId) && observerUserIds.length >= 2)} checked={observerUserIds.includes(member.userId)} onChange={() => onObserver(member.userId)} />
      </div>
    </div>;
  })}</div>;
}

function PublishedSearch({ search, team }: { search: ScrimSearch; team: Team }) {
  return <div style={styles.publishedBox}>
    <TeamBadge name={team.name} logoUrl={team.logoUrl} large />
    <div><strong>{team.name}</strong><p style={styles.muted}>Sala #{search.id.slice(-5).toUpperCase()} visible en catálogo.</p></div>
    <div style={styles.pillRow}><StatusChip tone="info">5 titulares</StatusChip><StatusChip tone="info">{search.coachUserId ? "Coach" : "Sin coach"}</StatusChip><StatusChip tone="info">{(search.observerUserIds ?? []).length}/2 obs</StatusChip></div>
  </div>;
}

function ScrimRoomCard({
  search,
  disabled,
  onChallenge,
  disabledReason,
}: {
  search: ScrimSearch;
  disabled: boolean;
  onChallenge: (id: string) => void;
  disabledReason: string;
}) {
  const starters = getMembersByIds(search.team, search.starterUserIds);
  return <article style={styles.roomCard}>
    <div style={styles.roomHeader}><TeamBadge name={search.team.name} logoUrl={search.team.logoUrl} /><div><h3 style={styles.roomTitle}>{search.team.name}</h3><p style={styles.smallMuted}>{average(starters.map((m) => m.user.mmr))} MMR medio</p></div><StatusChip tone="success">LIVE</StatusChip></div>
    <div style={styles.avatarRow}>{starters.map((member) => <Avatar key={member.userId} user={member.user} />)}</div>
    <p style={styles.muted}>{search.notes || "Disponible para scrim inmediato."}</p>
    <button style={styles.primaryButton} className="nx-interactive" disabled={disabled} onClick={() => onChallenge(search.id)}>{disabled ? "No disponible" : "Enviar solicitud"}</button>
    {disabled && <p style={styles.smallMuted}>{disabledReason}</p>}
  </article>;
}

function ChallengeCard({ challenge, busy, onAccept, onDecline }: { challenge: ScrimChallenge; busy: boolean; onAccept: (id: string) => void; onDecline: (id: string) => void }) {
  return <article style={styles.roomCard}>
    <div style={styles.roomHeader}><TeamBadge name={challenge.fromTeam.name} logoUrl={challenge.fromTeam.logoUrl ?? null} /><h3 style={styles.roomTitle}>{challenge.fromTeam.name} vs {challenge.toTeam.name}</h3></div>
    <p style={styles.muted}>Aceptar crea matchroom y ventana global de aceptación.</p>
    <div style={styles.row}><button style={styles.primaryButton} className="nx-interactive" disabled={busy} onClick={() => onAccept(challenge.id)}>Aceptar</button><button style={styles.ghostButton} className="nx-interactive" disabled={busy} onClick={() => onDecline(challenge.id)}>Rechazar</button></div>
  </article>;
}

function EmptyState({ text = "Sin salas rivales por ahora" }: { text?: string }) {
  return <div style={styles.emptyState}><Users size={28} /><strong>{text}</strong><p style={styles.muted}>Cuando otro capitán publique búsqueda, aparecerá acá.</p></div>;
}

function getMembersByIds(team: Team, ids: string[]) {
  const byId = new Map(team.members.map((member) => [member.userId, member]));
  return ids.map((id) => byId.get(id)).filter((member): member is TeamMember => Boolean(member));
}

function average(values: number[]) {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}

const styles: Record<string, CSSProperties> = {
  page: { display: "grid", gap: "1rem" },
  panel: { ...panelBase, padding: "1rem" },
  panelAccent: { ...panelBase, padding: "1rem", borderColor: "rgba(0,200,255,0.24)", display: "grid", gap: "0.55rem" },
  commandGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: "1rem" },
  error: { padding: "0.85rem 1rem", border: "1px solid rgba(248,113,113,0.45)", background: "rgba(127,29,29,0.22)", color: "#fecaca" },
  notice: { padding: "0.85rem 1rem", border: "1px solid rgba(34,197,94,0.34)", background: "rgba(22,101,52,0.18)", color: "#bbf7d0" },
  alert: { display: "inline-flex", alignItems: "center", gap: "0.4rem", color: "#fde68a" },
  headerStats: { display: "grid", gridTemplateColumns: "repeat(3, minmax(70px, 1fr))", gap: "0.55rem" },
  stat: { display: "grid", gap: "0.15rem", padding: "0.65rem 0.75rem", border: "1px solid rgba(148,163,184,0.16)", background: "rgba(2,6,23,0.55)", color: "#e2e8f0", fontSize: "0.78rem" },
  secondaryButton: { display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0.65rem 0.9rem", border: "1px solid rgba(148,163,184,0.22)", color: "#e2e8f0", textDecoration: "none", background: "rgba(15,23,42,0.72)", fontWeight: 800 },
  primaryButton: { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "0.35rem", padding: "0.62rem 0.9rem", border: "1px solid rgba(125,211,252,0.38)", background: "rgba(14,116,144,0.14)", color: "#7dd3fc", fontWeight: 950, cursor: "pointer" },
  ghostButton: { padding: "0.62rem 0.9rem", border: "1px solid rgba(148,163,184,0.2)", background: "rgba(15,23,42,0.7)", color: "#cbd5e1", fontWeight: 800, cursor: "pointer" },
  sectionTitleRow: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.8rem", marginBottom: "0.9rem", flexWrap: "wrap" },
  sectionHeaderActions: { display: "inline-flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", justifyContent: "flex-end" },
  eyebrow: { margin: 0, color: "#00c8ff", fontSize: "0.68rem", fontWeight: 950, letterSpacing: "0.18em", textTransform: "uppercase", display: "flex", alignItems: "center" },
  sectionTitle: { margin: "0.18rem 0 0", color: "#f8fafc", fontSize: "1.1rem", letterSpacing: "0.02em", textTransform: "uppercase", fontFamily: "var(--font-display)" },
  muted: { margin: "0.35rem 0", color: "rgba(226,232,240,0.62)", lineHeight: 1.55 },
  smallMuted: { display: "block", color: "rgba(226,232,240,0.54)", fontSize: "0.76rem" },

  chip: { padding: "0.3rem 0.52rem", border: "1px solid transparent", fontSize: "0.72rem", fontWeight: 850 },
  chipSuccess: { color: "#bbf7d0", background: "rgba(22,101,52,0.22)", borderColor: "rgba(34,197,94,0.28)" },
  chipWarn: { color: "#fde68a", background: "rgba(120,53,15,0.22)", borderColor: "rgba(245,158,11,0.28)" },
  chipInfo: { color: "#bae6fd", background: "rgba(14,165,233,0.14)", borderColor: "rgba(14,165,233,0.24)" },
  chipMuted: { color: "#cbd5e1", background: "rgba(100,116,139,0.16)", borderColor: "rgba(148,163,184,0.18)" },
  chipDanger: { color: "#fecaca", background: "rgba(127,29,29,0.22)", borderColor: "rgba(248,113,113,0.38)" },

  metricGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "0.55rem" },
  metricTile: { display: "grid", gap: "0.12rem", padding: "0.58rem 0.66rem", border: "1px solid rgba(148,163,184,0.14)", background: "rgba(2,6,23,0.58)", color: "#e2e8f0" },

  teamBadge: { flex: "0 0 auto", display: "grid", placeItems: "center", background: "linear-gradient(135deg, #00c8ff, #1e3a8a)", color: "#f8fafc", fontWeight: 950, overflow: "hidden" },
  pillRow: { display: "flex", flexWrap: "wrap", gap: "0.45rem", marginBottom: "0.8rem" },
  memberGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))", gap: "0.6rem" },
  memberCard: { display: "flex", alignItems: "center", gap: "0.6rem", minWidth: 0, padding: "0.62rem", background: "rgba(15,23,42,0.62)", border: "1px solid rgba(148,163,184,0.12)" },
  memberOnline: { display: "flex", alignItems: "center", gap: "0.6rem", minWidth: 0, padding: "0.62rem", background: "rgba(22,101,52,0.14)", border: "1px solid rgba(34,197,94,0.22)" },
  memberBot: { display: "flex", alignItems: "center", gap: "0.6rem", minWidth: 0, padding: "0.62rem", background: "rgba(14,165,233,0.1)", border: "1px solid rgba(14,165,233,0.22)" },
  avatar: { width: 34, height: 34, display: "grid", placeItems: "center", overflow: "hidden", flex: "0 0 auto", background: "#0f172a", color: "#7dd3fc", fontSize: "0.68rem", fontWeight: 950, border: "1px solid rgba(125,211,252,0.25)" },
  avatarImg: { width: 34, height: 34, objectFit: "cover" },
  truncate: { display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#f8fafc" },
  textarea: { width: "100%", minHeight: 82, marginTop: "0.8rem", padding: "0.72rem 0.8rem", border: "1px solid rgba(148,163,184,0.2)", background: "rgba(2,6,23,0.78)", color: "#e2e8f0", outline: "none", resize: "vertical" },
  pickerGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: "0.7rem" },
  pickerCard: { padding: "0.65rem", border: "1px solid rgba(148,163,184,0.14)", background: "rgba(15,23,42,0.5)" },
  pickerSelected: { padding: "0.65rem", border: "1px solid rgba(0,200,255,0.36)", background: "rgba(0,200,255,0.08)" },
  toggleRow: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.35rem", marginTop: "0.55rem" },
  toggle: { display: "flex", justifyContent: "center", gap: "0.25rem", padding: "0.42rem 0.35rem", background: "rgba(2,6,23,0.58)", color: "#94a3b8", fontSize: "0.72rem", cursor: "pointer" },
  toggleChecked: { display: "flex", justifyContent: "center", gap: "0.25rem", padding: "0.42rem 0.35rem", background: "rgba(0,200,255,0.18)", color: "#bae6fd", fontSize: "0.72rem", cursor: "pointer" },
  builderFooter: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.8rem", flexWrap: "wrap", marginTop: "0.75rem" },
  cardGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: "0.8rem" },
  catalogGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: "0.8rem" },
  roomCard: { padding: "0.9rem", border: "1px solid rgba(148,163,184,0.14)", background: "rgba(15,23,42,0.62)", display: "grid", gap: "0.55rem" },
  roomHeader: { display: "grid", gridTemplateColumns: "auto 1fr auto", gap: "0.7rem", alignItems: "center" },
  roomTitle: { margin: 0, color: "#f8fafc", fontSize: "1rem" },
  avatarRow: { display: "flex", gap: "0.3rem", marginTop: "0.4rem" },
  publishedBox: { display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.85rem", alignItems: "center", padding: "0.85rem", background: "rgba(15,23,42,0.62)", border: "1px solid rgba(245,158,11,0.18)" },
  emptyState: { minHeight: 150, display: "grid", placeItems: "center", textAlign: "center", border: "1px dashed rgba(148,163,184,0.18)", color: "#94a3b8" },
  line: { margin: "0.35rem 0", padding: "0.7rem", background: "rgba(15,23,42,0.6)", color: "#cbd5e1" },
  row: { display: "flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" },

  skeletonHero: { border: "1px solid rgba(148,163,184,0.18)", background: "rgba(15,23,42,0.68)", padding: "1rem", display: "grid", gap: "0.7rem" },
  skeletonLineLg: { height: 26, width: "44%", background: "rgba(148,163,184,0.2)", animation: "pulseGlow 1.4s ease-in-out infinite" },
  skeletonLineMd: { height: 14, width: "68%", background: "rgba(148,163,184,0.16)", animation: "pulseGlow 1.4s ease-in-out infinite" },
  metricSkeleton: { minHeight: 54, border: "1px solid rgba(148,163,184,0.12)", background: "rgba(2,6,23,0.58)", animation: "pulseGlow 1.4s ease-in-out infinite" },
  listSkeleton: { minHeight: 120, border: "1px solid rgba(148,163,184,0.12)", background: "rgba(2,6,23,0.58)", animation: "pulseGlow 1.4s ease-in-out infinite" },
};
