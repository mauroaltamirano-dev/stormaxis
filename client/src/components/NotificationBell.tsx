import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Bell, Check, Clock3, Swords, UserPlus, X } from "lucide-react";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";

type NotificationItem =
  | {
      id: string;
      type: "FRIEND_REQUEST";
      createdAt: string;
      fromUser: { id: string; username: string; avatar: string | null };
      friendRequestId: string;
    }
  | {
      id: string;
      type: "TEAM_INVITE";
      createdAt: string;
      team: { id: string; name: string; slug: string; logoUrl: string | null };
      invitedBy?: { id: string; username: string; avatar: string | null } | null;
      inviteId: string;
    }
  | {
      id: string;
      type: "TEAM_JOIN_REQUEST";
      createdAt: string;
      team: { id: string; name: string; slug: string; logoUrl: string | null };
      user: { id: string; username: string; avatar: string | null };
      joinRequestId: string;
    };

type NotificationsResponse = {
  unreadCount: number;
  items: NotificationItem[];
};

function relativeTime(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.floor(diff / 60_000));
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;
  return `Hace ${Math.floor(hours / 24)} d`;
}

export function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  async function refresh() {
    try {
      const { data } = await api.get<NotificationsResponse>("/notifications");
      setItems(data.items);
    } catch {
      setItems([]);
    }
  }

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(refresh, 20_000);
    const socket = getSocket();
    const onRefresh = () => { void refresh(); };
    socket.on("friends:updated", onRefresh);
    socket.on("teams:invite_updated", onRefresh);
    socket.on("teams:join_request_updated", onRefresh);
    return () => {
      window.clearInterval(interval);
      socket.off("friends:updated", onRefresh);
      socket.off("teams:invite_updated", onRefresh);
      socket.off("teams:join_request_updated", onRefresh);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    void refresh();
    function handleOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  async function respondFriend(requestId: string, response: "ACCEPT" | "DECLINE") {
    setBusyId(requestId);
    try {
      await api.post(`/friends/requests/${requestId}/respond`, { response });
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  function openTeam(slug: string) {
    setOpen(false);
    navigate({ to: "/teams/$slug", params: { slug } });
  }

  return (
    <div className="storm-notif-wrap" ref={wrapRef}>
      <button
        className={`storm-notif-btn${open ? " open" : ""}`}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notificaciones"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Bell size={24} />
        {items.length > 0 ? <span className="storm-notif-badge" aria-label={`${items.length} pendientes`}>{items.length}</span> : null}
      </button>

      {open ? (
        <div className="storm-notif-panel storm-left-flyout" role="dialog" aria-label="Panel de notificaciones">
          <div className="storm-notif-head">
            <span className="storm-notif-title">Notificaciones</span>
            {items.length > 0 ? <span className="storm-notif-new">{items.length} pendientes</span> : null}
          </div>

          {items.length === 0 ? (
            <div className="storm-notif-empty">Sin notificaciones accionables.</div>
          ) : (
            <ul className="storm-notif-list">
              {items.map((item) => (
                <li key={item.id} className="storm-notif-item unread">
                  <span className={`storm-notif-ico-wrap storm-notif-ico--${item.type === "FRIEND_REQUEST" ? "check" : "trophy"}`} aria-hidden="true">
                    {item.type === "FRIEND_REQUEST" ? <UserPlus size={14} /> : item.type === "TEAM_INVITE" ? <Swords size={14} /> : <Clock3 size={14} />}
                  </span>
                  <div className="storm-notif-body">
                    <p className="storm-notif-msg">
                      {item.type === "FRIEND_REQUEST"
                        ? `${item.fromUser.username} te envió solicitud de amistad.`
                        : item.type === "TEAM_INVITE"
                          ? `${item.invitedBy?.username ?? "Un captain"} te invitó a ${item.team.name}.`
                          : `${item.user.username} solicitó entrar a ${item.team.name}.`}
                    </p>
                    <time className="storm-notif-time">{relativeTime(item.createdAt)}</time>
                    <div className="storm-notif-actions">
                      {item.type === "FRIEND_REQUEST" ? (
                        <>
                          <button type="button" className="storm-notif-action accept" disabled={busyId === item.friendRequestId} onClick={() => respondFriend(item.friendRequestId, "ACCEPT")} aria-label="Aceptar solicitud">
                            <Check size={14} />
                          </button>
                          <button type="button" className="storm-notif-action reject" disabled={busyId === item.friendRequestId} onClick={() => respondFriend(item.friendRequestId, "DECLINE")} aria-label="Rechazar solicitud">
                            <X size={14} />
                          </button>
                        </>
                      ) : (
                        <button type="button" className="storm-notif-link" onClick={() => openTeam(item.team.slug)}>Ver team</button>
                      )}
                    </div>
                  </div>
                  <span className="storm-notif-unread-dot" aria-hidden="true" />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
