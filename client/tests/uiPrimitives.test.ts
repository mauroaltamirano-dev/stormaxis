import assert from "node:assert/strict";
import test from "node:test";

import { buildActionClassName, buildPanelClassName } from "../src/components/ui/uiPrimitives";

test("buildActionClassName gives enabled actions interactive affordances", () => {
  assert.equal(
    buildActionClassName({ variant: "primary", size: "md", className: "extra" }),
    "sx-action sx-action--primary sx-action--md nx-interactive extra",
  );
});

test("buildActionClassName marks disabled actions as non interactive", () => {
  assert.equal(
    buildActionClassName({ variant: "ghost", size: "sm", disabled: true }),
    "sx-action sx-action--ghost sx-action--sm sx-action--disabled",
  );
});

test("buildPanelClassName composes tone and padding consistently", () => {
  assert.equal(
    buildPanelClassName({ tone: "accent", padding: "lg", className: "matchroom" }),
    "sx-panel sx-panel--accent sx-panel--pad-lg matchroom",
  );
});

test("buildActionClassName supports link-compatible secondary large actions", () => {
  assert.equal(
    buildActionClassName({ variant: "secondary", size: "lg" }),
    "sx-action sx-action--secondary sx-action--lg nx-interactive",
  );
});
