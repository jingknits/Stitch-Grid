import { useState } from "react";
import DirectoryPanel from "./DirectoryPanel";
import AddSymbolForm from "./AddSymbolForm";
import SymbolRow from "./SymbolRow";

export default function Sidebar({
  // symbols
  symbols,
  showEditSymbols,
  setShowEditSymbols,
  newSymName,
  setNewSymName,
  newSymWidth,
  setNewSymWidth,
  newSymSvg,
  addError,
  fileInputRef,
  handleSvgFileChange,
  addSymbol,
  deleteSymbol,
  placeSymbol,
  // edit symbol
  editingSymbolId,
  editSymName,
  setEditSymName,
  editSymWidth,
  setEditSymWidth,
  startEditSymbol,
  saveEditSymbol,
  cancelEditSymbol,
  // directory
  showDirectory,
  setShowDirectory,
  svgTree,
  customDirectoryTree,
  dirFileInputRef,
  handleDirSvgUpload,
  addFromDirectory,
  removeFromDirectory,
  // selection context (needed for place-symbol)
  selected,
  setSelected,
  moveMode,
}) {
  const [sidebarWidth, setSidebarWidth] = useState(300);

  const handleResizeStart = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sidebarWidth;
    const onMove = (ev) => {
      const newW = Math.max(180, Math.min(500, startW + ev.clientX - startX));
      setSidebarWidth(newW);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div
      style={{
        width: sidebarWidth,
        flexShrink: 0,
        background: "#16213e",
        borderRight: "1px solid #0f3460",
        display: "flex",
        flexDirection: "column",
        zIndex: 10,
        boxShadow: "4px 0 20px rgba(0,0,0,0.5)",
        overflow: "hidden",
        position: "relative",
        paddingTop: 50,
      }}
    >

      {/* Resize handle */}
      <div
        onMouseDown={handleResizeStart}
        style={{
          position: "absolute", top: 0, right: 0, width: 5, height: "100%",
          cursor: "col-resize", zIndex: 20, background: "transparent",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(233,69,96,0.3)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      />

      {/* Symbols header with DIR / EDIT buttons */}
      <div
        style={{
          padding: "8px 12px 10px",
          color: "#7070b0",
          fontSize: 16,
          letterSpacing: 2,
          textTransform: "uppercase",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <span>Symbols</span>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            onClick={() => {
              setShowDirectory((v) => !v);
              if (showEditSymbols) setShowEditSymbols(false);
            }}
            style={{
              background: showDirectory ? "#5080e0" : "#0f3460",
              border: `1px solid ${showDirectory ? "#5080e0" : "#3a5a7a"}`,
              borderRadius: 4,
              color: showDirectory ? "#fff" : "#60a0d0",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 700,
              padding: "2px 6px",
            }}
          >
            {showDirectory ? "CLOSE" : "DIR"}
          </button>
          <button
            onClick={() => {
              setShowEditSymbols((v) => !v);
              if (showDirectory) setShowDirectory(false);
              cancelEditSymbol();
            }}
            style={{
              background: showEditSymbols ? "#e94560" : "#0f3460",
              border: `1px solid ${showEditSymbols ? "#e94560" : "#3a5a7a"}`,
              borderRadius: 4,
              color: showEditSymbols ? "#fff" : "#60a0d0",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 700,
              padding: "2px 6px",
            }}
          >
            {showEditSymbols ? "DONE" : "EDIT"}
          </button>
        </div>
      </div>

      {/* SVG Directory Panel */}
      {showDirectory && (
        <DirectoryPanel
          svgTree={svgTree}
          customDirectoryTree={customDirectoryTree}
          dirFileInputRef={dirFileInputRef}
          handleDirSvgUpload={handleDirSvgUpload}
          addFromDirectory={addFromDirectory}
          removeFromDirectory={removeFromDirectory}
          symbols={symbols}
        />
      )}

      {/* Add symbol form */}
      {showEditSymbols && (
        <AddSymbolForm
          newSymSvg={newSymSvg}
          newSymName={newSymName}
          setNewSymName={setNewSymName}
          newSymWidth={newSymWidth}
          setNewSymWidth={setNewSymWidth}
          addError={addError}
          fileInputRef={fileInputRef}
          handleSvgFileChange={handleSvgFileChange}
          addSymbol={addSymbol}
        />
      )}

      {/* Symbol list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 8px" }}>
        {symbols.length === 0 && !showDirectory && !showEditSymbols && (
          <div style={{ padding: "20px 8px", textAlign: "center" }}>
            <div style={{ color: "#3a4a6a", fontSize: 22, marginBottom: 8 }}>⬙</div>
            <div style={{ color: "#4a5a7a", fontSize: 16, lineHeight: 1.6 }}>
              No symbols loaded
            </div>
            <div style={{ color: "#3a4a6a", fontSize: 16, marginTop: 4, lineHeight: 1.5 }}>
              Open the <span style={{ color: "#5080e0", fontWeight: 700, cursor: "pointer" }} onClick={() => { setShowDirectory(true); if (showEditSymbols) setShowEditSymbols(false); }}>DIR</span> for stock svgs, or use <span style={{ color: "#e94560", fontWeight: 700, cursor: "pointer" }} onClick={() => { setShowEditSymbols(true); if (showDirectory) setShowDirectory(false); }}>EDIT</span> to add one directly
            </div>
          </div>
        )}
        {symbols.map((sym) => (
          <SymbolRow
            key={sym.id}
            sym={sym}
            isEditMode={showEditSymbols}
            isEditing={editingSymbolId === sym.id}
            editSymName={editSymName}
            setEditSymName={setEditSymName}
            editSymWidth={editSymWidth}
            setEditSymWidth={setEditSymWidth}
            startEditSymbol={startEditSymbol}
            saveEditSymbol={saveEditSymbol}
            cancelEditSymbol={cancelEditSymbol}
            deleteSymbol={deleteSymbol}
            placeSymbol={placeSymbol}
            moveMode={moveMode}
          />
        ))}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "6px 12px 8px",
          borderTop: "1px solid #0f3460",
          color: "#4a4a7a",
          fontSize: 12,
          lineHeight: 1.7,
          flexShrink: 0,
        }}
      >
        <div>Scroll: zoom | Space+Drag: pan</div>
        <div>Click: select | Ctrl+Click: multi</div>
      </div>
    </div>
  );
}