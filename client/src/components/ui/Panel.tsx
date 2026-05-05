import type { HTMLAttributes, ReactNode } from "react";
import { buildPanelClassName, type UiPanelPadding, type UiPanelTone } from "./uiPrimitives";

export type PanelProps = HTMLAttributes<HTMLElement> & {
  as?: "section" | "article" | "div";
  tone?: UiPanelTone;
  padding?: UiPanelPadding;
  title?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
};

export function Panel({ as: Tag = "section", tone = "default", padding = "md", title, eyebrow, actions, className, children, ...props }: PanelProps) {
  const hasHeader = Boolean(title || eyebrow || actions);

  return (
    <Tag {...props} className={buildPanelClassName({ tone, padding, className })}>
      {hasHeader ? (
        <header className="sx-panel__header">
          <div className="sx-panel__title-block">
            {eyebrow ? <p className="sx-panel__eyebrow">{eyebrow}</p> : null}
            {title ? <h2 className="sx-panel__title">{title}</h2> : null}
          </div>
          {actions ? <div className="sx-panel__actions">{actions}</div> : null}
        </header>
      ) : null}
      <div className="sx-panel__body">{children}</div>
    </Tag>
  );
}
