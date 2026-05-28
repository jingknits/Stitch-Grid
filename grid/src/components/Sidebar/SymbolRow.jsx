import { svgToDataUrl } from "../../utils/svgUtils";

export default function SymbolRow({
  sym,
  isEditMode,
  isEditing,
  editSymName,
  setEditSymName,
  editSymWidth,
  setEditSymWidth,
  startEditSymbol,
  saveEditSymbol,
  cancelEditSymbol,
  deleteSymbol,
  placeSymbol,
  moveMode,
}) {
  const previewDataUrl = sym.svgContent ? svgToDataUrl(sym.svgContent) : null;

  if (!isEditMode) {
    return (
      <button
        onClick={() => placeSymbol(sym)}
        disabled={moveMode}
        style={{
          display: "block",
          width: "100%",
          padding: 0,
          marginBottom: 3,
          background: "#0f3460",
          border: "1px solid #1a4080",
          borderRadius: 6,
          cursor: moveMode ? "default" : "pointer",
          opacity: moveMode ? 0.4 : 1,
          textAlign: "left",
          overflowX: "auto",
        }}
        onMouseEnter={(e) => {
          if (!moveMode) {
            e.currentTarget.style.background = "#1a4480";
            e.currentTarget.style.borderColor = "#e94560";
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "#0f3460";
          e.currentTarget.style.borderColor = "#1a4080";
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 8,
            padding: "6px 8px",
          }}
        >
          {previewDataUrl && (
            <div
              style={{
                width: 36 * (sym.width || 1),
                height: 36,
                background: "#fff",
                borderRadius: 3,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                padding: 2,
                boxSizing: "border-box",
              }}
            >
              <img src={previewDataUrl} style={{ width: "100%", height: "100%", objectFit: "contain" }} alt="" />
            </div>
          )}
          <div
            style={{
              flexShrink: 0,
              color: "#e0e0ff",
              fontSize: 16,
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            {sym.name}
          </div>
          <div
            style={{
              flexShrink: 0,
              color: "#5a7aaa",
              fontSize: 14,
              fontWeight: 700,
              background: "#0a1a30",
              borderRadius: 4,
              padding: "2px 6px",
              minWidth: 20,
              textAlign: "center",
            }}
          >
            {sym.width}
          </div>
        </div>
      </button>
    );
  }

  // Edit mode — currently editing this symbol
  if (isEditing) {
    return (
      <div style={{ padding: "6px 8px", background: "#0a1420", border: "1px solid #5080e0", borderRadius: 6, marginBottom: 3, overflowX: "auto" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginBottom: 5 }}>
          {previewDataUrl && (
            <div
              style={{
                width: 33 * (sym.width || 1),
                height: 33,
                background: "#fff",
                borderRadius: 3,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                padding: 1,
                boxSizing: "border-box",
              }}
            >
              <img src={previewDataUrl} style={{ width: "100%", height: "100%", objectFit: "contain" }} alt="" />
            </div>
          )}
          <input
            value={editSymName}
            onChange={(e) => setEditSymName(e.target.value)}
            placeholder="Name"
            style={{
              flex: 1,
              minWidth: 80,
              padding: "4px 6px",
              background: "#0f1e30",
              border: "1px solid #3a6a9a",
              borderRadius: 4,
              color: "#e0e0ff",
              fontSize: 14,
              fontFamily: "inherit",
              outline: "none",
            }}
          />
        </div>
        <div style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 5 }}>
          <label style={{ color: "#7070b0", fontSize: 12, whiteSpace: "nowrap" }}>Width:</label>
          <input
            type="number"
            min={1}
            max={20}
            value={editSymWidth}
            onChange={(e) => setEditSymWidth(e.target.value)}
            style={{
              width: 50,
              padding: "3px 5px",
              background: "#0f1e30",
              border: "1px solid #3a6a9a",
              borderRadius: 4,
              color: "#e0e0ff",
              fontSize: 14,
              fontFamily: "inherit",
              outline: "none",
            }}
          />
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            onClick={saveEditSymbol}
            style={{
              flex: 1,
              padding: "4px",
              background: "#1a3a2a",
              border: "1px solid #3a7a5a",
              borderRadius: 4,
              color: "#60d090",
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            SAVE
          </button>
          <button
            onClick={cancelEditSymbol}
            style={{
              flex: 1,
              padding: "4px",
              background: "#1a2a3a",
              border: "1px solid #3a5a7a",
              borderRadius: 4,
              color: "#80a0c0",
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            CANCEL
          </button>
        </div>
      </div>
    );
  }

  // Edit mode — not editing this symbol (shows edit/delete buttons)
  return (
    <div
      style={{
        marginBottom: 3,
        background: "#0f1828",
        border: "1px solid #1a3050",
        borderRadius: 6,
        overflowX: "auto",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          padding: "6px 8px",
          gap: 6,
        }}
      >
        {previewDataUrl && (
          <div
            style={{
              width: 33 * (sym.width || 1),
              height: 33,
              background: "#fff",
              borderRadius: 3,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              padding: 1,
              boxSizing: "border-box",
            }}
          >
            <img src={previewDataUrl} style={{ width: "100%", height: "100%", objectFit: "contain" }} alt="" />
          </div>
        )}
        <div
          style={{
            flexShrink: 0,
            color: "#e0e0ff",
            fontSize: 16,
            fontWeight: 600,
            whiteSpace: "nowrap",
          }}
        >
          {sym.name}
        </div>
        <div
          style={{
            flexShrink: 0,
            color: "#5a7aaa",
            fontSize: 14,
            fontWeight: 700,
            background: "#0a1a30",
            borderRadius: 4,
            padding: "2px 6px",
            minWidth: 20,
            textAlign: "center",
          }}
        >
          {sym.width}
        </div>
        <button
          onClick={() => startEditSymbol(sym)}
          style={{
            background: "#1a2a3a",
            border: "1px solid #3a6a9a",
            borderRadius: 4,
            color: "#60a0d0",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 700,
            padding: "2px 6px",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#2a3a4a")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#1a2a3a")}
        >
          ✎
        </button>
        <button
          onClick={() => deleteSymbol(sym.id)}
          style={{
            background: "#3a1a1a",
            border: "1px solid #7a3a3a",
            borderRadius: 4,
            color: "#e94560",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 700,
            padding: "2px 6px",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#5a2a2a")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#3a1a1a")}
        >
          ✕
        </button>
      </div>
    </div>
  );
}