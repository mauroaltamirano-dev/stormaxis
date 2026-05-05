import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft, BarChart3, Check, Clock3, ExternalLink, Link as LinkIcon, Pencil, Save, Search, Settings, ShieldCheck, Trash2, UserMinus, UserPlus, Users, X } from "lucide-react";
import { api } from "../lib/api";
import { Button, buildActionClassName } from "../components/ui";
import { PlayerLink } from "../components/PlayerLink";
import { CountryBadge } from "../components/CountryBadge";
import { COUNTRY_OPTIONS, getCountryName } from "../lib/countries";
import { getRankMeta, getRankMetaFromMmr, parseRankLevel } from "../lib/ranks";
import { getRoleIconSources, getRoleMeta } from "../lib/roles";
import { canShowTeamSettings, getSelectedPlayerRoles, summarizePublicTeamStats, type Metric } from "./teamsScrimsUi";

type PlayerRole = "RANGED" | "HEALER" | "OFFLANE" | "FLEX" | "TANK";
type CompetitiveRole = "UNASSIGNED" | "CAPTAIN" | "STARTER" | "SUBSTITUTE" | "COACH" | "STAFF";
type TeamRole = "OWNER" | "CAPTAIN" | "MEMBER";
type ActiveTab = "overview" | "stats" | "settings";

type SocialLink = { label: string; url: string };
type InviteSearchResult = { id: string; username: string; avatar: string | null; mmr: number; rank?: string | null; };
type TeamPendingInvite = {
  id: string;
  status: string;
  createdAt: string;
  invitedUser: { id: string; username: string; avatar: string | null; mmr: number; rank?: string | null };
  invitedBy?: { id: string; username: string; avatar: string | null } | null;
};
type TeamIncomingJoinRequest = {
  id: string;
  status: string;
  createdAt: string;
  user: { id: string; username: string; avatar: string | null; mmr: number; rank?: string | null };
};

type PublicTeamMember = {
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

type PublicTeam = {
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
  socialLinks?: SocialLink[] | null;
  availabilityDays?: string[] | null;
  ownerId: string;
  viewerRole?: TeamRole | null;
  viewerHasTeam?: boolean;
  viewerPendingInvite?: { id: string; status: string; createdAt: string } | null;
  viewerPendingJoinRequest?: { id: string; status: string; createdAt: string } | null;
  pendingInvites?: TeamPendingInvite[];
  incomingJoinRequests?: TeamIncomingJoinRequest[];
  canEdit?: boolean;
  members: PublicTeamMember[];
};

type PublicTeamStats = {
  summary: { totalMatches: number; wins: number; losses: number; winrate: number; recentResults: string[] };
  mapStats: Array<{ map: string; matches: number; wins: number; winrate: number }>;
  performance: Array<{ matchId: string; createdAt: string; value: number }>;
  matches: PublicTeamMatch[];
  nextCursor: string | null;
};

type PublicTeamMatch = {
  id: string;
  createdAt: string;
  selectedMap: string;
  duration: number | null;
  result: "W" | "L";
  teamSide: number | null;
  winner: number | null;
  opponentName: string;
};

type SettingsForm = {
  name: string;
  logoUrl: string;
  bannerUrl: string;
  description: string;
  countryCode: string;
  about: string;
  availabilityDays: string[];
  isRecruiting: boolean;
  recruitingRoles: PlayerRole[];
  socialLinks: SocialLink[];
};

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const DAY_LABELS: Record<string, string> = { MON: "Lun", TUE: "Mar", WED: "Mié", THU: "Jue", FRI: "Vie", SAT: "Sáb", SUN: "Dom" };
const ROLE_OPTIONS: PlayerRole[] = ["RANGED", "HEALER", "OFFLANE", "FLEX", "TANK"];

function getApiErrorMessage(err: any, fallback: string) {
  return err?.response?.data?.error?.message ?? err?.response?.data?.message ?? fallback;
}

export default function TeamPublicProfile() {
  const { slug } = useParams({ strict: false }) as { slug: string };
  const navigate = useNavigate();
  const [team, setTeam] = useState<PublicTeam | null>(null);
  const [stats, setStats] = useState<PublicTeamStats | null>(null);
  const [matches, setMatches] = useState<PublicTeamMatch[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [tab, setTab] = useState<ActiveTab>("overview");
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<SettingsForm>(() => emptySettingsForm());
  const [editingMember, setEditingMember] = useState<PublicTeamMember | null>(null);
  const [inviteQuery, setInviteQuery] = useState("");
  const [inviteResults, setInviteResults] = useState<InviteSearchResult[]>([]);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const isOwner = team?.viewerRole === "OWNER";

  const canEdit = canShowTeamSettings(team?.viewerRole ?? null) || Boolean(team?.canEdit);
  const canManageTeam = team?.viewerRole === "OWNER" || team?.viewerRole === "CAPTAIN";
  const avgMmr = useMemo(() => team ? getAverageMmr(team.members) : 0, [team]);
  const starters = useMemo(() => team ? team.members.filter((member) => member.competitiveRole === "STARTER") : [], [team]);

  async function loadTeam() {
    setError(null);
    const { data } = await api.get<{ team: PublicTeam }>(`/teams/public/${encodeURIComponent(slug)}`);
    setTeam(data.team);
    setForm(settingsFormFromTeam(data.team));
  }

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    api.get<{ team: PublicTeam }>(`/teams/public/${encodeURIComponent(slug)}`)
      .then(({ data }) => {
        if (!alive) return;
        setTeam(data.team);
        setForm(settingsFormFromTeam(data.team));
        if (!canShowTeamSettings(data.team.viewerRole ?? null)) setTab("overview");
      })
      .catch((err) => { if (alive) setError(err.response?.data?.message ?? "No se pudo cargar el equipo."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [slug]);

  async function loadStats(cursor?: string | null, append = false) {
    if (!append) setStatsLoading(true);
    if (append) setLoadingMore(true);
    try {
      const { data } = await api.get<PublicTeamStats>(`/teams/public/${encodeURIComponent(slug)}/stats`, {
        params: { limit: 10, ...(cursor ? { cursor } : {}) },
      });
      setStats(data);
      setMatches((current) => append ? [...current, ...data.matches] : data.matches);
      setNextCursor(data.nextCursor);
    } catch (err: any) {
      setError(err.response?.data?.message ?? "No se pudieron cargar estadísticas del equipo.");
    } finally {
      setStatsLoading(false);
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    if (tab !== "stats" || !team || stats) return;
    void loadStats();
  }, [tab, team, stats]);

  useEffect(() => {
    if (tab !== "stats" || !nextCursor) return;
    const node = loadMoreRef.current;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && nextCursor && !loadingMore) {
        void loadStats(nextCursor, true);
      }
    }, { rootMargin: "240px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [tab, nextCursor, loadingMore]);

  // Debounced player search for invite
  useEffect(() => {
    if (inviteQuery.trim().length < 2) { setInviteResults([]); return; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get<InviteSearchResult[] | { users: InviteSearchResult[] }>("/users/search", { params: { q: inviteQuery, limit: 8 } });
        if (!cancelled) setInviteResults(Array.isArray(data) ? data : (data as any).users ?? []);
      } catch { if (!cancelled) setInviteResults([]); }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [inviteQuery]);

  async function invitePlayer(userId: string, username: string) {
    if (!team) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/teams/invites", { teamId: team.id, invitedUserId: userId });
      setInvitedIds((prev) => new Set([...prev, userId]));
      setNotice(`Invitación enviada a ${username}.`);
      await loadTeam();
    } catch (err: any) {
      setError(getApiErrorMessage(err, "No se pudo enviar la invitación."));
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(userId: string, username: string) {
    if (!team || !canEdit) return;
    setBusy(true);
    setError(null);
    try {
      await api.delete(`/teams/${team.id}/members/${userId}`);
      setNotice(`${username} fue removido del equipo.`);
      await loadTeam();
    } catch (err: any) {
      setError(err.response?.data?.message ?? "No se pudo remover al jugador.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveMemberEdit(userId: string, competitiveRole: CompetitiveRole, teamRole: TeamRole) {
    if (!team || !canEdit) return;
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/teams/${team.id}/members/${userId}/competitive-role`, { competitiveRole });
      const current = team.members.find((m) => m.userId === userId);
      if (current && current.role !== "OWNER" && teamRole !== current.role) {
        await api.patch(`/teams/${team.id}/members/${userId}/role`, { role: teamRole });
      }
      setEditingMember(null);
      setNotice("Miembro actualizado.");
      await loadTeam();
    } catch (err: any) {
      setError(err.response?.data?.message ?? "No se pudo actualizar el miembro.");
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings() {
    if (!team || !canEdit) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.patch(`/teams/${team.id}`, {
        name: form.name,
        logoUrl: form.logoUrl || null,
        bannerUrl: form.bannerUrl || null,
        description: form.description || null,
        countryCode: form.countryCode || null,
        about: form.about || null,
        availabilityDays: form.availabilityDays,
        isRecruiting: form.isRecruiting,
        recruitingRoles: form.recruitingRoles,
        socialLinks: form.socialLinks.filter((link) => link.label.trim() && link.url.trim()),
      });
      setNotice("Ajustes del equipo guardados.");
      await loadTeam();
    } catch (err: any) {
      setError(err.response?.data?.message ?? "No se pudieron guardar los ajustes.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteCurrentTeam() {
    if (!team || !canEdit) return;
    const confirmed = window.confirm(`¿Borrar el equipo ${team.name}? Se archivará y los miembros quedarán sin equipo.`);
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      await api.delete(`/teams/${team.id}`);
      await navigate({ to: "/teams" });
    } catch (err: any) {
      setError(err.response?.data?.message ?? "No se pudo borrar el equipo.");
    } finally {
      setBusy(false);
    }
  }

  async function respondViewerInvite(response: "ACCEPT" | "DECLINE") {
    if (!team?.viewerPendingInvite) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.post(`/teams/invites/${team.viewerPendingInvite.id}/respond`, { response });
      setNotice(response === "ACCEPT" ? "Invitación aceptada. Ya sos parte del team." : "Invitación rechazada.");
      await loadTeam();
    } catch (err: any) {
      setError(err.response?.data?.error?.message ?? err.response?.data?.message ?? "No se pudo responder la invitación.");
    } finally {
      setBusy(false);
    }
  }

  async function requestJoinTeam() {
    if (!team) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.post("/teams/join-requests", { teamId: team.id });
      setNotice("Solicitud enviada al team. Queda pendiente.");
      await loadTeam();
    } catch (err: any) {
      setError(err.response?.data?.error?.message ?? err.response?.data?.message ?? "No se pudo enviar la solicitud.");
    } finally {
      setBusy(false);
    }
  }

  async function respondIncomingJoinRequest(requestId: string, response: "ACCEPT" | "DECLINE") {
    if (!team || !canManageTeam) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.post(`/teams/join-requests/${requestId}/respond`, { response });
      setNotice(response === "ACCEPT" ? "Solicitud aceptada. Jugador añadido al equipo." : "Solicitud rechazada.");
      await loadTeam();
    } catch (err: any) {
      setError(err.response?.data?.error?.message ?? err.response?.data?.message ?? "No se pudo responder la solicitud.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <TeamProfileShell><div style={styles.skeleton} /></TeamProfileShell>;
  if (error && !team) return <TeamProfileShell><ErrorPanel error={error} /></TeamProfileShell>;
  if (!team) return <TeamProfileShell><ErrorPanel error="El equipo no existe o no está activo." /></TeamProfileShell>;

  const tabs: Array<{ key: ActiveTab; label: string; icon: ReactNode }> = [
    { key: "overview", label: "Descripción general", icon: <Users size={15} /> },
    { key: "stats", label: "Estadísticas", icon: <BarChart3 size={15} /> },
    ...(canEdit ? [{ key: "settings" as const, label: "Ajustes", icon: <Settings size={15} /> }] : []),
  ];

  return (
    <TeamProfileShell>
      <section style={styles.faceitShell}>
        <Hero team={team} avgMmr={avgMmr} canEdit={canEdit} onEdit={() => setTab("settings")} />
        <nav style={styles.tabs} aria-label="Secciones del perfil de equipo">
          {tabs.map((entry) => (
            <button key={entry.key} type="button" style={tab === entry.key ? styles.tabActive : styles.tab} onClick={() => setTab(entry.key)}>
              {entry.icon}{entry.label}
            </button>
          ))}
        </nav>
        {error ? <div style={styles.error}>{error}</div> : null}
        {notice ? <div style={styles.notice}>{notice}</div> : null}
        <TeamAccessPanel
          team={team}
          busy={busy}
          onAcceptInvite={() => respondViewerInvite("ACCEPT")}
          onDeclineInvite={() => respondViewerInvite("DECLINE")}
          onRequestJoin={requestJoinTeam}
        />
        {tab === "overview" ? (
          <OverviewPanel
            team={team}
            starters={starters.length}
            canEdit={canEdit}
            canManageTeam={canManageTeam}
            isOwner={isOwner}
            busy={busy}
            inviteQuery={inviteQuery}
            inviteResults={inviteResults}
            invitedIds={invitedIds}
            onInviteQueryChange={setInviteQuery}
            onInvitePlayer={invitePlayer}
            onRespondJoinRequest={respondIncomingJoinRequest}
            onEditMember={setEditingMember}
            onRemoveMember={removeMember}
          />
        ) : null}
        {editingMember && (
          <MemberEditModal
            member={editingMember}
            isOwner={team.viewerRole === "OWNER"}
            busy={busy}
            onSave={handleSaveMemberEdit}
            onClose={() => setEditingMember(null)}
          />
        )}
        {tab === "stats" ? <StatsPanel stats={stats} matches={matches} loading={statsLoading} loadingMore={loadingMore} nextCursor={nextCursor} loadMoreRef={loadMoreRef} /> : null}
        {tab === "settings" && canEdit ? <SettingsPanel form={form} setForm={setForm} busy={busy} onSave={saveSettings} onDelete={deleteCurrentTeam} /> : null}
      </section>
    </TeamProfileShell>
  );
}

function TeamAccessPanel({
  team,
  busy,
  onAcceptInvite,
  onDeclineInvite,
  onRequestJoin,
}: {
  team: PublicTeam;
  busy: boolean;
  onAcceptInvite: () => void;
  onDeclineInvite: () => void;
  onRequestJoin: () => void;
}) {
  if (team.viewerRole) return null;

  if (team.viewerPendingInvite) {
    return (
      <section style={styles.accessPanel}>
        <div>
          <strong style={styles.accessTitle}>Invitación pendiente</strong>
          <p style={styles.accessText}>Este team te invitó a sumarte. Aceptá para entrar o rechazá la solicitud.</p>
        </div>
        <div style={styles.accessActions}>
          <Button disabled={busy} onClick={onAcceptInvite}><Check size={14} /> Aceptar</Button>
          <Button variant="ghost" disabled={busy} onClick={onDeclineInvite}><X size={14} /> Rechazar</Button>
        </div>
      </section>
    );
  }

  if (team.viewerPendingJoinRequest) {
    return (
      <section style={styles.accessPanel}>
        <div>
          <strong style={styles.accessTitle}>Solicitud pendiente</strong>
          <p style={styles.accessText}>Ya pediste ingresar a este team. Esperá la decisión del líder o captain.</p>
        </div>
        <span style={styles.pendingJoinPill}><Clock3 size={14} /> Pendiente</span>
      </section>
    );
  }

  if (team.viewerHasTeam) return null;

  return (
    <section style={styles.accessPanel}>
      <div>
        <strong style={styles.accessTitle}>¿Querés entrar a este team?</strong>
        <p style={styles.accessText}>Enviá una solicitud de ingreso. El líder verá la notificación para aceptarte o rechazarte.</p>
      </div>
      <Button disabled={busy} onClick={onRequestJoin}><UserPlus size={14} /> Solicitar ingreso</Button>
    </section>
  );
}

function Hero({ team, avgMmr, canEdit, onEdit }: { team: PublicTeam; avgMmr: number; canEdit: boolean; onEdit: () => void }) {
  return (
    <header style={styles.hero}>
      <div style={{ ...styles.cover, backgroundImage: team.bannerUrl ? `linear-gradient(180deg, rgba(8,12,20,.18), rgba(8,12,20,.92)), linear-gradient(90deg, rgba(7,19,38,.38), rgba(17,27,69,.58)), url(${team.bannerUrl})` : styles.cover.backgroundImage }} />
      <div style={styles.heroInfoBar}>
        <TeamEmblem name={team.name} logoUrl={team.logoUrl} />
        <div style={styles.heroCopy}>
          <div style={styles.nameRow}>
            <h1 style={styles.title}>{team.name}</h1>
            <CountryBadge countryCode={team.countryCode} />
          </div>
          <p style={styles.gameLine}><ShieldCheck size={14} /> Heroes of the Storm · {getCountryName(team.countryCode)}</p>
          <p style={styles.eloLine}>{avgMmr.toLocaleString("es-AR")} ELO promedio · {team.members.length} miembros</p>
        </div>
        <div style={styles.heroActions}>
          <Link to="/teams" className={buildActionClassName({ variant: "secondary", size: "md" })}><ArrowLeft size={14} /> Mi escuadra</Link>
          {canEdit ? <Button variant="ghost" onClick={onEdit}><Settings size={14} /> Editar equipo</Button> : null}
        </div>
      </div>
    </header>
  );
}

function OverviewPanel({
  team, starters, canEdit, canManageTeam, isOwner, busy,
  inviteQuery, inviteResults, invitedIds,
  onInviteQueryChange, onInvitePlayer, onRespondJoinRequest, onEditMember, onRemoveMember,
}: {
  team: PublicTeam;
  starters: number;
  canEdit: boolean;
  canManageTeam: boolean;
  isOwner: boolean;
  busy: boolean;
  inviteQuery: string;
  inviteResults: InviteSearchResult[];
  invitedIds: Set<string>;
  onInviteQueryChange: (v: string) => void;
  onInvitePlayer: (userId: string, username: string) => void;
  onRespondJoinRequest: (requestId: string, response: "ACCEPT" | "DECLINE") => void;
  onEditMember: (m: PublicTeamMember) => void;
  onRemoveMember: (userId: string, username: string) => void;
}) {
  return (
    <section style={styles.overviewGrid}>
      <div style={styles.mainColumn}>
        {canEdit && (
          <div style={styles.ownerBanner}>
            <ShieldCheck size={15} />
            <span>Sos el <strong>líder</strong> de este equipo — pods editar roles, expulsar miembros e invitar jugadores.</span>
          </div>
        )}
        <Panel title="Miembros del equipo" eyebrow={`${team.members.length} miembros · ${starters}/5 titulares`}>
          <div style={styles.memberList}>
            {team.members.map((member) => (
              <MemberRow
                key={member.userId}
                member={member}
                canEdit={canEdit}
                isOwner={isOwner}
                busy={busy}
                onEditMember={onEditMember}
                onRemoveMember={onRemoveMember}
              />
            ))}
          </div>
        </Panel>

        {canEdit && (
          <Panel
            title="Invitar jugadores"
            eyebrow="Recruiting · Solo líder"
          >
            <div style={styles.inviteSearchWrap}>
              <span style={styles.inviteSearchIcon}><Search size={15} /></span>
              <input
                style={styles.inviteSearchInput}
                type="search"
                placeholder="Buscar jugador por username..."
                value={inviteQuery}
                onChange={(e) => onInviteQueryChange(e.target.value)}
                autoComplete="off"
              />
            </div>

            {inviteQuery.length > 0 && inviteQuery.length < 2 && (
              <p style={styles.inviteHint}>Escribí al menos 2 caracteres para buscar.</p>
            )}

            {inviteResults.length > 0 && (
              <div style={styles.inviteResultList}>
                {inviteResults.map((player) => (
                  <InviteResultRow
                    key={player.id}
                    player={player}
                    invited={invitedIds.has(player.id)}
                    busy={busy}
                    onInvite={onInvitePlayer}
                  />
                ))}
              </div>
            )}

            {inviteQuery.length >= 2 && inviteResults.length === 0 && (
              <p style={styles.inviteHint}>Sin resultados para “{inviteQuery}”.</p>
            )}
          </Panel>
        )}

        {canManageTeam && (
          <RequestsManagementPanel
            incomingJoinRequests={team.incomingJoinRequests ?? []}
            pendingInvites={team.pendingInvites ?? []}
            busy={busy}
            onRespondJoinRequest={onRespondJoinRequest}
          />
        )}
      </div>
      <aside style={styles.aboutColumn}>
        <Panel title="About" eyebrow="Información pública">
          <AboutContent team={team} />
        </Panel>
      </aside>
    </section>
  );
}

function AboutContent({ team }: { team: PublicTeam }) {
  return (
    <div style={styles.aboutStack}>
      <p style={styles.aboutText}>{team.about || team.description || "Aún no has añadido una descripción."}</p>
      <div style={styles.aboutBlock}>
        <strong>Días de treino</strong>
        <div style={styles.dayGrid}>{(team.availabilityDays?.length ? team.availabilityDays : []).map((day) => <span key={day} style={styles.dayActive}>{DAY_LABELS[day] ?? day}</span>)}</div>
        {!team.availabilityDays?.length ? <p style={styles.muted}>Sin disponibilidad pública.</p> : null}
      </div>
      <div style={styles.aboutBlock}>
        <strong>Recruiting</strong>
        <p style={styles.muted}>{team.isRecruiting ? "Buscando jugadores" : "No busca jugadores ahora"}</p>
        {team.isRecruiting && team.recruitingRoles?.length ? <div style={styles.pillRow}>{team.recruitingRoles.map((role) => <Chip key={role} tone="warn">{getRoleMeta(role)?.label ?? role}</Chip>)}</div> : null}
      </div>
      {team.socialLinks?.length ? <div style={styles.aboutBlock}><strong>Redes</strong>{team.socialLinks.map((link) => <a key={`${link.label}-${link.url}`} href={link.url} target="_blank" rel="noreferrer" style={styles.socialLink}><LinkIcon size={14} />{link.label}<ExternalLink size={13} /></a>)}</div> : null}
    </div>
  );
}

function RequestsManagementPanel({ incomingJoinRequests, pendingInvites, busy, onRespondJoinRequest }: {
  incomingJoinRequests: TeamIncomingJoinRequest[];
  pendingInvites: TeamPendingInvite[];
  busy: boolean;
  onRespondJoinRequest: (requestId: string, response: "ACCEPT" | "DECLINE") => void;
}) {
  return (
    <Panel title="Solicitudes e invitaciones" eyebrow={`${incomingJoinRequests.length} solicitudes · ${pendingInvites.length} invitaciones`}>
      <div style={styles.requestColumns}>
        <div style={styles.requestColumn}>
          <h3 style={styles.requestTitle}>Quieren entrar</h3>
          {incomingJoinRequests.length === 0 ? (
            <p style={styles.inviteHint}>No hay solicitudes pendientes.</p>
          ) : (
            <div style={styles.requestList}>
              {incomingJoinRequests.map((request) => (
                <div key={request.id} style={styles.requestRow}>
                  <Avatar user={request.user} />
                  <div style={styles.inviteResultInfo}>
                    <strong><PlayerLink username={request.user.username}>{request.user.username}</PlayerLink></strong>
                    <span style={styles.memberMeta}>{request.user.mmr.toLocaleString("es-AR")} MMR · {formatDate(request.createdAt)}</span>
                  </div>
                  <div style={styles.requestActions}>
                    <Button disabled={busy} onClick={() => onRespondJoinRequest(request.id, "ACCEPT")}><Check size={13} /> Aceptar</Button>
                    <Button variant="ghost" disabled={busy} onClick={() => onRespondJoinRequest(request.id, "DECLINE")}><X size={13} /> Rechazar</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={styles.requestColumn}>
          <h3 style={styles.requestTitle}>Invitaciones enviadas</h3>
          {pendingInvites.length === 0 ? (
            <p style={styles.inviteHint}>No hay invitaciones pendientes.</p>
          ) : (
            <div style={styles.requestList}>
              {pendingInvites.map((invite) => (
                <div key={invite.id} style={styles.requestRow}>
                  <Avatar user={invite.invitedUser} />
                  <div style={styles.inviteResultInfo}>
                    <strong><PlayerLink username={invite.invitedUser.username}>{invite.invitedUser.username}</PlayerLink></strong>
                    <span style={styles.memberMeta}>Pendiente · {formatDate(invite.createdAt)}</span>
                  </div>
                  <span style={styles.pendingJoinPill}><Clock3 size={13} /> Pendiente</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

function StatsPanel({ stats, matches, loading, loadingMore, nextCursor, loadMoreRef }: { stats: PublicTeamStats | null; matches: PublicTeamMatch[]; loading: boolean; loadingMore: boolean; nextCursor: string | null; loadMoreRef: React.RefObject<HTMLDivElement | null> }) {
  if (loading && !stats) return <div style={styles.skeleton} />;
  const cards: Metric[] = stats ? summarizePublicTeamStats(stats.summary) : [];
  return (
    <section style={styles.statsStack}>
      <Panel title="Estadísticas principales" eyebrow="Scrims completados">
        <div style={styles.statCards}>{cards.map((card) => <StatCard key={card.label} {...card} />)}</div>
      </Panel>
      <Panel title="Preferencias de juego" eyebrow="Stats por mapas">
        <MapStatsTable mapStats={stats?.mapStats ?? []} />
      </Panel>
      <Panel title="Estadísticas de rendimiento" eyebrow="Rolling winrate del equipo">
        <PerformanceChart points={stats?.performance ?? []} />
      </Panel>
      <Panel title="Historial de partidas" eyebrow="Carga incremental">
        <MatchHistory matches={matches} />
        <div ref={loadMoreRef} style={styles.loadMoreSentinel}>{loadingMore ? "Cargando 10 más…" : nextCursor ? "Baja para cargar más" : "No hay más partidas"}</div>
      </Panel>
    </section>
  );
}

function SettingsPanel({ form, setForm, busy, onSave, onDelete }: { form: SettingsForm; setForm: React.Dispatch<React.SetStateAction<SettingsForm>>; busy: boolean; onSave: () => void; onDelete: () => void }) {
  return (
    <section style={styles.settingsGrid}>
      <Panel title="Ajustes del equipo" eyebrow="Solo líder">
        <div style={styles.formGrid}>
          <Field label="Nombre"><input style={styles.input} value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} /></Field>
          <Field label="País"><select style={styles.input} value={form.countryCode} onChange={(event) => setForm((prev) => ({ ...prev, countryCode: event.target.value }))}><option value="">Sin país</option>{COUNTRY_OPTIONS.map((country) => <option key={country.code} value={country.code}>{country.flag} {country.name}</option>)}</select></Field>
          <Field label="Logo URL"><input style={styles.input} value={form.logoUrl} onChange={(event) => setForm((prev) => ({ ...prev, logoUrl: event.target.value }))} placeholder="https://.../logo.png" /></Field>
          <Field label="Portada URL"><input style={styles.input} value={form.bannerUrl} onChange={(event) => setForm((prev) => ({ ...prev, bannerUrl: event.target.value }))} placeholder="https://.../cover.jpg" /></Field>
        </div>
        <Field label="Tagline"><input style={styles.input} value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} placeholder="Resumen corto del equipo" /></Field>
        <Field label="About"><textarea style={styles.textarea} value={form.about} onChange={(event) => setForm((prev) => ({ ...prev, about: event.target.value }))} placeholder="Sobre nosotros, horarios, objetivos, estilo de juego..." /></Field>
        <Field label="Días de treino"><div style={styles.dayGrid}>{DAYS.map((day) => <button key={day} type="button" style={form.availabilityDays.includes(day) ? styles.dayActive : styles.day} onClick={() => setForm((prev) => ({ ...prev, availabilityDays: prev.availabilityDays.includes(day) ? prev.availabilityDays.filter((entry) => entry !== day) : [...prev.availabilityDays, day] }))}>{DAY_LABELS[day]}</button>)}</div></Field>
        <Field label="Búsqueda de jugadores"><label style={styles.checkboxRow}><input type="checkbox" checked={form.isRecruiting} onChange={(event) => setForm((prev) => ({ ...prev, isRecruiting: event.target.checked }))} /> Estamos buscando jugadores</label><div style={styles.dayGrid}>{ROLE_OPTIONS.map((role) => <button key={role} type="button" style={form.recruitingRoles.includes(role) ? styles.dayActive : styles.day} onClick={() => setForm((prev) => ({ ...prev, recruitingRoles: prev.recruitingRoles.includes(role) ? prev.recruitingRoles.filter((entry) => entry !== role) : [...prev.recruitingRoles, role] }))}>{getRoleMeta(role)?.label ?? role}</button>)}</div></Field>
        <SocialLinksEditor links={form.socialLinks} setLinks={(socialLinks) => setForm((prev) => ({ ...prev, socialLinks }))} />
        <div style={styles.actionsRow}><Button disabled={busy || form.name.trim().length < 2} onClick={onSave}><Save size={14} /> Guardar ajustes</Button><Button variant="ghost" disabled={busy} onClick={onDelete}><Trash2 size={14} /> Borrar equipo</Button></div>
      </Panel>
    </section>
  );
}

function SocialLinksEditor({ links, setLinks }: { links: SocialLink[]; setLinks: (links: SocialLink[]) => void }) {
  const normalized = links.length ? links : [{ label: "", url: "" }];
  return <Field label="Redes sociales">{normalized.map((link, index) => <div key={index} style={styles.socialEditorRow}><input style={styles.input} value={link.label} onChange={(event) => setLinks(updateArray(normalized, index, { ...link, label: event.target.value }))} placeholder="Discord" /><input style={styles.input} value={link.url} onChange={(event) => setLinks(updateArray(normalized, index, { ...link, url: event.target.value }))} placeholder="https://..." /></div>)}<Button size="sm" variant="ghost" disabled={normalized.length >= 5} onClick={() => setLinks([...normalized, { label: "", url: "" }])}>Agregar red</Button></Field>;
}

function MemberRow({
  member, canEdit, isOwner, busy, onEditMember, onRemoveMember,
}: {
  member: PublicTeamMember;
  canEdit: boolean;
  isOwner: boolean;
  busy: boolean;
  onEditMember: (m: PublicTeamMember) => void;
  onRemoveMember: (userId: string, username: string) => void;
}) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const rankMeta = member.user.rank ? getRankMeta(parseRankLevel(member.user.rank)) : getRankMetaFromMmr(member.user.mmr);
  const selectedPlayerRoles = getSelectedPlayerRoles(member.user.mainRole ?? null, member.user.secondaryRole ?? null);
  const isOwnerMember = member.role === "OWNER";

  return (
    <article style={styles.memberRow}>
      <Avatar user={member.user} />
      <div style={styles.memberInfo}>
        <div style={styles.memberNameLine}>
          <CountryBadge countryCode={member.user.countryCode} compact />
          <strong><PlayerLink username={member.user.username} isBot={member.user.isBot}>{member.user.username}</PlayerLink></strong>
        </div>
        <div style={styles.memberMeta}>
          <span>{rankMeta.label}</span>
          <span>{member.user.mmr.toLocaleString("es-AR")} ELO</span>
          {selectedPlayerRoles.length > 0 ? (
            <span style={styles.playerRoleIconRow} aria-label="Roles de jugador">
              {selectedPlayerRoles.map((role) => <PlayerRoleIcon key={role} role={role} />)}
            </span>
          ) : null}
        </div>
      </div>
      <img src={rankMeta.iconSrc} alt="" style={styles.rankIcon} />
      <div style={styles.memberRoles}>
        <Chip tone={member.competitiveRole === "STARTER" ? "success" : member.competitiveRole === "COACH" ? "info" : "muted"}>{roleLabel(member.competitiveRole)}</Chip>
        <Chip tone={isOwnerMember ? "warn" : member.role === "CAPTAIN" ? "info" : "muted"}>
          {isOwnerMember ? "Líder" : member.role === "CAPTAIN" ? "Capitán" : "Miembro"}
        </Chip>
        {canEdit && !member.user.isBot ? (
          <div style={styles.memberActions}>
            {/* Edit: owner + captain can edit competitive role */}
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => onEditMember(member)}>
              <Pencil size={13} /> Editar
            </Button>
            {/* Expulsar: solo owner, no puede expulsar al owner */}
            {isOwner && !isOwnerMember && (
              confirmRemove ? (
                <div style={styles.confirmInline}>
                  <span style={styles.confirmText}>¿Expulsar?</span>
                  <button type="button" style={styles.btnDangerSm} disabled={busy}
                    onClick={() => { onRemoveMember(member.userId, member.user.username); setConfirmRemove(false); }}>
                    Sí
                  </button>
                  <button type="button" style={styles.btnGhostSm} disabled={busy} onClick={() => setConfirmRemove(false)}>No</button>
                </div>
              ) : (
                <button type="button" style={styles.btnDangerSm} disabled={busy} onClick={() => setConfirmRemove(true)}>
                  <UserMinus size={13} /> Expulsar
                </button>
              )
            )}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function PlayerRoleIcon({ role }: { role: PlayerRole }) {
  const meta = getRoleMeta(role);
  const sources = getRoleIconSources(role);
  if (!meta || !sources) return null;

  return (
    <img
      src={sources.primary}
      alt={meta.label}
      title={meta.label}
      loading="lazy"
      decoding="async"
      style={{
        ...styles.playerRoleIcon,
        borderColor: `${meta.accent}66`,
        boxShadow: `0 0 12px ${meta.accent}33`,
      }}
      onError={(event) => {
        const image = event.currentTarget;
        if (image.src.endsWith(sources.fallback)) return;
        image.src = sources.fallback;
      }}
    />
  );
}

function InviteResultRow({ player, invited, busy, onInvite }: {
  player: InviteSearchResult;
  invited: boolean;
  busy: boolean;
  onInvite: (id: string, username: string) => void;
}) {
  const rankMeta = player.rank ? getRankMeta(parseRankLevel(player.rank)) : getRankMetaFromMmr(player.mmr);
  return (
    <div style={styles.inviteResultRow}>
      <div style={{ ...styles.avatar, width: 34, height: 34, fontSize: ".72rem" }}>
        {player.avatar
          ? <img src={player.avatar} alt="" style={styles.avatarImg} />
          : player.username.slice(0, 2).toUpperCase()}
      </div>
      <div style={styles.inviteResultInfo}>
        <strong style={{ color: "#f0f6ff", fontSize: 13 }}>
          <PlayerLink username={player.username}>{player.username}</PlayerLink>
        </strong>
        <span style={{ color: "#94a3b8", fontSize: 11 }}>{rankMeta.label} · {player.mmr.toLocaleString("es-AR")} MMR</span>
      </div>
      <img src={rankMeta.iconSrc} alt="" style={{ width: 28, height: 28, objectFit: "contain" }} />
      <Button
        size="sm"
        variant={invited ? "ghost" : "ghost"}
        disabled={busy || invited}
        onClick={() => onInvite(player.id, player.username)}
      >
        {invited ? "Invitado ✓" : <><UserPlus size={13} /> Invitar</>}
      </Button>
    </div>
  );
}

function MemberEditModal({
  member, isOwner, busy, onSave, onClose,
}: {
  member: PublicTeamMember;
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

  return (
    <div className="storm-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="storm-modal-panel" role="dialog" aria-modal="true" aria-label={`Editar ${member.user.username}`}>
        <div className="storm-modal-header">
          <div className="storm-modal-identity">
            <div style={{ width: 46, height: 46, borderRadius: "50%", overflow: "hidden", background: "#1f2937", display: "grid", placeItems: "center", color: "#e5e7eb", fontWeight: 950, flexShrink: 0 }}>
              {member.user.avatar
                ? <img src={member.user.avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : member.user.username.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h3 className="storm-modal-title">{member.user.username}</h3>
              <span className="storm-modal-sub">{rankMeta.label} · {member.user.mmr.toLocaleString("es-AR")} MMR · {member.role.toLowerCase()}</span>
            </div>
          </div>
          <button className="storm-modal-close" type="button" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>

        <div className="storm-modal-body">
          <label className="storm-modal-field">
            <span className="storm-modal-label">Rol competitivo</span>
            <select className="storm-modal-select" value={competitiveRole} onChange={(e) => setCompetitiveRole(e.target.value as CompetitiveRole)} disabled={busy}>
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
              <select className="storm-modal-select" value={teamRole} onChange={(e) => setTeamRole(e.target.value as TeamRole)} disabled={busy}>
                <option value="MEMBER">Miembro</option>
                <option value="CAPTAIN">Capitán</option>
              </select>
            </label>
          )}
        </div>

        <div className="storm-modal-footer">
          <Button variant="ghost" disabled={busy} onClick={onClose}>Cancelar</Button>
          <Button disabled={busy} onClick={() => onSave(member.userId, competitiveRole, teamRole)}>Guardar cambios</Button>
        </div>
      </div>
    </div>
  );
}

function MapStatsTable({ mapStats }: { mapStats: PublicTeamStats["mapStats"] }) {
  if (mapStats.length === 0) return <p style={styles.muted}>Todavía no hay scrims completados para este equipo.</p>;
  return <div style={styles.table}>{mapStats.map((entry) => <div key={entry.map} style={styles.tableRow}><span>{entry.map}</span><strong>{entry.matches}</strong><strong>{entry.winrate}%</strong></div>)}</div>;
}

function PerformanceChart({ points }: { points: PublicTeamStats["performance"] }) {
  if (points.length === 0) return <div style={styles.chartEmpty}>Sin datos de rendimiento todavía.</div>;
  const width = 900;
  const height = 230;
  const max = 100;
  const path = points.map((point, index) => {
    const x = points.length === 1 ? width / 2 : (index / (points.length - 1)) * width;
    const y = height - (point.value / max) * height;
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return <svg viewBox={`0 0 ${width} ${height}`} style={styles.chartSvg} role="img" aria-label="Rolling winrate del equipo"><g>{[0, 25, 50, 75, 100].map((tick) => <line key={tick} x1="0" x2={width} y1={height - (tick / 100) * height} y2={height - (tick / 100) * height} stroke="rgba(148,163,184,.18)" />)}</g><path d={path} fill="none" stroke="#00c8ff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /><path d={`${path} L${width},${height} L0,${height} Z`} fill="rgba(0,200,255,.10)" /></svg>;
}

function MatchHistory({ matches }: { matches: PublicTeamMatch[] }) {
  if (matches.length === 0) return <p style={styles.muted}>Sin historial de scrims completados.</p>;
  return <div style={styles.historyTable}><div style={styles.historyHead}><span>Fecha</span><span>Resultado</span><span>Rival</span><span>Mapa</span></div>{matches.map((match) => <div key={match.id} style={styles.historyRow}><span>{formatDate(match.createdAt)}</span><strong style={{ color: match.result === "W" ? "#22c55e" : "#fb7185" }}>{match.result === "W" ? "WIN" : "LOSS"}</strong><span>{match.opponentName}</span><span>{match.selectedMap}</span></div>)}</div>;
}

function Panel({ title, eyebrow, children }: { title: string; eyebrow?: string; children: ReactNode }) { return <section style={styles.panel}><p style={styles.eyebrow}>{eyebrow}</p><h2 style={styles.sectionTitle}>{title}</h2>{children}</section>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label style={styles.fieldLabel}>{label}{children}</label>; }
function StatCard({ label, value }: Metric) { return <article style={styles.statCard}><span>{label}</span><strong>{value}</strong></article>; }
function TeamProfileShell({ children }: { children: ReactNode }) { return <main className="storm-page" style={styles.page}>{children}</main>; }
function ErrorPanel({ error }: { error: string }) { return <section style={styles.panel}><h1 style={styles.sectionTitle}>Equipo no encontrado</h1><p style={styles.muted}>{error}</p><Link to="/teams" className={buildActionClassName({ variant: "primary", size: "md" })}>Volver a mi escuadra</Link></section>; }
function TeamEmblem({ name, logoUrl }: { name: string; logoUrl: string | null }) { return <div style={styles.emblem}>{logoUrl ? <img src={logoUrl} alt="" style={styles.emblemImg} /> : <span>{name.slice(0, 2).toUpperCase()}</span>}</div>; }
function Avatar({ user }: { user: { username: string; avatar: string | null } }) { return <div style={styles.avatar}>{user.avatar ? <img src={user.avatar} alt="" style={styles.avatarImg} /> : user.username.slice(0, 2).toUpperCase()}</div>; }
function Chip({ children, tone }: { children: ReactNode; tone: "success" | "warn" | "info" | "muted" }) { const toneStyle = tone === "success" ? styles.chipSuccess : tone === "warn" ? styles.chipWarn : tone === "info" ? styles.chipInfo : styles.chipMuted; return <span style={{ ...styles.chip, ...toneStyle }}>{children}</span>; }

function emptySettingsForm(): SettingsForm { return { name: "", logoUrl: "", bannerUrl: "", description: "", countryCode: "", about: "", availabilityDays: [], isRecruiting: false, recruitingRoles: [], socialLinks: [{ label: "", url: "" }] }; }
function settingsFormFromTeam(team: PublicTeam): SettingsForm { return { name: team.name, logoUrl: team.logoUrl ?? "", bannerUrl: team.bannerUrl ?? "", description: team.description ?? "", countryCode: team.countryCode ?? "", about: team.about ?? "", availabilityDays: Array.isArray(team.availabilityDays) ? team.availabilityDays : [], isRecruiting: Boolean(team.isRecruiting), recruitingRoles: Array.isArray(team.recruitingRoles) ? team.recruitingRoles : [], socialLinks: team.socialLinks?.length ? team.socialLinks : [{ label: "", url: "" }] }; }
function getAverageMmr(members: PublicTeamMember[]) { const humans = members.filter((member) => !member.user.isBot); const source = humans.length ? humans : members; return source.length ? Math.round(source.reduce((sum, member) => sum + member.user.mmr, 0) / source.length) : 0; }
function updateArray<T>(items: T[], index: number, value: T) { return items.map((item, itemIndex) => itemIndex === index ? value : item); }
function roleLabel(role: CompetitiveRole) { return role === "STARTER" ? "Titular" : role === "SUBSTITUTE" ? "Suplente" : role === "COACH" ? "Coach" : role === "STAFF" ? "Staff" : role === "CAPTAIN" ? "Capitán" : "Sin rol"; }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); }

const styles: Record<string, CSSProperties> = {
  page: { display: "grid", gap: "1rem", background: "var(--nexus-bg)" },
  faceitShell: { width: "min(100%, 1800px)", justifySelf: "center", display: "grid", gap: "1.25rem", padding: "0 clamp(.75rem, 3vw, 2.4rem) 2rem" },
  hero: { position: "relative", minHeight: 430, borderRadius: 28, overflow: "hidden", background: "var(--nexus-surface)", border: "1px solid var(--nexus-border-active)", boxShadow: "0 26px 70px rgba(0,0,0,.45)" },
  cover: { position: "absolute", inset: 0, backgroundImage: "linear-gradient(180deg, rgba(8,12,20,.08), rgba(8,12,20,.94)), radial-gradient(circle at 28% 18%, rgba(0,200,255,.28), transparent 24%), radial-gradient(circle at 72% 22%, rgba(124,77,255,.24), transparent 28%), linear-gradient(135deg,#071326,#111b45 48%,#1b1038)", backgroundSize: "cover", backgroundPosition: "center" },
  heroInfoBar: { position: "absolute", left: "clamp(1rem, 4vw, 3rem)", right: "clamp(1rem, 4vw, 3rem)", bottom: 0, display: "grid", gridTemplateColumns: "150px minmax(0,1fr) auto", gap: "1rem", alignItems: "center", minHeight: 150, borderTop: "1px solid rgba(255,255,255,.09)", background: "linear-gradient(90deg, rgba(8,12,20,.94), rgba(13,20,34,.82))", padding: "1.1rem 0" },
  emblem: { width: 132, height: 132, marginTop: -66, borderRadius: "50%", display: "grid", placeItems: "center", overflow: "hidden", background: "radial-gradient(circle, rgba(0,200,255,.12), rgba(17,27,69,.9))", border: "1px solid rgba(255,255,255,.22)", boxShadow: "0 0 0 10px rgba(0,200,255,.08), 0 18px 42px rgba(0,0,0,.55)", color: "#fff", fontWeight: 950, fontSize: "2rem" },
  emblemImg: { width: "100%", height: "100%", objectFit: "contain", padding: 4, display: "block" },
  heroCopy: { minWidth: 0, display: "grid", gap: ".28rem" },
  nameRow: { display: "flex", gap: ".6rem", alignItems: "center", flexWrap: "wrap" },
  title: { margin: 0, color: "#fff", fontFamily: "var(--font-display)", fontSize: "clamp(2rem, 4vw, 3.25rem)", letterSpacing: "-.03em", lineHeight: 1, textTransform: "none" },
  gameLine: { margin: 0, display: "flex", alignItems: "center", gap: ".35rem", color: "#94a3b8", fontWeight: 850 },
  eloLine: { margin: 0, color: "var(--nexus-accent)", fontWeight: 950, letterSpacing: ".04em", textTransform: "uppercase" },
  heroActions: { display: "flex", gap: ".55rem", flexWrap: "wrap", justifyContent: "flex-end", alignSelf: "center" },
  tabs: { display: "flex", gap: "2rem", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,.11)", paddingInline: "clamp(.5rem, 2vw, 1.5rem)", overflowX: "auto" },
  tab: { display: "inline-flex", alignItems: "center", gap: ".42rem", border: 0, background: "transparent", color: "#94a3b8", padding: "1rem 0", fontWeight: 950, letterSpacing: ".04em", textTransform: "uppercase", cursor: "pointer", borderBottom: "3px solid transparent" },
  tabActive: { display: "inline-flex", alignItems: "center", gap: ".42rem", border: 0, background: "transparent", color: "var(--nexus-accent)", padding: "1rem 0", fontWeight: 950, letterSpacing: ".04em", textTransform: "uppercase", cursor: "pointer", borderBottom: "3px solid var(--nexus-accent)" },
  accessPanel: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", border: "1px solid rgba(55,217,255,.22)", borderRadius: 16, background: "linear-gradient(135deg, rgba(0,200,255,.08), rgba(124,77,255,.08))", padding: "1rem 1.15rem", boxShadow: "inset 0 1px 0 rgba(255,255,255,.04)" },
  accessTitle: { display: "block", color: "#f0f6ff", fontFamily: "var(--font-display)", fontSize: "1rem", fontWeight: 950, letterSpacing: ".06em", textTransform: "uppercase" },
  accessText: { margin: ".25rem 0 0", color: "#94a3b8", fontSize: 13, fontWeight: 700, lineHeight: 1.45 },
  accessActions: { display: "flex", alignItems: "center", gap: ".55rem", flexWrap: "wrap" },
  pendingJoinPill: { display: "inline-flex", alignItems: "center", gap: ".45rem", border: "1px solid rgba(255,255,255,.13)", borderRadius: 999, background: "rgba(255,255,255,.05)", color: "#cbd5e1", padding: ".65rem .9rem", fontSize: 12, fontWeight: 950, letterSpacing: ".08em", textTransform: "uppercase" },
  overviewGrid: { display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(320px,.34fr)", gap: "2rem", alignItems: "start" },
  mainColumn: { display: "grid", gap: "1.4rem", minWidth: 0 },
  aboutColumn: { minWidth: 0 },
  statsStack: { display: "grid", gap: "2rem" },
  settingsGrid: { width: "min(100%, 980px)", justifySelf: "center" },
  panel: { display: "grid", gap: "1rem", background: "transparent", color: "#fff" },
  sectionTitle: { margin: 0, color: "#fff", fontSize: "1.45rem", fontWeight: 950, letterSpacing: ".01em" },
  eyebrow: { margin: 0, minHeight: 18, color: "#94a3b8", fontSize: ".72rem", fontWeight: 950, letterSpacing: ".18em", textTransform: "uppercase" },
  emptyNotice: { borderRadius: 6, background: "linear-gradient(180deg, rgba(17,25,39,.88), rgba(13,20,34,.82))", color: "#94a3b8", textAlign: "center", padding: "1rem", fontWeight: 700 },
  memberList: { display: "grid", borderTop: "1px solid rgba(255,255,255,.1)" },
  ownerBanner: { display: "flex", alignItems: "center", gap: ".55rem", padding: ".75rem 1rem", borderRadius: 10, border: "1px solid rgba(55,217,255,.22)", background: "rgba(55,217,255,.07)", color: "rgba(180,220,255,.82)", fontSize: 13, fontWeight: 700 },
  inviteSearchWrap: { position: "relative" as const, display: "flex", alignItems: "center" },
  inviteSearchIcon: { position: "absolute" as const, left: 12, color: "#94a3b8", display: "grid", placeItems: "center", pointerEvents: "none" as const },
  inviteSearchInput: { width: "100%", minHeight: 42, paddingLeft: 38, paddingRight: 14, paddingTop: 0, paddingBottom: 0, borderRadius: 10, border: "1px solid rgba(255,255,255,.12)", background: "rgba(13,20,34,.86)", color: "#fff", fontSize: 14, fontWeight: 700, outline: "none" },
  inviteResultList: { display: "grid", gap: 4, marginTop: 8 },
  inviteResultRow: { display: "grid", gridTemplateColumns: "34px minmax(0,1fr) 28px auto", gap: ".65rem", alignItems: "center", padding: ".6rem .75rem", borderRadius: 9, border: "1px solid rgba(255,255,255,.07)", background: "rgba(13,20,34,.72)", transition: "background .14s" },
  inviteResultInfo: { display: "grid", gap: 1, minWidth: 0 },
  inviteHint: { margin: ".5rem 0 0", color: "#64748b", fontSize: 12, fontWeight: 700 },
  requestColumns: { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "1rem" },
  requestColumn: { display: "grid", alignContent: "start", gap: ".65rem", minWidth: 0 },
  requestTitle: { margin: 0, color: "#e8f2ff", fontSize: ".92rem", fontWeight: 950, letterSpacing: ".08em", textTransform: "uppercase" },
  requestList: { display: "grid", gap: ".5rem" },
  requestRow: { display: "grid", gridTemplateColumns: "42px minmax(0,1fr) auto", gap: ".7rem", alignItems: "center", padding: ".7rem .8rem", borderRadius: 10, border: "1px solid rgba(255,255,255,.08)", background: "rgba(13,20,34,.72)" },
  requestActions: { display: "flex", alignItems: "center", gap: ".45rem", flexWrap: "wrap", justifyContent: "flex-end" },
  memberRow: { display: "grid", gridTemplateColumns: "48px minmax(0,1fr) 46px minmax(220px,auto)", gap: ".75rem", alignItems: "center", padding: ".9rem 0", borderBottom: "1px solid rgba(255,255,255,.09)" },
  memberActions: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" as const, justifyContent: "flex-end" },
  confirmInline: { display: "flex", alignItems: "center", gap: 5 },
  confirmText: { color: "rgba(255,100,130,.9)", fontSize: 11, fontWeight: 800, whiteSpace: "nowrap" as const },
  btnDangerSm: { display: "inline-flex", alignItems: "center", gap: 4, minHeight: 28, padding: "0 10px", borderRadius: 7, border: "1px solid rgba(255,90,120,.42)", background: "rgba(255,60,90,.12)", color: "rgba(255,130,150,.92)", fontSize: 11, fontWeight: 900, cursor: "pointer", letterSpacing: ".06em" },
  btnGhostSm: { display: "inline-flex", alignItems: "center", minHeight: 28, padding: "0 10px", borderRadius: 7, border: "1px solid rgba(148,163,184,.18)", background: "rgba(10,20,40,.5)", color: "rgba(180,195,225,.72)", fontSize: 11, fontWeight: 900, cursor: "pointer" },
  avatar: { width: 42, height: 42, borderRadius: "50%", display: "grid", placeItems: "center", overflow: "hidden", background: "#1f2937", color: "#e5e7eb", fontWeight: 950 },
  avatarImg: { width: "100%", height: "100%", objectFit: "cover" },
  memberInfo: { minWidth: 0, display: "grid", gap: ".2rem" },
  memberNameLine: { display: "inline-flex", alignItems: "center", gap: ".42rem", minWidth: 0 },
  memberMeta: { display: "flex", gap: ".45rem", alignItems: "center", flexWrap: "wrap", color: "#94a3b8", fontSize: ".78rem" },
  playerRoleIconRow: { display: "inline-flex", alignItems: "center", gap: ".25rem" },
  playerRoleIcon: { width: 20, height: 20, objectFit: "contain", borderRadius: 7, border: "1px solid rgba(148,163,184,.25)", background: "rgba(2,6,23,.72)", padding: 2 },
  memberRoles: { display: "flex", gap: ".35rem", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" },
  rankIcon: { width: 38, height: 38, objectFit: "contain" },
  aboutStack: { display: "grid", gap: "1.15rem", color: "#cbd5e1" },
  aboutText: { margin: 0, color: "#94a3b8", lineHeight: 1.6 },
  aboutBlock: { display: "grid", gap: ".5rem" },
  socialLink: { display: "inline-flex", alignItems: "center", gap: ".35rem", color: "var(--nexus-accent)", fontWeight: 950, textDecoration: "none" },
  dayGrid: { display: "flex", flexWrap: "wrap", gap: ".45rem" },
  day: { border: "1px solid rgba(255,255,255,.12)", borderRadius: 999, background: "rgba(13,20,34,.86)", color: "#94a3b8", padding: ".48rem .68rem", cursor: "pointer", fontWeight: 900 },
  dayActive: { border: "1px solid rgba(0,200,255,.42)", borderRadius: 999, background: "rgba(0,200,255,.14)", color: "#bae6fd", padding: ".48rem .68rem", cursor: "pointer", fontWeight: 950 },
  pillRow: { display: "flex", flexWrap: "wrap", gap: ".45rem", alignItems: "center" },
  chip: { display: "inline-flex", alignItems: "center", borderRadius: 999, padding: ".24rem .55rem", fontSize: ".72rem", fontWeight: 900, border: "1px solid transparent" },
  chipSuccess: { color: "#22c55e", background: "rgba(34,197,94,.12)", borderColor: "rgba(34,197,94,.22)" },
  chipWarn: { color: "var(--nexus-accent)", background: "rgba(124,77,255,.14)", borderColor: "rgba(124,77,255,.28)" },
  chipInfo: { color: "#38bdf8", background: "rgba(56,189,248,.1)", borderColor: "rgba(56,189,248,.2)" },
  chipMuted: { color: "#cbd5e1", background: "rgba(148,163,184,.1)", borderColor: "rgba(148,163,184,.16)" },
  statCards: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: "1.2rem" },
  statCard: { minHeight: 94, display: "grid", alignContent: "center", gap: ".6rem", padding: "1.15rem", borderRadius: 6, background: "linear-gradient(180deg, rgba(17,25,39,.88), rgba(13,20,34,.82))", border: "1px solid rgba(255,255,255,.05)" },
  table: { display: "grid", borderTop: "1px solid rgba(255,255,255,.1)" },
  tableRow: { display: "grid", gridTemplateColumns: "minmax(0,1fr) 160px 160px", gap: "1rem", padding: ".9rem 1rem", borderBottom: "1px solid rgba(255,255,255,.09)", color: "#e5e7eb" },
  chartSvg: { width: "100%", minHeight: 260, display: "block", background: "var(--nexus-surface)" },
  chartEmpty: { minHeight: 220, display: "grid", placeItems: "center", color: "#94a3b8", background: "rgba(13,20,34,.86)", borderRadius: 8 },
  historyTable: { display: "grid", borderTop: "1px solid rgba(255,255,255,.1)" },
  historyHead: { display: "grid", gridTemplateColumns: "1.1fr .6fr 1.2fr 1fr", padding: ".8rem 1rem", color: "#fff", fontWeight: 950, borderBottom: "1px solid rgba(255,255,255,.1)" },
  historyRow: { display: "grid", gridTemplateColumns: "1.1fr .6fr 1.2fr 1fr", padding: ".95rem 1rem", color: "#f8fafc", borderBottom: "1px solid rgba(255,255,255,.08)" },
  loadMoreSentinel: { minHeight: 74, display: "grid", placeItems: "center", color: "#94a3b8" },
  formGrid: { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: ".8rem" },
  fieldLabel: { display: "grid", gap: ".4rem", color: "#94a3b8", fontWeight: 950, fontSize: ".75rem", letterSpacing: ".08em", textTransform: "uppercase" },
  input: { width: "100%", borderRadius: 8, border: "1px solid rgba(255,255,255,.12)", background: "rgba(13,20,34,.86)", color: "#fff", padding: ".75rem .85rem", outline: "none" },
  textarea: { width: "100%", minHeight: 140, borderRadius: 8, border: "1px solid rgba(255,255,255,.12)", background: "rgba(13,20,34,.86)", color: "#fff", padding: ".75rem .85rem", outline: "none", resize: "vertical" },
  checkboxRow: { display: "flex", alignItems: "center", gap: ".5rem", color: "#e5e7eb", textTransform: "none", letterSpacing: 0 },
  socialEditorRow: { display: "grid", gridTemplateColumns: ".35fr .65fr", gap: ".65rem" },
  actionsRow: { display: "flex", gap: ".75rem", flexWrap: "wrap", justifyContent: "space-between" },
  muted: { margin: 0, color: "#94a3b8", lineHeight: 1.5 },
  error: { padding: "0.85rem 1rem", borderRadius: 8, background: "rgba(127,29,29,.35)", border: "1px solid rgba(248,113,113,.35)", color: "#fecaca" },
  notice: { padding: "0.85rem 1rem", borderRadius: 8, background: "rgba(22,101,52,.24)", border: "1px solid rgba(34,197,94,.3)", color: "#bbf7d0" },
  skeleton: { minHeight: 420, borderRadius: 18, background: "linear-gradient(90deg,#0d1422,#111927,#0d1422)", animation: "pulseGlow 1.4s ease-in-out infinite" },
};
