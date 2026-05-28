import { useState, useRef, useCallback, useEffect } from "react";
import { CELL_SIZE } from "../../constants";
import { exportAsPng } from "../../utils/exportUtils";
import ResizeGridModal from "../Modals/ResizeGridModal";

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED UI COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

export function BarBtn({ onClick, icon, label, shortcut, color, hoverBg, disabled, accent }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick} disabled={disabled} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      title={shortcut || ""}
      style={{
        display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 6,
        border: accent ? `2px solid ${color}` : `1px solid ${disabled ? "#1a2a3a" : "#2a3a5a"}`,
        background: hov && !disabled ? (hoverBg || "#2a3a4a") : (accent ? "#1a1a2e" : "transparent"),
        color: disabled ? "#3a4a5a" : color, cursor: disabled ? "default" : "pointer",
        fontSize: 16, fontWeight: 700, fontFamily: "inherit", opacity: disabled ? 0.5 : 1,
        transition: "background 0.12s, border-color 0.12s", whiteSpace: "nowrap"
      }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span>{label}</span>
      {shortcut && !disabled && (
        <span style={{ fontSize: 16, color: "#4a5a7a", fontWeight: 500, marginLeft: 2 }}>{shortcut}</span>
      )}
    </button>
  );
}

export function TBarDivider() {
  return <div style={{ width: 1, height: 22, background: "#1a3060", margin: "0 4px", flexShrink: 0 }} />;
}

function DropdownItem({ icon, label, shortcut, color, onAction, disabled }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={(e) => { e.stopPropagation(); if (!disabled) onAction(); }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      disabled={disabled}
      style={{
        display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 14px",
        background: hov && !disabled ? "#1a2a4a" : "transparent",
        border: "none", cursor: disabled ? "default" : "pointer",
        fontFamily: "inherit", fontSize: 16, fontWeight: 600,
        color: disabled ? "#3a4a5a" : (color || "#c0d0e8"),
        opacity: disabled ? 0.5 : 1, textAlign: "left",
        transition: "background 0.1s",
      }}
    >
      <span style={{ fontSize: 16, width: 18, textAlign: "center", flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {shortcut && (
        <span style={{ fontSize: 16, color: "#4a5a7a", fontWeight: 500, marginLeft: 8 }}>{shortcut}</span>
      )}
    </button>
  );
}

function DropdownMenu({ label, items, disabled }) {
  const [open, setOpen] = useState(false);
  const [hov, setHov] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={menuRef} style={{ position: "relative" }}>
      <button
        onClick={() => { if (!disabled) setOpen((p) => !p); }}
        onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
        style={{
          display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 6,
          border: open ? "1px solid #4a6a9a" : "1px solid transparent",
          background: open ? "#1a2a4a" : hov && !disabled ? "#1a2a3a" : "transparent",
          color: disabled ? "#3a4a5a" : "#b0c0e0", cursor: disabled ? "default" : "pointer",
          fontSize: 16, fontWeight: 700, fontFamily: "inherit", opacity: disabled ? 0.5 : 1,
          transition: "background 0.12s", whiteSpace: "nowrap",
        }}
      >
        <span>{label}</span>
        <span style={{ fontSize: 14, marginLeft: 2 }}>▼</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, minWidth: 200, zIndex: 200,
          background: "#111830", border: "1px solid #2a3a5a", borderRadius: 8,
          boxShadow: "0 8px 32px rgba(0,0,0,0.6)", padding: "4px 0",
          overflow: "hidden",
        }}>
          {items.map((item, i) => item.divider ? (
            <div key={`div-${i}`} style={{ height: 1, background: "#1a2a4a", margin: "4px 8px" }} />
          ) : (
            <DropdownItem key={item.label} {...item} onAction={() => { item.onClick(); setOpen(false); }} />
          ))}
        </div>
      )}
    </div>
  );
}

function HelpMenuButton({ onOpen }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onOpen}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 6,
        border: "1px solid transparent",
        background: hov ? "#1a2a3a" : "transparent",
        color: "#b0c0e0", cursor: "pointer",
        fontSize: 16, fontWeight: 700, fontFamily: "inherit",
        transition: "background 0.12s", whiteSpace: "nowrap",
      }}
    >
      <span>Help</span>
    </button>
  );
}

function FileNameDisplay({ fileName, setFileName }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(fileName);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  useEffect(() => {
    if (!editing) setDraft(fileName);
  }, [fileName, editing]);

  const commit = () => {
    const trimmed = draft.trim();
    setFileName(trimmed || "Untitled");
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { commit(); }
          if (e.key === "Escape") { setDraft(fileName); setEditing(false); }
          e.stopPropagation();
        }}
        style={{
          background: "#0a1020",
          border: "1px solid #3a6a9a",
          borderRadius: 6,
          color: "#e0e0ff",
          fontSize: 16,
          fontWeight: 600,
          fontFamily: "inherit",
          padding: "3px 10px",
          textAlign: "center",
          outline: "none",
          minWidth: 120,
          maxWidth: 300,
        }}
      />
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      title="Click to rename"
      style={{
        color: "#8090b0",
        fontSize: 16,
        fontWeight: 600,
        padding: "3px 10px",
        borderRadius: 6,
        cursor: "text",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        maxWidth: 300,
        transition: "color 0.12s, background 0.12s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = "#c0c8e0"; e.currentTarget.style.background = "#1a2a3a"; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = "#8090b0"; e.currentTarget.style.background = "transparent"; }}
    >
      {fileName}
    </div>
  );
}

// Renders item strings with **bold** and `code` markup
function HelpText({ text }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**"))
          return <strong key={i} style={{ color: "#d0d8f0", fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
        if (part.startsWith("`") && part.endsWith("`"))
          return <code key={i} style={{ background: "#0e1828", color: "#80d0ff", borderRadius: 3, padding: "1px 5px", fontSize: 11, fontFamily: "monospace" }}>{part.slice(1, -1)}</code>;
        return part;
      })}
    </>
  );
}

const HELP_SECTIONS = [
  {
    title: "BASIC",
    cols: true,
    items: [
      "Click: select cells",
      "Drag: multi select",
      "Ctrl + Click/Drag: multi select",
      "Ctrl+Z / Ctrl+Y: undo / redo",
      "Ctrl+C / Ctrl+V: copy / paste",
      "Ctrl+S: save as JSON",
      "Scroll: zoom",
      "Middle mouse: pan",
      "Space+Drag: pan",
      "Del: delete selected symbols",
    ],
  },
  {
    title: "SIDE BAR",
    items: [
      "**DIR** — directory of symbols",
      "**EDIT** — upload your own symbols (must be `.svg`). Width is the number of grid cells the symbol occupies.",
    ],
  },
  {
    title: "PLACING SYMBOLS",
    items: [
      "Select cells then click symbol on side bar",
      "Number of selected cells ≥ symbol width",
    ],
  },
  {
    title: "FILE",
    items: [
      "**Import:** import JSON file that was saved before",
      "**Save:** save as JSON to be re-imported back to grid",
      "**Save as Image:** export grid as PNG",
    ],
  },
  {
    title: "EDIT",
    items: [
      "**Undo / Redo**",
      "**Copy:** copy selected cells",
      "**Paste:** paste on selected cell",
      "**Clear:** delete selected symbols",
      "**Deselect:** all cells deselected",
      "**Resize Grid:** resize grid to desired size",
    ],
  },
  {
    title: "INSERT",
    items: [
      "**Column Before/After:** insert columns relative to selection",
      "**Row Before/After:** insert rows relative to selection",
      "**Add Column:** 1 column added to the left of the grid",
      "**Add Row:** 1 row added to the top of the grid",
      "**Start/End Guide Line:** highlight horizontal/vertical grid lines",
      "**Undo Last Guide / Clear All Guides**",
    ],
  },
  {
    title: "MOVE",
    items: [
      "Select cells to move",
      "Click **MOVE** button on top right",
      "Drag selected cells to desired location",
      "Click **PLACE HERE** to commit",
    ],
  },
  {
    title: "BG",
    items: [
      "Upload an image as reference",
      "Resize/move image to align with the grid",
    ],
  },
  {
    title: "KNITTING MODE",
    items: [
      "Keeps track of which row you have knit till",
      "**Next Row:** slash through the next row",
      "**Previous Row:** undo the last slash",
    ],
  },
];

function HelpModal({ onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#16213e",
          border: "1px solid #3a6a9a",
          borderRadius: 12,
          padding: "24px 28px",
          maxWidth: 520,
          maxHeight: "80vh",
          overflowY: "auto",
          boxShadow: "0 0 40px rgba(80,128,224,0.2)",
        }}
      >
        <div
          style={{
            color: "#e94560",
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: 2,
            marginBottom: 16,
            textAlign: "center",
          }}
        >
          HELP
        </div>
        {HELP_SECTIONS.map((section) => (
          <div key={section.title} style={{ marginBottom: 14 }}>
            <div
              style={{
                color: "#5080e0",
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: 1,
                marginBottom: 4,
                textAlign: "center",
              }}
            >
              {section.title}
            </div>
            {section.cols ? (
              <div style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "1px 12px", paddingLeft: 8 }}>
                {section.items.map((item, i) => {
                  const colon = item.indexOf(":");
                  const key = colon !== -1 ? item.slice(0, colon) : item;
                  const val = colon !== -1 ? item.slice(colon + 1).trim() : "";
                  return [
                    <span key={`k${i}`} style={{ color: "#d0d8f0", fontSize: 12, fontWeight: 700, lineHeight: 1.8, whiteSpace: "nowrap", textAlign: "left" }}>{key}</span>,
                    <span key={`v${i}`} style={{ color: "#b0b0d0", fontSize: 12, lineHeight: 1.8, textAlign: "left" }}>{val}</span>,
                  ];
                })}
              </div>
            ) : (
              section.items.map((item, i) => (
                <div key={i} style={{ color: "#b0b0d0", fontSize: 12, lineHeight: 1.7, paddingLeft: 8, textAlign: "left" }}>
                  <HelpText text={item} />
                </div>
              ))
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOP BAR
// ═══════════════════════════════════════════════════════════════════════════════

export default function TopBar({ selected, setSelected, moveMode, enterMoveMode, commitMove, historyLen, undo, redo, clipboard, copySelected, paste, clearSelected, setShowConfirm, cells, symbols, bgImage, bgImageEditing, bgFileInputRef, handleBgImageUpload, bgImageFix, bgImageEdit, bgImageRemove, addColumn, addRow, insertColumnsBefore, insertColumnsAfter, insertRowBefore, insertRowAfter, removeSelectedColumns, removeSelectedRows, importGridmark, saveGridmark, saveError, resizeGrid, gridRows, gridCols, knittingMode, toggleKnittingMode, fileName, setFileName }) {
  const importFileRef = useRef(null);
  const hasContent = cells.size > 0;
  const allDisabled = bgImageEditing || knittingMode;
  const hasSel = selected.size > 0;
  const [showResizeModal, setShowResizeModal] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const handleImport = useCallback(async () => {
    if (window.showOpenFilePicker) {
      try {
        const [handle] = await window.showOpenFilePicker({
          types: [{ description: "Gridmark JSON", accept: { "application/json": [".json"] } }],
          multiple: false,
        });
        const file = await handle.getFile();
        const text = await file.text();
        importGridmark(text, handle);
      } catch (err) {
        if (err.name === "AbortError") return;
        alert("Failed to open file: " + err.message);
      }
    } else {
      importFileRef.current?.click();
    }
  }, [importGridmark]);

  const editItems = [
    { icon: "↩", label: "Undo", shortcut: "⌘Z", color: "#80c0ff", onClick: undo, disabled: allDisabled || historyLen.undo === 0 },
    { icon: "↪", label: "Redo", shortcut: "⌘Y", color: "#80c0ff", onClick: redo, disabled: allDisabled || historyLen.redo === 0 },
    { divider: true },
    { icon: "⎘", label: "Copy", shortcut: "⌘C", color: "#80d080", onClick: copySelected, disabled: allDisabled || !hasSel },
    { icon: "⎗", label: "Paste", shortcut: "⌘V", color: "#80d080", onClick: paste, disabled: allDisabled || !clipboard || !hasSel },
    { divider: true },
    { icon: "✕", label: "Clear", shortcut: "Del", color: "#c060f0", onClick: clearSelected, disabled: allDisabled || moveMode || !hasSel },
    { divider: true },
    { icon: "◻", label: "Deselect", color: "#60a0d0", onClick: () => setSelected(new Set()), disabled: allDisabled || !hasSel },
    { divider: true },
    { icon: "⤡", label: "Resize Grid", color: "#f0c060", onClick: () => setShowResizeModal(true), disabled: allDisabled },
  ];

  const insertItems = [
    { icon: "┃←", label: "Column Before", color: "#80c0ff", onClick: insertColumnsBefore, disabled: allDisabled || !hasSel },
    { icon: "┃→", label: "Column After", color: "#80c0ff", onClick: insertColumnsAfter, disabled: allDisabled || !hasSel },
    { icon: "━↑", label: "Row Before", color: "#80c0ff", onClick: insertRowBefore, disabled: allDisabled || !hasSel },
    { icon: "━↓", label: "Row After", color: "#80c0ff", onClick: insertRowAfter, disabled: allDisabled || !hasSel },
    { divider: true },
    { icon: "┃+", label: "Add Column", color: "#6090b0", onClick: addColumn, disabled: allDisabled },
    { icon: "━+", label: "Add Row", color: "#6090b0", onClick: addRow, disabled: allDisabled },
    { divider: true },
    { icon: "┃−", label: "Remove Column", color: "#e07070", onClick: removeSelectedColumns, disabled: allDisabled || !hasSel },
    { icon: "━−", label: "Remove Row", color: "#e07070", onClick: removeSelectedRows, disabled: allDisabled || !hasSel },
  ];

  const fileItems = [
    { icon: "⬆", label: "Import", color: "#d0a0ff", onClick: handleImport, disabled: allDisabled },
    { divider: true },
    { icon: "💾", label: "Save", shortcut: "⌘S", color: "#80d080", onClick: saveGridmark, disabled: allDisabled || !hasContent },
    { icon: "🖼", label: "Save as Image", color: "#f0c060", onClick: () => exportAsPng(cells, symbols, CELL_SIZE, fileName), disabled: allDisabled || !hasContent },
  ];

  return (
    <>
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "6px 12px",
        background: "rgba(16, 24, 48, 0.95)", backdropFilter: "blur(14px)",
        borderBottom: bgImageEditing ? "1px solid #f0a030" : "1px solid #1a3060",
        boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <DropdownMenu label="File" items={fileItems} disabled={allDisabled} />
          <DropdownMenu label="Edit" items={editItems} disabled={allDisabled} />
          <DropdownMenu label="Insert" items={insertItems} disabled={allDisabled} />
          <HelpMenuButton onOpen={() => setShowHelp(true)} />

          {hasSel && !allDisabled && (
            <>
              <TBarDivider />
              <div style={{ color: "#6080a0", fontSize: 16, fontWeight: 600, padding: "4px 8px", background: "#0a1020", borderRadius: 6, border: "1px solid #1a3050", whiteSpace: "nowrap" }}>
                {selected.size} sel{clipboard ? <span style={{ color: "#3a8a3a" }}> · clip</span> : null}
              </div>
            </>
          )}
        </div>

        <FileNameDisplay fileName={fileName} setFileName={setFileName} />

        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {bgImageEditing && bgImage && (
            <>
              <div style={{ color: "#f0a030", fontSize: 16, fontWeight: 700, padding: "4px 8px", background: "#2a1a00", borderRadius: 6, border: "1px solid #f0a030", whiteSpace: "nowrap" }}>
                BG IMAGE — Drag to move · Corner to resize
              </div>
              <BarBtn onClick={bgImageFix} icon="✓" label="FIX" color="#80ff80" hoverBg="#1a4a1a" accent />
              <BarBtn onClick={bgImageRemove} icon="✕" label="REMOVE" color="#e94560" hoverBg="#3a1a1a" />
              <TBarDivider />
            </>
          )}
          {!bgImageEditing && bgImage && (
            <>
              <BarBtn onClick={bgImageEdit} icon="✎" label="BG IMG" color="#f0a030" hoverBg="#2a1a00" />
              <BarBtn onClick={bgImageRemove} icon="✕" label="RM BG" color="#e94560" hoverBg="#3a1a1a" />
              <TBarDivider />
            </>
          )}

          <BarBtn onClick={moveMode ? commitMove : enterMoveMode} icon="⤢" label={moveMode ? "PLACE HERE" : "MOVE"} color="#60d090" hoverBg="#1a3a2a" disabled={allDisabled || (!moveMode && !hasSel)} />
          <TBarDivider />
          <input type="file" accept=".json" ref={importFileRef} style={{ display: "none" }} onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => { importGridmark(ev.target.result, null); };
            reader.readAsText(file);
            e.target.value = "";
          }} />
          <input type="file" accept="image/*" ref={bgFileInputRef} style={{ display: "none" }} onChange={handleBgImageUpload} />
          <BarBtn onClick={() => bgFileInputRef.current?.click()} icon="🖼" label="BG" color="#a0c0f0" hoverBg="#1a2a3a" disabled={allDisabled || knittingMode} />
          <TBarDivider />
          <BarBtn onClick={toggleKnittingMode} icon="🧶" label={knittingMode ? "EXIT KNITTING" : "Knitting Mode"} color={knittingMode ? "#ff80a0" : "#f0a0d0"} hoverBg={knittingMode ? "#3a1a2a" : "#2a1a2a"} accent={knittingMode} />
          <TBarDivider />
          <BarBtn onClick={() => setShowConfirm(true)} icon="↺" label="RESTART" color="#e94560" hoverBg="#3a1a1a" disabled={allDisabled || knittingMode} />
        </div>
      </div>
      {saveError && (
        <div style={{
          position: "fixed", top: 48, left: "50%", transform: "translateX(-50%)", zIndex: 200,
          background: "#3a1a1a", border: "1px solid #e94560", borderRadius: 8,
          padding: "10px 20px", color: "#ff8080", fontSize: 16, fontWeight: 700,
          boxShadow: "0 4px 24px rgba(233,69,96,0.4)", whiteSpace: "nowrap",
          fontFamily: "'JetBrains Mono', 'Courier New', monospace",
        }}>
          ⚠ {saveError}
        </div>
      )}
      {showResizeModal && (
        <ResizeGridModal
          gridRows={gridRows}
          gridCols={gridCols}
          onCancel={() => setShowResizeModal(false)}
          onResize={(r, c) => { resizeGrid(r, c); setShowResizeModal(false); }}
        />
      )}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </>
  );
}