import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Crown, RefreshCw, ShieldCheck, UserPlus, Users } from "lucide-react";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";
import { PageHeader } from "../components/PageHeader";

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
    if (!data?.myTeam) return;
    void runAction(async () => {
      await api.patch(`/teams/${data.myTeam!.id}`, {
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
    if (!data?.myTeam) return;
    void runAction(async () => {
      await api.post("/teams/invites", { teamId: data.myTeam!.id, invitedUserId: userId });
      setInviteQuery("");
      setInviteResults([]);
      setNotice(`Invitación enviada a ${username}.`);
      await refresh();
    });
  }

  function assignRole(member: TeamMember, competitiveRole: CompetitiveRole) {
    if (!data?.myTeam) return;
    void runAction(async () => {
      await api.patch(`/teams/${data.myTeam!.id}/members/${member.userId}/competitive-role`, { competitiveRole });
      await refresh();
    });
  }

  function toggleDay(day: string) {
    setAvailabilityDays((current) =>
      current.includes(day) ? current.filter((entry) => entry !== day) : [...current, day],
    );
  }

  if (loading) return <div style={styles.page}><div style={styles.panel}>Cargando equipos...</div></div>;

  const teamsWithoutMine = data?.teamDirectory.filter((team) => team.id !== data.myTeam?.id) ?? [];

  return (
    <div style={styles.page}>
      <PageHeader
        eyebrow="Equipos"
        title="Hub de Equipos"
        icon={<Users size={18} />}
        description="Crea o únete a un equipo, gestiona solicitudes/invitaciones y prepara tu roster para scrims competitivos."
        actions={<div style={styles.actionsRow}>
          <button
            type="button"
            style={styles.ghostButton}
            disabled={busy || refreshing}
            onClick={() => { void refresh({ soft: true }); }}
          >
            <RefreshCw size={14} /> {refreshing ? "Actualizando..." : "Refrescar"}
          </button>
          <Link to="/scrims" style={styles.secondaryButton}>Ir a Scrims</Link>
        </div>}
      />

      {error && <div style={styles.error}>{error}</div>}
      {notice && <div style={styles.notice}>{notice}</div>}
      {refreshing && !loading && <div style={styles.muted}>Actualizando equipos…</div>}

      {(data?.myInvites.length ?? 0) > 0 && (
        <section style={styles.panel}>
          <Header title="Invitaciones recibidas" icon={<ShieldCheck size={16} />} />
          <div style={styles.grid}>{data!.myInvites.map((invite) => (
            <article key={invite.id} style={styles.card}>
              <strong>{invite.team.name}</strong>
              <p style={styles.muted}>Invitado por {invite.invitedBy?.username ?? "capitán"}</p>
              <div style={styles.row}>
                <button style={styles.primaryButton} disabled={busy} onClick={() => respondInvite(invite.id, "ACCEPT")}>Aceptar</button>
                <button style={styles.ghostButton} disabled={busy} onClick={() => respondInvite(invite.id, "DECLINE")}>Rechazar</button>
              </div>
            </article>
          ))}</div>
        </section>
      )}

      {data?.myTeam ? (
        <section style={styles.panel}>
          <Header title={`Mi equipo · ${data.myTeam.name}`} icon={<Crown size={16} />} />
          <p style={styles.muted}>Rol: {data.myRole}</p>

          {isOwner && (
            <div style={styles.formGrid}>
              <input style={styles.input} value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="Nombre" />
              <input style={styles.input} value={logoUrl} onChange={(event) => setLogoUrl(event.target.value)} placeholder="Logo URL" />
              <input style={styles.input} value={bannerUrl} onChange={(event) => setBannerUrl(event.target.value)} placeholder="Portada URL" />
              <textarea style={styles.textarea} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Descripción" />
              <div style={styles.dayRow}>{DAYS.map((day) => (
                <button key={day} style={availabilityDays.includes(day) ? styles.dayActive : styles.day} type="button" onClick={() => toggleDay(day)}>{day}</button>
              ))}</div>
              <button style={styles.primaryButton} disabled={busy || teamName.trim().length < 2} onClick={saveTeamProfile}>Guardar perfil</button>
            </div>
          )}

          {canManage && (
            <div style={styles.subPanel}>
              <Header title="Invitar jugadores" icon={<UserPlus size={16} />} />
              <input style={styles.input} value={inviteQuery} onChange={(event) => setInviteQuery(event.target.value)} placeholder="Buscar username" />
              {inviteResults.length > 0 && <div style={styles.stack}>{inviteResults.map((result) => (
                <button key={result.id} style={styles.searchButton} onClick={() => inviteUser(result.id, result.username)}>
                  <span>{result.username}</span>
                  <span>{result.mmr} MMR</span>
                </button>
              ))}</div>}
            </div>
          )}

          <div style={styles.grid}>{data.myTeam.members.map((member) => (
            <article key={member.userId} style={styles.memberCard}>
              <div style={styles.row}>
                <span style={onlineSet.has(member.userId) ? styles.online : styles.offline} />
                <strong>{member.user.username}</strong>
              </div>
              <p style={styles.muted}>{member.user.rank ?? "LVL"} · {member.user.mmr} ELO · {member.role}</p>
              <p style={styles.muted}>Rol competitivo: {member.competitiveRole}</p>
              {isOwner && (
                <select
                  style={styles.select}
                  value={member.competitiveRole}
                  onChange={(event) => assignRole(member, event.target.value as CompetitiveRole)}
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
          ))}</div>
        </section>
      ) : (
        <section style={styles.panel}>
          <Header title="Crear equipo" icon={<Users size={16} />} />
          <div style={styles.formGrid}>
            <input style={styles.input} value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="Nombre del equipo" />
            <input style={styles.input} value={logoUrl} onChange={(event) => setLogoUrl(event.target.value)} placeholder="Logo URL" />
            <input style={styles.input} value={bannerUrl} onChange={(event) => setBannerUrl(event.target.value)} placeholder="Portada URL" />
            <textarea style={styles.textarea} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Descripción" />
            <div style={styles.dayRow}>{DAYS.map((day) => (
              <button key={day} style={availabilityDays.includes(day) ? styles.dayActive : styles.day} type="button" onClick={() => toggleDay(day)}>{day}</button>
            ))}</div>
            <button style={styles.primaryButton} disabled={busy || teamName.trim().length < 2} onClick={createTeam}>Crear equipo</button>
          </div>
        </section>
      )}

      <section style={styles.panel}>
        <Header title="Solicitudes enviadas" icon={<ShieldCheck size={16} />} />
        {(data?.sentJoinRequests.length ?? 0) === 0 ? <p style={styles.muted}>Sin solicitudes enviadas.</p> : (
          <div style={styles.grid}>{data!.sentJoinRequests.map((request) => (
            <article key={request.id} style={styles.card}>
              <strong>{request.team?.name ?? "Equipo"}</strong>
              <p style={styles.muted}>Estado: {request.status}</p>
              <button style={styles.ghostButton} disabled={busy} onClick={() => cancelRequest(request.id)}>Cancelar</button>
            </article>
          ))}</div>
        )}
      </section>

      {(data?.incomingJoinRequests.length ?? 0) > 0 && (
        <section style={styles.panel}>
          <Header title="Solicitudes recibidas" icon={<ShieldCheck size={16} />} />
          <div style={styles.grid}>{data!.incomingJoinRequests.map((request) => (
            <article key={request.id} style={styles.card}>
              <strong>{request.user?.username ?? "Jugador"}</strong>
              <p style={styles.muted}>{request.user?.rank ?? "LVL"} · {request.user?.mmr ?? 0} ELO</p>
              <div style={styles.row}>
                <button style={styles.primaryButton} disabled={busy} onClick={() => respondJoinRequest(request.id, "ACCEPT")}>Aceptar</button>
                <button style={styles.ghostButton} disabled={busy} onClick={() => respondJoinRequest(request.id, "DECLINE")}>Rechazar</button>
              </div>
            </article>
          ))}</div>
        </section>
      )}

      <section style={styles.panel}>
        <Header title="Equipos disponibles" icon={<Users size={16} />} />
        <div style={styles.grid}>{teamsWithoutMine.map((team) => {
          const pending = data?.sentJoinRequests.find((request) => request.teamId === team.id && request.status === "PENDING");
          const hasTeam = Boolean(data?.myTeam);
          return (
            <article key={team.id} style={styles.card}>
              <strong>{team.name}</strong>
              <p style={styles.muted}>{team.members.length} miembros · owner {team.members.find((m) => m.role === "OWNER")?.user.username ?? "-"}</p>
              <p style={styles.muted}>{team.description ?? "Sin descripción"}</p>
              {pending ? (
                <button style={styles.ghostButton} disabled={busy} onClick={() => cancelRequest(pending.id)}>Cancelar solicitud</button>
              ) : (
                <button style={styles.primaryButton} disabled={busy || hasTeam} onClick={() => requestJoin(team.id)}>
                  {hasTeam ? "Ya tienes equipo" : "Solicitar ingreso"}
                </button>
              )}
            </article>
          );
        })}</div>
      </section>
    </div>
  );
}

function Header({ title, icon }: { title: string; icon: ReactNode }) {
  return <div style={styles.header}><div style={styles.headerIcon}>{icon}</div><h2 style={styles.title}>{title}</h2></div>;
}

const styles: Record<string, CSSProperties> = {
  page: { display: "grid", gap: "1rem" },
  panel: { border: "1px solid var(--nexus-border)", background: "var(--nexus-card)", padding: "1rem", display: "grid", gap: "0.8rem" },
  header: { display: "flex", alignItems: "center", gap: "0.6rem" },
  headerIcon: { color: "#7dd3fc", display: "grid", placeItems: "center" },
  title: { margin: 0, fontSize: "1.05rem", color: "#f8fafc", textTransform: "uppercase", fontFamily: "var(--font-display)" },
  actionsRow: { display: "inline-flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" },
  error: { padding: "0.85rem 1rem", border: "1px solid rgba(248,113,113,0.45)", background: "rgba(127,29,29,0.22)", color: "#fecaca" },
  notice: { padding: "0.85rem 1rem", border: "1px solid rgba(34,197,94,0.34)", background: "rgba(22,101,52,0.18)", color: "#bbf7d0" },
  secondaryButton: { display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0.65rem 0.9rem", border: "1px solid rgba(148,163,184,0.22)", color: "#e2e8f0", textDecoration: "none", background: "rgba(15,23,42,0.72)", fontWeight: 800 },
  primaryButton: { display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0.55rem 0.8rem", border: "1px solid rgba(125,211,252,0.38)", background: "rgba(14,116,144,0.14)", color: "#7dd3fc", fontWeight: 900, cursor: "pointer" },
  ghostButton: { display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0.55rem 0.8rem", border: "1px solid rgba(148,163,184,0.24)", background: "rgba(2,6,23,0.65)", color: "#cbd5e1", fontWeight: 800, cursor: "pointer" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "0.7rem" },
  card: { padding: "0.8rem", border: "1px solid rgba(148,163,184,0.14)", background: "rgba(15,23,42,0.6)", display: "grid", gap: "0.45rem" },
  muted: { margin: 0, color: "rgba(226,232,240,0.65)", fontSize: "0.86rem", lineHeight: 1.45 },
  row: { display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" },
  formGrid: { display: "grid", gap: "0.6rem" },
  input: { width: "100%", padding: "0.68rem 0.75rem", border: "1px solid rgba(148,163,184,0.24)", background: "rgba(2,6,23,0.7)", color: "#e2e8f0" },
  textarea: { width: "100%", minHeight: "86px", padding: "0.68rem 0.75rem", border: "1px solid rgba(148,163,184,0.24)", background: "rgba(2,6,23,0.7)", color: "#e2e8f0", resize: "vertical" },
  dayRow: { display: "flex", flexWrap: "wrap", gap: "0.45rem" },
  day: { padding: "0.35rem 0.5rem", border: "1px solid rgba(148,163,184,0.24)", background: "rgba(15,23,42,0.7)", color: "#94a3b8", fontSize: "0.75rem", cursor: "pointer" },
  dayActive: { padding: "0.35rem 0.5rem", border: "1px solid rgba(34,197,94,0.3)", background: "rgba(22,101,52,0.2)", color: "#bbf7d0", fontSize: "0.75rem", cursor: "pointer" },
  subPanel: { borderTop: "1px solid rgba(148,163,184,0.12)", paddingTop: "0.8rem", display: "grid", gap: "0.55rem" },
  stack: { display: "grid", gap: "0.4rem" },
  searchButton: { display: "flex", justifyContent: "space-between", width: "100%", padding: "0.56rem 0.65rem", border: "1px solid rgba(148,163,184,0.2)", background: "rgba(15,23,42,0.7)", color: "#e2e8f0", cursor: "pointer" },
  memberCard: { padding: "0.78rem", border: "1px solid rgba(148,163,184,0.16)", background: "rgba(15,23,42,0.62)", display: "grid", gap: "0.4rem" },
  online: { width: "9px", height: "9px", borderRadius: "999px", background: "#22c55e", boxShadow: "0 0 0 3px rgba(34,197,94,0.2)" },
  offline: { width: "9px", height: "9px", borderRadius: "999px", background: "#ef4444", boxShadow: "0 0 0 3px rgba(239,68,68,0.2)" },
  select: { width: "100%", padding: "0.52rem 0.6rem", border: "1px solid rgba(125,211,252,0.3)", background: "rgba(2,6,23,0.8)", color: "#e2e8f0" },
};
