export default function AddSymbolForm({
  newSymSvg,
  newSymName,
  setNewSymName,
  newSymWidth,
  setNewSymWidth,
  addError,
  fileInputRef,
  handleSvgFileChange,
  addSymbol,
}) {
  return (
    <div style={{ padding: "8px", borderBottom: "1px solid #0f3460", background: "#101828", flexShrink: 0 }}>
      <div style={{ color: "#7070b0", fontSize: 9, letterSpacing: 1, marginBottom: 6, textTransform: "uppercase" }}>
        Upload SVG
      </div>

      <div
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${newSymSvg ? "#40d040" : "#1a4080"}`,
          borderRadius: 6,
          padding: "10px 6px",
          textAlign: "center",
          cursor: "pointer",
          marginBottom: 6,
          background: newSymSvg ? "rgba(64,208,64,0.06)" : "transparent",
          transition: "all 0.15s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = newSymSvg ? "#60f060" : "#3a70c0")}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = newSymSvg ? "#40d040" : "#1a4080")}
      >
        {newSymSvg ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div dangerouslySetInnerHTML={{ __html: newSymSvg.content }} style={{ width: 36, height: 36 }} />
            <div style={{ color: "#40d040", fontSize: 9 }}>{newSymSvg.name}</div>
          </div>
        ) : (
          <div style={{ color: "#4a6a9a", fontSize: 10 }}>
            <div style={{ fontSize: 18, marginBottom: 3 }}>↑</div>
            Click to upload .svg
          </div>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".svg,image/svg+xml"
        style={{ display: "none" }}
        onChange={handleSvgFileChange}
      />

      <input
        value={newSymName}
        onChange={(e) => setNewSymName(e.target.value)}
        placeholder="Symbol name"
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "5px 8px",
          marginBottom: 5,
          background: "#0f1e30",
          border: "1px solid #1a4080",
          borderRadius: 5,
          color: "#e0e0ff",
          fontSize: 11,
          fontFamily: "inherit",
          outline: "none",
        }}
      />

      <div style={{ display: "flex", gap: 5, marginBottom: 5, alignItems: "center" }}>
        <label style={{ color: "#7070b0", fontSize: 10, whiteSpace: "nowrap" }}>Width:</label>
        <input
          type="number"
          min={1}
          max={20}
          value={newSymWidth}
          onChange={(e) => setNewSymWidth(e.target.value)}
          style={{
            flex: 1,
            padding: "5px 6px",
            background: "#0f1e30",
            border: "1px solid #1a4080",
            borderRadius: 5,
            color: "#e0e0ff",
            fontSize: 11,
            fontFamily: "inherit",
            outline: "none",
          }}
        />
      </div>

      <button
        onClick={addSymbol}
        style={{
          width: "100%",
          padding: "7px",
          background: "#1a3a2a",
          border: "1px solid #3a7a5a",
          borderRadius: 6,
          color: "#60d090",
          cursor: "pointer",
          fontSize: 11,
          fontWeight: 700,
          fontFamily: "inherit",
          transition: "background 0.12s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "#2a5a3a")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "#1a3a2a")}
      >
        + Add Symbol
      </button>
      {addError && (
        <div style={{ color: "#e94560", fontSize: 10, marginTop: 4 }}>{addError}</div>
      )}
    </div>
  );
}