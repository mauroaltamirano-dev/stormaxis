import type { CSSProperties, ReactNode } from "react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useForm, type FieldPath } from "react-hook-form";
import { z } from "zod/v4";
import { api } from "../lib/api";
import { buildApiUrl } from "../lib/backend";
import { useAuthStore } from "../stores/auth.store";
import { ChevronRight } from "lucide-react";
import { requiresCompetitiveOnboarding } from "../lib/onboarding";

const schema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Requerido"),
});
type FormData = z.infer<typeof schema>;

export function Login() {
  const { user, setAuth } = useAuthStore();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState("");

  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<FormData>();

  useEffect(() => {
    if (!user) return;
    navigate({
      to: requiresCompetitiveOnboarding(user)
        ? "/onboarding"
        : user.role === "ADMIN"
          ? "/admin"
          : "/dashboard",
      replace: true,
    });
  }, [navigate, user]);

  async function onSubmit(data: FormData) {
    setServerError("");
    clearErrors();
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string")
          setError(field as FieldPath<FormData>, { message: issue.message });
      }
      return;
    }
    try {
      const res = await api.post("/auth/login", parsed.data);
      setAuth(res.data.user, res.data.accessToken);
      navigate({
        to: requiresCompetitiveOnboarding(res.data.user)
          ? "/onboarding"
          : res.data.user.role === "ADMIN"
            ? "/admin"
            : "/dashboard",
      });
    } catch (err: any) {
      setServerError(
        err.response?.data?.error?.message || "Credenciales inválidas",
      );
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        width: "100%",
        alignSelf: "stretch",
        position: "relative",
        overflow: "hidden",
        backgroundColor: "#05070A",
      }}
    >
      {/* Background full-bleed */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: "url(/images/greymane_1920x1200.webp)",
          backgroundSize: "cover",
          backgroundPosition: "center",
          opacity: 0.35,
          filter: "grayscale(80%)",
          mixBlendMode: "luminosity",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(100deg, rgba(5,7,10,0.98) 0%, rgba(5,7,10,0.6) 55%, rgba(5,7,10,0.97) 100%)",
        }}
      />
      {/* Grid pattern */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.04,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,1) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,1) 1px,transparent 1px)",
          backgroundSize: "80px 80px",
          pointerEvents: "none",
        }}
      />

      {/* Left panel — branding */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "clamp(2.5rem, 6vw, 5rem)",
          position: "relative",
          zIndex: 1,
          minWidth: 0,
        }}
      >
        {/* Logo */}
        <Link
          to="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "1rem",
            textDecoration: "none",
          }}
        >
          <img
            src="/brand/logo.webp"
            alt="NexusGG"
            decoding="async"
            style={{ width: "40px", height: "40px", objectFit: "contain" }}
          />
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "1.4rem",
              fontWeight: 700,
              letterSpacing: "0.25em",
              color: "#00c8ff",
              textTransform: "uppercase",
            }}
          >
            NexusGG
          </span>
        </Link>

        {/* Center copy */}
        <div style={{ maxWidth: "520px" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.75rem",
              border: "1px solid rgba(0,200,255,0.3)",
              background: "rgba(0,200,255,0.08)",
              padding: "0.4rem 1rem",
              marginBottom: "2rem",
            }}
          >
            <span
              style={{
                width: "6px",
                height: "6px",
                background: "#00c8ff",
                display: "block",
              }}
            />
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "0.65rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.3em",
                color: "#00c8ff",
              }}
            >
              Acceso Táctico
            </span>
          </div>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(2.8rem, 6vw, 5rem)",
              fontWeight: 900,
              textTransform: "uppercase",
              color: "#fff",
              lineHeight: 1.05,
              margin: "0 0 1.5rem 0",
            }}
          >
            De vuelta
            <br />a la{" "}
            <span
              style={{
                background: "linear-gradient(90deg, #00c8ff, #7c4dff)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              arena
            </span>
          </h1>
          <p
            style={{
              color: "#94a3b8",
              fontSize: "1rem",
              lineHeight: 1.75,
              borderLeft: "3px solid rgba(0,200,255,0.4)",
              paddingLeft: "1.25rem",
            }}
          >
            Tu progreso, tu rango, tu historial. Todo te espera adentro. Entrá y
            seguí compitiendo.
          </p>
        </div>

        {/* Footer note */}
        <p
          style={{
            fontSize: "0.7rem",
            color: "#334155",
            fontFamily: "monospace",
            letterSpacing: "0.05em",
          }}
        >
          © {new Date().getFullYear()} NexusGG — Infraestructura Táctica
          Independiente
        </p>
      </div>

      {/* Right panel — form */}
      <div
        style={{
          width: "clamp(360px, 35vw, 520px)",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          zIndex: 1,
          borderLeft: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(5,7,10,0.85)",
          backdropFilter: "blur(16px)",
          padding: "clamp(2.5rem, 5vw, 4rem)",
        }}
      >
        {/* Top accent */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "2px",
            background:
              "linear-gradient(90deg, transparent, #00c8ff 50%, transparent)",
          }}
        />

        <div style={{ width: "100%", maxWidth: "400px" }}>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "1.8rem",
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "#fff",
              marginBottom: "0.5rem",
            }}
          >
            Iniciar Sesión
          </h2>
          <p
            style={{
              fontSize: "0.8rem",
              color: "#64748b",
              marginBottom: "2.5rem",
              letterSpacing: "0.05em",
            }}
          >
            Ingresá tus credenciales para continuar
          </p>

          {/* OAuth */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
              marginBottom: "2rem",
            }}
          >
            <a
              href={buildApiUrl("/api/auth/discord")}
              style={{ textDecoration: "none" }}
            >
              <button style={oauthBtn("#5865F2")}>
                <svg
                  width="18"
                  height="14"
                  viewBox="0 0 71 55"
                  fill="currentColor"
                >
                  <path d="M60.1 4.9A58.6 58.6 0 0 0 45.5.4a.2.2 0 0 0-.2.1 40.8 40.8 0 0 0-1.8 3.7 54.1 54.1 0 0 0-16.2 0A37.4 37.4 0 0 0 25.5.5a.2.2 0 0 0-.2-.1A58.5 58.5 0 0 0 10.7 4.9a.2.2 0 0 0-.1.1C1.5 18.1-.9 31-.3 43.6a.2.2 0 0 0 .1.2 58.8 58.8 0 0 0 17.7 8.9.2.2 0 0 0 .2-.1 42 42 0 0 0 3.6-5.9.2.2 0 0 0-.1-.3 38.7 38.7 0 0 1-5.5-2.6.2.2 0 0 1 0-.4l1.1-.9a.2.2 0 0 1 .2 0c11.5 5.3 24 5.3 35.4 0a.2.2 0 0 1 .2 0l1.1.8a.2.2 0 0 1 0 .4 36.1 36.1 0 0 1-5.5 2.6.2.2 0 0 0-.1.3 47.1 47.1 0 0 0 3.6 5.9.2.2 0 0 0 .2.1 58.7 58.7 0 0 0 17.8-8.9.2.2 0 0 0 .1-.2c.7-14.4-2.1-27.2-9.7-38.6a.2.2 0 0 0-.1-.1ZM23.7 36.4c-3.5 0-6.4-3.2-6.4-7.1s2.8-7.1 6.4-7.1c3.6 0 6.5 3.2 6.4 7.1 0 3.9-2.8 7.1-6.4 7.1Zm23.7 0c-3.5 0-6.4-3.2-6.4-7.1s2.8-7.1 6.4-7.1c3.6 0 6.5 3.2 6.4 7.1 0 3.9-2.8 7.1-6.4 7.1Z" />
                </svg>
                Continuar con Discord
              </button>
            </a>
            <a
              href={buildApiUrl("/api/auth/bnet")}
              style={{ textDecoration: "none" }}
            >
              <button
                style={oauthBtn("linear-gradient(135deg, #0074e0, #00aeff)")}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                  focusable="false"
                  width="22"
                  height="22"
                  viewBox="0 0 48 48"
                  style={{
                    display: "block",
                    flex: "0 0 22px",
                    marginTop: "-1px",
                    filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.35))",
                  }}
                >
                  <path
                    fill="#d1d1d1"
                    d="M38.072,21.627c0,0,3.288,0.167,3.288-1.768c0-2.527-4.378-4.806-4.378-4.806s0.685-1.456,1.113-2.269c0.428-0.813,1.633-3.987,1.741-4.712c0.136-0.911-0.071-1.198-0.071-1.198c-0.298,1.953-3.476,7.575-3.728,7.768c-3.102-1.454-7.363-1.859-7.363-1.859S24.504,4,20.582,4c-3.889,0-3.87,7.521-3.87,7.521s-1.099-2.133-2.478-2.133c-2.016,0-2.678,3.051-2.678,6.358c-3.982,0-7.332,0.89-7.632,0.976c-0.3,0.086-1.242,0.771-0.813,0.685c0.871-0.279,4.963-0.912,8.545-0.601c0.197,3.144,2.032,7.238,2.032,7.238s-3.935,5.701-3.935,9.773c0,1.072,0.401,3.182,3.227,3.182c2.366,0,5.089-1.574,5.59-1.863c-0.437,0.624-0.76,1.811-0.76,2.355c0,0.257,0.099,0.779,0.519,1.181c0.666-0.666,1.325-1.325,2.134-2.134c-0.874-0.16-0.992-0.808-0.992-0.974c0-0.588,0.46-1.283,0.46-1.283s2.126-1.437,2.26-1.59l1.571,2.931c0,0-1.608,0.953-2.872,0.953c-0.159,0-0.3-0.013-0.426-0.036c-0.81,0.81-1.469,1.469-2.134,2.134c0.311,0.298,0.794,0.531,1.57,0.531c2.344,0,4.962-1.797,4.962-1.797s2.472,4.109,4.585,5.992c0.57,0.508,1.114,0.6,1.114,0.6s-2.099-2.022-4.865-7.23c2.57-1.589,5.247-5.336,5.247-5.336s0.315,0.01,2.756,0.01c3.825,0,9.258-0.805,9.258-3.845C42.956,24.462,38.072,21.627,38.072,21.627z M38.499,19.738c0,1.109-1.056,1.096-1.056,1.096l-0.802,0.053l-2.446-1.176c0,0,1.43-2.205,1.764-2.82C36.214,17.038,38.499,18.468,38.499,19.738z M15.372,11.864c0.571,0,1.131,0.695,1.361,1.284c0,0.389,0.203,2.662,0.203,2.662l-3.301-0.124C13.635,12.708,14.802,11.864,15.372,11.864z M15.031,32.539c-1.803,0-2.176-1.005-2.176-1.91c0-2.049,1.635-4.914,1.635-4.914s1.831,3.854,5.03,5.481C17.932,32.127,16.623,32.539,15.031,32.539z M24.832,34.976c-0.769-1.346-1.337-2.752-1.337-2.752s3.162,0.205,4.86-1.552c-1.059,0.477-2.746,1.077-4.711,0.896l8.527-8.948c-0.175-0.21-1.101-0.857-1.328-0.966c-1.223,1.472-5.977,6.557-10.38,9.074c-5.574-3.041-6.745-11.988-6.863-13.846l3.045,0.292c0,0-1.144,2.029-1.144,3.522c0,1.493,0.178,1.572,0.178,1.572s-0.038-2.603,1.569-4.613c1.223,6.518,2.5,9.858,3.495,11.848c0.507-0.21,1.451-0.629,1.451-0.629s-2.813-8.108-2.656-13.596c0.887-0.474,2.074-0.952,3.428-1.203c-0.033-0.351-0.107-0.702-0.259-1.053c-1.023,0.238-2.121,0.619-3.149,1.223c0.09-3.056,1.119-5.823,2.937-5.823c1.797,0,4.364,4.244,4.364,4.244s-1.896-0.17-4.152,0.355c0.152,0.351,0.226,0.702,0.259,1.053c0.594-0.11,1.217-0.181,1.867-0.181c5.609,0,10.118,2.415,10.118,2.415l-1.765,2.464c0,0-1.573-2.848-3.792-3.355c1.171,0.873,2.482,2.027,3.163,3.688c-4.648-1.818-10.257-2.778-12.057-2.988c-0.157,0.664-0.136,1.612-0.136,1.612s7.523,1.389,12.997,4.522C33.325,29.105,25.863,34.365,24.832,34.976z M31.958,29.856c0,0,2.337-3.065,2.298-7.126c0,0,3.773,2.337,3.773,4.617C38.03,29.894,31.958,29.856,31.958,29.856z"
                  ></path>
                  <path
                    fill="#ffffff"
                    d="M17.808,37.492c0-0.544,0.323-1.731,0.76-2.355c0.738-0.372,1.361-0.856,1.361-0.856s-0.46,0.695-0.46,1.283c0,0.167,0.118,0.814,0.992,0.974c0.126,0.023,0.267,0.036,0.426,0.036c1.264,0,2.872-0.953,2.872-0.953C18.594,40.25,17.808,37.558,17.808,37.492z M18.645,29.397l-0.062,0.03l-0.075,0.044c-0.293,0.172-0.568,0.315-0.836,0.44c0.553,0.49,1.167,0.939,1.848,1.285c0.294-0.14,0.737-0.362,0.944-0.467C19.795,30.364,19.193,29.91,18.645,29.397z M13.402,32.043c-0.419-0.375-0.547-0.907-0.547-1.414c0-2.049,1.635-4.914,1.635-4.914l-0.803-1.67c0,0-4.048,6.088-0.298,8.026C13.397,32.048,13.393,32.068,13.402,32.043z M37.963,27.785c-0.655,2.104-6.005,2.071-6.005,2.071l-1.017,1.578c0,0,0.303,0.009,2.373,0.01C33.314,31.444,37.554,31.098,37.963,27.785z M33.23,24.446c-0.001,0,0.346,0.222,0.801,0.574c0.144-0.714,0.233-1.481,0.225-2.291c-0.198-0.118-0.704-0.389-0.893-0.476c-0.004,0.727-0.107,1.432-0.262,2.12C33.151,24.401,33.199,24.428,33.23,24.446C33.23,24.446,33.23,24.446,33.23,24.446z M38.499,19.738c0,1.109-1.056,1.096-1.056,1.096l-0.802,0.053l1.43,0.739c4.616-0.189,1.067-3.781-2.112-4.735C36.214,17.038,38.499,18.468,38.499,19.738z M21.933,8.525c0.179-0.062,0.365-0.1,0.562-0.1c1.797,0,4.364,4.244,4.364,4.244l1.815,0.113c0,0-0.417-0.876-1.108-2.073C26.616,9.171,23.693,7.641,21.933,8.525z M15.188,10.188c-1.781-0.188-1.729,4.938-1.553,5.499c0-2.978,1.167-3.822,1.737-3.822c0.571,0,1.131,0.695,1.361,1.284c-0.025-0.878-0.022-1.628-0.022-1.628S16,10.344,15.188,10.188z M21.557,14.33c0.01-0.348,0.044-0.677,0.082-1.002c-0.696,0.227-1.403,0.521-2.081,0.919c-0.017,0.419,0.003,0.607-0.02,1.033c0.56-0.299,1.25-0.594,2.015-0.838C21.555,14.406,21.556,14.372,21.557,14.33z M24.811,34.976c-0.769-1.346-1.337-2.752-1.337-2.752s3.162,0.205,4.86-1.552c-1.059,0.477-2.746,1.077-4.711,0.896c-0.416,0.432-0.916,0.765-1.456,1.123l1.571,2.931C23.738,35.622,24.934,34.903,24.811,34.976z M25.672,36.77c0.241-0.149-0.834,0.637-0.834,0.637s2.472,4.109,4.585,5.992c0.57,0.508,1.114,0.6,1.114,0.6S28.438,41.978,25.672,36.77z M39.766,6.873c-0.298,1.953-3.476,7.575-3.728,7.768c-0.31-0.145,0.945,0.411,0.945,0.411s0.685-1.456,1.113-2.269c0.428-0.813,1.633-3.987,1.741-4.712C39.972,7.16,39.766,6.873,39.766,6.873z M34.952,16.312l-1.765,2.464c0,0-1.573-2.848-3.792-3.355c0.894,0.667,1.868,1.5,2.583,2.594c0-0.004,0-0.01,0-0.015c0,0.005,0,0.011,0,0.015c0.221,0.339,0.42,0.701,0.581,1.093c0.919,0.35,1.713,0.634,1.637,0.603c0,0,1.43-2.205,1.764-2.82C36.054,16.946,34.952,16.312,34.952,16.312z M16.936,15.811l-3.301-0.124c-0.052,0.334-0.032,0.855-0.034,1.197l3.045,0.292c0,0-1.144,2.029-1.144,3.522c0,1.493,0.178,1.572,0.178,1.572s-0.033-2.312,1.31-4.261c-0.004-0.004-0.008-0.005-0.011-0.009c0.004,0.004,0.008,0.006,0.011,0.009c0.082-0.119,0.167-0.236,0.259-0.352C17.041,16.479,16.936,15.811,16.936,15.811z M11.555,15.747c-3.982,0-7.332,0.89-7.632,0.976c-0.3,0.086-1.242,0.771-0.813,0.685c0.871-0.279,4.963-0.912,8.545-0.601C11.582,16.146,11.555,15.747,11.555,15.747z"
                  ></path>
                </svg>
                Continuar con Battle.net
              </button>
            </a>
          </div>

          {/* Divider */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "1rem",
              marginBottom: "2rem",
            }}
          >
            <div
              style={{
                flex: 1,
                height: "1px",
                background: "rgba(255,255,255,0.08)",
              }}
            />
            <span
              style={{
                fontSize: "0.65rem",
                fontWeight: 700,
                letterSpacing: "0.15em",
                color: "#334155",
                textTransform: "uppercase",
              }}
            >
              O con email
            </span>
            <div
              style={{
                flex: 1,
                height: "1px",
                background: "rgba(255,255,255,0.08)",
              }}
            />
          </div>

          {/* Form */}
          <form
            onSubmit={handleSubmit(onSubmit)}
            style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}
          >
            <Field label="Email" error={errors.email?.message}>
              <input
                {...register("email")}
                type="email"
                placeholder="vos@nexusgg.gg"
                style={inputStyle}
              />
            </Field>
            <Field label="Contraseña" error={errors.password?.message}>
              <input
                {...register("password")}
                type="password"
                placeholder="••••••••"
                style={inputStyle}
              />
            </Field>

            {serverError && (
              <div
                style={{
                  fontSize: "0.75rem",
                  color: "#ff4757",
                  background: "rgba(255,71,87,0.08)",
                  border: "1px solid rgba(255,71,87,0.2)",
                  padding: "0.75rem 1rem",
                }}
              >
                {serverError}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: "0.9rem",
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                background: isSubmitting ? "rgba(0,200,255,0.3)" : "#00c8ff",
                color: "#000",
                border: "none",
                padding: "1rem",
                cursor: isSubmitting ? "not-allowed" : "pointer",
                marginTop: "0.5rem",
                transition: "all 0.2s",
              }}
            >
              {isSubmitting ? (
                "Ingresando..."
              ) : (
                <>
                  <span>Iniciar Sesión</span>
                  <ChevronRight size={18} />
                </>
              )}
            </button>
          </form>

          <p
            style={{
              textAlign: "center",
              marginTop: "2rem",
              fontSize: "0.8rem",
              color: "#475569",
            }}
          >
            ¿No tenés cuenta?{" "}
            <Link
              to="/register"
              style={{
                color: "#00c8ff",
                textDecoration: "none",
                fontWeight: 700,
              }}
            >
              Registrate acá
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label
        style={{
          display: "block",
          fontSize: "0.65rem",
          fontWeight: 700,
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          color: "#64748b",
          marginBottom: "0.5rem",
        }}
      >
        {label}
      </label>
      {children}
      {error && (
        <div
          style={{ fontSize: "0.7rem", color: "#ff4757", marginTop: "0.4rem" }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "0.75rem 1rem",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "#f1f5f9",
  fontSize: "0.9rem",
  fontFamily: "var(--font-body)",
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.2s",
};

function oauthBtn(bg: string): CSSProperties {
  return {
    width: "100%",
    minHeight: "48px",
    padding: "0.85rem 1.25rem",
    background: bg,
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.1)",
    fontSize: "0.85rem",
    fontWeight: 700,
    fontFamily: "var(--font-body)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.7rem",
    letterSpacing: "0.05em",
    lineHeight: 1,
  };
}
