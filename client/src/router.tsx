import {
  createRouter,
  createRoute,
  createRootRoute,
  lazyRouteComponent,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { useAuthStore } from "./stores/auth.store";
import { requiresCompetitiveOnboarding } from "./lib/onboarding";

function getAuthedHomePath(user: { role?: string }) {
  return user.role === "ADMIN" ? "/admin" : "/dashboard";
}

// ─── Root ──────────────────────────────────────────────────
const rootRoute = createRootRoute({ component: Outlet });

// ─── Public routes ─────────────────────────────────────────
const landingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: lazyRouteComponent(() => import("./pages/Landing"), "Landing"),
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: lazyRouteComponent(() => import("./pages/Login"), "Login"),
  beforeLoad: () => {
    const user = useAuthStore.getState().user;
    if (user) throw redirect({ to: requiresCompetitiveOnboarding(user) ? "/onboarding" : getAuthedHomePath(user) });
  },
});

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/register",
  component: lazyRouteComponent(() => import("./pages/Register"), "Register"),
  beforeLoad: () => {
    const user = useAuthStore.getState().user;
    if (user) throw redirect({ to: requiresCompetitiveOnboarding(user) ? "/onboarding" : getAuthedHomePath(user) });
  },
});

const authCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/callback",
  component: lazyRouteComponent(() => import("./pages/AuthCallback"), "AuthCallback"),
});

// ─── Protected layout ──────────────────────────────────────
const protectedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "protected",
  component: Outlet,
  beforeLoad: () => {
    if (!useAuthStore.getState().user) throw redirect({ to: "/login" });
  },
});

const onboardingRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "/onboarding",
  component: lazyRouteComponent(() => import("./pages/Onboarding"), "Onboarding"),
  beforeLoad: () => {
    const user = useAuthStore.getState().user;
    if (!user) throw redirect({ to: "/login" });
    if (!requiresCompetitiveOnboarding(user)) throw redirect({ to: getAuthedHomePath(user) });
  },
});

const appRoute = createRoute({
  getParentRoute: () => protectedRoute,
  id: "app",
  component: lazyRouteComponent(() => import("./layouts/AppLayout"), "AppLayout"),
  beforeLoad: () => {
    const user = useAuthStore.getState().user;
    if (!user) throw redirect({ to: "/login" });
    if (requiresCompetitiveOnboarding(user)) throw redirect({ to: "/onboarding" });
  },
});

const dashboardRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/dashboard",
  component: lazyRouteComponent(() => import("./pages/Dashboard"), "Dashboard"),
});

const adminRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/admin",
  component: lazyRouteComponent(() => import("./pages/Admin"), "Admin"),
  beforeLoad: () => {
    const user = useAuthStore.getState().user;
    if (!user) throw redirect({ to: "/login" });
    if (user.role !== "ADMIN") throw redirect({ to: "/dashboard" });
  },
});

const profileRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/profile",
  component: lazyRouteComponent(() => import("./pages/Profile"), "Profile"),
});

const publicProfileRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/profile/$username",
  component: lazyRouteComponent(() => import("./pages/Profile"), "Profile"),
});

const matchRoomRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/match/$matchId",
  component: lazyRouteComponent(() => import("./pages/MatchRoom"), "MatchRoom"),
});

const leaderboardRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/leaderboard",
  component: lazyRouteComponent(() => import("./pages/Leaderboard"), "Leaderboard"),
});

const statsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/stats",
  component: lazyRouteComponent(() => import("./pages/Stats"), "Stats"),
});

const heroesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/heroes",
  component: lazyRouteComponent(() => import("./pages/Heroes"), "Heroes"),
});

// ─── Router ────────────────────────────────────────────────
const routeTree = rootRoute.addChildren([
  landingRoute,
  loginRoute,
  registerRoute,
  authCallbackRoute,
  protectedRoute.addChildren([
    onboardingRoute,
    appRoute.addChildren([
      dashboardRoute,
      adminRoute,
      leaderboardRoute,
      statsRoute,
      heroesRoute,
      profileRoute,
      publicProfileRoute,
      matchRoomRoute,
    ]),
  ]),
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
