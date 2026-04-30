import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Crown, RefreshCw, ShieldCheck, Sparkles, UserPlus, Users } from "lucide-react";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";
import { PageHeader } from "../components/PageHeader";
import { computeTeamHubSnapshot, type Metric } from "./teamsScrimsUi";

type TeamRole = "OWNER" | "CAPTAIN" | "MEMBER";
type CompetitiveRole = "UNASSIGNED" | "CAPTAIN" | "STARTER" | "SUBSTITUTE" | "COACH" | "STAFF";

type TeamMember = {
  id: string;
  userId: string;
  role: TeamRole;
  competitiveRole: CompetitiveRole;
  user: { id: string; username: string; avatar: string | null; mmr: number; rank?: string | null; isBot?: boolean };
};

type TeamInvite = {
  id: string;
  teamId: string;
  team: { id: string; name: string; logoUrl: string | null };
  invitedBy?: { id: string; username: string; avatar: string | null };
};

type JoinRequest = {
  id: string;
  teamId: string;
  status: string;
  team?: { id: string; name: string; logoUrl?: string | null };
  user?: { id: string; username: string; avatar: string | null; mmr: number; rank?: string | null };
};

type Team = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  bannerUrl?: string | null;
  description?: string | null;
  availabilityDays?: string[] | null;
  ownerId: string;
  members: TeamMember[];
};

type HubResponse = {
  myTeam: Team | null;
  myRole: TeamRole | null;
  myInvites: TeamInvite[];
  sentJoinRequests: JoinRequest[];
  incomingJoinRequests: JoinRequest[];
  teamDirectory: Team[];
  onlineUserIds: string[];
};

type UserSearchResult = { id: string; username: string; avatar: string | null; mmr: number; rank?: string };

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

export default function Teams() {
  const [data, setData] = useState<HubResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [formTeamId, setFormTeamId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [description, setDescription] = useState("");
  const [availabilityDays, setAvailabilityDays] = useState<string[]>([]);
  const [inviteQuery, setInviteQuery] = useState("");
  const [inviteResults, setInviteResults] = useState<UserSearchResult[]>([]);

  const onlineSet = useMemo(() => new Set(data?.onlineUserIds ?? []), [data?.onlineUserIds]);
  const isOwner = data?.myRole === "OWNER";
  const canManage = data?.myRole === "OWNER" || data?.myRole === "CAPTAIN";

  const onlineCount = useMemo(() => {
    if (!data?.myTeam) return 0;
    return data.myTeam.members.filter((member) => !member.user.isBot && onlineSet.has(member.userId)).length;
  }, [data?.myTeam, onlineSet]);

  const hubSnapshot = useMemo(() => computeTeamHubSnapshot({
    hasTeam: Boolean(data?.myTeam),
    myRole: data?.myRole ?? null,
    memberCount: data?.myTeam?.members.length ?? 0,
    onlineCount,
    pendingInvites: data?.myInvites.length ?? 0,
    pendingIncomingRequests: data?.incomingJoinRequests.length ?? 0,
    pendingSentRequests: data?.sentJoinRequests.filter((request) => request.status === "PENDING").length ?? 0,
  }), [
    data?.myTeam,
    data?.myRole,
    data?.myInvites.length,
    data?.incomingJoinRequests.length,
    data?.sentJoinRequests,
    onlineCount,
  ]);

  async function refresh(options?: { soft?: boolean; silentErrors?: boolean }) {
    const soft = options?.soft ?? Boolean(data);
    if (!soft) setLoading(true);
    if (soft) setRefreshing(true);
    if (!options?.silentErrors) setError(null);
    try {
      const response = await api.get<HubResponse>("/teams/hub");
      setData(response.data);
      const incomingTeamId = response.data.myTeam?.id ?? null;
      if (response.data.myTeam && formTeamId !== incomingTeamId) {
        setTeamName(response.data.myTeam.name);
        setLogoUrl(response.data.myTeam.logoUrl ?? "");
        setBannerUrl(response.data.myTeam.bannerUrl ?? "");
        setDescription(response.data.myTeam.description ?? "");
        setAvailabilityDays(Array.isArray(response.data.myTeam.availabilityDays) ? response.data.myTeam.availabilityDays : []);
        setFormTeamId(incomingTeamId);
      } else if (!response.data.myTeam && formTeamId !== null) {
        setFormTeamId(null);
        setTeamName("");
        setLogoUrl("");
        setBannerUrl("");
        setDescription("");
        setAvailabilityDays([]);
      }
    } catch (err: any) {
      if (!options?.silentErrors) setError(err.response?.data?.message ?? "No se pudo cargar equipos.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  useEffect(() => {
    const socket = getSocket();
    const onRefresh = () => { void refresh({ soft: true, silentErrors: true }); };
    socket.on("teams:updated", onRefresh);
    socket.on("teams:invite_updated", onRefresh);
    socket.on("teams:join_request_updated", onRefresh);
    return () => {
      socket.off("teams:updated", onRefresh);
      socket.off("teams:invite_updated", onRefresh);
      socket.off("teams:join_request_updated", onRefresh);
    };
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(async () => {
      if (inviteQuery.trim().length < 2) {
        setInviteResults([]);
        return;
      }
      try {
        const response = await api.get<UserSearchResult[]>("/users/search", { params: { q: inviteQuery.trim() } });
        setInviteResults(response.data);
      } catch {
        setInviteResults([]);
      }
    }, 250);
    return () => window.clearTimeout(handle);
  }, [inviteQuery]);

  async function runAction(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (err: any) {
      setError(err.response?.data?.message ?? "No se pudo completar la acción.");
    } finally {
      setBusy(false);
    }
  }

  function createTeam() {
    void runAction(async () => {
      await api.post("/teams", {
        name: teamName,
        logoUrl: logoUrl || null,
        bannerUrl: bannerUrl || null,
        description: description || null,
        availabilityDays,
      });
      setNotice("Equipo creado.");
      await refresh();
    });
  }

  function saveTeamProfile() {
    const teamId = data?.myTeam?.id;
    if (!teamId) return;
    void runAction(async () => {
      await api.patch(`/teams/${teamId}`, {
        name: teamName,
        logoUrl: logoUrl || null,
        bannerUrl: bannerUrl || null,
        description: description || null,
        availabilityDays,
      });
      setNotice("Perfil del equipo actualizado.");
      await refresh();
    });
  }

  function respondInvite(inviteId: string, response: "ACCEPT" | "DECLINE") {
    void runAction(async () => {
      await api.post(`/teams/invites/${inviteId}/respond`, { response });
      setNotice(response === "ACCEPT" ? "Invitación aceptada." : "Invitación rechazada.");
      await refresh();
    });
  }

  function requestJoin(teamId: string) {
    void runAction(async () => {
      await api.post("/teams/join-requests", { teamId });
      setNotice("Solicitud enviada.");
      await refresh();
    });
  }

  function cancelRequest(requestId: string) {
    void runAction(async () => {
      await api.post(`/teams/join-requests/${requestId}/cancel`);
      setNotice("Solicitud cancelada.");
      await refresh();
    });
  }

  function respondJoinRequest(requestId: string, response: "ACCEPT" | "DECLINE") {
    void runAction(async () => {
      await api.post(`/teams/join-requests/${requestId}/respond`, { response });
      setNotice(response === "ACCEPT" ? "Solicitud aceptada." : "Solicitud rechazada.");
      await refresh();
    });
  }

  function inviteUser(userId: string, username: string) {
    const teamId = data?.myTeam?.id;
    if (!teamId) return;
    void runAction(async () => {
      await api.post("/teams/invites", { teamId, invitedUserId: userId });
      setInviteQuery("");
      setInviteResults([]);
      setNotice(`Invitación enviada a ${username}.`);
      await refresh();
    });
  }

  function assignRole(member: TeamMember, competitiveRole: CompetitiveRole) {
    const teamId = data?.myTeam?.id;
    if (!teamId) return;
    void runAction(async () => {
      await api.patch(`/teams/${teamId}/members/${member.userId}/competitive-role`, { competitiveRole });
      await refresh();
    });
  }

  function toggleDay(day: string) {
    setAvailabilityDays((current) =>
      current.includes(day) ? current.filter((entry) => entry !== day) : [...current, day],
    );
  }

  const teamsWithoutMine = data?.teamDirectory.filter((team) => team.id !== data.myTeam?.id) ?? [];

  if (loading) {
    return (
      <div style={styles.page}>
        <section style={styles.skeletonHero}>
          <div style={styles.skeletonLineLg} />
          <div style={styles.skeletonLineMd} />
          <div style={styles.metricGrid}>{Array.from({ length: 4 }).map((_, idx) => <div key={idx} style={styles.metricSkeleton} />)}</div>
        </section>
        <section style={styles.panel}><div style={styles.skeletonLineMd} /><div style={styles.listSkeleton} /></section>
        <section style={styles.panel}><div style={styles.skeletonLineMd} /><div style={styles.listSkeleton} /></section>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <PageHeader
        eyebrow="Equipos"
        title="Hub de Equipos"
        icon={<Users size={18} />}
        description="Crea o únete a un equipo, gestiona invites/solicitudes y prepara tu roster para scrims competitivos."
        actions={<div style={styles.actionsRow}>
          <button
            type="button"
            style={styles.ghostButton}
            className="nx-interactive"
            disabled={busy || refreshing}
            onClick={() => { void refresh({ soft: true }); }}
          >
            <RefreshCw size={14} /> {refreshing ? "Actualizando..." : "Refrescar"}
          </button>
          <Link to="/scrims" style={styles.secondaryButton} className="nx-interactive">Ir a Scrims</Link>
        </div>}
      />

      {error && <div style={styles.error}>{error}</div>}
      {notice && <div style={styles.notice}>{notice}</div>}

      <section style={styles.panelAccent}>
        <SectionHeader
          title={data?.myTeam ? data.myTeam.name : "Agente Libre"}
          eyebrow="Estado operativo"
          icon={<Sparkles size={15} />}
          meta={<StatusChip tone={data?.myTeam ? "success" : "warn"}>{hubSnapshot.teamStatusLabel}</StatusChip>}
        />

        <div style={styles.commandCard}>
          <div style={styles.commandHead}>
            <TeamBadge name={data?.myTeam?.name ?? "FA"} logoUrl={data?.myTeam?.logoUrl ?? null} large />
            <div style={{ minWidth: 0 }}>
              <h3 style={styles.commandTitle}>{hubSnapshot.commandLabel}</h3>
              <p style={styles.muted}>Rol actual: {data?.myRole ?? "Sin rol"} · {onlineCount} online</p>
            </div>
          </div>
          <MetricGrid metrics={hubSnapshot.stats} />
        </div>
      </section>

      <section style={styles.teamsBoard}>
        <div style={styles.mainColumn}>
          {data?.myTeam ? (
            <section style={styles.panel}>
              <SectionHeader title={`Mi equipo · ${data.myTeam.name}`} eyebrow="Roster" icon={<Crown size={16} />} />
              <div style={styles.pillRow}>
                <StatusChip tone="info">{data.myTeam.members.length} miembros</StatusChip>
                <StatusChip tone="success">{onlineCount} online</StatusChip>
                <StatusChip tone={canManage ? "warn" : "muted"}>{canManage ? "Puede gestionar" : "Solo lectura"}</StatusChip>
              </div>

              {isOwner && (
                <div style={styles.subPanel}>
                  <SectionHeader title="Perfil del equipo" eyebrow="Owner" />
                  <div style={styles.formGrid}>
                    <input style={styles.input} value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="Nombre" />
                    <input style={styles.input} value={logoUrl} onChange={(event) => setLogoUrl(event.target.value)} placeholder="Logo URL" />
                    <input style={styles.input} value={bannerUrl} onChange={(event) => setBannerUrl(event.target.value)} placeholder="Portada URL" />
                    <textarea style={styles.textarea} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Descripción" />
                    <div style={styles.dayRow}>{DAYS.map((day) => (
                      <button key={day} style={availabilityDays.includes(day) ? styles.dayActive : styles.day} className="nx-interactive" type="button" onClick={() => toggleDay(day)}>{day}</button>
                    ))}</div>
                    <button style={styles.primaryButton} className="nx-interactive" disabled={busy || teamName.trim().length < 2} onClick={saveTeamProfile}>Guardar perfil</button>
                  </div>
                </div>
              )}

              {canManage && (
                <div style={styles.subPanel}>
                  <SectionHeader title="Invitar jugadores" eyebrow="Recruiting" icon={<UserPlus size={16} />} />
                  <input style={styles.input} value={inviteQuery} onChange={(event) => setInviteQuery(event.target.value)} placeholder="Buscar username" />
                  {inviteResults.length > 0 && <div style={styles.stack}>{inviteResults.map((result) => (
                    <button key={result.id} style={styles.searchButton} className="nx-interactive" onClick={() => inviteUser(result.id, result.username)}>
                      <span>{result.username}</span>
                      <span>{result.rank ?? "LVL"} · {result.mmr} MMR</span>
                    </button>
                  ))}</div>}
                </div>
              )}

              <div style={styles.grid}>{data.myTeam.members.map((member) => (
                <TeamMemberCard
                  key={member.userId}
                  member={member}
                  online={onlineSet.has(member.userId)}
                  isOwner={isOwner}
                  busy={busy}
                  onAssignRole={assignRole}
                />
              ))}</div>
            </section>
          ) : (
            <section style={styles.panel}>
              <SectionHeader title="Crear equipo" eyebrow="Setup" icon={<Users size={16} />} />
              <div style={styles.formGrid}>
                <input style={styles.input} value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="Nombre del equipo" />
                <input style={styles.input} value={logoUrl} onChange={(event) => setLogoUrl(event.target.value)} placeholder="Logo URL" />
                <input style={styles.input} value={bannerUrl} onChange={(event) => setBannerUrl(event.target.value)} placeholder="Portada URL" />
                <textarea style={styles.textarea} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Descripción" />
                <div style={styles.dayRow}>{DAYS.map((day) => (
                  <button key={day} style={availabilityDays.includes(day) ? styles.dayActive : styles.day} className="nx-interactive" type="button" onClick={() => toggleDay(day)}>{day}</button>
                ))}</div>
                <button style={styles.primaryButton} className="nx-interactive" disabled={busy || teamName.trim().length < 2} onClick={createTeam}>Crear equipo</button>
              </div>
            </section>
          )}

          <section style={styles.panel}>
            <SectionHeader title="Equipos disponibles" eyebrow="Directory" icon={<Users size={16} />} />
            {teamsWithoutMine.length === 0 ? <EmptyState text="No hay equipos abiertos en este momento." /> : (
              <div style={styles.grid}>{teamsWithoutMine.map((team) => {
                const pending = data?.sentJoinRequests.find((request) => request.teamId === team.id && request.status === "PENDING");
                const hasTeam = Boolean(data?.myTeam);
                return (
                  <article key={team.id} style={styles.card}>
                    <div style={styles.cardHeader}><TeamBadge name={team.name} logoUrl={team.logoUrl} /><strong>{team.name}</strong></div>
                    <p style={styles.muted}>{team.members.length} miembros · owner {team.members.find((m) => m.role === "OWNER")?.user.username ?? "-"}</p>
                    <p style={styles.muted}>{team.description ?? "Sin descripción"}</p>
                    {pending ? (
                      <button style={styles.ghostButton} className="nx-interactive" disabled={busy} onClick={() => cancelRequest(pending.id)}>Cancelar solicitud</button>
                    ) : (
                      <button style={styles.primaryButton} className="nx-interactive" disabled={busy || hasTeam} onClick={() => requestJoin(team.id)}>
                        {hasTeam ? "Ya tienes equipo" : "Solicitar ingreso"}
                      </button>
                    )}
                  </article>
                );
              })}</div>
            )}
          </section>
        </div>

        <aside style={styles.sideColumn}>
          {(data?.myInvites.length ?? 0) > 0 && (
            <section style={styles.panel}>
              <SectionHeader title="Invitaciones recibidas" eyebrow="Inbox" icon={<ShieldCheck size={16} />} />
              <div style={styles.grid}>{data!.myInvites.map((invite) => (
                <article key={invite.id} style={styles.card}>
                  <div style={styles.cardHeader}><TeamBadge name={invite.team.name} logoUrl={invite.team.logoUrl} /><strong>{invite.team.name}</strong></div>
                  <p style={styles.muted}>Invitado por {invite.invitedBy?.username ?? "capitán"}</p>
                  <div style={styles.row}>
                    <button style={styles.primaryButton} className="nx-interactive" disabled={busy} onClick={() => respondInvite(invite.id, "ACCEPT")}>Aceptar</button>
                    <button style={styles.ghostButton} className="nx-interactive" disabled={busy} onClick={() => respondInvite(invite.id, "DECLINE")}>Rechazar</button>
                  </div>
                </article>
              ))}</div>
            </section>
          )}

          <section style={styles.panel}>
            <SectionHeader title="Solicitudes enviadas" eyebrow="Outbox" icon={<ShieldCheck size={16} />} />
            {(data?.sentJoinRequests.length ?? 0) === 0 ? <EmptyState text="Sin solicitudes enviadas." /> : (
              <div style={styles.grid}>{data!.sentJoinRequests.map((request) => (
                <article key={request.id} style={styles.card}>
                  <strong>{request.team?.name ?? "Equipo"}</strong>
                  <StatusChip tone={request.status === "PENDING" ? "warn" : "muted"}>{request.status}</StatusChip>
                  <button style={styles.ghostButton} className="nx-interactive" disabled={busy} onClick={() => cancelRequest(request.id)}>Cancelar</button>
                </article>
              ))}</div>
            )}
          </section>

          {(data?.incomingJoinRequests.length ?? 0) > 0 && (
            <section style={styles.panel}>
              <SectionHeader title="Solicitudes recibidas" eyebrow="Inbox" icon={<ShieldCheck size={16} />} />
              <div style={styles.grid}>{data!.incomingJoinRequests.map((request) => (
                <article key={request.id} style={styles.card}>
                  <strong>{request.user?.username ?? "Jugador"}</strong>
                  <p style={styles.muted}>{request.user?.rank ?? "LVL"} · {request.user?.mmr ?? 0} MMR</p>
                  <div style={styles.row}>
                    <button style={styles.primaryButton} className="nx-interactive" disabled={busy} onClick={() => respondJoinRequest(request.id, "ACCEPT")}>Aceptar</button>
                    <button style={styles.ghostButton} className="nx-interactive" disabled={busy} onClick={() => respondJoinRequest(request.id, "DECLINE")}>Rechazar</button>
                  </div>
                </article>
              ))}</div>
            </section>
          )}
        </aside>
      </section>
    </div>
  );
}

function SectionHeader({ title, eyebrow, icon, meta }: { title: string; eyebrow: string; icon?: ReactNode; meta?: ReactNode }) {
  return <div style={styles.sectionTitleRow}>
    <div>
      <p style={styles.eyebrow}>{icon ? <span style={{ marginRight: 6 }}>{icon}</span> : null}{eyebrow}</p>
      <h2 style={styles.sectionTitle}>{title}</h2>
    </div>
    {meta}
  </div>;
}

function StatusChip({ children, tone }: { children: ReactNode; tone: "success" | "warn" | "info" | "muted" }) {
  return <span style={{ ...styles.chip, ...(tone === "success" ? styles.chipSuccess : tone === "warn" ? styles.chipWarn : tone === "info" ? styles.chipInfo : styles.chipMuted) }}>{children}</span>;
}

function MetricGrid({ metrics }: { metrics: Metric[] }) {
  return <div style={styles.metricGrid}>{metrics.map((metric) => (
    <div key={metric.label} style={styles.metricTile}><strong>{metric.value}</strong><span>{metric.label}</span></div>
  ))}</div>;
}

function TeamBadge({ name, logoUrl, large = false }: { name: string; logoUrl: string | null; large?: boolean }) {
  const size = large ? 60 : 36;
  return <div style={{ ...styles.teamBadge, width: size, height: size }}>{logoUrl ? <img src={logoUrl} alt="" style={{ width: size, height: size, objectFit: "cover" }} /> : name.slice(0, 2).toUpperCase()}</div>;
}

function UserAvatar({ user }: { user: { username: string; avatar: string | null } }) {
  return <div style={styles.avatar}>{user.avatar ? <img src={user.avatar} alt="" style={styles.avatarImg} /> : user.username.slice(0, 2).toUpperCase()}</div>;
}

function TeamMemberCard({
  member,
  online,
  isOwner,
  busy,
  onAssignRole,
}: {
  member: TeamMember;
  online: boolean;
  isOwner: boolean;
  busy: boolean;
  onAssignRole: (member: TeamMember, role: CompetitiveRole) => void;
}) {
  const tone: "success" | "warn" | "info" = member.user.isBot ? "info" : online ? "success" : "warn";

  return (
    <article style={styles.memberCard}>
      <div style={styles.cardHeader}>
        <UserAvatar user={member.user} />
        <div style={{ minWidth: 0 }}>
          <strong style={styles.truncate}>{member.user.username}</strong>
          <p style={styles.smallMuted}>{member.user.rank ?? "LVL"} · {member.user.mmr} MMR</p>
        </div>
      </div>

      <div style={styles.pillRow}>
        <StatusChip tone={tone}>{member.user.isBot ? "BOT" : online ? "Online" : "Offline"}</StatusChip>
        <StatusChip tone="muted">{member.role}</StatusChip>
        <StatusChip tone="info">{member.competitiveRole}</StatusChip>
      </div>

      {isOwner && (
        <select
          style={styles.select}
          value={member.competitiveRole}
          onChange={(event) => onAssignRole(member, event.target.value as CompetitiveRole)}
          disabled={busy}
        >
          <option value="UNASSIGNED">Sin asignar</option>
          <option value="CAPTAIN">Capitán</option>
          <option value="STARTER">Titular</option>
          <option value="SUBSTITUTE">Suplente</option>
          <option value="COACH">Coach</option>
          <option value="STAFF">Staff</option>
        </select>
      )}
    </article>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div style={styles.emptyState}><Users size={18} /><p style={styles.muted}>{text}</p></div>;
}

const styles: Record<string, CSSProperties> = {
  page: { display: "grid", gap: "1rem", paddingBottom: "0.25rem" },
  teamsBoard: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: "1rem", alignItems: "start" },
  mainColumn: { display: "grid", gap: "1rem" },
  sideColumn: { display: "grid", gap: "1rem" },
  panel: { border: "1px solid var(--nexus-border)", background: "var(--nexus-card)", padding: "1rem", display: "grid", gap: "0.8rem" },
  panelAccent: { border: "1px solid rgba(0,200,255,0.24)", background: "linear-gradient(180deg, rgba(15,23,42,0.82), rgba(2,6,23,0.85))", padding: "1rem", display: "grid", gap: "0.8rem" },
  sectionTitleRow: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.8rem", marginBottom: "0.4rem", flexWrap: "wrap" },
  eyebrow: { margin: 0, color: "#00c8ff", fontSize: "0.68rem", fontWeight: 950, letterSpacing: "0.18em", textTransform: "uppercase", display: "flex", alignItems: "center" },
  sectionTitle: { margin: "0.18rem 0 0", color: "#f8fafc", fontSize: "1.04rem", letterSpacing: "0.02em", textTransform: "uppercase", fontFamily: "var(--font-display)" },

  actionsRow: { display: "inline-flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" },
  error: { padding: "0.85rem 1rem", border: "1px solid rgba(248,113,113,0.45)", background: "rgba(127,29,29,0.22)", color: "#fecaca" },
  notice: { padding: "0.85rem 1rem", border: "1px solid rgba(34,197,94,0.34)", background: "rgba(22,101,52,0.18)", color: "#bbf7d0" },

  commandCard: { border: "1px solid rgba(148,163,184,0.14)", background: "rgba(15,23,42,0.6)", padding: "0.85rem", display: "grid", gap: "0.65rem" },
  commandHead: { display: "flex", alignItems: "center", gap: "0.8rem", minWidth: 0 },
  commandTitle: { margin: 0, color: "#f8fafc", fontSize: "1.02rem" },

  metricGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "0.55rem" },
  metricTile: { display: "grid", gap: "0.12rem", padding: "0.58rem 0.66rem", border: "1px solid rgba(148,163,184,0.14)", background: "rgba(2,6,23,0.58)", color: "#e2e8f0" },
  chip: { padding: "0.3rem 0.52rem", border: "1px solid transparent", fontSize: "0.72rem", fontWeight: 850 },
  chipSuccess: { color: "#bbf7d0", background: "rgba(22,101,52,0.22)", borderColor: "rgba(34,197,94,0.28)" },
  chipWarn: { color: "#fde68a", background: "rgba(120,53,15,0.22)", borderColor: "rgba(245,158,11,0.28)" },
  chipInfo: { color: "#bae6fd", background: "rgba(14,165,233,0.14)", borderColor: "rgba(14,165,233,0.24)" },
  chipMuted: { color: "#cbd5e1", background: "rgba(100,116,139,0.16)", borderColor: "rgba(148,163,184,0.18)" },

  secondaryButton: { display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0.65rem 0.9rem", border: "1px solid rgba(148,163,184,0.22)", color: "#e2e8f0", textDecoration: "none", background: "rgba(15,23,42,0.72)", fontWeight: 800 },
  primaryButton: { display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0.58rem 0.86rem", border: "1px solid rgba(125,211,252,0.38)", background: "rgba(14,116,144,0.14)", color: "#7dd3fc", fontWeight: 900, cursor: "pointer" },
  ghostButton: { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "0.35rem", padding: "0.58rem 0.86rem", border: "1px solid rgba(148,163,184,0.24)", background: "rgba(2,6,23,0.65)", color: "#cbd5e1", fontWeight: 800, cursor: "pointer" },

  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 250px), 1fr))", gap: "0.7rem" },
  card: { padding: "0.8rem", border: "1px solid rgba(148,163,184,0.14)", background: "rgba(15,23,42,0.6)", display: "grid", gap: "0.45rem" },
  cardHeader: { display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 },

  muted: { margin: 0, color: "rgba(226,232,240,0.66)", fontSize: "0.86rem", lineHeight: 1.45 },
  smallMuted: { margin: "0.1rem 0 0", color: "rgba(226,232,240,0.56)", fontSize: "0.76rem" },
  truncate: { display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#f8fafc" },

  row: { display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" },
  formGrid: { display: "grid", gap: "0.6rem" },
  input: { width: "100%", padding: "0.68rem 0.75rem", border: "1px solid rgba(148,163,184,0.24)", background: "rgba(2,6,23,0.7)", color: "#e2e8f0" },
  textarea: { width: "100%", minHeight: "86px", padding: "0.68rem 0.75rem", border: "1px solid rgba(148,163,184,0.24)", background: "rgba(2,6,23,0.7)", color: "#e2e8f0", resize: "vertical" },
  dayRow: { display: "flex", flexWrap: "wrap", gap: "0.45rem" },
  day: { padding: "0.35rem 0.5rem", border: "1px solid rgba(148,163,184,0.24)", background: "rgba(15,23,42,0.7)", color: "#94a3b8", fontSize: "0.75rem", cursor: "pointer" },
  dayActive: { padding: "0.35rem 0.5rem", border: "1px solid rgba(34,197,94,0.3)", background: "rgba(22,101,52,0.2)", color: "#bbf7d0", fontSize: "0.75rem", cursor: "pointer" },
  subPanel: { borderTop: "1px solid rgba(148,163,184,0.12)", paddingTop: "0.8rem", display: "grid", gap: "0.55rem" },
  stack: { display: "grid", gap: "0.4rem" },
  searchButton: { display: "flex", justifyContent: "space-between", width: "100%", padding: "0.56rem 0.65rem", border: "1px solid rgba(148,163,184,0.2)", background: "rgba(15,23,42,0.7)", color: "#e2e8f0", cursor: "pointer", gap: "0.4rem" },

  memberCard: { padding: "0.78rem", border: "1px solid rgba(148,163,184,0.16)", background: "rgba(15,23,42,0.62)", display: "grid", gap: "0.55rem" },
  pillRow: { display: "flex", flexWrap: "wrap", gap: "0.45rem", marginBottom: "0.2rem" },
  select: { width: "100%", padding: "0.52rem 0.6rem", border: "1px solid rgba(125,211,252,0.3)", background: "rgba(2,6,23,0.8)", color: "#e2e8f0" },

  teamBadge: { flex: "0 0 auto", display: "grid", placeItems: "center", background: "linear-gradient(135deg, #00c8ff, #1e3a8a)", color: "#f8fafc", fontWeight: 950, overflow: "hidden" },
  avatar: { width: 34, height: 34, display: "grid", placeItems: "center", overflow: "hidden", flex: "0 0 auto", background: "#0f172a", color: "#7dd3fc", fontSize: "0.68rem", fontWeight: 950, border: "1px solid rgba(125,211,252,0.25)" },
  avatarImg: { width: 34, height: 34, objectFit: "cover" },

  emptyState: { minHeight: 120, display: "grid", placeItems: "center", textAlign: "center", border: "1px dashed rgba(148,163,184,0.18)", color: "#94a3b8", gap: "0.35rem", padding: "0.6rem" },

  skeletonHero: { border: "1px solid rgba(148,163,184,0.18)", background: "rgba(15,23,42,0.68)", padding: "1rem", display: "grid", gap: "0.7rem" },
  skeletonLineLg: { height: 26, width: "44%", background: "rgba(148,163,184,0.2)", animation: "pulseGlow 1.4s ease-in-out infinite" },
  skeletonLineMd: { height: 14, width: "68%", background: "rgba(148,163,184,0.16)", animation: "pulseGlow 1.4s ease-in-out infinite" },
  metricSkeleton: { minHeight: 54, border: "1px solid rgba(148,163,184,0.12)", background: "rgba(2,6,23,0.58)", animation: "pulseGlow 1.4s ease-in-out infinite" },
  listSkeleton: { minHeight: 120, border: "1px solid rgba(148,163,184,0.12)", background: "rgba(2,6,23,0.58)", animation: "pulseGlow 1.4s ease-in-out infinite" },
};
