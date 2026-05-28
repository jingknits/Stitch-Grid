export default function ResetModal({ onCancel, onReset }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div style={{ background: "#16213e", border: "1px solid #e94560", borderRadius: 12, padding: 32, maxWidth: 320, textAlign: "center", boxShadow: "0 0 40px rgba(233,69,96,0.3)" }}>
        <div style={{ color: "#e94560", fontSize: 24, marginBottom: 8 }}>⚠</div>
        <div style={{ color: "#e0e0ff", fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Reset Grid?</div>
        <div style={{ color: "#7070b0", fontSize: 12, marginBottom: 24 }}>This will clear all symbols and selections.</div>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button onClick={onCancel} style={{ padding: "8px 20px", background: "#0f3460", border: "1px solid #1a4080", borderRadius: 6, color: "#e0e0ff", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>Cancel</button>
          <button onClick={onReset} style={{ padding: "8px 20px", background: "#e94560", border: "none", borderRadius: 6, color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>Reset</button>
        </div>
      </div>
    </div>
  );
}