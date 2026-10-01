import { useRef, useEffect, useState, useCallback } from "react";
import { cellKey, parseKey, resolveRoot } from "../utils/cellUtils";
import { svgToDataUrl } from "../utils/svgUtils";
import { NO_SYMBOL, ANY_SYMBOL } from "../hooks/useGridState";

// ═══════════════════════════════════════════════════════════════════════════
// FIND / REPLACE WINDOW
// Fixed (non-draggable) panel anchored top-right of the canvas, to the left
// of the Selection HUD. Contains a symbol selector, prev/next match arrows,
// and a close button.
// ═══════════════════════════════════════════════════════════════════════════

function FindReplaceWindow({ symbols, findSymbolId, setFindSymbol, findMatches, findMatchIndex, findNext, findPrev, onClose, replaceSymbolId, setReplaceSymbol, onReplace, onReplaceAll, replaceOpen, setReplaceOpen, findColor, setFindColor, replaceColor, setReplaceColor, replaceColorEnabled, setReplaceColorEnabled }) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [replaceDropdownOpen, setReplaceDropdownOpen] = useState(false);
  const ddRef = useRef(null);
  const replaceDdRef = useRef(null);

  // Color pickers fire onChange continuously while dragging inside the native
  // picker UI. Pushing every tick straight to findColor/replaceColor would
  // recompute findMatches (an O(cells) scan) on every frame, causing visible
  // stutter. So we keep an instant local "draft" for the swatch itself, and
  // debounce the expensive propagation up to the parent.
  const [findColorDraft, setFindColorDraft] = useState(findColor);
  const [replaceColorDraft, setReplaceColorDraft] = useState(replaceColor);
  const findColorTimer = useRef(null);
  const replaceColorTimer = useRef(null);

  useEffect(() => { setFindColorDraft(findColor); }, [findColor]);
  useEffect(() => { setReplaceColorDraft(replaceColor); }, [replaceColor]);

  const handleFindColorChange = useCallback((val) => {
    setFindColorDraft(val);
    if (findColorTimer.current) clearTimeout(findColorTimer.current);
    findColorTimer.current = setTimeout(() => setFindColor(val), 80);
  }, [setFindColor]);

  const flushFindColor = useCallback(() => {
    if (findColorTimer.current) { clearTimeout(findColorTimer.current); findColorTimer.current = null; }
    setFindColor(findColorDraft);
  }, [findColorDraft, setFindColor]);

  const handleReplaceColorChange = useCallback((val) => {
    setReplaceColorDraft(val);
    if (replaceColorTimer.current) clearTimeout(replaceColorTimer.current);
    replaceColorTimer.current = setTimeout(() => setReplaceColor(val), 80);
  }, [setReplaceColor]);

  const flushReplaceColor = useCallback(() => {
    if (replaceColorTimer.current) { clearTimeout(replaceColorTimer.current); replaceColorTimer.current = null; }
    setReplaceColor(replaceColorDraft);
  }, [replaceColorDraft, setReplaceColor]);

  useEffect(() => {
    return () => {
      if (findColorTimer.current) clearTimeout(findColorTimer.current);
      if (replaceColorTimer.current) clearTimeout(replaceColorTimer.current);
    };
  }, []);

  // Symbol chip sizing: render the icon proportional to its cell width
  // (same convention as the grid/sidebar), with the picked color as its own
  // small swatch background — the button itself stays the normal panel color.
  const SYMBOL_UNIT = 16;
  const symbolChipStyle = (symbol) => {
    const span = symbol ? Math.max(1, symbol.width || 1) : 1;
    return { width: SYMBOL_UNIT * span, height: SYMBOL_UNIT, flexShrink: 0 };
  };

  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e) => { if (ddRef.current && !ddRef.current.contains(e.target)) setDropdownOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  useEffect(() => {
    if (!replaceDropdownOpen) return;
    const handler = (e) => { if (replaceDdRef.current && !replaceDdRef.current.contains(e.target)) setReplaceDropdownOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [replaceDropdownOpen]);

  const activeSymbol = symbols.find((s) => s.id === findSymbolId) || null;
  const replaceSymbol = symbols.find((s) => s.id === replaceSymbolId) || null;
  const hasMatches = findMatches.length > 0;
  const matchPosition = hasMatches
    ? ((findMatchIndex % findMatches.length) + findMatches.length) % findMatches.length + 1
    : 0;

  const REPLACE_SVG = `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="%2380c0ff"><path fill-rule="evenodd" clip-rule="evenodd" d="M3.221 3.739l2.261 2.269L7.7 3.784l-.7-.7-1.012 1.007-.008-1.6a.523.523 0 0 1 .5-.526H8V1H6.48A1.482 1.482 0 0 0 5 2.489V4.1L3.927 3.033l-.706.706zm6.67 1.794h.01c.183.311.451.467.806.467.393 0 .706-.168.94-.503.236-.335.353-.78.353-1.333 0-.511-.1-.913-.301-1.207-.201-.295-.488-.442-.86-.442-.405 0-.718.194-.938.581h-.01V1H9v4.919h.89v-.386zm-.015-1.061v-.34c0-.248.058-.448.175-.601a.54.54 0 0 1 .445-.23.49.49 0 0 1 .436.233c.104.154.155.368.155.643 0 .33-.056.587-.169.768a.524.524 0 0 1-.47.27.495.495 0 0 1-.411-.211.853.853 0 0 1-.16-.532zM9 12.769c-.256.154-.625.231-1.108.231-.563 0-1.02-.178-1.369-.533-.349-.355-.523-.813-.523-1.374 0-.648.186-1.158.56-1.53.374-.376.875-.563 1.5-.563.433 0 .746.06.94.179v.998a1.26 1.26 0 0 0-.792-.276c-.325 0-.583.1-.774.298-.19.196-.283.468-.283.816 0 .338.09.603.272.797.182.191.431.287.749.287.282 0 .558-.092.828-.276v.946zM4 7L3 8v6l1 1h7l1-1V8l-1-1H4zm0 1h7v6H4V8z"/></svg>`;
  const REPLACE_ALL_SVG = `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="%2380c0ff"><path fill-rule="evenodd" clip-rule="evenodd" d="M11.6 2.677c.147-.31.356-.465.626-.465.248 0 .44.118.573.353.134.236.201.557.201.966 0 .443-.078.798-.235 1.067-.156.268-.365.402-.627.402-.237 0-.416-.125-.537-.374h-.008v.31H11V1h.593v1.677h.008zm-.016 1.1a.78.78 0 0 0 .107.426c.071.113.163.169.274.169.136 0 .24-.072.314-.216.075-.145.113-.35.113-.615 0-.22-.035-.39-.104-.514-.067-.124-.164-.187-.29-.187-.12 0-.219.062-.297.185a.886.886 0 0 0-.117.48v.272zM4.12 7.695L2 5.568l.662-.662 1.006 1v-1.51A1.39 1.39 0 0 1 5.055 3H7.4v.905H5.055a.49.49 0 0 0-.468.493l.007 1.5.949-.944.656.656-2.08 2.085zM9.356 4.93H10V3.22C10 2.408 9.685 2 9.056 2c-.135 0-.285.024-.45.073a1.444 1.444 0 0 0-.388.167v.665c.237-.203.487-.304.75-.304.261 0 .392.156.392.469l-.6.103c-.506.086-.76.406-.76.961 0 .263.061.473.183.631A.61.61 0 0 0 8.69 5c.29 0 .509-.16.657-.48h.009v.41zm.004-1.355v.193a.75.75 0 0 1-.12.436.368.368 0 0 1-.313.17.276.276 0 0 1-.22-.095.38.38 0 0 1-.08-.248c0-.222.11-.351.332-.389l.4-.067zM7 12.93h-.644v-.41h-.009c-.148.32-.367.48-.657.48a.61.61 0 0 1-.507-.235c-.122-.158-.183-.368-.183-.63 0-.556.254-.876.76-.962l.6-.103c0-.313-.13-.47-.392-.47-.263 0-.513.102-.75.305v-.665c.095-.063.224-.119.388-.167.165-.049.315-.073.45-.073.63 0 .944.407.944 1.22v1.71zm-.64-1.162v-.193l-.4.068c-.222.037-.333.166-.333.388 0 .1.027.183.08.248a.276.276 0 0 0 .22.095.368.368 0 0 0 .312-.17c.08-.116.12-.26.12-.436zM9.262 13c.321 0 .568-.058.738-.173v-.71a.9.9 0 0 1-.552.207.619.619 0 0 1-.5-.215c-.12-.145-.181-.345-.181-.598 0-.26.063-.464.189-.612a.644.644 0 0 1 .516-.223c.194 0 .37.069.528.207v-.749c-.129-.09-.338-.134-.626-.134-.417 0-.751.14-1.001.422-.249.28-.373.662-.373 1.148 0 .42.116.764.349 1.03.232.267.537.4.913.4zM2 9l1-1h9l1 1v5l-1 1H3l-1-1V9zm1 0v5h9V9H3zm3-2l1-1h7l1 1v5l-1 1V7H6z"/></svg>`;

  const replaceSvgUrl = `data:image/svg+xml,${encodeURIComponent(REPLACE_SVG.replace(/%23/g, '#'))}`;
  const replaceAllSvgUrl = `data:image/svg+xml,${encodeURIComponent(REPLACE_ALL_SVG.replace(/%23/g, '#'))}`;

  const navColor = hasMatches ? "#007ACC" : "#AAAAAA";
  const toggleColor = "#007ACC";
  const closeColor = "#C42B1C";

  const UP_SVG = (color) => `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="${color}"><path fill-rule="evenodd" clip-rule="evenodd" d="M13.854 7l-5-5h-.707l-5 5 .707.707L8 3.561V14h1V3.56l4.146 4.147.708-.707z"/></svg>`;
  const DOWN_SVG = (color) => `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="${color}"><path fill-rule="evenodd" clip-rule="evenodd" d="M3.147 9l5 5h.707l5-5-.707-.707L9 12.439V2H8v10.44L3.854 8.292 3.147 9z"/></svg>`;
  const CHEV_RIGHT_SVG = (color) => `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="${color}"><path fill-rule="evenodd" clip-rule="evenodd" d="M10.072 8.024L5.715 3.667l.618-.62L11 7.716v.618L6.333 13l-.618-.619 4.357-4.357z"/></svg>`;
  const CHEV_DOWN_SVG = (color) => `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="${color}"><path fill-rule="evenodd" clip-rule="evenodd" d="M7.976 10.072l4.357-4.357.62.618L8.284 11h-.618L3 6.333l.619-.618 4.357 4.357z"/></svg>`;
  const CROSS_SVG = (color) => `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="${color}"><path fill-rule="evenodd" clip-rule="evenodd" d="M7.116 8l-4.558 4.558.884.884L8 8.884l4.558 4.558.884-.884L8.884 8l4.558-4.558-.884-.884L8 7.116 3.442 2.558l-.884.884L7.116 8z"/></svg>`;

  const upSvgUrl = `data:image/svg+xml,${encodeURIComponent(UP_SVG(navColor))}`;
  const downSvgUrl = `data:image/svg+xml,${encodeURIComponent(DOWN_SVG(navColor))}`;
  const chevRightUrl = `data:image/svg+xml,${encodeURIComponent(CHEV_RIGHT_SVG(toggleColor))}`;
  const chevDownUrl = `data:image/svg+xml,${encodeURIComponent(CHEV_DOWN_SVG(toggleColor))}`;
  const crossUrl = `data:image/svg+xml,${encodeURIComponent(CROSS_SVG(closeColor))}`;

  return (
    <div
      style={{
        background: "#E7E8EC", border: "1px solid #007ACC", borderRadius: 8,
        padding: "8px 10px", boxShadow: "0 0 12px rgba(0,122,204,0.18)",
        zIndex: 32, minWidth: 420,
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div style={{ display: "flex", alignItems: "stretch", gap: 6 }}>
        {/* Replace toggle arrow — stretches to span both rows when the replace row is open */}
        <button
          onClick={() => setReplaceOpen((p) => !p)}
          title={replaceOpen ? "Hide replace" : "Show replace"}
          style={{
            width: 24, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
            padding: 0, borderRadius: 6, border: "1px solid #EEEEF2",
            background: replaceOpen ? "#C9DEF5" : "transparent",
            cursor: "pointer",
          }}
        >
          <img src={replaceOpen ? chevDownUrl : chevRightUrl} alt={replaceOpen ? "Hide replace" : "Show replace"} style={{ width: 14, height: 14 }} />
        </button>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 0 }}>
      {/* Find row */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {/* Find symbol selection menu */}
        <div ref={ddRef} style={{ position: "relative", width: 170, flexShrink: 0 }}>
          <button
            onClick={() => setDropdownOpen((p) => !p)}
            style={{
              display: "flex", alignItems: "center", gap: 6, width: "100%",
              padding: "5px 8px", borderRadius: 6, border: "1px solid #EEEEF2",
              background: "#E7E8EC", color: "#4B4B4B", cursor: "pointer",
              fontFamily: "inherit", fontSize: 13,
            }}
          >
            {activeSymbol ? (
              <>
                <span style={{
                  ...symbolChipStyle(activeSymbol),
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "#ffffff", borderRadius: 4,
                }}>
                  <img src={svgToDataUrl(activeSymbol.svgContent)} alt="" style={{ width: "100%", height: "100%" }} />
                </span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, textAlign: "left" }}>{activeSymbol.name}</span>
              </>
            ) : findSymbolId === NO_SYMBOL ? (
              <span style={{ flex: 1, textAlign: "left" }}>No Symbol</span>
            ) : findSymbolId === ANY_SYMBOL ? (
              <span style={{ flex: 1, textAlign: "left" }}>Any Symbol</span>
            ) : (
              <span style={{ color: "#8A8A8A", flex: 1, textAlign: "left" }}>Select symbol</span>
            )}
            <span style={{ fontSize: 11, color: "#8A8A8A", flexShrink: 0 }}>▼</span>
          </button>
          {dropdownOpen && (
            <div style={{
              position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, maxHeight: 220,
              overflowY: "auto", background: "#E7E8EC", border: "1px solid #EEEEF2", borderRadius: 8,
              boxShadow: "0 8px 32px rgba(0,0,0,0.6)", zIndex: 40, padding: "4px 0",
            }}>
              {symbols.length === 0 && (
                <div style={{ padding: "8px 12px", color: "#8A8A8A", fontSize: 12 }}>No symbols available</div>
              )}
              <button
                onClick={() => { setFindSymbol(ANY_SYMBOL); setDropdownOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%",
                  padding: "6px 12px", background: findSymbolId === ANY_SYMBOL ? "#C9DEF5" : "transparent",
                  border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, color: "#4B4B4B",
                  textAlign: "left",
                }}
                onMouseEnter={(e) => { if (findSymbolId !== ANY_SYMBOL) e.currentTarget.style.background = "#E7E8EC"; }}
                onMouseLeave={(e) => { if (findSymbolId !== ANY_SYMBOL) e.currentTarget.style.background = "transparent"; }}
              >
                <span>Any Symbol</span>
              </button>
              <button
                onClick={() => { setFindSymbol(NO_SYMBOL); setDropdownOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%",
                  padding: "6px 12px", background: findSymbolId === NO_SYMBOL ? "#C9DEF5" : "transparent",
                  border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, color: "#4B4B4B",
                  textAlign: "left",
                }}
                onMouseEnter={(e) => { if (findSymbolId !== NO_SYMBOL) e.currentTarget.style.background = "#E7E8EC"; }}
                onMouseLeave={(e) => { if (findSymbolId !== NO_SYMBOL) e.currentTarget.style.background = "transparent"; }}
              >
                <span>No Symbol</span>
              </button>
              {symbols.map((s) => (
                <button
                  key={s.id}
                  onClick={() => { setFindSymbol(s.id); setDropdownOpen(false); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, width: "100%",
                    padding: "6px 12px", background: s.id === findSymbolId ? "#C9DEF5" : "transparent",
                    border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, color: "#4B4B4B",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => { if (s.id !== findSymbolId) e.currentTarget.style.background = "#E7E8EC"; }}
                  onMouseLeave={(e) => { if (s.id !== findSymbolId) e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{
                    ...symbolChipStyle(s),
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: "#ffffff", borderRadius: 4,
                  }}>
                    <img src={svgToDataUrl(s.svgContent)} alt="" style={{ width: "100%", height: "100%" }} />
                  </span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Find color filter — disabled/dimmed unless the checkbox below is on */}
        <input
          type="color"
          value={findColorDraft || "#ffffff"}
          onChange={(e) => handleFindColorChange(e.target.value)}
          onBlur={flushFindColor}
          disabled={!findColorDraft}
          title={findColorDraft ? "Filter by color" : "Enable the checkbox to filter by color"}
          style={{
            width: 24, height: 24, flexShrink: 0, padding: 0,
            border: findColorDraft ? "2px solid #007ACC" : "1px solid #EEEEF2",
            borderRadius: "50%", background: "#FFFFFF",
            cursor: findColorDraft ? "pointer" : "not-allowed",
            opacity: findColorDraft ? 1 : 0.4,
            WebkitAppearance: "none", appearance: "none", overflow: "hidden",
          }}
        />

        {/* Find color toggle — checked filters matches by the swatch color,
            unchecked matches any color (equivalent to the old "Any Color"
            control), mirroring the Replace row's swatch+checkbox layout. */}
        <input
          type="checkbox"
          checked={!!findColorDraft}
          onChange={(e) => {
            if (e.target.checked) {
              const val = findColorDraft || "#ffffff";
              setFindColorDraft(val);
              setFindColor(val);
            } else {
              if (findColorTimer.current) clearTimeout(findColorTimer.current);
              setFindColorDraft(null);
              setFindColor(null);
            }
          }}
          title={findColorDraft ? "Color filter is active" : "Any Color (no filter)"}
          style={{ width: 13, height: 13, flexShrink: 0, cursor: "pointer", accentColor: "#007ACC" }}
        />

        {/* Match position indicator */}
        <span style={{
          fontSize: 12, color: hasMatches ? "#4B4B4B" : "#8A8A8A", flexShrink: 0,
          whiteSpace: "nowrap", minWidth: 36, textAlign: "center",
        }}>
          {matchPosition}/{findMatches.length}
        </span>

        {/* Prev match */}
        <button
          onClick={findPrev}
          disabled={!hasMatches}
          title="Previous match"
          style={{
            width: 24, height: 24, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
            padding: 0, borderRadius: 6, border: "1px solid #EEEEF2",
            background: "transparent",
            cursor: hasMatches ? "pointer" : "default",
          }}
        >
          <img src={upSvgUrl} alt="Previous match" style={{ width: 16, height: 16 }} />
        </button>

        {/* Next match */}
        <button
          onClick={findNext}
          disabled={!hasMatches}
          title="Next match"
          style={{
            width: 24, height: 24, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
            padding: 0, borderRadius: 6, border: "1px solid #EEEEF2",
            background: "transparent",
            cursor: hasMatches ? "pointer" : "default",
          }}
        >
          <img src={downSvgUrl} alt="Next match" style={{ width: 16, height: 16 }} />
        </button>

        {/* Close */}
        <button
          onClick={onClose}
          title="Close"
          style={{
            width: 24, height: 24, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
            border: "1px solid #EEEEF2", borderRadius: 6, background: "transparent",
            cursor: "pointer",
          }}
        >
          <img src={crossUrl} alt="Close" style={{ width: 14, height: 14 }} />
        </button>
      </div>

      {/* Replace row (toggled) */}
      {replaceOpen && (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* Replace symbol selection menu */}
          <div ref={replaceDdRef} style={{ position: "relative", width: 170, flexShrink: 0 }}>
            <button
              onClick={() => setReplaceDropdownOpen((p) => !p)}
              style={{
                display: "flex", alignItems: "center", gap: 6, width: "100%",
                padding: "5px 8px", borderRadius: 6, border: "1px solid #EEEEF2",
                background: "#E7E8EC", color: "#4B4B4B", cursor: "pointer",
                fontFamily: "inherit", fontSize: 13,
              }}
            >
              {replaceSymbol ? (
                <>
                  <span style={{
                    ...symbolChipStyle(replaceSymbol),
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: "#ffffff", borderRadius: 4,
                  }}>
                    <img src={svgToDataUrl(replaceSymbol.svgContent)} alt="" style={{ width: "100%", height: "100%" }} />
                  </span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, textAlign: "left" }}>{replaceSymbol.name}</span>
                </>
              ) : replaceSymbolId === NO_SYMBOL ? (
                <span style={{ flex: 1, textAlign: "left" }}>No Symbol</span>
              ) : (
                <span style={{ color: "#8A8A8A", flex: 1, textAlign: "left" }}>Select symbol</span>
              )}
              <span style={{ fontSize: 11, color: "#8A8A8A", flexShrink: 0 }}>▼</span>
            </button>
            {replaceDropdownOpen && (
              <div style={{
                position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, maxHeight: 220,
                overflowY: "auto", background: "#E7E8EC", border: "1px solid #EEEEF2", borderRadius: 8,
                boxShadow: "0 8px 32px rgba(0,0,0,0.6)", zIndex: 40, padding: "4px 0",
              }}>
                {symbols.length === 0 && (
                  <div style={{ padding: "8px 12px", color: "#8A8A8A", fontSize: 12 }}>No symbols available</div>
                )}
                <button
                  onClick={() => { setReplaceSymbol(NO_SYMBOL); setReplaceDropdownOpen(false); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, width: "100%",
                    padding: "6px 12px", background: replaceSymbolId === NO_SYMBOL ? "#C9DEF5" : "transparent",
                    border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, color: "#4B4B4B",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => { if (replaceSymbolId !== NO_SYMBOL) e.currentTarget.style.background = "#E7E8EC"; }}
                  onMouseLeave={(e) => { if (replaceSymbolId !== NO_SYMBOL) e.currentTarget.style.background = "transparent"; }}
                >
                  <span>No Symbol</span>
                </button>
                {symbols.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => { setReplaceSymbol(s.id); setReplaceDropdownOpen(false); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, width: "100%",
                      padding: "6px 12px", background: s.id === replaceSymbolId ? "#C9DEF5" : "transparent",
                      border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, color: "#4B4B4B",
                      textAlign: "left",
                    }}
                    onMouseEnter={(e) => { if (s.id !== replaceSymbolId) e.currentTarget.style.background = "#E7E8EC"; }}
                    onMouseLeave={(e) => { if (s.id !== replaceSymbolId) e.currentTarget.style.background = "transparent"; }}
                  >
                    <span style={{
                      ...symbolChipStyle(s),
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: "#ffffff", borderRadius: 4,
                    }}>
                      <img src={svgToDataUrl(s.svgContent)} alt="" style={{ width: "100%", height: "100%" }} />
                    </span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Replace color swatch — dimmed/disabled unless the toggle below is on */}
          <input
            type="color"
            value={replaceColorDraft || "#ffffff"}
            onChange={(e) => handleReplaceColorChange(e.target.value)}
            onBlur={flushReplaceColor}
            disabled={!replaceColorEnabled}
            title={replaceColorEnabled ? "Set replacement color" : "Enable the checkbox to apply a color"}
            style={{
              width: 24, height: 24, flexShrink: 0, padding: 0, border: "1px solid #EEEEF2",
              borderRadius: "50%", background: "#FFFFFF",
              cursor: replaceColorEnabled ? "pointer" : "not-allowed",
              opacity: replaceColorEnabled ? 1 : 0.4,
              WebkitAppearance: "none", appearance: "none", overflow: "hidden",
            }}
          />

          {/* Replace color toggle — checked applies the swatch color,
              unchecked explicitly strips color (combines with the symbol
              selector above to give all 4 combos: symbol/no-symbol crossed
              with color/no-color). */}
          <input
            type="checkbox"
            checked={replaceColorEnabled}
            onChange={(e) => setReplaceColorEnabled(e.target.checked)}
            title={replaceColorEnabled ? "Color will be applied" : "No color will be applied"}
            style={{ width: 13, height: 13, flexShrink: 0, cursor: "pointer", accentColor: "#007ACC" }}
          />

          {/* Replace single */}
          <button
            onClick={onReplace}
            disabled={!hasMatches || !replaceSymbolId}
            title="Replace"
            style={{
              width: 24, height: 24, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
              padding: 0, borderRadius: 6, border: "1px solid #EEEEF2",
              background: "transparent",
              cursor: hasMatches && replaceSymbolId ? "pointer" : "default",
              opacity: hasMatches && replaceSymbolId ? 1 : 0.4,
            }}
          >
            <img src={replaceSvgUrl} alt="Replace" style={{ width: 16, height: 16 }} />
          </button>

          {/* Replace all */}
          <button
            onClick={onReplaceAll}
            disabled={!hasMatches || !replaceSymbolId}
            title="Replace All"
            style={{
              width: 24, height: 24, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
              padding: 0, borderRadius: 6, border: "1px solid #EEEEF2",
              background: "transparent",
              cursor: hasMatches && replaceSymbolId ? "pointer" : "default",
              opacity: hasMatches && replaceSymbolId ? 1 : 0.4,
            }}
          >
            <img src={replaceAllSvgUrl} alt="Replace All" style={{ width: 16, height: 16 }} />
          </button>

          {/* Spacer matching the close button's slot above */}
          <div style={{ width: 24, height: 24, flexShrink: 0 }} />
        </div>
      )}
        </div>
      </div>
    </div>
  );
}

export default function GridCanvas({
  containerRef,
  spaceDown,
  movingSelection,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onWheel,
  offset,
  csW,
  csH,
  zoom,
  cells,
  symbols,
  selected,
  clipboard = null,
  dragRect,
  moveOffset,
  getViewport,
  selectionInfo,
  bgImage,
  bgImageEditing,
  bgImageStartDrag,
  bgImageFix,
  bgImageRemove,
  setBgImageOpacity,
  gridRows,
  gridCols,
  knittingMode,
  slashedRows,
  onNextRow,
  onPrevRow,
  onKnittingCellClick = null,
  fillMode = false,
  fillCell = null,
  onFillMouseUp = null,
  onContextMenu = null,
  findOpen = false,
  findSymbolId = null,
  setFindSymbol = null,
  findMatches = [],
  findMatchIndex = 0,
  findNext = null,
  findPrev = null,
  closeFind = null,
  replaceSymbolId = null,
  setReplaceSymbol = null,
  onReplace = null,
  onReplaceAll = null,
  replaceRowOpen = false,
  setReplaceRowOpen = null,
  findColor = null,
  setFindColor = null,
  replaceColor = null,
  setReplaceColor = null,
  replaceColorEnabled = false,
  setReplaceColorEnabled = null,
  findHighlight = null,
  rowShading = "none",
  guideLines = [],
  guideLineDraft = null,
  guideLineMode = false,
  selectedGuideLineId = null,
  selectGuideLine = null,
  startGuideLineCreate = null,
  startGuideLineMove = null,
  startGuideLineCapDrag = null,
  handlePointerGestureStart = null,
}) {
  const { r0, r1, c0, c1 } = getViewport();

  // Build symbol lookup map once per render (O(1) lookups instead of O(n) find per cell)
  const symMap = useRef(new Map());
  symMap.current.clear();
  for (const s of symbols) symMap.current.set(s.id, s);

  // Knitting cell click state.
  // knittingPartial: { r, c } | null
  //   r = internal row index of the frontier (the row currently being worked on)
  //   c = column of the last cell click (drives the partial-slash visual on the frontier row)
  //       c === 0 means the full row is shown slashed (set by Next/Prev navigation)
  // All rows with internal index > knittingPartial.r are fully slashed.
  // When null, nav defers to App's slashedRows / onNextRow / onPrevRow.
  const [knittingPartial, setKnittingPartial] = useState(null);

  // Round vs Flat knitting toggle.
  // "round": odd perimeter rows slash/fill from the right edge, even rows from the left edge.
  // "flat": no change to existing left-to-right slashing logic.
  const [roundMode, setRoundMode] = useState(true);

  // Returns true if the given internal row index should fill/slash right-to-left (round mode, even perimeter row).
  const isRightToLeftRow = useCallback((r) => {
    if (!roundMode) return false;
    const perimNum = gridRows - r;
    return perimNum % 2 === 0;
  }, [roundMode, gridRows]);

  // Effective slashed: all internal rows strictly below the frontier (index > frontier.r)
  // plus whatever App has already committed in slashedRows.
  const effectiveSlashed = new Set(slashedRows);
  if (knittingPartial !== null) {
    for (let pr = knittingPartial.r + 1; pr < gridRows; pr++) effectiveSlashed.add(pr);
  }

  // completedCount = number of rows strictly below the frontier (perimeter rows 1..frontier-1)
  // = gridRows - knittingPartial.r - 1
  // When no partial is active, fall back to App's count.
  const completedCount = knittingPartial !== null
    ? gridRows - knittingPartial.r - 1
    : slashedRows.size;

  const handleKnittingClick = useCallback((e) => {
    if (!knittingMode) return false;
    if (e.button !== 0) return false;
    if (spaceDown.current) return false;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return false;
    const r = Math.floor((e.clientY - rect.top - offset.y) / csH);
    const c = Math.floor((e.clientX - rect.left - offset.x) / csW);
    if (r < 0 || r >= gridRows || c < 0 || c >= gridCols) return false;
    setKnittingPartial({ r, c });
    if (onKnittingCellClick) onKnittingCellClick(r, c);
    return true;
  }, [knittingMode, offset, csW, csH, gridRows, gridCols, onKnittingCellClick]);

  // Next Row: fully slash the frontier row and advance the frontier up one row (r - 1).
  // The frontier row goes from partial-slash to full-slash, and banner count goes up by 1.
  // "Done" column for a row depends on its fill direction:
  //   left-to-right (flat, or round even row): done == 0
  //   right-to-left (round odd row): done == gridCols - 1
  const handleNextRow = useCallback(() => {
    if (knittingPartial !== null) {
      const { r, c } = knittingPartial;
      const rtl = isRightToLeftRow(r);
      const doneC = rtl ? gridCols - 1 : 0;
      if (c !== doneC) {
        setKnittingPartial({ r: r, c: doneC });
      }
      else if (r > 0) {
        setKnittingPartial({ r: r - 1, c: isRightToLeftRow(r - 1) ? gridCols - 1 : 0 });
      } else {
        // Already at the topmost row -- slash it and clear
        setKnittingPartial(null);
        onNextRow();
      }
    } else {
      onNextRow();
    }
  }, [knittingPartial, onNextRow, isRightToLeftRow, gridCols]);

  // Prev Row:
  // - If a partial click is active (not at the row's "done" column): first press resets to
  //   the row's done column, keeping the frontier row the same so the banner count is unchanged.
  // - If frontier is already at its done column: move frontier down one row (r + 1), unslashing it.
  const handlePrevRow = useCallback(() => {
    if (knittingPartial !== null) {
      const { r, c } = knittingPartial;
      const rtl = isRightToLeftRow(r);
      const doneC = rtl ? gridCols - 1 : 0;
      if (c !== doneC) {
        // Clear partial column -- frontier stays on same row, banner count unchanged
        setKnittingPartial({ r: r + 1, c: isRightToLeftRow(r + 1) ? gridCols - 1 : 0 });
      } else if (r + 1 < gridRows) {
        setKnittingPartial({ r: r + 1, c: isRightToLeftRow(r + 1) ? gridCols - 1 : 0 });
      } else {
        // Frontier was at the very bottom row -- clear entirely
        setKnittingPartial(null);
      }
    } else {
      onPrevRow();
    }
  }, [knittingPartial, gridRows, onPrevRow]);

  // Fill mode — track whether the primary button is held for drag-to-fill
  const fillDragging = useRef(false);

  // Guide-line hit targets: the visible line is only 4px wide, which a
  // finger easily misses (and then starts a new line instead of moving the
  // existing one). On devices with any touch/coarse pointer, widen the
  // invisible hit band around each line body and end cap. (Guide lines
  // only take input in Guide Line mode, so this never blocks cell clicks
  // in Select/Fill/knitting mode.)
  const [coarsePointer] = useState(
    () => typeof window !== "undefined" && !!window.matchMedia?.("(any-pointer: coarse)").matches
  );
  const GL_HIT_WIDTH = coarsePointer ? 22 : 10;
  const GL_CAP_HIT = coarsePointer ? 14 : 7; // half-size of the cap's hit square

  // Long-press → context menu (touch has no right-click). Only armed for
  // touch pointers; cancelled if the finger moves past a small threshold
  // before the timer fires, so it doesn't fire mid-drag.
  const LONG_PRESS_MS = 500;
  const LONG_PRESS_MOVE_THRESHOLD = 10;
  const longPressTimer = useRef(null);
  const longPressStart = useRef(null);

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    longPressStart.current = null;
  }, []);

  const handleLongPressStart = useCallback((e) => {
    if (e.pointerType !== "touch") return;
    longPressStart.current = { x: e.clientX, y: e.clientY };
    clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      if (longPressStart.current) {
        onContextMenu?.(longPressStart.current.x, longPressStart.current.y);
      }
      longPressTimer.current = null;
    }, LONG_PRESS_MS);
  }, [onContextMenu]);

  const handleLongPressMove = useCallback((e) => {
    if (!longPressStart.current) return;
    const dx = e.clientX - longPressStart.current.x;
    const dy = e.clientY - longPressStart.current.y;
    if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_THRESHOLD) clearLongPress();
  }, [clearLongPress]);

  useEffect(() => () => clearTimeout(longPressTimer.current), []);

  const getCellAt = useCallback((e) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const r = Math.floor((e.clientY - rect.top - offset.y) / csH);
    const c = Math.floor((e.clientX - rect.left - offset.x) / csW);
    if (r < 0 || r >= gridRows || c < 0 || c >= gridCols) return null;
    return { r, c };
  }, [containerRef, offset, csW, csH, gridRows, gridCols]);

  const handleFillMouseDown = useCallback((e) => {
    if (!fillMode || !fillCell) return false;
    if (e.button !== 0) return false;
    if (spaceDown.current) return false;
    const pos = getCellAt(e);
    if (!pos) return false;
    fillDragging.current = true;
    fillCell(pos.r, pos.c);
    return true;
  }, [fillMode, fillCell, spaceDown, getCellAt]);

  const handleFillMouseMove = useCallback((e) => {
    if (!fillMode || !fillCell || !fillDragging.current) return false;
    if (!(e.buttons & 1)) { fillDragging.current = false; return false; }
    const pos = getCellAt(e);
    if (!pos) return false;
    fillCell(pos.r, pos.c);
    return true;
  }, [fillMode, fillCell, getCellAt]);

  const handleFillMouseUp = useCallback(() => {
    fillDragging.current = false;
    onFillMouseUp?.();
  }, [onFillMouseUp]);
  let dragHighlight = null;
  let dragSelKeys = null;
  if (dragRect && !movingSelection) {
    const sr0 = Math.min(dragRect.start.r, dragRect.end.r);
    const sr1 = Math.max(dragRect.start.r, dragRect.end.r);
    const sc0 = Math.min(dragRect.start.c, dragRect.end.c);
    const sc1 = Math.max(dragRect.start.c, dragRect.end.c);
    dragHighlight = {
      left: sc0 * csW,
      top: sr0 * csH,
      width: (sc1 - sc0 + 1) * csW,
      height: (sr1 - sr0 + 1) * csH,
    };
    dragSelKeys = new Set();
    for (let dr = sr0; dr <= sr1; dr++)
      for (let dc = sc0; dc <= sc1; dc++)
        dragSelKeys.add(cellKey(dr, dc));
  }

  // Build visible cells — only cells in the viewport
  const occupiedCells = [];
  const rootCells = [];
  const selectedCells = [];
  let emptyPathD = "";


  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const key = cellKey(r, c);
      const cell = cells.get(key);
      const x = c * csW;
      const y = r * csH;

      if (cell) {
        occupiedCells.push({ r, c, key, cell, x, y });
        if (cell.spanWidth >= 1) {
          rootCells.push({ r, c, key, cell, x, y });
        }
      } else {
        emptyPathD += `M${x},${y}h${csW}M${x},${y}v${csH}`;
      }

      const isSel = selected.has(key) || (dragSelKeys !== null && dragSelKeys.has(key));
      if (isSel) {
        selectedCells.push({ r, c, key, x, y });
      }
    }
  }
  // Build occupiedPathD and occupiedMaskD from root cells only —
  // only interior vertical lines of multi-cell symbols
  let occupiedPathD = "";
  let occupiedMaskD = "";
  for (const { cell, x, y } of rootCells) {
    if (cell.spanWidth <= 1) continue; // width-1 symbols have no interior verticals
    // Interior vertical lines: from the 2nd to the (spanWidth-1)th cell boundary
    for (let i = 1; i < cell.spanWidth; i++) {
      const lx = x + i * csW;
      occupiedPathD += `M${lx},${y}v${csH}`;
      occupiedMaskD += `M${lx - 1},${y}h2v${csH}h-2Z`;
    }
  }
  const { dr: mdr, dc: mdc } = moveOffset;
  const selectedRootsForMove = new Set();
  if (movingSelection)
    for (const key of selected) {
      const rk = resolveRoot(cells, key);
      if (rk) selectedRootsForMove.add(rk);
    }

  const contentTransform = `translate3d(${offset.x}px, ${offset.y}px, 0)`;

  // Register wheel handler as non-passive so preventDefault() works
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onWheel, containerRef]);

  // Clear local knitting state when mode is toggled off
  useEffect(() => {
    if (!knittingMode) {
      setKnittingPartial(null);
    }
  }, [knittingMode]);

  // Knitting mode keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (!knittingMode) return;
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "Enter" || e.key === "ArrowUp") {
        e.preventDefault();
        handleNextRow();
      } else if (e.key === "Delete" || e.key === "Backspace" || e.key === "ArrowDown") {
        e.preventDefault();
        handlePrevRow();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [knittingMode, handleNextRow, handlePrevRow]);

  return (
    <div
      ref={containerRef}
      data-grid-canvas
      style={{
        flex: 1,
        position: "relative",
        overflow: "hidden",
        touchAction: "none",
        WebkitUserSelect: "none",
        userSelect: "none",
        cursor: guideLineMode ? "crosshair" : fillMode && !spaceDown.current ? "crosshair" : knittingMode ? (spaceDown.current ? "grab" : "crosshair") : bgImageEditing ? "grab" : movingSelection ? "grab" : spaceDown.current ? "grab" : "crosshair",
      }}
      onPointerDown={(e) => {
        if (guideLineMode) {
          // No long-press context menu here: a touch press that holds still
          // before dragging is the start of a new guide line, and the menu
          // popping up mid-gesture would interrupt it.
          // Let a second finger (pinch/pan) or a middle-click/space-pan
          // through to the normal panning logic instead of treating it as
          // a guide-line click.
          if (handlePointerGestureStart?.(e)) return;
          startGuideLineCreate?.(e);
          return;
        }
        handleLongPressStart(e);
        if (!handleFillMouseDown(e) && !handleKnittingClick(e)) onMouseDown(e);
      }}
      onPointerMove={(e) => {
        handleLongPressMove(e);
        if (!handleFillMouseMove(e)) onMouseMove(e);
      }}
      onPointerUp={(e) => {
        clearLongPress();
        handleFillMouseUp();
        onMouseUp(e);
      }}
      onPointerCancel={() => clearLongPress()}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e.clientX, e.clientY); }}
    >
      {/* Grid lines — bottom layer, clipped to grid bounds, masked to hide under symbols */}
      <svg
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 1 }}
      >
        <defs>
          <pattern id="smallGrid" width={csW} height={csH} patternUnits="userSpaceOnUse" x={offset.x} y={offset.y}>
            <path d={`M ${csW} 0 L 0 0 0 ${csH}`} fill="none" stroke="#C9DEF5" strokeWidth="1" />
          </pattern>
          {occupiedMaskD && (
            <mask id="gridMask">
              <rect x={offset.x} y={offset.y} width={gridCols * csW} height={gridRows * csH} fill="white" />
              <path d={occupiedMaskD} fill="black" transform={`translate(${offset.x},${offset.y})`} />
            </mask>
          )}
        </defs>
        {/* Alternate row shading — darkens rows whose perimeter row number
            (gridRows - r, same "bottom-right = 1, increasing upward"
            numbering used for the perimeter counts / export margins) is
            even. Drawn before the grid-line pattern rect so the thin grid
            lines still render on top of the shading. */}
        {rowShading === "alternate" && Array.from({ length: gridRows }, (_, r) => {
          const perimNum = gridRows - r;
          if (perimNum % 2 !== 0) return null;
          return (
            <rect
              key={`rowshade-${r}`}
              x={offset.x}
              y={offset.y + r * csH}
              width={gridCols * csW}
              height={csH}
              fill="rgba(0,0,0,0.22)"
            />
          );
        })}
        <rect
          x={offset.x} y={offset.y}
          width={gridCols * csW} height={gridRows * csH}
          fill="url(#smallGrid)"
          mask={occupiedMaskD ? "url(#gridMask)" : undefined}
        />
      </svg>

      {/* Background reference image */}
      {bgImage && (
        <img
          src={bgImage.src}
          alt=""
          draggable={false}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            transform: `translate(${offset.x + bgImage.col * csW}px, ${offset.y + bgImage.row * csH}px)`,
            width: bgImage.cellW * csW,
            height: bgImage.cellH * csH,
            opacity: bgImage.opacity ?? 0.5,
            pointerEvents: "none",
            zIndex: 1,
            objectFit: "fill",
            imageRendering: "auto",
            willChange: "transform",
          }}
        />
      )}

      {/* Background image editing handles */}
      {bgImage && bgImageEditing && (
        <div style={{ position: "absolute", inset: 0, zIndex: 50, pointerEvents: "none" }}>
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              transform: `translate(${offset.x + bgImage.col * csW}px, ${offset.y + bgImage.row * csH}px)`,
              width: bgImage.cellW * csW,
              height: bgImage.cellH * csH,
              border: "2px dashed #CA5010",
              borderRadius: 4,
              cursor: "move",
              pointerEvents: "auto",
              boxSizing: "border-box",
              willChange: "transform",
            }}
            onPointerDown={(e) => { e.stopPropagation(); bgImageStartDrag(e, "move"); }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Corner: bottom-right (proportional resize) */}
            <div
              style={{
                position: "absolute", right: -6, bottom: -6, width: 14, height: 14,
                background: "#CA5010", border: "2px solid #F5F5F5", borderRadius: 3,
                cursor: "nwse-resize", pointerEvents: "auto",
              }}
              onPointerDown={(e) => { e.stopPropagation(); bgImageStartDrag(e, "resize"); }}
              onMouseDown={(e) => e.stopPropagation()}
            />
            {/* Corner: top-left (proportional resize) */}
            <div
              style={{
                position: "absolute", left: -6, top: -6, width: 14, height: 14,
                background: "#CA5010", border: "2px solid #F5F5F5", borderRadius: 3,
                cursor: "nwse-resize", pointerEvents: "auto",
              }}
              onPointerDown={(e) => { e.stopPropagation(); bgImageStartDrag(e, "resize-tl"); }}
              onMouseDown={(e) => e.stopPropagation()}
            />
            {/* Edge: mid-right (stretch horizontal) */}
            <div
              style={{
                position: "absolute", right: -5, top: "50%", transform: "translateY(-50%)",
                width: 10, height: 22, background: "#CA5010", border: "2px solid #F5F5F5",
                borderRadius: 3, cursor: "ew-resize", pointerEvents: "auto",
              }}
              onPointerDown={(e) => { e.stopPropagation(); bgImageStartDrag(e, "stretch-right"); }}
              onMouseDown={(e) => e.stopPropagation()}
            />
            {/* Edge: mid-left (stretch horizontal) */}
            <div
              style={{
                position: "absolute", left: -5, top: "50%", transform: "translateY(-50%)",
                width: 10, height: 22, background: "#CA5010", border: "2px solid #F5F5F5",
                borderRadius: 3, cursor: "ew-resize", pointerEvents: "auto",
              }}
              onPointerDown={(e) => { e.stopPropagation(); bgImageStartDrag(e, "stretch-left"); }}
              onMouseDown={(e) => e.stopPropagation()}
            />
            {/* Edge: mid-bottom (stretch vertical) */}
            <div
              style={{
                position: "absolute", bottom: -5, left: "50%", transform: "translateX(-50%)",
                width: 22, height: 10, background: "#CA5010", border: "2px solid #F5F5F5",
                borderRadius: 3, cursor: "ns-resize", pointerEvents: "auto",
              }}
              onPointerDown={(e) => { e.stopPropagation(); bgImageStartDrag(e, "stretch-bottom"); }}
              onMouseDown={(e) => e.stopPropagation()}
            />
            {/* Edge: mid-top (stretch vertical) */}
            <div
              style={{
                position: "absolute", top: -5, left: "50%", transform: "translateX(-50%)",
                width: 22, height: 10, background: "#CA5010", border: "2px solid #F5F5F5",
                borderRadius: 3, cursor: "ns-resize", pointerEvents: "auto",
              }}
              onPointerDown={(e) => { e.stopPropagation(); bgImageStartDrag(e, "stretch-top"); }}
              onMouseDown={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}

      {/* Translated content layer */}
      <div style={{ position: "absolute", left: 0, top: 0, willChange: "transform", transform: contentTransform, zIndex: 5 }}>

        {/* White cell backgrounds */}
        <div style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", zIndex: 2 }}>
          {occupiedCells.map(({ key, cell, x, y }) => {
            const isSelRoot =
              movingSelection &&
              (selectedRootsForMove.has(key) || (cell.spanRoot && selectedRootsForMove.has(cell.spanRoot)));
            return (
              <div
                key={`bg-${key}`}
                style={{
                  position: "absolute",
                  left: x,
                  top: y,
                  width: csW,
                  height: csH,
                  background: cell.color || "#ffffff",
                  boxSizing: "border-box",
                  opacity: isSelRoot ? 0.2 : 1,
                }}
              />
            );
          })}
        </div>

        {/* Grid lines overlay */}
        <svg style={{ position: "absolute", left: 0, top: 0, width: gridCols * csW, height: gridRows * csH, pointerEvents: "none", zIndex: 3, overflow: "visible" }}>
          {emptyPathD && <path d={emptyPathD} fill="none" stroke="#C9DEF5" strokeWidth="1" />}
          {occupiedPathD && <path d={occupiedPathD} fill="none" stroke="#DDDDDD" strokeWidth="1" />}
        </svg>

        {/* Symbol images */}
        <div style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", zIndex: 4 }}>
          {rootCells.map(({ key, cell, x, y }) => {
            const isSelRoot = movingSelection && selectedRootsForMove.has(key);
            const w = cell.spanWidth * csW;
            const sym = symMap.current.get(cell.symbolId);
            return (
              <div
                key={key}
                style={{
                  position: "absolute",
                  left: x,
                  top: y,
                  width: w,
                  height: csH,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  boxSizing: "border-box",
                  opacity: isSelRoot ? 0.2 : 1,
                }}
              >
                {sym?.svgContent && (
                  <img
                    src={svgToDataUrl(sym.svgContent)}
                    style={{ width: w - 4, height: csH - 4, objectFit: "fill", display: "block" }}
                    alt=""
                    draggable={false}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Guide lines — thicker, distinctly colored lines snapped to grid
            lines. Rendered above symbols so they always read clearly.
            The parent <svg> is pointer-events:none so empty space in this
            layer never blocks clicks; each line/cap opts back in via its
            own pointerEvents style, matching the layering convention used
            elsewhere in this file. */}
        <svg style={{ position: "absolute", left: 0, top: 0, width: gridCols * csW, height: gridRows * csH, pointerEvents: "none", zIndex: 15, overflow: "visible" }}>
          {guideLines.map((gl) => {
            const g = (guideLineDraft && guideLineDraft.id === gl.id) ? guideLineDraft : gl;
            const isSelected = selectedGuideLineId === gl.id;
            const x1 = g.orientation === "h" ? g.start * csW : g.linePos * csW;
            const y1 = g.orientation === "h" ? g.linePos * csH : g.start * csH;
            const x2 = g.orientation === "h" ? g.end * csW : g.linePos * csW;
            const y2 = g.orientation === "h" ? g.linePos * csH : g.end * csH;
            const CAP = 5;
            return (
              <g key={gl.id}>
                {/* Visible line — purely visual; the hit band below handles input. */}
                <line
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke="#000000" strokeWidth={4} strokeLinecap="round"
                  style={{ pointerEvents: "none" }}
                />
                {/* Invisible, wider hit band for moving the line (mouse or
                    one-finger touch drag). Guide lines are only interactive
                    in Guide Line mode — in every other mode they're display
                    only, so clicks/touches pass straight through to cells. */}
                <line
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke="transparent" strokeWidth={GL_HIT_WIDTH} strokeLinecap="round"
                  style={{ pointerEvents: guideLineMode ? "stroke" : "none", cursor: "move" }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    selectGuideLine?.(gl.id);
                    startGuideLineMove?.(e, gl.id);
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                />
                {isSelected && guideLineMode && [["start", x1, y1], ["end", x2, y2]].map(([which, cx, cy]) => (
                  <g key={which}>
                    <rect
                      x={cx - CAP} y={cy - CAP} width={CAP * 2} height={CAP * 2}
                      fill="#8250DF" stroke="#FFFFFF" strokeWidth={1.5}
                      style={{ pointerEvents: "none" }}
                    />
                    {/* Invisible, larger hit square for the end cap. Drawn
                        after the body's hit band so caps win where they overlap. */}
                    <rect
                      x={cx - GL_CAP_HIT} y={cy - GL_CAP_HIT} width={GL_CAP_HIT * 2} height={GL_CAP_HIT * 2}
                      fill="transparent"
                      style={{ pointerEvents: "all", cursor: "crosshair" }}
                      onPointerDown={(e) => { e.stopPropagation(); startGuideLineCapDrag?.(e, gl.id, which); }}
                      onMouseDown={(e) => e.stopPropagation()}
                    />
                  </g>
                ))}
              </g>
            );
          })}
          {/* In-progress creation preview (dotted, not yet a real guide line) */}
          {guideLineDraft && guideLineDraft.id === null && (
            <line
              x1={guideLineDraft.orientation === "h" ? guideLineDraft.start * csW : guideLineDraft.linePos * csW}
              y1={guideLineDraft.orientation === "h" ? guideLineDraft.linePos * csH : guideLineDraft.start * csH}
              x2={guideLineDraft.orientation === "h" ? guideLineDraft.end * csW : guideLineDraft.linePos * csW}
              y2={guideLineDraft.orientation === "h" ? guideLineDraft.linePos * csH : guideLineDraft.end * csH}
              stroke="#8250DF" strokeWidth={4} strokeLinecap="round" strokeDasharray="0.5 8" opacity={0.9}
            />
          )}
        </svg>

        {/* Selection borders */}
        <div style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", zIndex: 20 }}>
          {movingSelection ? (
            selectedCells.map(({ key, x, y, r, c }) => {
              const hasTop = selected.has(cellKey(r - 1, c));
              const hasBottom = selected.has(cellKey(r + 1, c));
              const hasLeft = selected.has(cellKey(r, c - 1));
              const hasRight = selected.has(cellKey(r, c + 1));
              if (hasTop && hasBottom && hasLeft && hasRight) return null;
              return (
                <div
                  key={`sel-${key}`}
                  style={{
                    position: "absolute", left: x, top: y, width: csW, height: csH,
                    boxSizing: "border-box",
                    borderTop: hasTop ? "none" : "2px solid #107C10",
                    borderBottom: hasBottom ? "none" : "2px solid #107C10",
                    borderLeft: hasLeft ? "none" : "2px solid #107C10",
                    borderRight: hasRight ? "none" : "2px solid #107C10",
                    pointerEvents: "none",
                  }}
                />
              );
            })
          ) : (
            selectedCells.map(({ key, x, y }) => (
              <div
                key={`sel-${key}`}
                style={{
                  position: "absolute", left: x, top: y, width: csW, height: csH,
                  boxSizing: "border-box",
                  border: "2px solid #007ACC",
                  borderRadius: 3,
                  boxShadow: "0 0 6px rgba(0,122,204,0.5)",
                  pointerEvents: "none",
                }}
              />
            ))
          )}
        </div>

        {/* Find highlight — outlines the currently found symbol (whole span if wider than 1) */}
        {findHighlight && (
          <div
            style={{
              position: "absolute",
              left: findHighlight.c * csW,
              top: findHighlight.r * csH,
              width: findHighlight.spanWidth * csW,
              height: csH,
              boxSizing: "border-box",
              border: "2px solid #B58900",
              borderRadius: 3,
              boxShadow: "0 0 8px rgba(181,137,0,0.7)",
              pointerEvents: "none",
              zIndex: 21,
            }}
          />
        )}

        {/* Drag rect */}
        {dragHighlight && (
          <div
            style={{
              position: "absolute",
              left: dragHighlight.left, top: dragHighlight.top,
              width: dragHighlight.width, height: dragHighlight.height,
              background: "rgba(0,122,204,0.12)",
              border: "1px dashed #007ACC",
              pointerEvents: "none",
              borderRadius: 2,
              zIndex: 25,
            }}
          />
        )}

        {/* Knitting mode overlays */}
        {knittingMode && (
          <div style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", zIndex: 10 }}>
            {Array.from({ length: gridRows }, (_, r) => {
              const perimNum = gridRows - r;
              const isEven = perimNum % 2 === 0;
              const isSlashed = effectiveSlashed.has(r);
              const isPartialRow = knittingPartial !== null && r === knittingPartial.r;
              if (!isEven && !isSlashed && !isPartialRow) return null;
              const rtl = isPartialRow && isRightToLeftRow(r);
              return (
                <div
                  key={`knit-row-${r}`}
                  style={{
                    position: "absolute",
                    left: isPartialRow && !isSlashed ? (rtl ? 0 : knittingPartial.c * csW) : 0,
                    top: r * csH,
                    width: isPartialRow && !isSlashed
                      ? (rtl ? (knittingPartial.c + 1) * csW : (gridCols - knittingPartial.c) * csW)
                      : gridCols * csW,
                    height: csH,
                    background: (isPartialRow || isSlashed) ? "rgba(75, 75, 75, 0.55)" : "rgba(0, 0, 0, 0.15)",
                  }}
                />
              );

            })}
            <svg style={{ position: "absolute", left: 0, top: 0, width: gridCols * csW, height: gridRows * csH, overflow: "visible" }}>
              {Array.from(effectiveSlashed).map((r) => (
                <line
                  key={`slash-${r}`}
                  x1={0} y1={r * csH + csH / 2}
                  x2={gridCols * csW} y2={r * csH + csH / 2}
                  stroke="#C42B1C"
                  strokeWidth={3}
                  opacity={0.8}
                />
              ))}
              {knittingPartial !== null && !effectiveSlashed.has(knittingPartial.r) && (
                <line
                  x1={isRightToLeftRow(knittingPartial.r) ? 0 : knittingPartial.c * csW}
                  y1={knittingPartial.r * csH + csH / 2}
                  x2={isRightToLeftRow(knittingPartial.r) ? (knittingPartial.c + 1) * csW : gridCols * csW} y2={knittingPartial.r * csH + csH / 2}
                  stroke="#C42B1C"
                  strokeWidth={3}
                  opacity={0.8}
                />
              )}
            </svg>
          </div>
        )}

        {/* Row & Column counts along perimeter */}
        <div style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", zIndex: 6 }}>
          {Array.from({ length: gridCols }, (_, c) => {
            const num = gridCols - c;
            const x = c * csW;
            return (
              <div key={`col-top-${c}`} style={{ position: "absolute", left: x, top: -18, width: csW, height: 16, display: "flex", alignItems: "center", justifyContent: "center", color: "#4B4B4B", fontSize: Math.min(12, Math.min(csW, csH) * 0.5), fontFamily: "Arial, sans-serif", userSelect: "none" }}>
                {num}
              </div>
            );
          })}
          {Array.from({ length: gridCols }, (_, c) => {
            const num = gridCols - c;
            const x = c * csW;
            return (
              <div key={`col-bot-${c}`} style={{ position: "absolute", left: x, top: gridRows * csH + 2, width: csW, height: 16, display: "flex", alignItems: "center", justifyContent: "center", color: "#4B4B4B", fontSize: Math.min(12, Math.min(csW, csH) * 0.5), fontFamily: "Arial, sans-serif", userSelect: "none" }}>
                {num}
              </div>
            );
          })}
          {Array.from({ length: gridRows }, (_, r) => {
            const num = gridRows - r;
            const y = r * csH;
            return (
              <div key={`row-left-${r}`} style={{ position: "absolute", left: -28, top: y, width: 24, height: csH, display: "flex", alignItems: "center", justifyContent: "flex-end", color: "#4B4B4B", fontSize: Math.min(12, Math.min(csW, csH) * 0.5), fontFamily: "Arial, sans-serif", userSelect: "none" }}>
                {num}
              </div>
            );
          })}
          {Array.from({ length: gridRows }, (_, r) => {
            const num = gridRows - r;
            const y = r * csH;
            return (
              <div key={`row-right-${r}`} style={{ position: "absolute", left: gridCols * csW + 4, top: y, width: 24, height: csH, display: "flex", alignItems: "center", justifyContent: "flex-start", color: "#4B4B4B", fontSize: Math.min(12, Math.min(csW, csH) * 0.5), fontFamily: "Arial, sans-serif", userSelect: "none" }}>
                {num}
              </div>
            );
          })}
        </div>

      </div>{/* end translated content layer */}

      {/* Move ghosts */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 12 }}>
        {movingSelection &&
          (() => {
            const destKeys = new Set();
            for (const key of selected) {
              const { r, c } = parseKey(key);
              destKeys.add(cellKey(r + mdr, c + mdc));
            }

            const symbolGhosts = [...selectedRootsForMove].map((rootKey) => {
              const cell = cells.get(rootKey);
              if (!cell) return null;
              const { r, c } = parseKey(rootKey);
              const nr = r + mdr, nc = c + mdc;
              if (nr < 0 || nc < 0) return null;
              const x = offset.x + nc * csW, y = offset.y + nr * csH, w = cell.spanWidth * csW;
              const sym = symMap.current.get(cell.symbolId);
              return (
                <div
                  key={`ghost-${rootKey}`}
                  style={{
                    position: "absolute", left: x, top: y,
                    width: w - 1, height: csH - 1,
                    background: "rgba(16,124,16,0.12)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    overflow: "hidden", boxSizing: "border-box", zIndex: 15,
                  }}
                >
                  {sym?.svgContent && (
                    <img
                      src={svgToDataUrl(sym.svgContent)}
                      style={{ width: w - 5, height: csH - 5, objectFit: "fill", display: "block", opacity: 0.7 }}
                      alt=""
                      draggable={false}
                    />
                  )}
                </div>
              );
            });

            const perimeterGhosts = [...selected].map((key) => {
              const { r, c } = parseKey(key);
              const nr = r + mdr, nc = c + mdc;
              if (nr < 0 || nc < 0) return null;
              const dk = cellKey(nr, nc);
              const hasTop = destKeys.has(cellKey(nr - 1, nc));
              const hasBottom = destKeys.has(cellKey(nr + 1, nc));
              const hasLeft = destKeys.has(cellKey(nr, nc - 1));
              const hasRight = destKeys.has(cellKey(nr, nc + 1));
              if (hasTop && hasBottom && hasLeft && hasRight) return null;
              return (
                <div
                  key={`ghost-p-${dk}`}
                  style={{
                    position: "absolute",
                    left: offset.x + nc * csW, top: offset.y + nr * csH,
                    width: csW, height: csH,
                    boxSizing: "border-box",
                    borderTop: hasTop ? "none" : "2px dashed #107C10",
                    borderBottom: hasBottom ? "none" : "2px dashed #107C10",
                    borderLeft: hasLeft ? "none" : "2px dashed #107C10",
                    borderRight: hasRight ? "none" : "2px dashed #107C10",
                    zIndex: 15,
                    pointerEvents: "none",
                  }}
                />
              );
            });

            return [...symbolGhosts, ...perimeterGhosts];
          })()}
      </div>

      {/* Zoom indicator (interactive zoom control lives in the View menu) */}
      <div
        style={{
          position: "absolute", bottom: 16, right: 16,
          background: "#E7E8EC", border: "1px solid #EEEEF2",
          borderRadius: 8, padding: "6px 12px",
          color: "#8A8A8A", fontSize: 11, zIndex: 30,
        }}
      >
        {Math.round(zoom * 100)}%
      </div>

      {/* Find/Replace window + Selection HUD, anchored top-right below the TopBar */}
      {(findOpen || selectionInfo) && (
        <div
          style={{
            position: "absolute", top: 52, right: 16, zIndex: 32,
            display: "flex", alignItems: "flex-start", gap: 8,
          }}
        >
          {findOpen && (
            <FindReplaceWindow
              symbols={symbols}
              findSymbolId={findSymbolId}
              setFindSymbol={setFindSymbol}
              findMatches={findMatches}
              findMatchIndex={findMatchIndex}
              findNext={findNext}
              findPrev={findPrev}
              onClose={closeFind}
              replaceSymbolId={replaceSymbolId}
              setReplaceSymbol={setReplaceSymbol}
              onReplace={onReplace}
              onReplaceAll={onReplaceAll}
              replaceOpen={replaceRowOpen}
              setReplaceOpen={setReplaceRowOpen}
              findColor={findColor}
              setFindColor={setFindColor}
              replaceColor={replaceColor}
              setReplaceColor={setReplaceColor}
              replaceColorEnabled={replaceColorEnabled}
              setReplaceColorEnabled={setReplaceColorEnabled}
            />
          )}
          {selectionInfo && (
            <div
              style={{
                background: "#F3F3F3",
                border: `1px solid ${movingSelection ? "#107C10" : "#007ACC"}`,
                borderRadius: 8, padding: "8px 14px",
              }}
            >
              <div style={{ color: movingSelection ? "#107C10" : "#007ACC", fontSize: 16, fontWeight: 400, marginBottom: 4 }}>
                {movingSelection ? "Moving" : "Selection"}
              </div>
              <div style={{ color: "#1E1E1E", fontSize: 12, marginBottom: 4 }}>
                {selected.size} sel{clipboard ? <span style={{ color: "#107C10" }}> · clip</span> : null}
              </div>
              <div style={{ color: "#1E1E1E", fontSize: 12, lineHeight: 1.7 }}>
                <span style={{ color: "#4B4B4B" }}>Rows: </span>
                {selectionInfo.rows}
                {"  "}
                <span style={{ color: "#4B4B4B" }}>Cols: </span>
                {selectionInfo.cols}
              </div>
              {movingSelection && (mdr !== 0 || mdc !== 0) && (
                <div style={{ color: "#107C10", fontSize: 12, marginTop: 2 }}>
                  Δr={mdr} Δc={mdc}
                </div>
              )}
              {!movingSelection && (
                <div style={{ color: "#4B4B4B", fontSize: 12, marginTop: 2 }}>
                  [{selectionInfo.endR},{selectionInfo.endC}] → [{selectionInfo.startR},{selectionInfo.startC}]
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* BG image editing HUD: instructions + opacity slider */}
      {bgImageEditing && bgImage && (
        <div
          style={{
            position: "absolute", top: 52, left: "50%", transform: "translateX(-50%)",
            background: "#FDF0E4", border: "1px solid #CA5010", borderRadius: 8,
            padding: "8px 20px", color: "#CA5010", fontSize: 12, fontWeight: 400,
            boxShadow: "0 0 20px rgba(202,80,16,0.2)", zIndex: 30,
            whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 14,
          }}
        >
          <span>BG IMAGE — Drag to move · Corner to resize</span>
          <div style={{ width: 1, alignSelf: "stretch", background: "#CA5010", opacity: 0.3 }} />
          <div
            style={{ display: "flex", alignItems: "center", gap: 8 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <span style={{ fontSize: 11 }}>Opacity</span>
            <input
              type="range"
              min={5}
              max={100}
              step={1}
              value={Math.round((bgImage.opacity ?? 0.5) * 100)}
              onChange={(e) => setBgImageOpacity(Number(e.target.value) / 100)}
              style={{ width: 90, accentColor: "#CA5010", cursor: "pointer" }}
            />
            <span style={{ fontSize: 11, width: 30, textAlign: "right" }}>
              {Math.round((bgImage.opacity ?? 0.5) * 100)}%
            </span>
          </div>
        </div>
      )}

      {/* Knitting mode status banner */}
      {knittingMode && (
        <div
          style={{
            position: "absolute", top: 52, left: "50%", transform: "translateX(-50%)",
            zIndex: 30, whiteSpace: "nowrap",
          }}
        >
          <div
            style={{
              background: "#FBE7F3", border: "1px solid #BF3989", borderRadius: 8,
              padding: "8px 20px", color: "#BF3989", fontSize: 12, fontWeight: 400,
              pointerEvents: "none", boxShadow: "0 0 20px rgba(191,57,137,0.2)",
            }}
          >
            🧶 KNITTING MODE — {completedCount} / {gridRows} rows completed
          </div>
        </div>
      )}

      {/* BG image editing bottom buttons */}
      {bgImageEditing && bgImage && (
        <div
          style={{
            position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)",
            display: "flex", gap: 12, zIndex: 60,
          }}
        >
          {[
            { label: "✓ FIX", onClick: bgImageFix, color: "#107C10", hoverBg: "#CBEECB", borderColor: "#107C10" },
            { label: "✕ REMOVE", onClick: bgImageRemove, color: "#C42B1C", hoverBg: "#FDECEA", borderColor: "#C42B1C" },
          ].map(({ label, onClick, color, hoverBg, borderColor }) => (
            <button
              key={label}
              onClick={onClick}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                padding: "10px 24px", borderRadius: 8,
                border: `2px solid ${borderColor}`,
                background: "#E7E8EC", color,
                fontSize: 13, fontWeight: 400, fontFamily: "inherit",
                cursor: "pointer", boxShadow: `0 0 12px ${borderColor}33`,
                transition: "background 0.12s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = hoverBg)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#E7E8EC")}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Knitting mode bottom buttons */}
      {knittingMode && (
        <div
          style={{
            position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)",
            display: "flex", gap: 12, zIndex: 30,
          }}
        >
          {[
            { id: "prev", label: "← Previous Row", onClick: handlePrevRow, color: "#CA5010", hoverBg: "#FDF0E4", borderColor: "#CA5010" },
            { id: "roundFlat", label: roundMode ? "Round" : "Flat", onClick: () => setRoundMode((prev) => !prev), color: "#007ACC", hoverBg: "#C9DEF5", borderColor: "#007ACC" },
            { id: "next", label: "Next Row →", onClick: handleNextRow, color: "#107C10", hoverBg: "#DFF6DD", borderColor: "#107C10" },
          ].map(({ id, label, onClick, color, hoverBg, borderColor }) => (
            <button
              key={id}
              onClick={onClick}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                padding: "10px 24px", borderRadius: 8,
                border: `2px solid ${borderColor}`,
                background: "#E7E8EC", color,
                fontSize: 13, fontWeight: 400, fontFamily: "inherit",
                cursor: "pointer", boxShadow: `0 0 12px ${borderColor}33`,
                transition: "background 0.12s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = hoverBg)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#E7E8EC")}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}