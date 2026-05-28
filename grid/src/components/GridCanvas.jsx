import { useRef, useEffect, useState, useCallback } from "react";
import { cellKey, parseKey, resolveRoot } from "../utils/cellUtils";
import { svgToDataUrl } from "../utils/svgUtils";

export default function GridCanvas({
  containerRef,
  spaceDown,
  moveMode,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onWheel,
  offset,
  cs,
  zoom,
  cells,
  symbols,
  selected,
  dragRect,
  moveOffset,
  getViewport,
  selectionInfo,
  bgImage,
  bgImageEditing,
  bgImageStartDrag,
  gridRows,
  gridCols,
  knittingMode,
  slashedRows,
  onNextRow,
  onPrevRow,
  onKnittingCellClick = null,
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
    const r = Math.floor((e.clientY - rect.top - offset.y) / cs);
    const c = Math.floor((e.clientX - rect.left - offset.x) / cs);
    if (r < 0 || r >= gridRows || c < 0 || c >= gridCols) return false;
    setKnittingPartial({ r, c });
    if (onKnittingCellClick) onKnittingCellClick(r, c);
    return true;
  }, [knittingMode, offset, cs, gridRows, gridCols, onKnittingCellClick]);

  // Next Row: fully slash the frontier row and advance the frontier up one row (r - 1).
  // The frontier row goes from partial-slash to full-slash, and banner count goes up by 1.
  const handleNextRow = useCallback(() => {
    if (knittingPartial !== null) {
      const { r, c } = knittingPartial;
      if (c > 0) {
        setKnittingPartial({ r: r, c: 0 });
      }
      else if (r > 0) {
        setKnittingPartial({ r: r - 1, c: 0 });
      } else {
        // Already at the topmost row -- slash it and clear
        setKnittingPartial(null);
        onNextRow();
      }
    } else {
      onNextRow();
    }
  }, [knittingPartial, onNextRow]);

  // Prev Row:
  // - If a partial click is active (c > 0): first press clears the column (c -> 0),
  //   keeping the frontier row the same so the banner count is unchanged.
  // - If frontier is already at c === 0: move frontier down one row (r + 1), unslashing it.
  const handlePrevRow = useCallback(() => {
    if (knittingPartial !== null) {
      const { r, c } = knittingPartial;
      if (c > 0) {
        // Clear partial column -- frontier stays on same row, banner count unchanged
        setKnittingPartial({ r: r + 1, c: 0 });
      } else if (r + 1 < gridRows) {
        setKnittingPartial({ r: r + 1, c: 0 });
      } else {
        // Frontier was at the very bottom row -- clear entirely
        setKnittingPartial(null);
      }
    } else {
      onPrevRow();
    }
  }, [knittingPartial, gridRows, onPrevRow]);

  // Drag highlight rect
  let dragHighlight = null;
  let dragSelKeys = null;
  if (dragRect && !moveMode) {
    const sr0 = Math.min(dragRect.start.r, dragRect.end.r);
    const sr1 = Math.max(dragRect.start.r, dragRect.end.r);
    const sc0 = Math.min(dragRect.start.c, dragRect.end.c);
    const sc1 = Math.max(dragRect.start.c, dragRect.end.c);
    dragHighlight = {
      left: sc0 * cs,
      top: sr0 * cs,
      width: (sc1 - sc0 + 1) * cs,
      height: (sr1 - sr0 + 1) * cs,
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
      const x = c * cs;
      const y = r * cs;

      if (cell) {
        occupiedCells.push({ r, c, key, cell, x, y });
        if (cell.spanWidth >= 1) {
          rootCells.push({ r, c, key, cell, x, y });
        }
      } else {
        emptyPathD += `M${x},${y}h${cs}M${x},${y}v${cs}`;
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
      const lx = x + i * cs;
      occupiedPathD += `M${lx},${y}v${cs}`;
      occupiedMaskD += `M${lx - 1},${y}h2v${cs}h-2Z`;
    }
  }
  const { dr: mdr, dc: mdc } = moveOffset;
  const selectedRootsForMove = new Set();
  if (moveMode)
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
      style={{
        flex: 1,
        position: "relative",
        overflow: "hidden",
        cursor: knittingMode ? (spaceDown.current ? "grab" : "crosshair") : bgImageEditing ? "grab" : moveMode ? "grab" : spaceDown.current ? "grab" : "crosshair",
      }}
      onMouseDown={(e) => { if (!handleKnittingClick(e)) onMouseDown(e); }}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Grid lines — bottom layer, clipped to grid bounds, masked to hide under symbols */}
      <svg
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 1 }}
      >
        <defs>
          <pattern id="smallGrid" width={cs} height={cs} patternUnits="userSpaceOnUse" x={offset.x} y={offset.y}>
            <path d={`M ${cs} 0 L 0 0 0 ${cs}`} fill="none" stroke="#1e2a4a" strokeWidth="0.5" />
          </pattern>
          {occupiedMaskD && (
            <mask id="gridMask">
              <rect x={offset.x} y={offset.y} width={gridCols * cs} height={gridRows * cs} fill="white" />
              <path d={occupiedMaskD} fill="black" transform={`translate(${offset.x},${offset.y})`} />
            </mask>
          )}
        </defs>
        <rect
          x={offset.x} y={offset.y}
          width={gridCols * cs} height={gridRows * cs}
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
            transform: `translate(${offset.x + bgImage.col * cs}px, ${offset.y + bgImage.row * cs}px)`,
            width: bgImage.cellW * cs,
            height: bgImage.cellH * cs,
            opacity: bgImageEditing ? 0.35 : 0.2,
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
              transform: `translate(${offset.x + bgImage.col * cs}px, ${offset.y + bgImage.row * cs}px)`,
              width: bgImage.cellW * cs,
              height: bgImage.cellH * cs,
              border: "2px dashed #f0a030",
              borderRadius: 4,
              cursor: "move",
              pointerEvents: "auto",
              boxSizing: "border-box",
              willChange: "transform",
            }}
            onMouseDown={(e) => bgImageStartDrag(e, "move")}
          >
            <div
              style={{
                position: "absolute", right: -6, bottom: -6, width: 14, height: 14,
                background: "#f0a030", border: "2px solid #1a1a2e", borderRadius: 3,
                cursor: "nwse-resize", pointerEvents: "auto",
              }}
              onMouseDown={(e) => { e.stopPropagation(); bgImageStartDrag(e, "resize"); }}
            />
            <div
              style={{
                position: "absolute", left: -6, top: -6, width: 14, height: 14,
                background: "#f0a030", border: "2px solid #1a1a2e", borderRadius: 3,
                cursor: "nwse-resize", pointerEvents: "auto",
              }}
              onMouseDown={(e) => { e.stopPropagation(); bgImageStartDrag(e, "resize"); }}
            />
          </div>
        </div>
      )}

      {/* Translated content layer */}
      <div style={{ position: "absolute", left: 0, top: 0, willChange: "transform", transform: contentTransform }}>

        {/* White cell backgrounds */}
        <div style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", zIndex: 2 }}>
          {occupiedCells.map(({ key, cell, x, y }) => {
            const isSelRoot =
              moveMode &&
              (selectedRootsForMove.has(key) || (cell.spanRoot && selectedRootsForMove.has(cell.spanRoot)));
            return (
              <div
                key={`bg-${key}`}
                style={{
                  position: "absolute",
                  left: x,
                  top: y,
                  width: cs,
                  height: cs,
                  background: "#ffffff",
                  boxSizing: "border-box",
                  opacity: isSelRoot ? 0.2 : 1,
                }}
              />
            );
          })}
        </div>

        {/* Grid lines overlay */}
        <svg style={{ position: "absolute", left: 0, top: 0, width: gridCols * cs, height: gridRows * cs, pointerEvents: "none", zIndex: 3, overflow: "visible" }}>
          {emptyPathD && <path d={emptyPathD} fill="none" stroke="#1e2a4a" strokeWidth="0.5" />}
          {occupiedPathD && <path d={occupiedPathD} fill="none" stroke="#7ba5ff73" strokeWidth="0.5" />}
        </svg>

        {/* Symbol images */}
        <div style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", zIndex: 4 }}>
          {rootCells.map(({ key, cell, x, y }) => {
            const isSelRoot = moveMode && selectedRootsForMove.has(key);
            const w = cell.spanWidth * cs;
            const sym = symMap.current.get(cell.symbolId);
            return (
              <div
                key={key}
                style={{
                  position: "absolute",
                  left: x,
                  top: y,
                  width: w,
                  height: cs,
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
                    style={{ width: w - 4, height: cs - 4, objectFit: "fill", display: "block" }}
                    alt=""
                    draggable={false}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Selection borders */}
        <div style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", zIndex: 20 }}>
          {moveMode ? (
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
                    position: "absolute", left: x, top: y, width: cs, height: cs,
                    boxSizing: "border-box",
                    borderTop: hasTop ? "none" : "2px solid #40d040",
                    borderBottom: hasBottom ? "none" : "2px solid #40d040",
                    borderLeft: hasLeft ? "none" : "2px solid #40d040",
                    borderRight: hasRight ? "none" : "2px solid #40d040",
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
                  position: "absolute", left: x, top: y, width: cs, height: cs,
                  boxSizing: "border-box",
                  border: "2px solid #e94560",
                  borderRadius: 3,
                  boxShadow: "0 0 6px rgba(233,69,96,0.5)",
                  pointerEvents: "none",
                }}
              />
            ))
          )}
        </div>

        {/* Drag rect */}
        {dragHighlight && (
          <div
            style={{
              position: "absolute",
              left: dragHighlight.left, top: dragHighlight.top,
              width: dragHighlight.width, height: dragHighlight.height,
              background: "rgba(233,69,96,0.12)",
              border: "1px dashed #e94560",
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
              return (
                <div
                  key={`knit-row-${r}`}
                  style={{
                    position: "absolute",
                    left: isPartialRow && !isSlashed ? knittingPartial.c * cs : 0,
                    top: r * cs,
                    width: isPartialRow && !isSlashed ? (gridCols - knittingPartial.c) * cs : gridCols * cs,
                    height: cs,
                    background: (isPartialRow || isSlashed) ? "rgba(255, 0, 0, 0.1)" : "rgba(10, 10, 20, 0.4)",
                  }}
                />
              );

            })}
            <svg style={{ position: "absolute", left: 0, top: 0, width: gridCols * cs, height: gridRows * cs, overflow: "visible" }}>
              {Array.from(effectiveSlashed).map((r) => (
                <line
                  key={`slash-${r}`}
                  x1={0} y1={r * cs + cs / 2}
                  x2={gridCols * cs} y2={r * cs + cs / 2}
                  stroke="#e94560"
                  strokeWidth={3}
                  opacity={0.8}
                />
              ))}
              {knittingPartial !== null && !effectiveSlashed.has(knittingPartial.r) && (
                <line
                  x1={knittingPartial.c * cs} y1={knittingPartial.r * cs + cs / 2}
                  x2={gridCols * cs} y2={knittingPartial.r * cs + cs / 2}
                  stroke="#e94560"
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
            const x = c * cs;
            return (
              <div key={`col-top-${c}`} style={{ position: "absolute", left: x, top: -18, width: cs, height: 16, display: "flex", alignItems: "center", justifyContent: "center", color: "#4a5580", fontSize: Math.min(9, cs * 0.32), fontFamily: "'JetBrains Mono', monospace", userSelect: "none" }}>
                {num}
              </div>
            );
          })}
          {Array.from({ length: gridCols }, (_, c) => {
            const num = gridCols - c;
            const x = c * cs;
            return (
              <div key={`col-bot-${c}`} style={{ position: "absolute", left: x, top: gridRows * cs + 2, width: cs, height: 16, display: "flex", alignItems: "center", justifyContent: "center", color: "#4a5580", fontSize: Math.min(9, cs * 0.32), fontFamily: "'JetBrains Mono', monospace", userSelect: "none" }}>
                {num}
              </div>
            );
          })}
          {Array.from({ length: gridRows }, (_, r) => {
            const num = gridRows - r;
            const y = r * cs;
            return (
              <div key={`row-left-${r}`} style={{ position: "absolute", left: -28, top: y, width: 24, height: cs, display: "flex", alignItems: "center", justifyContent: "flex-end", color: "#4a5580", fontSize: Math.min(9, cs * 0.32), fontFamily: "'JetBrains Mono', monospace", userSelect: "none" }}>
                {num}
              </div>
            );
          })}
          {Array.from({ length: gridRows }, (_, r) => {
            const num = gridRows - r;
            const y = r * cs;
            return (
              <div key={`row-right-${r}`} style={{ position: "absolute", left: gridCols * cs + 4, top: y, width: 24, height: cs, display: "flex", alignItems: "center", justifyContent: "flex-start", color: "#4a5580", fontSize: Math.min(9, cs * 0.32), fontFamily: "'JetBrains Mono', monospace", userSelect: "none" }}>
                {num}
              </div>
            );
          })}
        </div>

      </div>{/* end translated content layer */}

      {/* Move ghosts */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 12 }}>
        {moveMode &&
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
              const x = offset.x + nc * cs, y = offset.y + nr * cs, w = cell.spanWidth * cs;
              const sym = symMap.current.get(cell.symbolId);
              return (
                <div
                  key={`ghost-${rootKey}`}
                  style={{
                    position: "absolute", left: x, top: y,
                    width: w - 1, height: cs - 1,
                    background: "rgba(64,208,64,0.12)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    overflow: "hidden", boxSizing: "border-box", zIndex: 15,
                  }}
                >
                  {sym?.svgContent && (
                    <img
                      src={svgToDataUrl(sym.svgContent)}
                      style={{ width: w - 5, height: cs - 5, objectFit: "fill", display: "block", opacity: 0.7 }}
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
                    left: offset.x + nc * cs, top: offset.y + nr * cs,
                    width: cs, height: cs,
                    boxSizing: "border-box",
                    borderTop: hasTop ? "none" : "2px dashed #40d040",
                    borderBottom: hasBottom ? "none" : "2px dashed #40d040",
                    borderLeft: hasLeft ? "none" : "2px dashed #40d040",
                    borderRight: hasRight ? "none" : "2px dashed #40d040",
                    zIndex: 15,
                    pointerEvents: "none",
                  }}
                />
              );
            });

            return [...symbolGhosts, ...perimeterGhosts];
          })()}
      </div>

      {/* Zoom indicator */}
      <div
        style={{
          position: "absolute", bottom: 16, right: 16,
          background: "#16213e", border: "1px solid #0f3460",
          borderRadius: 8, padding: "6px 12px",
          color: "#7070b0", fontSize: 11, zIndex: 30,
        }}
      >
        {Math.round(zoom * 100)}%
      </div>

      {/* Selection HUD */}
      {selectionInfo && (
        <div
          style={{
            position: "absolute", top: 52, right: 16,
            background: "#16213e",
            border: `1px solid ${moveMode ? "#40d040" : "#ffd700"}`,
            borderRadius: 8, padding: "8px 14px",
            boxShadow: `0 0 12px ${moveMode ? "rgba(64,208,64,0.15)" : "rgba(255,215,0,0.15)"}`,
            zIndex: 30,
          }}
        >
          <div style={{ color: moveMode ? "#40d040" : "#ffd700", fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
            {moveMode ? "Move Mode" : "Selection"}
          </div>
          <div style={{ color: "#e0e0ff", fontSize: 12, lineHeight: 1.7 }}>
            <span style={{ color: "#7070b0" }}>Rows: </span>
            {selectionInfo.rows}
            {"  "}
            <span style={{ color: "#7070b0" }}>Cols: </span>
            {selectionInfo.cols}
          </div>
          {moveMode && (mdr !== 0 || mdc !== 0) && (
            <div style={{ color: "#40d040", fontSize: 12, marginTop: 2 }}>
              Δr={mdr} Δc={mdc}
            </div>
          )}
          {!moveMode && (
            <div style={{ color: "#6060a0", fontSize: 12, marginTop: 2 }}>
              [{selectionInfo.endR},{selectionInfo.endC}] → [{selectionInfo.startR},{selectionInfo.startC}]
            </div>
          )}
        </div>
      )}

      {/* Move mode banner */}
      {moveMode && (
        <div
          style={{
            position: "absolute", top: 52, left: "50%", transform: "translateX(-50%)",
            background: "#1a4a1a", border: "1px solid #40d040", borderRadius: 8,
            padding: "8px 20px", color: "#80ff80", fontSize: 12, fontWeight: 700,
            pointerEvents: "none", boxShadow: "0 0 20px rgba(64,208,64,0.3)", zIndex: 30,
          }}
        >
          MOVE MODE — Drag to reposition · Click PLACE HERE to commit
        </div>
      )}

      {/* Knitting mode banner */}
      {knittingMode && (
        <div
          style={{
            position: "absolute", top: 52, left: "50%", transform: "translateX(-50%)",
            background: "#2a1a2a", border: "1px solid #f0a0d0", borderRadius: 8,
            padding: "8px 20px", color: "#f0a0d0", fontSize: 12, fontWeight: 700,
            pointerEvents: "none", boxShadow: "0 0 20px rgba(240,160,208,0.2)",
            zIndex: 30, whiteSpace: "nowrap",
          }}
        >
          🧶 KNITTING MODE — {completedCount} / {gridRows} rows completed
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
            { label: "← Previous Row", onClick: handlePrevRow, color: "#f0a030", hoverBg: "#2a2a1a", borderColor: "#f0a030" },
            { label: "Next Row →", onClick: handleNextRow, color: "#60d090", hoverBg: "#1a3a2a", borderColor: "#60d090" },
          ].map(({ label, onClick, color, hoverBg, borderColor }) => (
            <button
              key={label}
              onClick={onClick}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                padding: "10px 24px", borderRadius: 8,
                border: `2px solid ${borderColor}`,
                background: "#16213e", color,
                fontSize: 13, fontWeight: 700, fontFamily: "inherit",
                cursor: "pointer", boxShadow: `0 0 12px ${borderColor}33`,
                transition: "background 0.12s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = hoverBg)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#16213e")}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}