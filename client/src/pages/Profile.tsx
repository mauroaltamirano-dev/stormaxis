import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  CheckCircle2,
  Clock3,
  Crosshair,
  Save,
  Search,
  ShieldCheck,
  Trophy,
} from "lucide-react";
import { api } from "../lib/api";
import { buildApiUrl } from "../lib/backend";
import { RankBadge } from "../components/RankBadge";
import { useAuthStore } from "../stores/auth.store";
import { getRoleMeta } from "../lib/roles";
import { getRankMeta } from "../lib/ranks";
import { RankProgressBar } from "../components/RankProgressBar";
import { RolePicker } from "../components/RolePicker";
import { MAP_ID_BY_NAME } from "@nexusgg/shared";
import { COUNTRY_OPTIONS, getCountryLabel } from "../lib/countries";

type PlayerRole = "RANGED" | "HEALER" | "OFFLANE" | "FLEX" | "TANK";
type LinkedAccountProvider = "discord" | "google" | "bnet";

type LinkedAccount = {
  provider: LinkedAccountProvider;
  providerUserId: string;
  displayName: string | null;
};

type ProfileUser = {
  id: string;
  username: string;
  email?: string | null;
  avatar: string | null;
  mmr: number;
  rank: string;
  wins: number;
  losses: number;
  mainRole?: PlayerRole | null;
  secondaryRole?: PlayerRole | null;
  countryCode?: string | null;
  discordId?: string | null;
  discordUsername?: string | null;
  bnetId?: string | null;
  bnetBattletag?: string | null;
  googleId?: string | null;
  createdAt?: string;
  level?: number;
  levelProgressPct?: number;
  nextLevelAt?: number | null;
  displayLevel?: string;
  winrate?: number;
  linkedAccounts?: LinkedAccount[];
};

type MatchHistoryEntry = {
  id: string;
  team: number;
  mmrDelta: number | null;
  match: {
    id: string;
    status: string;
    selectedMap: string | null;
    winner: number | null;
    createdAt: string;
    endedAt: string | null;
  };
};

type SearchResult = {
  id: string;
  username: string;
  avatar: string | null;
  mmr: number;
  wins: number;
  losses: number;
  mainRole?: PlayerRole | null;
  secondaryRole?: PlayerRole | null;
  countryCode?: string | null;
  displayLevel?: string;
  winrate?: number;
};

type ProfileTab = "overview" | "history" | "accounts";
type MatchFilter = "all" | "wins" | "losses";

const PLAYER_ROLE_OPTIONS: Array<{ value: PlayerRole; label: string }> = [
  { value: "RANGED", label: "Ranged" },
  { value: "HEALER", label: "Healer" },
  { value: "OFFLANE", label: "Offlane" },
  { value: "FLEX", label: "Flex" },
  { value: "TANK", label: "Tank" },
];

const MATCHES_PER_PAGE = 5;

const cardStyle: CSSProperties = {
  background: "var(--nexus-card)",
  border: "1px solid var(--nexus-border)",
  borderRadius: "0",
  padding: "18px",
};

const neonPanelStyle: CSSProperties = {
  border: "1px solid rgba(0,174,255,0.25)",
  boxShadow:
    "inset 0 0 0 1px rgba(0,174,255,0.08), 0 0 24px rgba(0,100,255,0.12)",
};

function parseRouteUsername(pathname: string) {
  if (!pathname.startsWith("/profile/")) return null;
  return decodeURIComponent(pathname.replace("/profile/", "").trim());
}

function getInitialProfileTab(): ProfileTab {
  if (typeof window === "undefined") return "overview";
  const tab = new URLSearchParams(window.location.search).get("tab");
  return tab === "history" || tab === "accounts" ? tab : "overview";
}

function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
  });
}

function formatMatchRelativeTime(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.floor(diffMs / 60_000));
  if (minutes < 60) return `${minutes} min atrás`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h atrás`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d atrás`;
  return formatShortDate(value);
}

function getMatchMapImage(selectedMap: string | null) {
  if (!selectedMap) return null;
  const mapId = MAP_ID_BY_NAME[selectedMap];
  return mapId ? `/maps/${mapId}.webp` : null;
}

function getProviderLabel(provider: LinkedAccountProvider) {
  switch (provider) {
    case "discord":
      return "Discord";
    case "google":
      return "Google";
    case "bnet":
      return "Battle.net";
  }
}

function getProviderAccent(provider: LinkedAccountProvider) {
  switch (provider) {
    case "discord":
      return "#5865F2";
    case "google":
      return "#34A853";
    case "bnet":
      return "#00AEFF";
  }
}

function getRoleLabel(role?: PlayerRole | null) {
  return (
    PLAYER_ROLE_OPTIONS.find((entry) => entry.value === role)?.label ??
    "No definido"
  );
}

function initialFromUser(user: ProfileUser | null) {
  return {
    username: user?.username ?? "",
    avatar: user?.avatar ?? "",
    mainRole: user?.mainRole ?? null,
    secondaryRole: user?.secondaryRole ?? null,
    countryCode: user?.countryCode ?? "",
  };
}

export function Profile() {
  const navigate = useNavigate();
  const { user, accessToken, updateUser } = useAuthStore();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const routeUsername = parseRouteUsername(pathname);
  const isOwnProfile = !routeUsername || routeUsername === user?.username;

  const [profile, setProfile] = useState<ProfileUser | null>(null);
  const [matches, setMatches] = useState<MatchHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] =
    useState<ProfileTab>(getInitialProfileTab);
  const [matchFilter, setMatchFilter] = useState<MatchFilter>("all");
  const [historyPage, setHistoryPage] = useState(1);

  const [form, setForm] = useState(() =>
    initialFromUser((user as ProfileUser | null) ?? null),
  );
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [accountMessage, setAccountMessage] = useState<string | null>(null);
  const [accountBusyProvider, setAccountBusyProvider] =
    useState<LinkedAccountProvider | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const level = profile?.level ?? 1;
  const rankMeta = getRankMeta(level);
  const nextRankMeta = getRankMeta(Math.min(10, level + 1));
  const rankColor = rankMeta.color;
  const nextRankColor = level >= 10 ? rankColor : nextRankMeta.color;
  const levelProgressPct = Math.max(
    0,
    Math.min(100, profile?.levelProgressPct ?? 0),
  );
  const pointsToNextLevel =
    profile?.nextLevelAt == null
      ? null
      : Math.max(0, profile.nextLevelAt - profile.mmr);
  const totalMatches = useMemo(
    () => (profile ? profile.wins + profile.losses : 0),
    [profile],
  );
  const latestMatch = useMemo(() => matches[0] ?? null, [matches]);
  const rolesConfiguredCount = useMemo(
    () => [profile?.mainRole, profile?.secondaryRole].filter(Boolean).length,
    [profile?.mainRole, profile?.secondaryRole],
  );

  const filteredMatches = useMemo(() => {
    if (matchFilter === "all") return matches;
    return matches.filter((entry) => {
      const won = entry.match.winner === entry.team;
      return matchFilter === "wins" ? won : !won;
    });
  }, [matchFilter, matches]);

  const totalHistoryPages = Math.max(
    1,
    Math.ceil(filteredMatches.length / MATCHES_PER_PAGE),
  );
  const visibleMatches = filteredMatches.slice(
    (historyPage - 1) * MATCHES_PER_PAGE,
    historyPage * MATCHES_PER_PAGE,
  );

  useEffect(() => {
    if (!isOwnProfile && activeTab === "accounts") {
      setActiveTab("overview");
    }
  }, [activeTab, isOwnProfile]);

  useEffect(() => {
    if (!user || !profile || profile.id !== user.id) return;

    setProfile((current) =>
      current && current.id === user.id
        ? {
            ...current,
            username: user.username,
            avatar: user.avatar,
            mmr: user.mmr,
            rank: user.rank,
            wins: user.wins,
            losses: user.losses,
            mainRole: user.mainRole,
            secondaryRole: user.secondaryRole,
            countryCode: user.countryCode,
            discordId: user.discordId,
            discordUsername: user.discordUsername,
            bnetId: user.bnetId,
            bnetBattletag: user.bnetBattletag,
            googleId: user.googleId,
            level: user.level,
            levelProgressPct: user.levelProgressPct,
            nextLevelAt: user.nextLevelAt,
            displayLevel: user.displayLevel,
            winrate: user.winrate,
            linkedAccounts: user.linkedAccounts,
          }
        : current,
    );
  }, [profile?.id, user]);

  useEffect(() => {
    setHistoryPage(1);
  }, [matchFilter, routeUsername]);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      setLoading(true);
      setError(null);
      setSaveMessage(null);
      setAccountMessage(null);

      try {
        const profilePromise = isOwnProfile
          ? api.get<ProfileUser>("/users/me")
          : api.get<ProfileUser>(`/users/${routeUsername}`);
        const matchesPromise = api.get<MatchHistoryEntry[]>(
          `/users/${routeUsername ?? user?.username}/matches`,
        );

        const [{ data: profileData }, { data: matchesData }] =
          await Promise.all([profilePromise, matchesPromise]);

        if (cancelled) return;
        setProfile(profileData);
        setMatches(matchesData);
        if (isOwnProfile) setForm(initialFromUser(profileData));
      } catch (err: any) {
        if (cancelled) return;
        setProfile(null);
        setMatches([]);
        setError(
          err.response?.data?.error?.message ??
            "No pude cargar el perfil competitivo.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [isOwnProfile, routeUsername, user?.username]);

  useEffect(() => {
    if (searchTerm.trim().length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    let cancelled = false;
    setSearchLoading(true);

    const timeout = window.setTimeout(async () => {
      try {
        const { data } = await api.get<SearchResult[]>("/users/search", {
          params: { q: searchTerm.trim() },
        });
        if (!cancelled) setSearchResults(data);
      } catch {
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [searchTerm]);

  async function handleSaveProfile() {
    setSaving(true);
    setSaveMessage(null);

    try {
      const payload = {
        username: form.username.trim(),
        avatar: form.avatar.trim(),
        mainRole: form.mainRole,
        secondaryRole: form.secondaryRole,
        countryCode: form.countryCode || null,
      };

      const { data } = await api.patch<ProfileUser>("/users/me", payload);
      setProfile(data);
      setForm(initialFromUser(data));
      updateUser({
        username: data.username,
        avatar: data.avatar,
        mmr: data.mmr,
        rank: data.rank,
        wins: data.wins,
        losses: data.losses,
        mainRole: data.mainRole,
        secondaryRole: data.secondaryRole,
        countryCode: data.countryCode,
        displayLevel: data.displayLevel,
        level: data.level,
        levelProgressPct: data.levelProgressPct,
        nextLevelAt: data.nextLevelAt,
        winrate: data.winrate,
        linkedAccounts: data.linkedAccounts,
      });
      setSaveMessage("Perfil actualizado. Ahora sí se siente más competitivo.");

      if (routeUsername) {
        navigate({ to: "/profile" });
      }
    } catch (err: any) {
      const details = err.response?.data?.error?.details;
      const detailMessage =
        details && typeof details === "object"
          ? Object.values(details).flat().filter(Boolean).join(" · ")
          : null;
      setSaveMessage(
        detailMessage ||
          err.response?.data?.error?.message ||
          "No pude guardar los cambios del perfil.",
      );
    } finally {
      setSaving(false);
    }
  }

  function openProfile(username: string) {
    if (username === user?.username) {
      navigate({ to: "/profile" });
      return;
    }

    navigate({
      to: "/profile/$username",
      params: { username },
    });
  }

  function handleLinkDiscord() {
    setAccountMessage(null);
    window.location.href = getOAuthLinkUrl("discord");
  }

  function handleLinkBattleNet() {
    setAccountMessage(null);
    window.location.href = getOAuthLinkUrl("bnet");
  }

  function getOAuthLinkUrl(provider: "discord" | "bnet") {
    const endpoint = buildApiUrl(`/api/auth/link/${provider}`);
    if (!accessToken) return endpoint;
    const separator = endpoint.includes("?") ? "&" : "?";
    return `${endpoint}${separator}link_token=${encodeURIComponent(accessToken)}`;
  }

  async function handleUnlink(provider: LinkedAccountProvider) {
    setAccountBusyProvider(provider);
    setAccountMessage(null);

    try {
      const { data } = await api.delete<ProfileUser>(
        `/users/me/accounts/${provider}`,
      );
      setProfile(data);
      updateUser({
        discordId: data.discordId ?? null,
        discordUsername: data.discordUsername ?? null,
        bnetId: data.bnetId ?? null,
        bnetBattletag: data.bnetBattletag ?? null,
        googleId: data.googleId ?? null,
        linkedAccounts: data.linkedAccounts,
      });
      setAccountMessage(
        `${getProviderLabel(provider)} desvinculado correctamente.`,
      );
    } catch (err: any) {
      setAccountMessage(
        err.response?.data?.error?.message ??
          `No pude desvincular ${getProviderLabel(provider)}.`,
      );
    } finally {
      setAccountBusyProvider(null);
    }
  }

  if (loading) {
    return (
      <div style={{ display: "grid", gap: "16px" }}>
        <div style={{ ...cardStyle, minHeight: "180px" }} />
        <div style={{ ...cardStyle, minHeight: "320px" }} />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <section style={{ ...cardStyle, display: "grid", gap: "12px" }}>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "18px",
            fontWeight: 800,
            letterSpacing: "2px",
            textTransform: "uppercase",
            color: "#ff6b6b",
          }}
        >
          Perfil no disponible
        </div>
        <div style={{ color: "var(--nexus-muted)", maxWidth: "60ch" }}>
          {error ??
            "No encontré ese perfil. Puede que el username haya cambiado."}
        </div>
      </section>
    );
  }

  const linkedDiscordAccount =
    profile.linkedAccounts?.find((entry) => entry.provider === "discord") ??
    null;
  const linkedGoogleAccount =
    profile.linkedAccounts?.find((entry) => entry.provider === "google") ??
    null;
  const linkedBattleNetAccount =
    profile.linkedAccounts?.find((entry) => entry.provider === "bnet") ?? null;

  return (
    <div style={{ display: "grid", gap: "18px" }}>
      <section
        style={{
          ...cardStyle,
          ...neonPanelStyle,
          display: "grid",
          gap: "18px",
          background:
            "linear-gradient(135deg, rgba(0,174,255,0.09), rgba(139,92,246,0.08) 55%, rgba(13,20,34,0.92))",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.45fr) minmax(320px, 0.85fr)",
            gap: "18px",
          }}
        >
          <div style={{ display: "grid", gap: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <AvatarBlock
                avatar={profile.avatar}
                username={profile.username}
                size={200}
                rankColor={rankColor}
              />

              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "12px",
                    fontWeight: 800,
                    letterSpacing: "2px",
                    textTransform: "uppercase",
                    color: "var(--nexus-accent)",
                    marginBottom: "6px",
                  }}
                >
                  {isOwnProfile
                    ? "Tu perfil competitivo"
                    : "Scouting de perfil"}
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ display: "grid", gap: "4px" }}>
                    <h1
                      style={{
                        margin: 0,
                        fontFamily: "var(--font-display)",
                        fontSize: "32px",
                        fontWeight: 900,
                        letterSpacing: "1px",
                        color: "var(--nexus-text)",
                        textShadow: `0 0 28px ${rankColor}55`,
                      }}
                    >
                      {profile.username}
                    </h1>
                    <div
                      style={{
                        width: "fit-content",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "8px",
                        border: "1px solid rgba(255,255,255,0.08)",
                        background: "rgba(255,255,255,0.04)",
                        color: "rgba(226,232,240,0.78)",
                        padding: "6px 10px",
                        fontSize: "12px",
                        fontWeight: 850,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                      }}
                    >
                      <span>{getCountryLabel(profile.countryCode)}</span>
                    </div>
                    {profile.bnetBattletag ? (
                      <BattleNetIdentityPill battletag={profile.bnetBattletag} />
                    ) : isOwnProfile ? (
                      <a
                        href={getOAuthLinkUrl("bnet")}
                        style={{
                          width: "fit-content",
                          color: "#5db7ff",
                          fontSize: "11px",
                          fontWeight: 900,
                          letterSpacing: "1px",
                          textTransform: "uppercase",
                          textDecoration: "none",
                        }}
                      >
                        + Vincular Battle.net
                      </a>
                    ) : null}
                    <div
                      style={{
                        height: "2px",
                        background: `linear-gradient(90deg, ${rankColor}, ${nextRankColor}55, transparent)`,
                      }}
                    />
                  </div>
                </div>

                <div
                  style={{
                    marginTop: "10px",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                  }}
                >
                  <RankBadge
                    level={level}
                    mmr={profile.mmr}
                    size="lg"
                    showLabel={false}
                    showMmr={false}
                    glow="strong"
                  />
                  <div
                    style={{
                      height: "84px",
                      display: "grid",
                      alignContent: "center",
                      gap: "6px",
                    }}
                  >
                    <div
                      style={{
                        color: rankMeta.color,
                        fontFamily: "var(--font-display)",
                        fontSize: "18px",
                        fontWeight: 900,
                        lineHeight: 1.05,
                        letterSpacing: "1px",
                        textTransform: "uppercase",
                      }}
                    >
                      {rankMeta.label}
                    </div>
                    <div
                      style={{
                        color: "var(--nexus-text)",
                        fontFamily: "var(--font-display)",
                        fontSize: "22px",
                        fontWeight: 900,
                        lineHeight: 1.05,
                        letterSpacing: "1px",
                      }}
                    >
                      {profile.mmr.toLocaleString("es-AR")} MMR
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                gap: "12px",
              }}
            >
              <MetricCard
                label="MMR actual"
                value={String(profile.mmr)}
                accent="#00c8ff"
                icon={<Crosshair size={16} />}
              />
              <MetricCard
                label="Record"
                value={`${profile.wins}W · ${profile.losses}L`}
                accent="#00e676"
                icon={<ShieldCheck size={16} />}
              />
              <MetricCard
                label="Winrate"
                value={`${profile.winrate ?? 0}%`}
                accent="#8b5cf6"
                icon={<Trophy size={16} />}
              />
              <MetricCard
                label="Última partida"
                value={
                  latestMatch
                    ? formatMatchRelativeTime(latestMatch.match.createdAt)
                    : "Sin historial"
                }
                accent="#f97316"
                icon={<Clock3 size={16} />}
              />
            </div>
          </div>

          <div
            style={{
              border: "1px solid rgba(255,255,255,0.07)",
              borderLeft: "1px solid rgba(0,174,255,0.18)",
              background:
                "linear-gradient(145deg, rgba(7,12,22,0.92), rgba(4,10,20,0.78) 60%, rgba(0,0,0,0.2))",
              padding: "16px",
              display: "grid",
              gap: "12px",
              alignContent: "start",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "12px",
                fontWeight: 800,
                letterSpacing: "2px",
                textTransform: "uppercase",
                color: "var(--nexus-faint)",
              }}
            >
              Rol y progreso
            </div>

            <RoleBadge label="Main" role={profile.mainRole} />
            <RoleBadge label="Secundario" role={profile.secondaryRole} />

            <RankProgressBar
              progressPct={levelProgressPct}
              pointsToNextLevel={pointsToNextLevel}
              rankColor={rankColor}
              nextRankColor={nextRankColor}
              subtitle={
                pointsToNextLevel == null
                  ? "Ya estás en el techo actual del ladder."
                  : `Te faltan ${pointsToNextLevel} puntos para el próximo rango.`
              }
            />

            {isOwnProfile && profile.email ? (
              <div
                style={{
                  marginTop: "8px",
                  paddingTop: "12px",
                  borderTop: "1px solid rgba(255,255,255,0.08)",
                  display: "grid",
                  gap: "4px",
                }}
              >
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 800,
                    letterSpacing: "1px",
                    textTransform: "uppercase",
                    color: "var(--nexus-faint)",
                  }}
                >
                  Cuenta principal
                </span>
                <span style={{ color: "var(--nexus-text)", fontSize: "13px" }}>
                  {profile.email}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section
        style={{
          ...cardStyle,
          padding: "10px",
          display: "flex",
          gap: "10px",
          flexWrap: "wrap",
        }}
      >
        <TabButton
          active={activeTab === "overview"}
          label="Overview"
          onClick={() => setActiveTab("overview")}
        />
        <TabButton
          active={activeTab === "history"}
          label="Historial"
          onClick={() => setActiveTab("history")}
        />
        {isOwnProfile ? (
          <TabButton
            active={activeTab === "accounts"}
            label="Cuentas"
            onClick={() => setActiveTab("accounts")}
          />
        ) : null}
      </section>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.45fr) minmax(320px, 0.85fr)",
          gap: "18px",
          alignItems: "start",
        }}
      >
        <div style={{ display: "grid", gap: "18px" }}>
          {activeTab === "overview" ? (
            <>
              {isOwnProfile ? (
                <section style={{ ...cardStyle, display: "grid", gap: "14px" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "12px",
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontFamily: "var(--font-display)",
                          fontSize: "18px",
                          fontWeight: 800,
                          letterSpacing: "2px",
                          textTransform: "uppercase",
                          color: "var(--nexus-text)",
                        }}
                      >
                        Ajustes de perfil
                      </div>
                      <div
                        style={{
                          color: "var(--nexus-muted)",
                          fontSize: "13px",
                        }}
                      >
                        Identidad clara, roles bien definidos y cero invento.
                      </div>
                    </div>

                    <button
                      onClick={handleSaveProfile}
                      disabled={saving}
                      style={primaryButtonStyle}
                    >
                      <Save size={15} />
                      {saving ? "Guardando..." : "Guardar cambios"}
                    </button>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      gap: "14px",
                    }}
                  >
                    <Field
                      label="Username"
                      value={form.username}
                      onChange={(value) =>
                        setForm((current) => ({ ...current, username: value }))
                      }
                      placeholder="Tu alias competitivo"
                    />
                    <Field
                      label="Avatar URL"
                      value={form.avatar}
                      onChange={(value) =>
                        setForm((current) => ({ ...current, avatar: value }))
                      }
                      placeholder="https://..."
                    />
                    <RolePicker
                      label="Main role"
                      value={form.mainRole}
                      onChange={(value) =>
                        setForm((current) => ({
                          ...current,
                          mainRole: value,
                        }))
                      }
                    />
                    <RolePicker
                      label="Secundario"
                      value={form.secondaryRole}
                      onChange={(value) =>
                        setForm((current) => ({
                          ...current,
                          secondaryRole: value,
                        }))
                      }
                    />
                    <div style={{ display: "grid", gap: "7px" }}>
                      <label
                        style={{
                          color: "var(--nexus-faint)",
                          fontSize: "11px",
                          fontWeight: 900,
                          letterSpacing: "1.4px",
                          textTransform: "uppercase",
                        }}
                      >
                        Nacionalidad
                      </label>
                      <select
                        value={form.countryCode}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            countryCode: event.target.value,
                          }))
                        }
                        style={{
                          border: "1px solid rgba(255,255,255,0.1)",
                          background: "rgba(2,6,14,0.75)",
                          color: "var(--nexus-text)",
                          padding: "12px",
                          minHeight: "44px",
                          outline: "none",
                        }}
                      >
                        <option value="">Sin país</option>
                        {COUNTRY_OPTIONS.map((country) => (
                          <option key={country.code} value={country.code}>
                            {country.flag} {country.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {saveMessage ? <MessageBanner text={saveMessage} /> : null}
                </section>
              ) : (
                <section style={{ ...cardStyle, display: "grid", gap: "12px" }}>
                  <div
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: "18px",
                      fontWeight: 800,
                      letterSpacing: "2px",
                      textTransform: "uppercase",
                      color: "var(--nexus-text)",
                    }}
                  >
                    Snapshot del jugador
                  </div>
                  <div
                    style={{ color: "var(--nexus-muted)", fontSize: "13px" }}
                  >
                    Acá ves la lectura rápida del perfil: nivel, roles, MMR y
                    rendimiento.
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      gap: "12px",
                    }}
                  >
                    <ScoutCard
                      label="Main role"
                      value={getRoleLabel(profile.mainRole)}
                    />
                    <ScoutCard
                      label="Secundario"
                      value={getRoleLabel(profile.secondaryRole)}
                    />
                    <ScoutCard label="MMR" value={`${profile.mmr}`} />
                    <ScoutCard
                      label="Winrate"
                      value={`${profile.winrate ?? 0}%`}
                    />
                  </div>
                </section>
              )}

              <section style={{ ...cardStyle, display: "grid", gap: "14px" }}>
                <div>
                  <div
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: "18px",
                      fontWeight: 800,
                      letterSpacing: "2px",
                      textTransform: "uppercase",
                      color: "var(--nexus-text)",
                    }}
                  >
                    Preparación competitiva
                  </div>
                  <div
                    style={{ color: "var(--nexus-muted)", fontSize: "13px" }}
                  >
                    Estado útil para jugar y scoutear sin repetir la identidad de arriba.
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                    gap: "12px",
                  }}
                >
                  <ReadinessCard
                    label="Roles listos"
                    value={`${rolesConfiguredCount}/2`}
                    detail={
                      rolesConfiguredCount === 2
                        ? "Main y secundario definidos"
                        : "Falta definir tu identidad competitiva"
                    }
                    accent={rolesConfiguredCount === 2 ? "#00e676" : "#facc15"}
                    icon={<CheckCircle2 size={16} />}
                  />
                  <ReadinessCard
                    label="Cuenta de juego"
                    value={profile.bnetBattletag ? "Battle.net" : "Pendiente"}
                    detail={
                      profile.bnetBattletag
                        ? "Lista para validación de replays"
                        : "Vinculala para mejorar confianza"
                    }
                    accent={profile.bnetBattletag ? "#00aeff" : "#f97316"}
                    icon={<ShieldCheck size={16} />}
                  />
                  <ReadinessCard
                    label="Historial"
                    value={totalMatches > 0 ? "Con evidencia" : "Sin datos"}
                    detail={
                      totalMatches > 0
                        ? `${totalMatches} match${totalMatches === 1 ? "" : "es"} registrado${totalMatches === 1 ? "" : "s"}`
                        : "Jugá partidas para construir scouting"
                    }
                    accent={totalMatches > 0 ? "#8b5cf6" : "#64748b"}
                    icon={<Clock3 size={16} />}
                  />
                </div>
              </section>
            </>
          ) : null}

          {activeTab === "history" ? (
            <section style={{ ...cardStyle, display: "grid", gap: "14px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: "18px",
                      fontWeight: 800,
                      letterSpacing: "2px",
                      textTransform: "uppercase",
                      color: "var(--nexus-text)",
                    }}
                  >
                    Historial reciente
                  </div>
                  <div
                    style={{ color: "var(--nexus-muted)", fontSize: "13px" }}
                  >
                    Las últimas partidas dicen MÁS que cualquier verso.
                  </div>
                </div>

                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <FilterChip
                    active={matchFilter === "all"}
                    label="Todo"
                    onClick={() => setMatchFilter("all")}
                  />
                  <FilterChip
                    active={matchFilter === "wins"}
                    label="Victorias"
                    onClick={() => setMatchFilter("wins")}
                  />
                  <FilterChip
                    active={matchFilter === "losses"}
                    label="Derrotas"
                    onClick={() => setMatchFilter("losses")}
                  />
                </div>
              </div>

              {visibleMatches.length === 0 ? (
                <ProfileHistoryEmpty
                  isOwnProfile={isOwnProfile}
                  filtered={matchFilter !== "all"}
                />
              ) : (
                <div style={{ display: "grid", gap: "10px" }}>
                  {visibleMatches.map((entry) => {
                    const won = entry.match.winner === entry.team;
                    const delta = entry.mmrDelta ?? 0;
                    const resultColor = won ? "#00e676" : "#ff4757";
                    const mapImage = getMatchMapImage(entry.match.selectedMap);

                    return (
                      <Link
                        key={entry.id}
                        to="/match/$matchId"
                        params={{ matchId: entry.match.id }}
                        title="Abrir matchroom histórico"
                        style={{
                          display: "grid",
                          gridTemplateColumns: "78px minmax(0, 1fr) auto",
                          gap: "12px",
                          alignItems: "center",
                          minHeight: "68px",
                          padding: "8px 14px 8px 8px",
                          border: "1px solid rgba(69,87,116,0.28)",
                          borderLeft: `3px solid ${resultColor}`,
                          background: `linear-gradient(180deg, ${resultColor}0a, rgba(3,8,18,0.94))`,
                          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.035), 0 0 20px ${resultColor}0a`,
                          color: "inherit",
                          textDecoration: "none",
                          cursor: "pointer",
                        }}
                      >
                        <div
                          style={{
                            position: "relative",
                            width: "74px",
                            height: "52px",
                            overflow: "hidden",
                            border: "1px solid rgba(232,244,255,0.08)",
                            background: "rgba(2,6,14,0.65)",
                          }}
                        >
                          {mapImage ? (
                            <img
                              src={mapImage}
                              alt=""
                              loading="lazy"
                              decoding="async"
                              style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                                display: "block",
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                width: "100%",
                                height: "100%",
                                display: "grid",
                                placeItems: "center",
                                color: "rgba(232,244,255,0.45)",
                                fontFamily: "var(--font-display)",
                                fontWeight: 900,
                              }}
                            >
                              {entry.match.selectedMap
                                ?.slice(0, 2)
                                .toUpperCase() ?? "?"}
                            </div>
                          )}
                          <div
                            style={{
                              position: "absolute",
                              inset: 0,
                              background:
                                "linear-gradient(135deg, rgba(255,255,255,0.08), transparent 44%, rgba(0,0,0,0.42))",
                              boxShadow: `inset 0 0 0 1px ${resultColor}26`,
                            }}
                          />
                        </div>

                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontWeight: 800,
                              color: "var(--nexus-text)",
                              fontSize: "14px",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {entry.match.selectedMap ?? "Mapa pendiente"}
                          </div>
                          <div
                            style={{
                              marginTop: "4px",
                              color: resultColor,
                              fontSize: "11px",
                              display: "flex",
                              gap: "10px",
                              flexWrap: "wrap",
                              textTransform: "uppercase",
                              letterSpacing: "0.9px",
                              fontWeight: 900,
                            }}
                          >
                            <span>{won ? "Victoria" : "Derrota"}</span>
                            <span>
                              {formatMatchRelativeTime(entry.match.createdAt)}
                            </span>
                          </div>
                        </div>

                        <div
                          style={{
                            fontFamily: "var(--font-display)",
                            fontSize: "15px",
                            fontWeight: 900,
                            color: delta >= 0 ? "#00e676" : "#ff4757",
                            whiteSpace: "nowrap",
                            letterSpacing: "0.7px",
                          }}
                        >
                          {entry.mmrDelta == null
                            ? "—"
                            : `${delta > 0 ? "+" : ""}${delta} ELO`}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}

              {filteredMatches.length > MATCHES_PER_PAGE ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "12px",
                    flexWrap: "wrap",
                  }}
                >
                  <div
                    style={{ color: "var(--nexus-muted)", fontSize: "12px" }}
                  >
                    Página {historyPage} de {totalHistoryPages}
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      disabled={historyPage === 1}
                      onClick={() =>
                        setHistoryPage((current) => Math.max(1, current - 1))
                      }
                      style={secondaryButtonStyle(historyPage === 1)}
                    >
                      Anterior
                    </button>
                    <button
                      disabled={historyPage === totalHistoryPages}
                      onClick={() =>
                        setHistoryPage((current) =>
                          Math.min(totalHistoryPages, current + 1),
                        )
                      }
                      style={secondaryButtonStyle(
                        historyPage === totalHistoryPages,
                      )}
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {activeTab === "accounts" && isOwnProfile ? (
            <section style={{ ...cardStyle, display: "grid", gap: "14px" }}>
              <div>
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "18px",
                    fontWeight: 800,
                    letterSpacing: "2px",
                    textTransform: "uppercase",
                    color: "var(--nexus-text)",
                  }}
                >
                  Cuentas vinculadas
                </div>
                <div style={{ color: "var(--nexus-muted)", fontSize: "13px" }}>
                  Vinculá las cuentas que destraban funciones reales: voice privado
                  por equipo, identidad Battle.net y futuras señales sociales.
                </div>
              </div>

              {accountMessage ? <MessageBanner text={accountMessage} /> : null}

              {!linkedDiscordAccount ? (
                <DiscordLinkCallout
                  busy={accountBusyProvider === "discord"}
                  onLink={handleLinkDiscord}
                />
              ) : null}

              <AccountCard
                provider="discord"
                account={linkedDiscordAccount}
                busy={accountBusyProvider === "discord"}
                status="ready"
                onLink={handleLinkDiscord}
                onUnlink={() => handleUnlink("discord")}
              />

              <AccountCard
                provider="google"
                account={linkedGoogleAccount}
                busy={false}
                status="coming-soon"
              />

              <AccountCard
                provider="bnet"
                account={linkedBattleNetAccount}
                busy={accountBusyProvider === "bnet"}
                status="ready"
                onLink={handleLinkBattleNet}
                onUnlink={() => handleUnlink("bnet")}
              />
            </section>
          ) : null}
        </div>

        <div style={{ display: "grid", gap: "18px" }}>
          <section style={{ ...cardStyle, display: "grid", gap: "12px" }}>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "16px",
                fontWeight: 800,
                letterSpacing: "2px",
                textTransform: "uppercase",
                color: "var(--nexus-text)",
              }}
            >
              Buscar perfiles
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(0,0,0,0.2)",
                padding: "10px 12px",
              }}
            >
              <Search size={16} color="var(--nexus-accent)" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Buscá por username..."
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: "var(--nexus-text)",
                  fontSize: "13px",
                }}
              />
            </div>

            {searchLoading ? (
              <EmptyBlock text="Buscando perfiles..." />
            ) : searchTerm.trim().length < 2 ? (
              <EmptyBlock text="Escribí al menos 2 caracteres para empezar a scoutear." />
            ) : searchResults.length === 0 ? (
              <EmptyBlock text="No encontré perfiles con ese criterio." />
            ) : (
              <div style={{ display: "grid", gap: "8px" }}>
                {searchResults.map((result) => (
                  <button
                    key={result.id}
                    onClick={() => openProfile(result.username)}
                    style={{
                      textAlign: "left",
                      padding: "12px",
                      border: "1px solid rgba(255,255,255,0.06)",
                      background: "rgba(255,255,255,0.02)",
                      color: "inherit",
                      cursor: "pointer",
                      display: "grid",
                      gap: "8px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "12px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                        }}
                      >
                        <AvatarBlock
                          avatar={result.avatar}
                          username={result.username}
                          size={34}
                        />
                        <div>
                          <div
                            style={{
                              fontWeight: 800,
                              color: "var(--nexus-text)",
                              fontSize: "13px",
                            }}
                          >
                            {result.username}
                          </div>
                          <div
                            style={{
                              color: "var(--nexus-muted)",
                              fontSize: "12px",
                            }}
                          >
                            {result.displayLevel ?? "Lvl 1"} · {result.mmr} MMR
                          </div>
                        </div>
                      </div>

                      <div
                        style={{
                          color: "var(--nexus-accent)",
                          fontSize: "12px",
                          fontWeight: 800,
                          textTransform: "uppercase",
                          letterSpacing: "1px",
                        }}
                      >
                        Ver perfil
                      </div>
                    </div>

                    <div
                      style={{
                        color: "var(--nexus-faint)",
                        fontSize: "12px",
                        display: "flex",
                        gap: "10px",
                        flexWrap: "wrap",
                      }}
                    >
                      <span>
                        {result.wins}W · {result.losses}L
                      </span>
                      <span>Winrate {result.winrate ?? 0}%</span>
                      <span>
                        {getRoleLabel(result.mainRole)} /{" "}
                        {getRoleLabel(result.secondaryRole)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function AvatarBlock({
  avatar,
  username,
  size,
  rankColor,
}: {
  avatar: string | null;
  username: string;
  size: number;
  rankColor?: string;
}) {
  const [imageVisible, setImageVisible] = useState(Boolean(avatar));
  const initial = username.charAt(0).toUpperCase() || "N";

  const borderStyle = rankColor
    ? `2px solid ${rankColor}66`
    : "1px solid rgba(255,255,255,0.08)";
  const glowStyle = rankColor
    ? `0 0 24px ${rankColor}44, 0 0 48px ${rankColor}22, inset 0 0 0 1px ${rankColor}22`
    : "none";

  return avatar && imageVisible ? (
    <img
      src={avatar}
      alt={username}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        objectFit: "cover",
        border: borderStyle,
        boxShadow: glowStyle,
        flexShrink: 0,
      }}
      onError={(event) => {
        event.currentTarget.style.display = "none";
        setImageVisible(false);
      }}
    />
  ) : (
    <div
      style={{
        width: `${size}px`,
        height: `${size}px`,
        display: "grid",
        placeItems: "center",
        border: borderStyle,
        boxShadow: glowStyle,
        background: rankColor ? `${rankColor}18` : "rgba(0,174,255,0.12)",
        color: rankColor ?? "var(--nexus-accent)",
        fontFamily: "var(--font-display)",
        fontSize: `${Math.max(16, Math.floor(size / 2.2))}px`,
        fontWeight: 900,
        flexShrink: 0,
      }}
    >
      {initial}
    </div>
  );
}

function MetricCard({
  label,
  value,
  accent,
  icon,
}: {
  label: string;
  value: string;
  accent: string;
  icon: ReactNode;
}) {
  return (
    <div
      style={{
        border: `1px solid ${accent}66`,
        boxShadow: `inset 0 0 0 1px ${accent}1f`,
        background: `linear-gradient(155deg, ${accent}12, rgba(7,12,22,0.75) 58%, rgba(7,12,22,0.92))`,
        padding: "14px",
        display: "grid",
        gap: "10px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          color: accent,
        }}
      >
        <span
          style={{
            fontSize: "11px",
            fontWeight: 800,
            letterSpacing: "1px",
            textTransform: "uppercase",
            border: `1px solid ${accent}66`,
            background: `${accent}1f`,
            padding: "4px 8px",
          }}
        >
          {label}
        </span>
        {icon}
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "22px",
          fontWeight: 900,
          color: "var(--nexus-text)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function RoleBadge({
  label,
  role,
}: {
  label: string;
  role?: PlayerRole | null;
}) {
  const meta = getRoleMeta(role);
  const accent = meta?.accent ?? "rgba(255,255,255,0.18)";
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "12px",
        padding: "10px 12px",
        border: `1px solid ${meta ? `${accent}55` : "rgba(255,255,255,0.06)"}`,
        background: meta ? `${accent}12` : "rgba(255,255,255,0.02)",
      }}
    >
      <span
        style={{
          fontSize: "11px",
          fontWeight: 800,
          letterSpacing: "1px",
          textTransform: "uppercase",
          color: "var(--nexus-faint)",
        }}
      >
        {label}
      </span>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "7px",
          color: meta ? accent : "var(--nexus-text)",
          fontWeight: 800,
          fontSize: "13px",
        }}
      >
        {meta && (
          <img
            src={meta.icon}
            alt=""
            style={{
              width: "18px",
              height: "18px",
              objectFit: "contain",
            }}
          />
        )}
        {getRoleLabel(role)}
      </span>
    </div>
  );
}

function TabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        position: "relative",
        border: "1px solid rgba(255,255,255,0.06)",
        borderBottom: active
          ? "2px solid var(--nexus-accent)"
          : "2px solid transparent",
        background: active
          ? "linear-gradient(180deg, rgba(0,200,255,0.10), rgba(0,200,255,0.04))"
          : "rgba(255,255,255,0.02)",
        color: active ? "var(--nexus-accent)" : "rgba(232,244,255,0.55)",
        padding: "10px 18px",
        cursor: "pointer",
        fontFamily: "var(--font-display)",
        fontWeight: 800,
        fontSize: "12px",
        textTransform: "uppercase",
        letterSpacing: "1.5px",
        boxShadow: active ? "0 0 16px rgba(0,200,255,0.12)" : "none",
      }}
    >
      {label}
    </button>
  );
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        border: `1px solid ${active ? "rgba(0,200,255,0.35)" : "rgba(255,255,255,0.08)"}`,
        background: active ? "rgba(0,200,255,0.12)" : "transparent",
        color: active ? "var(--nexus-accent)" : "var(--nexus-muted)",
        padding: "8px 10px",
        cursor: "pointer",
        fontWeight: 800,
        textTransform: "uppercase",
        letterSpacing: "1px",
        fontSize: "11px",
      }}
    >
      {label}
    </button>
  );
}

function ReadinessCard({
  label,
  value,
  detail,
  accent,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  accent: string;
  icon: ReactNode;
}) {
  return (
    <div
      style={{
        border: `1px solid ${accent}55`,
        background: `linear-gradient(145deg, ${accent}14, rgba(7,12,22,0.78) 58%, rgba(3,7,14,0.92))`,
        padding: "14px",
        display: "grid",
        gap: "10px",
        minHeight: "112px",
        boxShadow: `inset 0 0 0 1px ${accent}14`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "10px",
          color: accent,
        }}
      >
        <span
          style={{
            color: "var(--nexus-faint)",
            fontSize: "11px",
            fontWeight: 900,
            letterSpacing: "1.4px",
            textTransform: "uppercase",
          }}
        >
          {label}
        </span>
        {icon}
      </div>
      <div
        style={{
          color: "var(--nexus-text)",
          fontFamily: "var(--font-display)",
          fontSize: "20px",
          fontWeight: 900,
          letterSpacing: "0.6px",
        }}
      >
        {value}
      </div>
      <div style={{ color: "var(--nexus-muted)", fontSize: "12px", lineHeight: 1.45 }}>
        {detail}
      </div>
    </div>
  );
}

function ScoutCard({
  label,
  value,
  icon,
  role,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
  role?: PlayerRole | null;
}) {
  const roleMeta = getRoleMeta(role);
  const accent = roleMeta?.accent ?? "var(--nexus-accent)";
  return (
    <div
      style={{
        border: roleMeta
          ? `1px solid ${accent}44`
          : "1px solid rgba(255,255,255,0.06)",
        background: roleMeta
          ? `linear-gradient(145deg, ${accent}1f, rgba(255,255,255,0.02) 52%, rgba(255,255,255,0.01))`
          : "rgba(255,255,255,0.02)",
        padding: "12px",
        display: "grid",
        gap: "8px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "10px",
          alignItems: "center",
        }}
      >
        <span
          style={{
            color: "var(--nexus-faint)",
            fontSize: "11px",
            fontWeight: 800,
            letterSpacing: "1px",
            textTransform: "uppercase",
          }}
        >
          {label}
        </span>
        {roleMeta ? (
          <img
            src={roleMeta.icon}
            alt=""
            style={{
              width: "18px",
              height: "18px",
              objectFit: "contain",
            }}
          />
        ) : icon ? (
          <span style={{ color: "var(--nexus-accent)" }}>{icon}</span>
        ) : null}
      </div>
      <div
        style={{
          color: roleMeta ? accent : "var(--nexus-text)",
          fontSize: "14px",
          fontWeight: 800,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label style={{ display: "grid", gap: "8px" }}>
      <span
        style={{
          fontSize: "11px",
          fontWeight: 800,
          letterSpacing: "1px",
          textTransform: "uppercase",
          color: "var(--nexus-faint)",
        }}
      >
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        style={fieldStyle}
      />
    </label>
  );
}

function BattleNetIdentityPill({ battletag }: { battletag: string }) {
  return (
    <div
      title="Battle.net ID vinculado"
      style={{
        width: "fit-content",
        display: "inline-flex",
        alignItems: "center",
        gap: "7px",
        border: "1px solid rgba(0,174,255,0.28)",
        background:
          "linear-gradient(90deg, rgba(0,174,255,0.12), rgba(93,183,255,0.05))",
        color: "#9bd8ff",
        padding: "5px 8px",
        boxShadow: "0 0 18px rgba(0,174,255,0.08)",
        fontSize: "11px",
        fontWeight: 900,
        letterSpacing: "0.9px",
        textTransform: "uppercase",
      }}
    >
      <span
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "999px",
          background: "#00aeff",
          boxShadow: "0 0 10px #00aeff",
        }}
      />
      <span style={{ color: "rgba(155,216,255,0.62)" }}>BATTLE.NET</span>
      <span style={{ color: "#d8f2ff" }}>{battletag}</span>
    </div>
  );
}

function DiscordLinkCallout({
  busy,
  onLink,
}: {
  busy: boolean;
  onLink: () => void;
}) {
  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        border: "1px solid rgba(88,101,242,0.42)",
        background:
          "radial-gradient(circle at top right, rgba(88,101,242,0.24), transparent 42%), linear-gradient(135deg, rgba(88,101,242,0.13), rgba(2,6,14,0.78))",
        padding: "14px",
        display: "flex",
        justifyContent: "space-between",
        gap: "14px",
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "grid", gap: "4px", minWidth: 0 }}>
        <div
          style={{
            color: "#a5b4fc",
            fontFamily: "var(--font-display)",
            fontSize: "12px",
            fontWeight: 900,
            letterSpacing: "1.6px",
            textTransform: "uppercase",
          }}
        >
          Acción recomendada
        </div>
        <div
          style={{
            color: "var(--nexus-text)",
            fontSize: "14px",
            fontWeight: 850,
          }}
        >
          Vinculá Discord para recibir el voice privado de tu equipo.
        </div>
        <div style={{ color: "rgba(226,232,240,0.62)", fontSize: "12px" }}>
          Sin Discord podés jugar, pero durante la partida no se te expone el
          invite automático del canal.
        </div>
      </div>
      <button
        onClick={onLink}
        disabled={busy}
        style={{
          border: "1px solid rgba(165,180,252,0.52)",
          background: busy
            ? "rgba(148,163,184,0.16)"
            : "linear-gradient(90deg, #5865f2, #8b5cf6)",
          color: "#fff",
          padding: "10px 12px",
          fontFamily: "var(--font-display)",
          fontSize: "12px",
          fontWeight: 900,
          letterSpacing: "1px",
          textTransform: "uppercase",
          cursor: busy ? "not-allowed" : "pointer",
          boxShadow: busy ? "none" : "0 0 24px rgba(88,101,242,0.22)",
        }}
      >
        {busy ? "Conectando..." : "Vincular Discord"}
      </button>
    </div>
  );
}

function AccountCard({
  provider,
  account,
  busy,
  status,
  onLink,
  onUnlink,
}: {
  provider: LinkedAccountProvider;
  account: LinkedAccount | null;
  busy: boolean;
  status: "ready" | "coming-soon";
  onLink?: () => void;
  onUnlink?: () => void;
}) {
  const linked = Boolean(account);
  const accent = getProviderAccent(provider);
  const unavailable = status !== "ready";
  const description =
    provider === "discord"
      ? "Voice privado, verificación social y acceso operativo a salas."
      : provider === "bnet"
        ? "Identidad Battle.net para validar cuenta y cruzar datos competitivos."
        : "Reservado para login alternativo cuando activemos OAuth de Google.";

  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(255,255,255,0.02)",
        padding: "14px",
        display: "grid",
        gap: "10px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "grid", gap: "4px" }}>
          <span
            style={{
              color: accent,
              fontSize: "12px",
              fontWeight: 800,
              letterSpacing: "1px",
              textTransform: "uppercase",
            }}
          >
            {getProviderLabel(provider)}
          </span>
          <span style={{ color: "var(--nexus-text)", fontSize: "13px" }}>
            {linked
              ? (account?.displayName ?? "Cuenta vinculada")
              : provider === "google"
                ? "Reservado para próximo OAuth"
                : "Lista para vincular ahora"}
          </span>
          <span style={{ color: "var(--nexus-muted)", fontSize: "12px" }}>
            {description}
          </span>
        </div>

        <span
          style={{
            color: linked ? "#00e676" : "var(--nexus-faint)",
            fontSize: "11px",
            fontWeight: 800,
            letterSpacing: "1px",
            textTransform: "uppercase",
          }}
        >
          {linked ? "Conectada" : status === "ready" ? "Libre" : "Sin OAuth"}
        </span>
      </div>

      <div
        style={{
          display: "flex",
          gap: "10px",
          flexWrap: "wrap",
        }}
      >
        {linked ? (
          <button
            onClick={onUnlink}
            disabled={busy}
            style={secondaryButtonStyle(busy)}
          >
            {busy ? "Desvinculando..." : "Desvincular"}
          </button>
        ) : (
          <button
            onClick={onLink}
            disabled={busy || unavailable}
            style={secondaryButtonStyle(busy || unavailable)}
          >
            {unavailable ? "No activo" : busy ? "Conectando..." : "Vincular"}
          </button>
        )}
      </div>
    </div>
  );
}

function MessageBanner({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        border: "1px solid rgba(0,200,255,0.25)",
        background: "rgba(0,200,255,0.08)",
        color: "var(--nexus-text)",
        fontSize: "13px",
      }}
    >
      {text}
    </div>
  );
}

function EmptyBlock({ text }: { text: string }) {
  return (
    <div
      style={{
        border: "1px dashed rgba(255,255,255,0.1)",
        background: "rgba(255,255,255,0.02)",
        padding: "14px",
        color: "var(--nexus-muted)",
        fontSize: "13px",
      }}
    >
      {text}
    </div>
  );
}

function ProfileHistoryEmpty({
  isOwnProfile,
  filtered,
}: {
  isOwnProfile: boolean;
  filtered: boolean;
}) {
  return (
    <div style={profileEmptyStateStyle}>
      <div>
        <div style={profileEmptyKickerStyle}>Historial en construcción</div>
        <strong style={profileEmptyTitleStyle}>
          {filtered ? "No hay partidas para este filtro" : "Todavía no hay evidencia competitiva"}
        </strong>
        <p style={profileEmptyTextStyle}>
          {isOwnProfile
            ? "Jugá matchmaking o pedí una scrim beta para que este perfil muestre mapas, resultado, ELO y scouting real."
            : "Este perfil todavía no tiene partidas visibles en la beta cerrada. Volvé cuando complete matches o scrims."}
        </p>
      </div>
      <div style={profileEmptyActionsStyle}>
        {isOwnProfile ? (
          <>
            <Link to="/dashboard" style={profileEmptyPrimaryLinkStyle}>
              Buscar partida
            </Link>
            <a href="/profile?tab=accounts" style={profileEmptySecondaryLinkStyle}>
              Vincular cuentas
            </a>
          </>
        ) : (
          <Link to="/leaderboard" style={profileEmptySecondaryLinkStyle}>
            Ver leaderboard
          </Link>
        )}
      </div>
    </div>
  );
}

const fieldStyle: CSSProperties = {
  width: "100%",
  background: "rgba(255,255,255,0.02)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "var(--nexus-text)",
  padding: "12px 14px",
  outline: "none",
  fontSize: "14px",
};

const profileEmptyStateStyle: CSSProperties = {
  border: "1px dashed rgba(0,200,255,0.24)",
  background:
    "linear-gradient(135deg, rgba(0,200,255,0.08), rgba(255,255,255,0.018) 48%, rgba(139,92,246,0.08))",
  padding: "16px",
  display: "grid",
  gap: "12px",
  color: "var(--nexus-text)",
};

const profileEmptyKickerStyle: CSSProperties = {
  color: "var(--nexus-accent)",
  fontSize: "11px",
  fontWeight: 900,
  letterSpacing: "1.5px",
  textTransform: "uppercase",
};

const profileEmptyTitleStyle: CSSProperties = {
  display: "block",
  marginTop: "4px",
  fontFamily: "var(--font-display)",
  fontSize: "16px",
  letterSpacing: "1px",
  textTransform: "uppercase",
};

const profileEmptyTextStyle: CSSProperties = {
  margin: "6px 0 0",
  color: "var(--nexus-muted)",
  fontSize: "13px",
  lineHeight: 1.55,
};

const profileEmptyActionsStyle: CSSProperties = {
  display: "flex",
  gap: "8px",
  flexWrap: "wrap",
};

const profileEmptyPrimaryLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  border: "1px solid rgba(0,200,255,0.42)",
  background: "rgba(0,200,255,0.14)",
  color: "var(--nexus-accent)",
  padding: "9px 11px",
  fontSize: "12px",
  fontWeight: 900,
  letterSpacing: "1px",
  textTransform: "uppercase",
  textDecoration: "none",
};

const profileEmptySecondaryLinkStyle: CSSProperties = {
  ...profileEmptyPrimaryLinkStyle,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.03)",
  color: "var(--nexus-text)",
};

const primaryButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  border: "1px solid rgba(0,200,255,0.35)",
  background: "rgba(0,200,255,0.12)",
  color: "var(--nexus-accent)",
  padding: "11px 14px",
  cursor: "pointer",
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "1px",
};

function secondaryButtonStyle(disabled: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.02)",
    color: disabled ? "var(--nexus-faint)" : "var(--nexus-text)",
    padding: "10px 12px",
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "1px",
    opacity: disabled ? 0.65 : 1,
  };
}
