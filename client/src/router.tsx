import {
  createRouter,
  createRoute,
  createRootRoute,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { useAuthStore } from "./stores/auth.store";
import { Landing } from "./pages/Landing";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { Dashboard } from "./pages/Dashboard";
import { MatchRoom } from "./pages/MatchRoom";
import { Profile } from "./pages/Profile";
import { Leaderboard } from "./pages/Leaderboard";
import { Admin } from "./pages/Admin";
import { AppLayout } from "./layouts/AppLayout";
import { AuthCallback } from "./pages/AuthCallback";
import { Onboarding } from "./pages/Onboarding";
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
  component: Landing,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: Login,
  beforeLoad: () => {
    const user = useAuthStore.getState().user;
    if (user) throw redirect({ to: requiresCompetitiveOnboarding(user) ? "/onboarding" : getAuthedHomePath(user) });
  },
});

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/register",
  component: Register,
  beforeLoad: () => {
    const user = useAuthStore.getState().user;
    if (user) throw redirect({ to: requiresCompetitiveOnboarding(user) ? "/onboarding" : getAuthedHomePath(user) });
  },
});

const authCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/callback",
  component: AuthCallback,
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
  component: Onboarding,
  beforeLoad: () => {
    const user = useAuthStore.getState().user;
    if (!user) throw redirect({ to: "/login" });
    if (!requiresCompetitiveOnboarding(user)) throw redirect({ to: getAuthedHomePath(user) });
  },
});

const appRoute = createRoute({
  getParentRoute: () => protectedRoute,
  id: "app",
  component: AppLayout,
  beforeLoad: () => {
    const user = useAuthStore.getState().user;
    if (!user) throw redirect({ to: "/login" });
    if (requiresCompetitiveOnboarding(user)) throw redirect({ to: "/onboarding" });
  },
});

const dashboardRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/dashboard",
  component: Dashboard,
});

const adminRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/admin",
  component: Admin,
  beforeLoad: () => {
    const user = useAuthStore.getState().user;
    if (!user) throw redirect({ to: "/login" });
    if (user.role !== "ADMIN") throw redirect({ to: "/dashboard" });
  },
});

const profileRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/profile",
  component: Profile,
});

const publicProfileRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/profile/$username",
  component: Profile,
});

const matchRoomRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/match/$matchId",
  component: MatchRoom,
});

const leaderboardRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/leaderboard",
  component: Leaderboard,
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
