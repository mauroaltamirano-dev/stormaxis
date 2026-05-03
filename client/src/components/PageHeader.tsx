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
    <section className="storm-page-header">
      <div className="storm-page-header-grid">
        <div style={styles.copy}>
          <div className="storm-page-eyebrow">
            {icon ? <span style={styles.iconWrap}>{icon}</span> : null}
            {eyebrow}
          </div>
          <h1 className="storm-page-title">{title}</h1>
          {description ? <p className="storm-page-copy">{description}</p> : null}
        </div>

        {(actions || stats) && (
          <div className="storm-page-header-side">
            {actions}
            {stats}
          </div>
        )}
      </div>
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  copy: { minWidth: 0 },
  iconWrap: {
    display: "inline-grid",
    placeItems: "center",
    color: "#00c8ff",
    filter: "drop-shadow(0 0 10px rgba(0,200,255,0.45))",
  },
};
