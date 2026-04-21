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
import { AppLayout } from "./layouts/AppLayout";
import { AuthCallback } from "./pages/AuthCallback";

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
    if (useAuthStore.getState().user) throw redirect({ to: "/dashboard" });
  },
});

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/register",
  component: Register,
  beforeLoad: () => {
    if (useAuthStore.getState().user) throw redirect({ to: "/dashboard" });
  },
});

const authCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/callback",
  component: AuthCallback,
});

// ─── Protected layout ──────────────────────────────────────
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  component: AppLayout,
  beforeLoad: () => {
    if (!useAuthStore.getState().user) throw redirect({ to: "/login" });
  },
});

const dashboardRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/dashboard",
  component: Dashboard,
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
  appRoute.addChildren([
    dashboardRoute,
    leaderboardRoute,
    profileRoute,
    publicProfileRoute,
    matchRoomRoute,
  ]),
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
