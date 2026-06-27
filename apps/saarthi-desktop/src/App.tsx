import { useState } from "react";

function App() {
  const [started, setStarted] = useState(false);

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background: "#0f172a",
        color: "white",
        fontFamily: "Segoe UI",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: "48px", marginBottom: "20px" }}>
          SAARTHI
        </h1>

        <h2>Welcome Ketan 👋</h2>

        {!started ? (
          <>
            <p>ARHAM ONE Platform Initialized</p>

            <br />

            <button
              onClick={() => setStarted(true)}
              style={{
                padding: "12px 30px",
                borderRadius: "10px",
                border: "none",
                background: "#2563eb",
                color: "white",
                cursor: "pointer",
                fontSize: "16px",
              }}
            >
              Start
            </button>
          </>
        ) : (
          <>
            <h2 style={{ color: "#22c55e" }}>
              ✅ SAARTHI Started Successfully
            </h2>

            <p>Mission Engine Loading...</p>
            <p>Memory Engine Loading...</p>
            <p>AI Core Initializing...</p>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
