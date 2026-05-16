import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
        gap: 32,
      }}
    >
      {/* Logo / titre */}
      <div style={{ textAlign: "center" }}>
        <p
          style={{
            fontFamily: "var(--font-display, Georgia, serif)",
            fontWeight: 900,
            fontSize: 32,
            letterSpacing: "-0.02em",
            color: "var(--ink)",
            margin: 0,
          }}
        >
          MEDIAPULSE
        </p>
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "var(--text-muted)",
            marginTop: 4,
          }}
        >
          Monitoring TV · Sénégal
        </p>
      </div>

      {/* Widget Clerk */}
      <SignIn />
    </div>
  );
}
