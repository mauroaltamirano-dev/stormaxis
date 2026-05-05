import { Link } from "@tanstack/react-router";
import type { CSSProperties, ReactNode } from "react";
import { canLinkToProfile, getProfilePath, type ProfileLinkOptions } from "../lib/profile-links";

type PlayerLinkProps = ProfileLinkOptions & {
  username: string | null | undefined;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  title?: string;
};

export function PlayerLink({ username, children, className, style, title, isBot, placeholder }: PlayerLinkProps) {
  const label = children ?? username ?? "Jugador";

  if (!canLinkToProfile(username, { isBot, placeholder })) {
    return <span className={className} style={style} title={title}>{label}</span>;
  }

  const safeUsername = username!.trim();

  return (
    <Link
      to={getProfilePath(safeUsername)}
      className={className}
      style={{ ...defaultPlayerLinkStyle, ...style }}
      title={title ?? `Ver perfil de ${safeUsername}`}
    >
      {label}
    </Link>
  );
}

const defaultPlayerLinkStyle: CSSProperties = {
  color: "inherit",
  textDecoration: "none",
  cursor: "pointer",
};
