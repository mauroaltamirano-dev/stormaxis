import type { CSSProperties, ReactNode } from "react";

type PageHeaderProps = {
  eyebrow: string;
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  stats?: ReactNode;
};

export function PageHeader({
  eyebrow,
  title,
  description,
  icon,
  actions,
  stats,
}: PageHeaderProps) {
  return (
    <section style={styles.header}>
      <div style={styles.gridPattern} />
      <div style={styles.content}>
        <div style={styles.copy}>
          <div style={styles.eyebrow}>
            {icon ? <span style={styles.iconWrap}>{icon}</span> : null}
            {eyebrow}
          </div>
          <h1 style={styles.title}>{title}</h1>
          {description ? <p style={styles.description}>{description}</p> : null}
        </div>

        {(actions || stats) && (
          <div style={styles.side}>
            {actions}
            {stats}
          </div>
        )}
      </div>
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  header: {
    position: "relative",
    overflow: "hidden",
    border: "1px solid rgba(0,200,255,0.18)",
    background:
      "linear-gradient(135deg, rgba(2,6,23,0.96), rgba(5,15,29,0.9) 58%, rgba(0,200,255,0.08)), radial-gradient(circle at 13% 12%, rgba(0,200,255,0.22), transparent 30%), radial-gradient(circle at 92% 18%, rgba(249,115,22,0.15), transparent 28%)",
    padding: "clamp(1rem, 2.3vw, 1.45rem)",
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.05), 0 22px 54px rgba(0,0,0,0.24)",
  },
  gridPattern: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    backgroundImage:
      "linear-gradient(90deg, rgba(125,211,252,0.045) 1px, transparent 1px), linear-gradient(0deg, rgba(125,211,252,0.032) 1px, transparent 1px)",
    backgroundSize: "42px 42px",
    maskImage: "linear-gradient(180deg, rgba(0,0,0,0.95), transparent 84%)",
  },
  content: {
    position: "relative",
    zIndex: 1,
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gap: "1rem",
    alignItems: "end",
  },
  copy: { minWidth: 0 },
  eyebrow: {
    display: "flex",
    alignItems: "center",
    gap: "0.45rem",
    color: "#00c8ff",
    fontSize: "0.68rem",
    fontWeight: 950,
    letterSpacing: "0.2em",
    textTransform: "uppercase",
  },
  iconWrap: {
    display: "inline-grid",
    placeItems: "center",
    color: "#00c8ff",
    filter: "drop-shadow(0 0 10px rgba(0,200,255,0.45))",
  },
  title: {
    margin: "0.28rem 0 0",
    color: "#f8fafc",
    fontFamily: "var(--font-display)",
    fontSize: "clamp(1.65rem, 3.6vw, 3.05rem)",
    lineHeight: 0.95,
    fontWeight: 950,
    letterSpacing: "0.065em",
    textTransform: "uppercase",
  },
  description: {
    margin: "0.7rem 0 0",
    maxWidth: "84ch",
    color: "rgba(226,232,240,0.66)",
    lineHeight: 1.58,
  },
  side: {
    display: "grid",
    gap: "0.65rem",
    justifyItems: "end",
    minWidth: "min(360px, 100%)",
  },
};
