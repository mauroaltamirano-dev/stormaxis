import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  Crown,
  ExternalLink,
  ImageIcon,
  Pencil,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";
import { PageHeader } from "../components/PageHeader";
import { PlayerLink } from "../components/PlayerLink";
import { Button, buildActionClassName } from "../components/ui";
import { getRankMeta, getRankMetaFromMmr, parseRankLevel } from "../lib/ranks";
import { getRoleMeta } from "../lib/roles";
import { CountryBadge } from "../components/CountryBadge";
import {
  computeTeamHubSnapshot,
  filterTeamDirectory,
  type Metric,
} from "./teamsScrimsUi";

type PlayerRole = "RANGED" | "HEALER" | "OFFLANE" | "FLEX" | "TANK";
type TeamRole = "OWNER" | "CAPTAIN" | "MEMBER";
type CompetitiveRole = "UNASSIGNED" | "CAPTAIN" | "STARTER" | "SUBSTITUTE" | "COACH" | "STAFF";

type TeamMember = {
  id?: string;
  userId: string;
  role: TeamRole;
  competitiveRole: CompetitiveRole;
  user: {
    id: string;
    username: string;
    avatar: string | null;
    mmr: number;
    rank?: string | null;
    mainRole?: PlayerRole | null;
    secondaryRole?: PlayerRole | null;
    countryCode?: string | null;
    isBot?: boolean;
  };
};

type TeamInvite = {
  id: string;
  teamId: string;
  team: { id: string; name: string; slug?: string; logoUrl: string | null };
  invitedBy?: { id: string; username: string; avatar: string | null };
};

type JoinRequest = {
  id: string;
  teamId: string;
  status: string;
  team?: { id: string; name: string; slug?: string; logoUrl?: string | null };
  user?: { id: string; username: string; avatar: string | null; mmr: number; rank?: string | null };
};

type Team = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  bannerUrl?: string | null;
  description?: string | null;
  countryCode?: string | null;
  about?: string | null;
  isRecruiting?: boolean;
  recruitingRoles?: PlayerRole[] | null;
  socialLinks?: Array<{ label: string; url: string }> | null;
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
const DAY_LABELS: Record<string, string> = { MON: "Lun", TUE: "Mar", WED: "Mié", THU: "Jue", FRI: "Vie", SAT: "Sáb", SUN: "Dom" };

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
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [teamSearchQuery, setTeamSearchQuery] = useState("");

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

  function removeMember(userId: string, username: string) {
    const teamId = data?.myTeam?.id;
    if (!teamId) return;
    void runAction(async () => {
      await api.delete(`/teams/${teamId}/members/${userId}`);
      setNotice(`${username} fue removido del equipo.`);
      await refresh();
    });
  }

  function handleSaveMemberEdit(userId: string, competitiveRole: CompetitiveRole, teamRole: TeamRole) {
    const teamId = data?.myTeam?.id;
    if (!teamId) return;
    void runAction(async () => {
      await api.patch(`/teams/${teamId}/members/${userId}/competitive-role`, { competitiveRole });
      const current = data?.myTeam?.members.find((m) => m.userId === userId);
      if (current && current.role !== "OWNER" && teamRole !== current.role) {
        await api.patch(`/teams/${teamId}/members/${userId}/role`, { role: teamRole });
      }
      setEditingMember(null);
      setNotice("Miembro actualizado.");
      await refresh();
    });
  }

  function toggleDay(day: string) {
    setAvailabilityDays((current) =>
      current.includes(day) ? current.filter((entry) => entry !== day) : [...current, day],
    );
  }

  const teamsWithoutMine = data?.teamDirectory.filter((team) => team.id !== data.myTeam?.id) ?? [];
  const filteredTeams = useMemo(() => filterTeamDirectory(teamsWithoutMine, teamSearchQuery), [teamsWithoutMine, teamSearchQuery]);

  if (loading) {
    return <TeamsSkeleton />;
  }

  const myTeam = data?.myTeam ?? null;

  return (
    <div className="storm-page" style={styles.page}>
      <PageHeader
        eyebrow="Equipos"
        title="Hub de Equipos"
        icon={<Users size={18} />}
        description="Gestiona tu identidad competitiva, recluta jugadores y explora equipos con perfiles públicos."
        actions={<div style={styles.actionsRow}>
          <Button
            variant="ghost"
            size="md"
            disabled={busy || refreshing}
            onClick={() => { void refresh({ soft: true }); }}
          >
            <RefreshCw size={14} /> {refreshing ? "Actualizando..." : "Refrescar"}
          </Button>
          <Link to="/scrims" className={buildActionClassName({ variant: "secondary", size: "md" })}>Ir a Scrims</Link>
        </div>}
      />

      {error && <div style={styles.error}>{error}</div>}
      {notice && <div style={styles.notice}>{notice}</div>}

      <PublicProfilePreview team={myTeam} myRole={data?.myRole ?? null} onlineCount={onlineCount} hubMetrics={hubSnapshot.stats} />

      <section style={styles.managementGrid}>
        <div style={styles.configArea}>
          <TeamConfigPanel
            team={myTeam}
            isOwner={isOwner}
            busy={busy}
            teamName={teamName}
            logoUrl={logoUrl}
            bannerUrl={bannerUrl}
            description={description}
            availabilityDays={availabilityDays}
            setTeamName={setTeamName}
            setLogoUrl={setLogoUrl}
            setBannerUrl={setBannerUrl}
            setDescription={setDescription}
            toggleDay={toggleDay}
            onSave={myTeam ? saveTeamProfile : createTeam}
          />
        </div>

        <div style={styles.rosterArea}>
          <TeamRosterPanel
            team={myTeam}
            onlineSet={onlineSet}
            isOwner={isOwner}
            canManage={canManage}
            busy={busy}
            onRemoveMember={removeMember}
            onEditMember={setEditingMember}
          />
        </div>
        {editingMember && (
          <MemberEditModal
            member={editingMember}
            isOwner={isOwner}
            busy={busy}
            onSave={handleSaveMemberEdit}
            onClose={() => setEditingMember(null)}
          />
        )}

        <aside style={styles.sideArea}>
          <InvitePlayersPanel
            canManage={canManage}
            hasTeam={Boolean(myTeam)}
            inviteQuery={inviteQuery}
            inviteResults={inviteResults}
            busy={busy}
            onQueryChange={setInviteQuery}
            onInvite={inviteUser}
          />

          <TeamDirectoryPanel
            teams={filteredTeams}
            totalTeams={teamsWithoutMine.length}
            query={teamSearchQuery}
            busy={busy}
            hasTeam={Boolean(myTeam)}
            sentJoinRequests={data?.sentJoinRequests ?? []}
            onQueryChange={setTeamSearchQuery}
            onRequestJoin={requestJoin}
            onCancelRequest={cancelRequest}
          />
        </aside>
      </section>

      <RequestsPanel
        invites={data?.myInvites ?? []}
        sentJoinRequests={data?.sentJoinRequests ?? []}
        incomingJoinRequests={data?.incomingJoinRequests ?? []}
        busy={busy}
        onRespondInvite={respondInvite}
        onCancelRequest={cancelRequest}
        onRespondJoinRequest={respondJoinRequest}
      />
    </div>
  );
}

function MemberEditModal({ member, isOwner, busy, onSave, onClose }: {
  member: TeamMember;
  isOwner: boolean;
  busy: boolean;
  onSave: (userId: string, competitiveRole: CompetitiveRole, teamRole: TeamRole) => void;
  onClose: () => void;
}) {
  const [competitiveRole, setCompetitiveRole] = useState<CompetitiveRole>(member.competitiveRole);
  const [teamRole, setTeamRole] = useState<TeamRole>(member.role === "OWNER" ? "OWNER" : member.role);
  const rankMeta = member.user.rank ? getRankMeta(parseRankLevel(member.user.rank)) : getRankMetaFromMmr(member.user.mmr);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleBackdrop(e: { target: EventTarget | null; currentTarget: EventTarget | null }) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div className="storm-modal-backdrop" onClick={handleBackdrop}>
      <div className="storm-modal-panel" role="dialog" aria-label={`Editar ${member.user.username}`} aria-modal="true">
        <div className="storm-modal-header">
          <div className="storm-modal-identity">
            <UserAvatar user={member.user} size="lg" />
            <div>
              <h3 className="storm-modal-title">{member.user.username}</h3>
              <span className="storm-modal-sub">{rankMeta.label} · {member.user.mmr.toLocaleString("es-AR")} MMR · <span style={{ textTransform: "capitalize" }}>{member.role.toLowerCase()}</span></span>
            </div>
          </div>
          <button className="storm-modal-close" type="button" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="storm-modal-body">
          <label className="storm-modal-field">
            <span className="storm-modal-label">Rol competitivo</span>
            <select
              className="storm-modal-select"
              value={competitiveRole}
              onChange={(e) => setCompetitiveRole(e.target.value as CompetitiveRole)}
              disabled={busy}
            >
              <option value="UNASSIGNED">Sin asignar</option>
              <option value="STARTER">Titular</option>
              <option value="SUBSTITUTE">Suplente</option>
              <option value="CAPTAIN">Capitán</option>
              <option value="COACH">Coach</option>
              <option value="STAFF">Staff</option>
            </select>
          </label>

          {isOwner && member.role !== "OWNER" && (
            <label className="storm-modal-field">
              <span className="storm-modal-label">Rango en el equipo</span>
              <select
                className="storm-modal-select"
                value={teamRole}
                onChange={(e) => setTeamRole(e.target.value as TeamRole)}
                disabled={busy}
              >
                <option value="MEMBER">Miembro</option>
                <option value="CAPTAIN">Capitán</option>
              </select>
            </label>
          )}
        </div>

        <div className="storm-modal-footer">
          <Button variant="ghost" disabled={busy} onClick={onClose}>Cancelar</Button>
          <Button disabled={busy} onClick={() => onSave(member.userId, competitiveRole, teamRole)}>
            Guardar cambios
          </Button>
        </div>
      </div>
    </div>
  );
}

function TeamsSkeleton() {
  return (
    <div className="storm-page" style={styles.page}>
      <section style={styles.skeletonHero}>
        <div style={styles.skeletonLineLg} />
        <div style={styles.skeletonLineMd} />
        <div style={styles.metricGrid}>{Array.from({ length: 4 }).map((_, idx) => <div key={idx} style={styles.metricSkeleton} />)}</div>
      </section>
      <section style={styles.managementGrid}>
        <div style={styles.configArea}><div style={styles.listSkeleton} /></div>
        <div style={styles.rosterArea}><div style={styles.listSkeletonTall} /></div>
        <aside style={styles.sideArea}><div style={styles.listSkeleton} /><div style={styles.listSkeleton} /></aside>
      </section>
    </div>
  );
}

function PublicProfilePreview({ team, myRole, onlineCount, hubMetrics }: { team: Team | null; myRole: TeamRole | null; onlineCount: number; hubMetrics: Metric[] }) {
  const starters = team ? getStarters(team) : [];
  const avgMmr = team ? getAverageMmr(team.members) : 0;
  return (
    <section style={styles.profilePreview}>
      <TeamBannerVisual team={team} />
      <div style={styles.previewContent}>
        <div style={styles.previewBadgeSlot}>
          <TeamBadge name={team?.name ?? "FA"} logoUrl={team?.logoUrl ?? null} large />
        </div>
        <div style={styles.previewCopy}>
          <p style={styles.eyebrow}><Sparkles size={14} /> Preview perfil público</p>
          <h2 style={styles.previewTitle}>{team?.name ?? "Crea tu identidad competitiva"}</h2>
          <p style={styles.previewDescription}>{team?.description || "Tu perfil público muestra identidad, roster, roles y disponibilidad para que otros equipos puedan evaluarte antes de scrims."}</p>
          <div style={styles.pillRow}>
            <StatusChip tone={team ? "success" : "warn"}>{team ? "Publicado" : "Sin equipo"}</StatusChip>
            <StatusChip tone="info">{myRole ?? "Agente libre"}</StatusChip>
            <StatusChip tone="success">{onlineCount} online</StatusChip>
            <StatusChip tone="muted">{team?.members.length ?? 0} miembros</StatusChip>
            {avgMmr ? <StatusChip tone="info">{avgMmr} MMR prom.</StatusChip> : null}
          </div>
        </div>
        <div style={styles.previewAside}>
          <MetricGrid metrics={team ? [
            { label: "Miembros", value: String(team.members.length) },
            { label: "Titulares", value: String(starters.length) },
            { label: "Online", value: String(onlineCount) },
            { label: "Días", value: String(team.availabilityDays?.length ?? 0) },
          ] : hubMetrics} />
          {team ? (
            <Link to="/teams/$slug" params={{ slug: team.slug }} className={buildActionClassName({ variant: "primary", size: "md" })}>
              Ver perfil público <ExternalLink size={14} />
            </Link>
          ) : (
            <a href="#team-config" className={buildActionClassName({ variant: "primary", size: "md" })}>Crear equipo</a>
          )}
        </div>
      </div>
    </section>
  );
}

function TeamConfigPanel({
  team,
  isOwner,
  busy,
  teamName,
  logoUrl,
  bannerUrl,
  description,
  availabilityDays,
  setTeamName,
  setLogoUrl,
  setBannerUrl,
  setDescription,
  toggleDay,
  onSave,
}: {
  team: Team | null;
  isOwner: boolean;
  busy: boolean;
  teamName: string;
  logoUrl: string;
  bannerUrl: string;
  description: string;
  availabilityDays: string[];
  setTeamName: (value: string) => void;
  setLogoUrl: (value: string) => void;
  setBannerUrl: (value: string) => void;
  setDescription: (value: string) => void;
  toggleDay: (day: string) => void;
  onSave: () => void;
}) {
  const editable = !team || isOwner;
  return (
    <section id="team-config" style={styles.panelLarge}>
      <SectionHeader
        title={team ? "Configurar perfil" : "Crear equipo"}
        eyebrow="Identidad"
        icon={<ImageIcon size={16} />}
        meta={<StatusChip tone={editable ? "info" : "muted"}>{editable ? "Editable" : "Solo owner"}</StatusChip>}
      />
      <div style={styles.formGridTwo}>
        <label style={styles.fieldLabel}>Nombre del equipo<input style={styles.input} value={teamName} disabled={!editable} onChange={(event) => setTeamName(event.target.value)} placeholder="Storm Alpha" /></label>
        <label style={styles.fieldLabel}>Logo URL<input style={styles.input} value={logoUrl} disabled={!editable} onChange={(event) => setLogoUrl(event.target.value)} placeholder="https://.../logo.png" /></label>
        <label style={styles.fieldLabel}>Banner URL<input style={styles.input} value={bannerUrl} disabled={!editable} onChange={(event) => setBannerUrl(event.target.value)} placeholder="https://.../banner.jpg" /></label>
        <label style={styles.fieldLabel}>Disponibilidad<div style={styles.dayRow}>{DAYS.map((day) => (
          <button key={day} style={availabilityDays.includes(day) ? styles.dayActive : styles.day} className="nx-interactive" type="button" disabled={!editable} onClick={() => toggleDay(day)}>{DAY_LABELS[day]}</button>
        ))}</div></label>
      </div>
      <label style={styles.fieldLabel}>Descripción<textarea style={styles.textarea} value={description} disabled={!editable} onChange={(event) => setDescription(event.target.value)} placeholder="Estilo de juego, horarios, objetivos de scrim..." /></label>
      <div style={styles.actionsRowLeft}>
        <Button disabled={!editable || busy || teamName.trim().length < 2} onClick={onSave}>{team ? "Guardar cambios" : "Crear equipo"}</Button>
        {team ? <Link to="/teams/$slug" params={{ slug: team.slug }} className={buildActionClassName({ variant: "secondary", size: "md" })}>Abrir público</Link> : null}
      </div>
    </section>
  );
}

function TeamRosterPanel({ team, onlineSet, isOwner, canManage, busy, onRemoveMember, onEditMember }: {
  team: Team | null;
  onlineSet: Set<string>;
  isOwner: boolean;
  canManage: boolean;
  busy: boolean;
  onRemoveMember: (userId: string, username: string) => void;
  onEditMember: (member: TeamMember) => void;
}) {
  const starters = team ? getStarters(team) : [];
  return (
    <section style={styles.panelLarge}>
      <SectionHeader
        title="Jugadores del equipo"
        eyebrow="Roster"
        icon={<Crown size={16} />}
        meta={<StatusChip tone={starters.length >= 5 ? "success" : "warn"}>{starters.length}/5 titulares</StatusChip>}
      />
      {!team ? <EmptyState text="Crea o únete a un equipo para ver el roster." /> : (
        <div style={styles.rosterList}>{team.members.map((member) => (
          <TeamMemberRow
            key={member.userId}
            member={member}
            online={onlineSet.has(member.userId)}
            isOwner={isOwner}
            canManage={canManage}
            busy={busy}
            onRemoveMember={onRemoveMember}
            onEditMember={onEditMember}
          />
        ))}</div>
      )}
    </section>
  );
}

function InvitePlayersPanel({ canManage, hasTeam, inviteQuery, inviteResults, busy, onQueryChange, onInvite }: { canManage: boolean; hasTeam: boolean; inviteQuery: string; inviteResults: UserSearchResult[]; busy: boolean; onQueryChange: (value: string) => void; onInvite: (userId: string, username: string) => void }) {
  return (
    <section style={styles.panelSmall}>
      <SectionHeader title="Invitar jugadores" eyebrow="Recruiting" icon={<UserPlus size={16} />} meta={<StatusChip tone={canManage ? "success" : "muted"}>{canManage ? "Habilitado" : "Sin permisos"}</StatusChip>} />
      <SearchBox value={inviteQuery} disabled={!canManage || !hasTeam} placeholder="Buscar username para invitar..." onChange={onQueryChange} />
      {!hasTeam ? <EmptyState text="Necesitas equipo para invitar jugadores." /> : !canManage ? <EmptyState text="Solo owner o captain pueden invitar." /> : inviteResults.length === 0 ? <p style={styles.smallMuted}>Escribe al menos 2 caracteres para buscar jugadores.</p> : (
        <div style={styles.stack}>{inviteResults.map((result) => <PlayerSearchResult key={result.id} result={result} busy={busy} onInvite={onInvite} />)}</div>
      )}
    </section>
  );
}

function TeamDirectoryPanel({ teams, totalTeams, query, busy, hasTeam, sentJoinRequests, onQueryChange, onRequestJoin, onCancelRequest }: { teams: Team[]; totalTeams: number; query: string; busy: boolean; hasTeam: boolean; sentJoinRequests: JoinRequest[]; onQueryChange: (value: string) => void; onRequestJoin: (teamId: string) => void; onCancelRequest: (requestId: string) => void }) {
  return (
    <section style={styles.panelSmall}>
      <SectionHeader title="Buscar equipos" eyebrow="Directory" icon={<Search size={16} />} meta={<StatusChip tone="info">{teams.length}/{totalTeams}</StatusChip>} />
      <SearchBox value={query} placeholder="Buscar por equipo, owner o jugador..." onChange={onQueryChange} />
      {teams.length === 0 ? <EmptyState text="No encontramos equipos con ese filtro." /> : (
        <div style={styles.directoryList}>{teams.map((team) => {
          const pending = sentJoinRequests.find((request) => request.teamId === team.id && request.status === "PENDING");
          return <TeamDirectoryCard key={team.id} team={team} pending={pending} busy={busy} hasTeam={hasTeam} onRequestJoin={onRequestJoin} onCancelRequest={onCancelRequest} />;
        })}</div>
      )}
    </section>
  );
}

function RequestsPanel({ invites, sentJoinRequests, incomingJoinRequests, busy, onRespondInvite, onCancelRequest, onRespondJoinRequest }: { invites: TeamInvite[]; sentJoinRequests: JoinRequest[]; incomingJoinRequests: JoinRequest[]; busy: boolean; onRespondInvite: (inviteId: string, response: "ACCEPT" | "DECLINE") => void; onCancelRequest: (requestId: string) => void; onRespondJoinRequest: (requestId: string, response: "ACCEPT" | "DECLINE") => void }) {
  return (
    <section style={styles.requestsGrid}>
      <MiniPanel title="Invitaciones recibidas" eyebrow="Inbox" icon={<ShieldCheck size={15} />}>
        {invites.length === 0 ? <EmptyState text="Sin invitaciones pendientes." compact /> : invites.map((invite) => (
          <article key={invite.id} style={styles.requestCard}>
            <div style={styles.cardHeader}><TeamBadge name={invite.team.name} logoUrl={invite.team.logoUrl} /><strong>{invite.team.name}</strong></div>
            <p style={styles.muted}>Invitado por {invite.invitedBy?.username ? <PlayerLink username={invite.invitedBy.username} style={styles.inlinePlayerLink}>{invite.invitedBy.username}</PlayerLink> : "capitán"}</p>
            <div style={styles.row}><Button disabled={busy} onClick={() => onRespondInvite(invite.id, "ACCEPT")}>Aceptar</Button><Button variant="ghost" disabled={busy} onClick={() => onRespondInvite(invite.id, "DECLINE")}>Rechazar</Button></div>
          </article>
        ))}
      </MiniPanel>
      <MiniPanel title="Solicitudes enviadas" eyebrow="Outbox" icon={<ShieldCheck size={15} />}>
        {sentJoinRequests.length === 0 ? <EmptyState text="Sin solicitudes enviadas." compact /> : sentJoinRequests.map((request) => (
          <article key={request.id} style={styles.requestCard}>
            <strong>{request.team?.slug ? <Link to="/teams/$slug" params={{ slug: request.team.slug }} style={styles.teamNameLink}>{request.team.name}</Link> : request.team?.name ?? "Equipo"}</strong>
            <StatusChip tone={request.status === "PENDING" ? "warn" : "muted"}>{request.status}</StatusChip>
            <Button variant="ghost" disabled={busy} onClick={() => onCancelRequest(request.id)}>Cancelar</Button>
          </article>
        ))}
      </MiniPanel>
      {incomingJoinRequests.length > 0 ? (
        <MiniPanel title="Solicitudes recibidas" eyebrow="Inbox" icon={<ShieldCheck size={15} />}>
          {incomingJoinRequests.map((request) => (
            <article key={request.id} style={styles.requestCard}>
              <strong>{request.user?.username ? <PlayerLink username={request.user.username}>{request.user.username}</PlayerLink> : "Jugador"}</strong>
              <p style={styles.muted}>{request.user?.rank ?? "LVL"} · {request.user?.mmr ?? 0} MMR</p>
              <div style={styles.row}><Button disabled={busy} onClick={() => onRespondJoinRequest(request.id, "ACCEPT")}>Aceptar</Button><Button variant="ghost" disabled={busy} onClick={() => onRespondJoinRequest(request.id, "DECLINE")}>Rechazar</Button></div>
            </article>
          ))}
        </MiniPanel>
      ) : null}
    </section>
  );
}

function PlayerSearchResult({ result, busy, onInvite }: { result: UserSearchResult; busy: boolean; onInvite: (userId: string, username: string) => void }) {
  const rankMeta = result.rank ? getRankMeta(parseRankLevel(result.rank)) : getRankMetaFromMmr(result.mmr);
  return (
    <article style={styles.searchResultRow}>
      <UserAvatar user={result} size="md" />
      <div style={{ minWidth: 0 }}>
        <strong style={styles.truncate}><PlayerLink username={result.username} style={styles.playerLink}>{result.username}</PlayerLink></strong>
        <span style={styles.smallMuted}>{rankMeta.label} · {result.mmr.toLocaleString("es-AR")} MMR</span>
      </div>
      <img src={rankMeta.iconSrc} alt="" style={styles.rankIconSm} />
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => onInvite(result.id, result.username)}>Invitar</Button>
    </article>
  );
}

function TeamDirectoryCard({ team, pending, busy, hasTeam, onRequestJoin, onCancelRequest }: { team: Team; pending?: JoinRequest; busy: boolean; hasTeam: boolean; onRequestJoin: (teamId: string) => void; onCancelRequest: (requestId: string) => void }) {
  const owner = getTeamOwner(team);
  const starters = getStarters(team);
  const avgMmr = getAverageMmr(team.members);
  return (
    <article style={styles.teamCard}>
      <Link to="/teams/$slug" params={{ slug: team.slug }} style={styles.teamCardLink}>
        <TeamBannerVisual team={team} compact />
        <div style={styles.teamCardBody}>
          <TeamBadge name={team.name} logoUrl={team.logoUrl} />
          <div style={{ minWidth: 0 }}>
            <h3 style={styles.teamCardTitle}>{team.name}</h3>
            <p style={styles.smallMuted}>{owner ? <>Owner <span style={styles.inlinePlayerText}>{owner.user.username}</span></> : "Sin owner"} · {team.members.length} miembros</p>
          </div>
          <ExternalLink size={15} color="#7dd3fc" />
        </div>
      </Link>
      <p style={styles.cardDescription}>{team.description || "Equipo disponible para scrims competitivos."}</p>
      <div style={styles.pillRow}>
        <StatusChip tone="info">{avgMmr} MMR</StatusChip>
        <StatusChip tone={starters.length >= 5 ? "success" : "warn"}>{starters.length}/5 titulares</StatusChip>
        <StatusChip tone="muted">{team.availabilityDays?.length ?? 0} días</StatusChip>
      </div>
      {pending ? (
        <Button variant="ghost" disabled={busy} onClick={() => onCancelRequest(pending.id)}>Cancelar solicitud</Button>
      ) : (
        <Button disabled={busy || hasTeam} onClick={() => onRequestJoin(team.id)}>{hasTeam ? "Ya tienes equipo" : "Solicitar ingreso"}</Button>
      )}
    </article>
  );
}

function TeamMemberRow({ member, online, isOwner, canManage, busy, onRemoveMember, onEditMember }: {
  member: TeamMember;
  online: boolean;
  isOwner: boolean;
  canManage: boolean;
  busy: boolean;
  onRemoveMember: (userId: string, username: string) => void;
  onEditMember: (member: TeamMember) => void;
}) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const isBot = Boolean(member.user.isBot);
  const rankMeta = member.user.rank ? getRankMeta(parseRankLevel(member.user.rank)) : getRankMetaFromMmr(member.user.mmr);
  const mainRole = getRoleMeta(member.user.mainRole ?? null);
  const secondaryRole = getRoleMeta(member.user.secondaryRole ?? null);
  const statusTone: "success" | "warn" | "info" = isBot ? "info" : online ? "success" : "warn";
  const isOwnerMember = member.role === "OWNER";

  return (
    <article style={styles.memberRow}>
      <div style={styles.memberAvatarCell}>
        <UserAvatar user={member.user} size="lg" />
      </div>
      <div style={styles.memberIdentity}>
        <strong style={styles.memberName}><PlayerLink username={member.user.username} isBot={isBot}>{member.user.username}</PlayerLink></strong>
        <div style={styles.memberSubline}>
          <CountryBadge countryCode={member.user.countryCode} compact />
          <span>{rankMeta.label}</span>
          <span>{member.user.mmr.toLocaleString("es-AR")} MMR</span>
        </div>
      </div>
      <div style={styles.memberRankBox}>
        <img src={rankMeta.iconSrc} alt="" style={styles.rankIcon} />
      </div>
      <div style={styles.memberRoles}>
        <StatusChip tone={statusTone}>{isBot ? "BOT" : online ? "Online" : "Offline"}</StatusChip>
        <StatusChip tone="muted">{member.role}</StatusChip>
        <StatusChip tone="info">{member.competitiveRole}</StatusChip>
        {mainRole ? <StatusChip tone="warn">{mainRole.label}</StatusChip> : null}
        {secondaryRole ? <StatusChip tone="success">{secondaryRole.label}</StatusChip> : null}
      </div>
      {canManage && !isBot ? (
        <div style={styles.memberActionsCell}>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onEditMember(member)}>
            <Pencil size={13} /> Editar
          </Button>
          {isOwner && !isOwnerMember && (
            confirmRemove ? (
              <div style={styles.confirmInline}>
                <span style={styles.confirmText}>¿Expulsar?</span>
                <button
                  type="button"
                  style={styles.btnDangerSm}
                  disabled={busy}
                  onClick={() => { onRemoveMember(member.userId, member.user.username); setConfirmRemove(false); }}
                >
                  Sí
                </button>
                <button type="button" style={styles.btnGhostSm} disabled={busy} onClick={() => setConfirmRemove(false)}>
                  No
                </button>
              </div>
            ) : (
              <button
                type="button"
                style={styles.btnDangerSm}
                disabled={busy}
                onClick={() => setConfirmRemove(true)}
              >
                <UserMinus size={13} /> Expulsar
              </button>
            )
          )}
        </div>
      ) : null}
    </article>
  );
}

function SectionHeader({ title, eyebrow, icon, meta }: { title: string; eyebrow: string; icon?: ReactNode; meta?: ReactNode }) {
  return <div style={styles.sectionTitleRow}>
    <div>
      <p style={styles.eyebrow}>{icon ? <span style={styles.eyebrowIcon}>{icon}</span> : null}{eyebrow}</p>
      <h2 style={styles.sectionTitle}>{title}</h2>
    </div>
    {meta}
  </div>;
}

function MiniPanel({ title, eyebrow, icon, children }: { title: string; eyebrow: string; icon: ReactNode; children: ReactNode }) {
  return <section style={styles.panelSmall}><SectionHeader title={title} eyebrow={eyebrow} icon={icon} /><div style={styles.stack}>{children}</div></section>;
}

function StatusChip({ children, tone }: { children: ReactNode; tone: "success" | "warn" | "info" | "muted" }) {
  const toneStyle = tone === "success" ? styles.chipSuccess : tone === "warn" ? styles.chipWarn : tone === "info" ? styles.chipInfo : styles.chipMuted;
  return <span style={{ ...styles.chip, ...toneStyle }}>{children}</span>;
}

function MetricGrid({ metrics }: { metrics: Metric[] }) {
  return <div style={styles.metricGrid}>{metrics.map((metric) => (
    <div key={metric.label} style={styles.metricTile}><strong>{metric.value}</strong><span>{metric.label}</span></div>
  ))}</div>;
}

function SearchBox({ value, placeholder, disabled, onChange }: { value: string; placeholder: string; disabled?: boolean; onChange: (value: string) => void }) {
  return <label style={styles.searchBox}><Search size={16} /><input style={styles.searchInput} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>;
}

function TeamBadge({ name, logoUrl, large = false }: { name: string; logoUrl: string | null; large?: boolean }) {
  const size = large ? 82 : 46;
  const logoStyle = logoUrl && large ? styles.teamBadgeLargeImage : null;
  return <div style={{ ...styles.teamBadge, ...logoStyle, width: size, height: size, borderRadius: large ? "50%" : 14 }}>{logoUrl ? <img src={logoUrl} alt="" style={{ width: size, height: size, objectFit: large ? "contain" : "cover", padding: large ? 2 : 0 }} /> : <span>{name.slice(0, 2).toUpperCase()}</span>}</div>;
}

function UserAvatar({ user, size = "md" }: { user: { username: string; avatar: string | null }; size?: "md" | "lg" }) {
  const px = size === "lg" ? 52 : 38;
  return <div style={{ ...styles.avatar, width: px, height: px, borderRadius: size === "lg" ? 15 : 11 }}>{user.avatar ? <img src={user.avatar} alt="" style={{ ...styles.avatarImg, width: px, height: px }} /> : user.username.slice(0, 2).toUpperCase()}</div>;
}

function TeamBannerVisual({ team, compact = false }: { team: Team | null; compact?: boolean }) {
  const height = compact ? 88 : 190;
  return <div style={{ ...styles.bannerVisual, height, backgroundImage: team?.bannerUrl ? `linear-gradient(90deg, rgba(2,6,23,.78), rgba(2,6,23,.22)), url(${team.bannerUrl})` : styles.bannerVisual.backgroundImage }}>
    <div style={styles.bannerGrid} />
    <div style={styles.bannerOrb} />
  </div>;
}

function EmptyState({ text, compact = false }: { text: string; compact?: boolean }) {
  return <div style={{ ...styles.emptyState, minHeight: compact ? 88 : 128 }}><Users size={18} /><p style={styles.muted}>{text}</p></div>;
}

function getTeamOwner(team: Team) {
  return team.members.find((member) => member.role === "OWNER") ?? null;
}

function getStarters(team: Team) {
  return team.members.filter((member) => member.competitiveRole === "STARTER");
}

function getAverageMmr(members: TeamMember[]) {
  const humans = members.filter((member) => !member.user.isBot);
  const source = humans.length > 0 ? humans : members;
  if (source.length === 0) return 0;
  return Math.round(source.reduce((sum, member) => sum + member.user.mmr, 0) / source.length);
}

const panelBase: CSSProperties = {
  border: "1px solid rgba(112,158,255,.2)",
  borderRadius: 18,
  background: "linear-gradient(180deg, rgba(10,20,39,.86), rgba(6,13,27,.82)), radial-gradient(circle at 100% 0%, rgba(55,217,255,.1), transparent 32%)",
  boxShadow: "0 18px 48px rgba(0,0,0,.24), inset 0 1px 0 rgba(255,255,255,.04)",
  padding: "1rem",
  display: "grid",
  gap: "0.9rem",
  minWidth: 0,
};

const styles: Record<string, CSSProperties> = {
  page: { display: "grid", gap: "1rem", paddingBottom: "0.25rem" },
  actionsRow: { display: "inline-flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" },
  actionsRowLeft: { display: "inline-flex", gap: "0.55rem", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-start" },
  error: { padding: "0.85rem 1rem", borderRadius: 12, border: "1px solid rgba(248,113,113,0.45)", background: "rgba(127,29,29,0.22)", color: "#fecaca" },
  notice: { padding: "0.85rem 1rem", borderRadius: 12, border: "1px solid rgba(34,197,94,0.34)", background: "rgba(22,101,52,0.18)", color: "#bbf7d0" },

  profilePreview: { position: "relative", overflow: "hidden", border: "1px solid rgba(93,207,255,.42)", borderRadius: 24, background: "linear-gradient(155deg, rgba(11,30,58,.9), rgba(7,15,30,.9))", boxShadow: "0 22px 60px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.05)" },
  previewContent: { position: "relative", zIndex: 2, display: "grid", gridTemplateColumns: "112px minmax(0,1fr) minmax(300px,.42fr)", gap: "1rem", alignItems: "center", padding: "1.2rem", background: "linear-gradient(180deg, rgba(2,6,23,.46), rgba(2,6,23,.82))" },
  previewBadgeSlot: { display: "grid", placeItems: "center", width: 104, height: 104, borderRadius: "50%", border: "1px solid rgba(255,255,255,.08)", background: "radial-gradient(circle, rgba(55,217,255,.08), transparent 68%)", boxShadow: "0 18px 42px rgba(0,0,0,.24)", padding: 8 },
  previewCopy: { minWidth: 0, display: "grid", gap: "0.45rem" },
  previewTitle: { margin: 0, color: "#fff", fontFamily: "var(--font-display)", fontSize: "clamp(1.8rem, 4vw, 3.8rem)", lineHeight: 0.95, letterSpacing: "-.04em", textTransform: "uppercase", textShadow: "0 0 26px rgba(55,217,255,.22)" },
  previewDescription: { margin: 0, maxWidth: 820, color: "rgba(226,232,240,.74)", lineHeight: 1.5, fontWeight: 650 },
  previewAside: { display: "grid", gap: "0.75rem", justifyItems: "stretch" },

  managementGrid: { display: "grid", gridTemplateColumns: "minmax(330px,.82fr) minmax(460px,1.18fr) minmax(340px,.9fr)", gridTemplateAreas: "\"config roster side\"", gap: "1rem", alignItems: "start" },
  configArea: { gridArea: "config", minWidth: 0 },
  rosterArea: { gridArea: "roster", minWidth: 0 },
  sideArea: { gridArea: "side", minWidth: 0, display: "grid", gap: "1rem", alignContent: "start" },
  panelLarge: { ...panelBase },
  panelSmall: { ...panelBase },
  requestsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: "1rem", alignItems: "start" },

  sectionTitleRow: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.8rem", marginBottom: "0.1rem", flexWrap: "wrap" },
  eyebrow: { margin: 0, color: "#37d9ff", fontSize: "0.68rem", fontWeight: 950, letterSpacing: "0.18em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6, textShadow: "0 0 16px rgba(55,217,255,.28)" },
  eyebrowIcon: { display: "inline-grid", placeItems: "center" },
  sectionTitle: { margin: "0.18rem 0 0", color: "#f8fafc", fontSize: "1.08rem", letterSpacing: "0.03em", textTransform: "uppercase", fontFamily: "var(--font-display)" },

  formGridTwo: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 230px), 1fr))", gap: "0.7rem" },
  fieldLabel: { display: "grid", gap: "0.35rem", color: "rgba(226,232,240,.74)", fontSize: "0.76rem", fontWeight: 900, letterSpacing: ".08em", textTransform: "uppercase" },
  input: { width: "100%", borderRadius: 12, padding: "0.72rem 0.78rem", border: "1px solid rgba(148,163,184,0.24)", background: "rgba(2,6,23,0.72)", color: "#e2e8f0", outline: "none" },
  textarea: { width: "100%", minHeight: 96, borderRadius: 12, padding: "0.72rem 0.78rem", border: "1px solid rgba(148,163,184,0.24)", background: "rgba(2,6,23,0.72)", color: "#e2e8f0", outline: "none", resize: "vertical" },
  dayRow: { display: "flex", flexWrap: "wrap", gap: "0.42rem" },
  day: { minWidth: 44, padding: "0.42rem 0.55rem", borderRadius: 999, border: "1px solid rgba(148,163,184,0.24)", background: "rgba(15,23,42,0.72)", color: "#94a3b8", fontSize: "0.75rem", cursor: "pointer", fontWeight: 900 },
  dayActive: { minWidth: 44, padding: "0.42rem 0.55rem", borderRadius: 999, border: "1px solid rgba(34,197,94,0.36)", background: "rgba(22,101,52,0.24)", color: "#bbf7d0", fontSize: "0.75rem", cursor: "pointer", fontWeight: 950, boxShadow: "0 0 16px rgba(34,197,94,.12)" },

  chip: { display: "inline-flex", alignItems: "center", minHeight: 24, padding: "0.28rem 0.52rem", borderRadius: 999, border: "1px solid transparent", fontSize: "0.72rem", fontWeight: 850, whiteSpace: "nowrap" },
  chipSuccess: { color: "#bbf7d0", background: "rgba(22,101,52,0.22)", borderColor: "rgba(34,197,94,0.28)" },
  chipWarn: { color: "#fde68a", background: "rgba(120,53,15,0.22)", borderColor: "rgba(245,158,11,0.28)" },
  chipInfo: { color: "#bae6fd", background: "rgba(14,165,233,0.14)", borderColor: "rgba(14,165,233,0.24)" },
  chipMuted: { color: "#cbd5e1", background: "rgba(100,116,139,0.16)", borderColor: "rgba(148,163,184,0.18)" },
  pillRow: { display: "flex", flexWrap: "wrap", gap: "0.45rem", alignItems: "center" },

  metricGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(92px, 1fr))", gap: "0.55rem" },
  metricTile: { display: "grid", gap: "0.12rem", borderRadius: 12, padding: "0.6rem 0.68rem", border: "1px solid rgba(148,163,184,0.14)", background: "rgba(2,6,23,0.58)", color: "#e2e8f0" },

  searchBox: { display: "grid", gridTemplateColumns: "auto minmax(0,1fr)", alignItems: "center", gap: "0.55rem", border: "1px solid rgba(125,211,252,.24)", borderRadius: 14, background: "rgba(2,6,23,.68)", padding: "0.7rem .78rem", color: "#7dd3fc" },
  searchInput: { width: "100%", border: 0, outline: "none", background: "transparent", color: "#e2e8f0", fontWeight: 750 },
  stack: { display: "grid", gap: "0.55rem" },
  directoryList: { display: "grid", gap: "0.75rem" },
  teamCard: { border: "1px solid rgba(148,163,184,.16)", borderRadius: 18, background: "linear-gradient(180deg,rgba(15,23,42,.76),rgba(2,6,23,.7))", overflow: "hidden", display: "grid", gap: "0.65rem", padding: "0 0 .8rem" },
  teamCardLink: { display: "grid", color: "inherit", textDecoration: "none" },
  teamCardBody: { display: "grid", gridTemplateColumns: "auto minmax(0,1fr) auto", gap: "0.75rem", alignItems: "center", padding: "0.75rem .8rem 0" },
  teamCardTitle: { margin: 0, color: "#fff", fontFamily: "var(--font-display)", fontSize: "1.04rem", textTransform: "uppercase", letterSpacing: ".04em" },
  cardDescription: { margin: "0 .85rem", color: "rgba(226,232,240,.68)", lineHeight: 1.45, fontSize: ".86rem" },
  teamNameLink: { color: "#f8fafc", fontWeight: 950, textDecoration: "underline", textDecorationColor: "rgba(125,211,252,.3)", textUnderlineOffset: 3 },
  inlinePlayerText: { color: "#bae6fd", fontWeight: 900 },
  inlinePlayerLink: { color: "#bae6fd", fontWeight: 900, textDecoration: "underline", textDecorationColor: "rgba(125,211,252,0.28)", textUnderlineOffset: 3 },
  playerLink: { color: "#e2e8f0", fontWeight: 900, textDecoration: "underline", textDecorationColor: "rgba(125,211,252,0.28)", textUnderlineOffset: 3 },

  rosterList: { display: "grid", gap: "0.65rem" },
  memberRow: { display: "grid", gridTemplateColumns: "64px minmax(0,1fr) 58px auto", gridTemplateAreas: "\"avatar identity rank actions\" \"roles roles roles actions\"", gap: "0.7rem 0.8rem", alignItems: "center", border: "1px solid rgba(148,163,184,.14)", borderRadius: 16, background: "linear-gradient(90deg,rgba(15,23,42,.74),rgba(8,18,38,.56))", padding: ".78rem" },
  memberAvatarCell: { gridArea: "avatar", alignSelf: "center" },
  memberIdentity: { gridArea: "identity", minWidth: 0, display: "grid", gap: ".18rem" },
  memberName: { color: "#fff", fontSize: "1rem", fontWeight: 950, minWidth: 0 },
  memberSubline: { display: "inline-flex", alignItems: "center", gap: ".45rem", color: "rgba(226,232,240,.62)", fontSize: ".76rem", flexWrap: "wrap" },
  memberRankBox: { gridArea: "rank", display: "grid", placeItems: "center", justifySelf: "end", width: 48, height: 48, borderRadius: 14, border: "1px solid rgba(125,211,252,.18)", background: "rgba(2,6,23,.62)" },
  rankIcon: { width: 42, height: 42, objectFit: "contain", filter: "drop-shadow(0 0 10px rgba(55,217,255,.32))" },
  rankIconSm: { width: 34, height: 34, objectFit: "contain" },
  memberRoles: { gridArea: "roles", display: "flex", alignItems: "center", gap: ".35rem", flexWrap: "wrap" },
  memberSelect: { gridArea: "select", justifySelf: "end", minWidth: 160 },
  select: { width: "100%", borderRadius: 12, padding: "0.56rem 0.62rem", border: "1px solid rgba(125,211,252,0.3)", background: "rgba(2,6,23,0.82)", color: "#e2e8f0" },

  searchResultRow: { display: "grid", gridTemplateColumns: "auto minmax(0,1fr) auto auto", gap: "0.65rem", alignItems: "center", border: "1px solid rgba(148,163,184,.14)", borderRadius: 14, background: "rgba(15,23,42,.62)", padding: ".6rem" },
  requestCard: { border: "1px solid rgba(148,163,184,.14)", borderRadius: 14, background: "rgba(15,23,42,.62)", padding: ".72rem", display: "grid", gap: ".5rem" },
  cardHeader: { display: "flex", alignItems: "center", gap: "0.55rem", minWidth: 0 },
  row: { display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" },
  muted: { margin: 0, color: "rgba(226,232,240,0.66)", fontSize: "0.86rem", lineHeight: 1.45 },
  smallMuted: { margin: 0, color: "rgba(226,232,240,0.56)", fontSize: "0.76rem", lineHeight: 1.35 },
  truncate: { display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#f8fafc" },

  teamBadge: { flex: "0 0 auto", display: "grid", placeItems: "center", border: "1px solid rgba(125,211,252,.3)", background: "linear-gradient(135deg, #00c8ff, #1e3a8a 52%, #7c3aed)", color: "#f8fafc", fontWeight: 950, overflow: "hidden", boxShadow: "0 0 24px rgba(55,217,255,.18)" },
  teamBadgeLargeImage: { border: "0", background: "transparent", boxShadow: "0 0 28px rgba(55,217,255,.22), 0 12px 34px rgba(0,0,0,.32)" },
  avatar: { display: "grid", placeItems: "center", overflow: "hidden", flex: "0 0 auto", background: "linear-gradient(135deg,#0f172a,#172554)", color: "#7dd3fc", fontSize: "0.72rem", fontWeight: 950, border: "1px solid rgba(125,211,252,0.25)" },
  avatarImg: { objectFit: "cover" },
  bannerVisual: { position: "relative", overflow: "hidden", backgroundImage: "radial-gradient(circle at 18% 28%, rgba(55,217,255,.34), transparent 24%), radial-gradient(circle at 86% 18%, rgba(155,85,255,.38), transparent 28%), linear-gradient(135deg,#071326,#111b45 46%,#1b1038)", backgroundSize: "cover", backgroundPosition: "center" },
  bannerGrid: { position: "absolute", inset: 0, opacity: .26, backgroundImage: "linear-gradient(rgba(125,211,252,.14) 1px, transparent 1px), linear-gradient(90deg, rgba(125,211,252,.14) 1px, transparent 1px)", backgroundSize: "34px 34px" },
  bannerOrb: { position: "absolute", right: "8%", top: "18%", width: 130, height: 130, borderRadius: "50%", border: "1px solid rgba(125,211,252,.24)", background: "radial-gradient(circle, rgba(55,217,255,.14), transparent 62%)", boxShadow: "0 0 44px rgba(155,85,255,.22)" },

  emptyState: { borderRadius: 14, display: "grid", placeItems: "center", textAlign: "center", border: "1px dashed rgba(148,163,184,0.2)", color: "#94a3b8", gap: "0.35rem", padding: "0.7rem" },
  skeletonHero: { border: "1px solid rgba(148,163,184,0.18)", borderRadius: 18, background: "rgba(15,23,42,0.68)", padding: "1rem", display: "grid", gap: "0.7rem" },
  skeletonLineLg: { height: 26, width: "44%", background: "rgba(148,163,184,0.2)", animation: "pulseGlow 1.4s ease-in-out infinite" },
  skeletonLineMd: { height: 14, width: "68%", background: "rgba(148,163,184,0.16)", animation: "pulseGlow 1.4s ease-in-out infinite" },
  metricSkeleton: { minHeight: 54, border: "1px solid rgba(148,163,184,0.12)", background: "rgba(2,6,23,0.58)", animation: "pulseGlow 1.4s ease-in-out infinite" },
  listSkeleton: { ...panelBase, minHeight: 220, animation: "pulseGlow 1.4s ease-in-out infinite" },
  listSkeletonTall: { ...panelBase, minHeight: 520, animation: "pulseGlow 1.4s ease-in-out infinite" },

  memberActionsCell: {
    gridArea: "actions",
    display: "flex",
    alignItems: "center",
    gap: 6,
    justifySelf: "end",
    flexWrap: "wrap" as const,
  },
  confirmInline: {
    display: "flex",
    alignItems: "center",
    gap: 5,
  },
  confirmText: {
    color: "rgba(255,100,130,.9)",
    fontSize: 11,
    fontWeight: 800,
    whiteSpace: "nowrap" as const,
  },
  btnDangerSm: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    minHeight: 28,
    padding: "0 10px",
    borderRadius: 7,
    border: "1px solid rgba(255,90,120,.45)",
    background: "rgba(255,60,90,.12)",
    color: "rgba(255,130,150,.92)",
    fontSize: 11,
    fontWeight: 900,
    cursor: "pointer",
    letterSpacing: ".06em",
  },
  btnGhostSm: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    minHeight: 28,
    padding: "0 10px",
    borderRadius: 7,
    border: "1px solid rgba(148,163,184,.2)",
    background: "rgba(10,20,40,.5)",
    color: "rgba(180,195,225,.72)",
    fontSize: 11,
    fontWeight: 900,
    cursor: "pointer",
  },
};
