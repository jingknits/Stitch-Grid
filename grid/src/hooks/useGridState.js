import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { ROWS, COLS, CELL_SIZE, MAX_HISTORY } from "../constants";
import { cellKey, parseKey, cloneCells, removeSpanContaining, resolveRoot } from "../utils/cellUtils";
import { computeDefaultWidth, svgTree } from "../utils/svgUtils";

// Sentinel value for the "No Symbol" option in Find/Replace — represents
// grid positions with nothing placed, distinct from "nothing selected yet"
// (which is `null`).
export const NO_SYMBOL = "__no_symbol__";
export const ANY_SYMBOL = "__any_symbol__";

// Symbols the sidebar is pre-populated with on first load.
const DEFAULT_SYMBOLS = [
  {
    id: "default_knit",
    name: "Knit",
    width: 1,
    svgContent: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <path d="M50 20 L 50 80" stroke="black" stroke-width="10px" stroke-linecap="round" />
</svg>`,
  },
  {
    id: "default_purl",
    name: "Purl",
    width: 1,
    svgContent: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <path d="M20 50 L 80 50" stroke="black" stroke-width="10px" stroke-linecap="round" />
</svg>`,
  },
  {
    id: "default_m1l",
    name: "M1L",
    width: 1,
    svgContent: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <path d="M90 10 L 90 90" stroke="black" stroke-width="10px" stroke-linecap="round" />
    <path d="M90 50 L10 10" stroke="black" stroke-width="10px" stroke-linecap="round" />
</svg>`,
  },
  {
    id: "default_m1r",
    name: "M1R",
    width: 1,
    svgContent: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
    <path d="M1 1 L 1 9" stroke="black" stroke-width="1px" stroke-linecap="round" />
    <path d="M1 5 L9 1" stroke="black" stroke-width="1px" stroke-linecap="round" />
</svg>`,
  },
  {
    id: "default_empty",
    name: "Empty",
    width: 1,
    svgContent: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
</svg>`,
  },
];

export default function useGridState() {
  // ── Symbol management ─────────────────────────────────────────────────────
  const [symbols, setSymbols] = useState(DEFAULT_SYMBOLS);
  const [lastUsedSymbolId, setLastUsedSymbolId] = useState(null);
  const [showEditSymbols, setShowEditSymbols] = useState(false);
  const [newSymName, setNewSymName] = useState("");
  const [newSymWidth, setNewSymWidth] = useState(1);
  const [newSymSvg, setNewSymSvg] = useState(null);
  const [addError, setAddError] = useState("");
  const fileInputRef = useRef(null);

  // Edit existing symbol
  const [editingSymbolId, setEditingSymbolId] = useState(null);
  const [editSymName, setEditSymName] = useState("");
  const [editSymWidth, setEditSymWidth] = useState(1);

  // SVG Directory (tree-based)
  const [showDirectory, setShowDirectory] = useState(false);
  const [customDirectoryTree, setCustomDirectoryTree] = useState({ __files: [] });
  const dirFileInputRef = useRef(null);

  // ── Grid dimensions (mutable) ─────────────────────────────────────────────
  const [gridRows, setGridRows] = useState(ROWS);
  const [gridCols, setGridCols] = useState(COLS);

  // ── Viewport / pan / zoom ─────────────────────────────────────────────────
  const [offset, setOffset] = useState({ x: 40, y: 40 });
  const [zoom, setZoom] = useState(1);
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const panOffset = useRef({ x: 40, y: 40 });
  const panRafId = useRef(null);
  const panLastMouse = useRef({ x: 0, y: 0 });

  // Mirror refs so multi-pointer gesture math (pinch-zoom / two-finger pan)
  // always reads the latest zoom/offset without re-creating callbacks.
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const offsetRef = useRef(offset);
  offsetRef.current = offset;

  // ── Multi-touch (pinch-to-zoom / two-finger pan) ─────────────────────────
  // Tracks every currently-down pointer by id so a second touch landing
  // while one is already down is recognized as the start of a pinch
  // gesture, distinct from the single-pointer selection/pan logic below.
  const activePointers = useRef(new Map()); // pointerId -> {x, y}
  const pinchState = useRef(null); // {startDist, startZoom, startMid, startOffset} | null

  // ── Selection ─────────────────────────────────────────────────────────────
  const [selected, setSelected] = useState(new Set());
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const isDragging = useRef(false);
  const dragStart = useRef(null);
  const dragCurrent = useRef(null);
  const [dragRect, setDragRect] = useState(null);

  // ── Cell data ─────────────────────────────────────────────────────────────
  const [cells, setCells] = useState(new Map());

  // ── History ───────────────────────────────────────────────────────────────
  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const [historyLen, setHistoryLen] = useState({ undo: 0, redo: 0 });

  // ── Dirty tracking (unsaved changes) ──────────────────────────────────
  const dirtyRef = useRef(false);

  // ── Clipboard ─────────────────────────────────────────────────────────────
  const [clipboard, setClipboard] = useState(null);
  // Separate clipboards for "Copy/Paste Color" and "Copy/Paste Symbol" so
  // copying one doesn't clobber the other, or the full-cell clipboard above.
  const [colorClipboard, setColorClipboard] = useState(null);
  const [symbolClipboard, setSymbolClipboard] = useState(null);
  // Saved "Groups" (Sidebar's Groups folder): persistent, named snapshots of
  // symbols+colors captured from a selection, pasteable at any later
  // selection — as opposed to the transient clipboards above.
  const [groups, setGroups] = useState([]);

  // ── Move-by-drag (selection mode) ─────────────────────────────────────────
  // There's no separate "Move mode" anymore — clicking down on a cell that's
  // already selected and dragging picks the whole selection up; releasing
  // drops it at the new spot. `movingSelection` is only true for the
  // duration of that drag gesture.
  const [movingSelection, setMovingSelection] = useState(false);
  const [moveOffset, setMoveOffset] = useState({ dr: 0, dc: 0 });
  const moveOffsetRef = useRef({ dr: 0, dc: 0 });
  moveOffsetRef.current = moveOffset;
  const isMoveDragging = useRef(false);
  const moveDragStartCell = useRef(null);
  // Bounding box of the selection at drag start, used to clamp the drag so
  // it can't carry the selection past the edge of the grid.
  const moveDragBounds = useRef(null);

  // ── Background image ──────────────────────────────────────────────────────
  const [bgImage, setBgImage] = useState(null);
  const [bgImageEditing, setBgImageEditing] = useState(false);
  const bgDragState = useRef(null);
  const bgFileInputRef = useRef(null);

  // ── Guide lines ────────────────────────────────────────────────────────
  // A guide line is { id, orientation: 'h'|'v', linePos, start, end }.
  // linePos is the grid-line index it sits on (a row index if horizontal,
  // a column index if vertical); start/end are the two endpoint positions
  // along the perpendicular axis, clamped to [0, gridCols]/[0, gridRows].
  // Guide lines are persisted content — saved into the JSON export and
  // drawn into PNG/SVG export — and every create/move/resize/flip/delete
  // goes through pushHistory like any other cell mutation (see the
  // combined {cells, guideLines} history-stack entries below).
  const [guideLines, setGuideLines] = useState([]);
  const guideLinesRef = useRef(guideLines);
  guideLinesRef.current = guideLines;

  const [selectedGuideLineId, setSelectedGuideLineId] = useState(null);
  const selectedGuideLineIdRef = useRef(selectedGuideLineId);
  selectedGuideLineIdRef.current = selectedGuideLineId;

  // Toggle that puts the canvas into "draw a guide line" mode — click-drag
  // along a grid line to create one, same exclusive-mode convention as
  // knittingMode/fillMode/bgImageEditing.
  const [guideLineMode, setGuideLineMode] = useState(false);
  const toggleGuideLineMode = useCallback(() => {
    setGuideLineMode((p) => !p);
    setSelectedGuideLineId(null);
  }, []);

  // Live preview shown during an in-progress create/move/resize(+flip)
  // drag. id === null means an in-progress creation, not yet committed to
  // guideLines; otherwise id matches the guideLines entry being dragged,
  // whose committed fields are overridden by this preview until the drag
  // commits on mouse-up.
  const [guideLineDraft, setGuideLineDraft] = useState(null);

  // Fourth, dedicated clipboard slot for guide lines (alongside clipboard/
  // colorClipboard/symbolClipboard) — holds one { orientation, linePos,
  // start, end } snapshot (no id, so pasting always creates a fresh one).
  const [guideLineClipboard, setGuideLineClipboard] = useState(null);
  // Tracks whether Ctrl+C/X most recently copied a guide line or cell
  // content, so a bare Ctrl+V knows which clipboard to paste from.
  const lastClipboardKindRef = useRef("cell");

  const guideLineIdCounter = useRef(0);
  const genGuideLineId = () => `gl_${Date.now()}_${guideLineIdCounter.current++}`;

  const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));

  // ── File handle (File System Access API) ──────────────────────────────
  const fileHandleRef = useRef(null);
  const [saveError, setSaveError] = useState(null);
  const [fileName, setFileName] = useState("Untitled");

  // ── Local folder browser (File System Access API) ─────────────────────
  // Lets the user pick a local folder and browse its .json (Gridmark) files
  // in the Sidebar's Files section. showDirectoryPicker is Chromium-only,
  // so the UI feature-detects via fileSystemApiSupported and shows a
  // fallback message elsewhere when it's unavailable.
  const [fileSystemApiSupported] = useState(
    () => typeof window !== "undefined" && typeof window.showDirectoryPicker === "function"
  );
  const [folderTree, setFolderTree] = useState(null); // null = no folder open
  const [folderName, setFolderName] = useState("");
  const [openFileId, setOpenFileId] = useState(null);
  const [folderError, setFolderError] = useState("");
  const rootDirHandleRef = useRef(null);
  const [cellColor, setCellColor] = useState("#ffffff");
  const cellColorRef = useRef(cellColor);
  cellColorRef.current = cellColor;
  const fileNameRef = useRef(fileName);
  fileNameRef.current = fileName;

  // ── UI state ──────────────────────────────────────────────────────────────
  const [showConfirm, setShowConfirm] = useState(false);
  const containerRef = useRef(null);
  const spaceDown = useRef(false);
  const ctrlAtDragStart = useRef(false);

  const cs = CELL_SIZE * zoom;

  // ── Rectangular cell size (gauge/define resize) ───────────────────────────
  // cellAspect = { w, h } multipliers applied on top of the base CELL_SIZE,
  // independent of zoom. Defaults to 1/1 (square cells, prior behavior).
  const [cellAspect, setCellAspect] = useState({ w: 1, h: 1 });
  const csW = cs * cellAspect.w;
  const csH = cs * cellAspect.h;

  const resizeCell = useCallback((result) => {
    if (!result) return;
    if (result.mode === "gauge") {
      const { stitches, rows } = result;
      if (!stitches || !rows) return;
      let w, h;
      if (stitches > rows) {
        h = 1;
        w = rows / stitches;
      } else {
        w = 1;
        h = stitches / rows;
      }
      setCellAspect({ w, h });
    } else if (result.mode === "define") {
      const { height, width } = result;
      if (!height || !width) return;
      let w, h;
      if (height > width) {
        h = 1;
        w = width / height;
      } else {
        w = 1;
        h = height / width;
      }
      setCellAspect({ w, h });
    }
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // HISTORY
  // ═══════════════════════════════════════════════════════════════════════════

  const pushHistoryGuard = useRef(false);

  // History-stack entries snapshot both `cells` and `guideLines` together —
  // guideLinesRef is declared above (Guide lines section) — so a single
  // Ctrl+Z/Ctrl+Y undoes/redoes whichever of the two actually changed,
  // without every existing pushHistory(prevCells) call site needing to
  // change: they still just pass the pre-edit cells Map, and the current
  // guideLines are captured automatically alongside it.
  const pushHistory = useCallback((prevCells) => {
    if (pushHistoryGuard.current) return;
    pushHistoryGuard.current = true;
    // Reset after the current microtask so the next independent action can push
    Promise.resolve().then(() => { pushHistoryGuard.current = false; });
    undoStack.current.push({ cells: [...prevCells], guideLines: guideLinesRef.current.map((g) => ({ ...g })) });
    if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift();
    redoStack.current = [];
    setHistoryLen({ undo: undoStack.current.length, redo: 0 });
    dirtyRef.current = true;
  }, []);

  const undoGuard = useRef(false);
  const redoGuard = useRef(false);

  const undo = useCallback(() => {
    if (!undoStack.current.length) return;
    const entry = undoStack.current.pop();
    undoGuard.current = false;
    setCells((cur) => {
      if (!undoGuard.current) {
        undoGuard.current = true;
        redoStack.current.push({ cells: [...cur], guideLines: guideLinesRef.current.map((g) => ({ ...g })) });
        setHistoryLen({
          undo: undoStack.current.length,
          redo: redoStack.current.length,
        });
      }
      return new Map(entry.cells);
    });
    setGuideLines(entry.guideLines.map((g) => ({ ...g })));
    setSelectedGuideLineId(null);
    setGuideLineDraft(null);
    dirtyRef.current = true;
  }, []);

  const redo = useCallback(() => {
    if (!redoStack.current.length) return;
    const entry = redoStack.current.pop();
    redoGuard.current = false;
    setCells((cur) => {
      if (!redoGuard.current) {
        redoGuard.current = true;
        undoStack.current.push({ cells: [...cur], guideLines: guideLinesRef.current.map((g) => ({ ...g })) });
        setHistoryLen({
          undo: undoStack.current.length,
          redo: redoStack.current.length,
        });
      }
      return new Map(entry.cells);
    });
    setGuideLines(entry.guideLines.map((g) => ({ ...g })));
    setSelectedGuideLineId(null);
    setGuideLineDraft(null);
    dirtyRef.current = true;
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // VIEWPORT
  // ═══════════════════════════════════════════════════════════════════════════

  const gridRowsRef = useRef(gridRows);
  gridRowsRef.current = gridRows;
  const gridColsRef = useRef(gridCols);
  gridColsRef.current = gridCols;

  const getViewport = useCallback(() => {
    if (!containerRef.current) return { r0: 0, r1: 30, c0: 0, c1: 50 };
    const { clientWidth, clientHeight } = containerRef.current;
    return {
      c0: Math.max(0, Math.floor(-offset.x / csW)),
      r0: Math.max(0, Math.floor(-offset.y / csH)),
      c1: Math.min(gridColsRef.current - 1, Math.ceil((clientWidth - offset.x) / csW)),
      r1: Math.min(gridRowsRef.current - 1, Math.ceil((clientHeight - offset.y) / csH)),
    };
  }, [offset, csW, csH]);

  const mouseToCell = useCallback(
    (e) => {
      const rect = containerRef.current.getBoundingClientRect();
      return {
        r: Math.floor((e.clientY - rect.top - offset.y) / csH),
        c: Math.floor((e.clientX - rect.left - offset.x) / csW),
      };
    },
    [offset, csW, csH]
  );

  const getCellsInDragRect = useCallback((start, end) => {
    const r0 = Math.max(0, Math.min(start.r, end.r));
    const r1 = Math.min(gridRowsRef.current - 1, Math.max(start.r, end.r));
    const c0 = Math.max(0, Math.min(start.c, end.c));
    const c1 = Math.min(gridColsRef.current - 1, Math.max(start.c, end.c));
    const keys = [];
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) keys.push(cellKey(r, c));
    return keys;
  }, []);

  // ── Fit grid to page ──────────────────────────────────────────────────────
  // Zooms/pans so the whole grid is visible, touching either the top+bottom
  // of the available area (below the fixed top bar) or the right edge and
  // the edge just before the sidebar — whichever pair is the tighter fit.
  const cellAspectRef = useRef(cellAspect);
  cellAspectRef.current = cellAspect;

  const fitGridToPage = useCallback(() => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    // The container's own top edge sits under the fixed top bar (it isn't
    // pushed down by it), so the usable vertical space starts below the bar.
    const TOPBAR_HEIGHT = 48;
    const availW = clientWidth;
    const availH = clientHeight - TOPBAR_HEIGHT;
    if (availW <= 0 || availH <= 0) return;

    const rows = gridRowsRef.current;
    const cols = gridColsRef.current;
    const { w: aspectW, h: aspectH } = cellAspectRef.current;
    const unitW = CELL_SIZE * aspectW;
    const unitH = CELL_SIZE * aspectH;

    const zoomForW = availW / (cols * unitW);
    const zoomForH = availH / (rows * unitH);
    const nextZoom = Math.max(0.2, Math.min(5, Math.min(zoomForW, zoomForH)));

    const newCsW = unitW * nextZoom;
    const newCsH = unitH * nextZoom;
    const gridPxW = cols * newCsW;
    const gridPxH = rows * newCsH;

    setZoom(nextZoom);
    setOffset({
      x: (availW - gridPxW) / 2,
      y: TOPBAR_HEIGHT + (availH - gridPxH) / 2,
    });
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // SPACE KEY (pan)
  // ═══════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    const kd = (e) => {
      if (e.code === "Space") {
        const tag = e.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target.isContentEditable) return;
        spaceDown.current = true;
        e.preventDefault();
      }
    };
    const ku = (e) => {
      if (e.code === "Space") spaceDown.current = false;
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // MOVE BY DRAG
  // ═══════════════════════════════════════════════════════════════════════════
  // Called on mouse-up at the end of a move-drag gesture (see onMouseDown/
  // onMouseMove below). Reads the live offset and the selection off refs so
  // it doesn't need to change identity as those change mid-drag.

  const commitMove = useCallback(() => {
    const { dr, dc } = moveOffsetRef.current;
    const sel = selectedRef.current;
    if (dr === 0 && dc === 0) {
      // Nothing actually moved (e.g. a plain click on the selection) —
      // leave cells and selection untouched.
      setMovingSelection(false);
      return;
    }
    setCells((prev) => {
      pushHistory(prev);
      const next = cloneCells(prev);
      const movingRoots = new Set();
      for (const key of sel) {
        const cell = next.get(key);
        if (!cell) continue; // truly empty selected cell — handled separately below
        // A continuation cell (spanWidth === 0) resolves to its spanRoot;
        // anything else — a symbol root OR a color-only Fill cell (which has
        // no spanWidth field at all) — is its own root.
        const rk = cell.spanWidth === 0 && cell.spanRoot ? cell.spanRoot : key;
        movingRoots.add(rk);
      }
      const toPlace = [];
      for (const rk of movingRoots) {
        const cell = next.get(rk);
        if (!cell) continue;
        const { r, c } = parseKey(rk);
        // Color-only (Fill-mode) cells have no symbolId and are always a
        // single cell — treat them as width 1 rather than reading the
        // (nonexistent) spanWidth field, so they get collected/deleted/
        // replaced just like symbol cells instead of being silently skipped.
        const width = cell.symbolId ? cell.spanWidth : 1;
        // Collect per-cell colors before deletion
        const colors = [];
        for (let i = 0; i < width; i++) {
          colors.push(next.get(cellKey(r, c + i))?.color || "#ffffff");
        }
        toPlace.push({ r, c, symbolId: cell.symbolId || null, spanWidth: width, colors, colorOnly: !cell.symbolId });
      }
      for (const key of sel) {
        if (!next.get(key)) {
          const { r, c } = parseKey(key);
          toPlace.push({ r, c, symbolId: null, spanWidth: 1, colors: ["#ffffff"], colorOnly: false });
        }
      }
      for (const rk of movingRoots) {
        const cell = next.get(rk);
        if (!cell) continue;
        const { r, c } = parseKey(rk);
        const width = cell.symbolId ? cell.spanWidth : 1;
        for (let i = 0; i < width; i++) next.delete(cellKey(r, c + i));
      }
      const newSel = new Set();
      for (const { r, c, symbolId, spanWidth, colors, colorOnly } of toPlace) {
        const nr = r + dr,
          nc = c + dc;
        if (nr < 0 || nr >= gridRowsRef.current || nc < 0 || nc >= gridColsRef.current) continue;
        if (symbolId) {
          for (let i = 0; i < spanWidth; i++)
            removeSpanContaining(next, cellKey(nr, nc + i));
          for (let i = 0; i < spanWidth; i++) {
            if (nc + i >= gridColsRef.current) continue;
            const nk = cellKey(nr, nc + i);
            const color = colors[i] || "#ffffff";
            if (i === 0) next.set(nk, { symbolId, spanWidth, color });
            else next.set(nk, { symbolId, spanWidth: 0, spanRoot: cellKey(nr, nc), color });
          }
          for (let i = 0; i < spanWidth; i++) newSel.add(cellKey(nr, nc + i));
        } else if (colorOnly) {
          // Move a Fill-mode color cell: clear any span occupying the
          // destination, then drop the color there with no symbol.
          removeSpanContaining(next, cellKey(nr, nc));
          next.set(cellKey(nr, nc), { color: colors[0] });
          newSel.add(cellKey(nr, nc));
        } else {
          newSel.add(cellKey(nr, nc));
        }
      }
      setSelected(newSel);
      return next;
    });
    setMovingSelection(false);
    setMoveOffset({ dr: 0, dc: 0 });
  }, [pushHistory]);

  // ═══════════════════════════════════════════════════════════════════════════
  // MOUSE EVENTS
  // ═══════════════════════════════════════════════════════════════════════════

  const bgImageEditingRef = useRef(bgImageEditing);
  bgImageEditingRef.current = bgImageEditing;

  // Shared gesture-start handling for pinch-zoom, two-finger pan, and
  // middle-click/space/bg-image-edit panning. Used as a prefix by both
  // normal cell interaction (onMouseDown) and guide-line creation, so a
  // second finger landing or a middle-click always pans/pinches the grid
  // instead of being swallowed by whichever single-pointer mode happens to
  // be active (e.g. guide-line mode intercepting every pointerdown to
  // place guide-line points). Returns true if the event was fully handled
  // here (caller should do nothing else with it); false for a plain
  // left-button, single-pointer down that the caller should still
  // interpret itself (a normal cell click, or a guide-line creation click).
  const handlePointerGestureStart = useCallback((e) => {
    if (e.pointerId !== undefined) {
      activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    // A second finger landing while one is already down starts a pinch
    // gesture instead: cancel any in-progress single-pointer interaction
    // (selection box, move-drag, space/middle-button pan, or a guide-line
    // creation waiting on its second click) and hand off to onMouseMove's
    // pinch handling below.
    if (activePointers.current.size >= 2) {
      isPanning.current = false;
      isDragging.current = false;
      setDragRect(null);
      if (isMoveDragging.current) {
        isMoveDragging.current = false;
        moveDragStartCell.current = null;
        moveDragBounds.current = null;
        setMovingSelection(false);
      }
      cancelGuideLineCreate();
      const pts = Array.from(activePointers.current.values()).slice(0, 2);
      const [p1, p2] = pts;
      pinchState.current = {
        startDist: Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1,
        startZoom: zoomRef.current,
        startMid: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
        startOffset: { ...offsetRef.current },
      };
      return true;
    }

    if (e.button === 1 || spaceDown.current) {
      isPanning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY };
      panOffset.current = { ...offset };
      e.preventDefault();
      return true;
    }
    if (bgImageEditingRef.current) {
      isPanning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY };
      panOffset.current = { ...offset };
      e.preventDefault();
      return true;
    }
    if (e.button !== 0) return true;

    return false;
  }, [offset]);

  const onMouseDown = useCallback(
    (e) => {
      if (handlePointerGestureStart(e)) return;

      // A click that reaches this handler wasn't on a guide line (its body
      // and end-cap handles stopPropagation on both onPointerDown and
      // onMouseDown), so it's a click "elsewhere" — deselect it, per spec.
      if (selectedGuideLineIdRef.current) setSelectedGuideLineId(null);

      const cell = mouseToCell(e);
      if (cell.r < 0 || cell.r >= gridRowsRef.current || cell.c < 0 || cell.c >= gridColsRef.current) return;

      const withCtrl = e.ctrlKey || e.metaKey;
      const key = cellKey(cell.r, cell.c);
      const sel = selectedRef.current;

      // Clicking (without ctrl) on a cell that's already selected starts a
      // move-drag instead of a fresh box-select: the whole selection follows
      // the cursor and drops in place on mouse-up. A plain click with no
      // drag is handled in onMouseUp and leaves the selection untouched.
      if (!withCtrl && sel.size > 0 && sel.has(key)) {
        isMoveDragging.current = true;
        moveDragStartCell.current = cell;
        setMovingSelection(true);
        setMoveOffset({ dr: 0, dc: 0 });

        // Snapshot the selection's bounding box once, so drag offsets can be
        // clamped live to the grid instead of only at drop time.
        let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
        for (const k of sel) {
          const { r, c } = parseKey(k);
          if (r < minR) minR = r;
          if (r > maxR) maxR = r;
          if (c < minC) minC = c;
          if (c > maxC) maxC = c;
        }
        moveDragBounds.current = { minR, maxR, minC, maxC };
        return;
      }

      ctrlAtDragStart.current = withCtrl;
      isDragging.current = true;
      dragStart.current = cell;
      dragCurrent.current = cell;
      setDragRect({ start: cell, end: cell });
    },
    [offset, mouseToCell]
  );

  const onMouseMove = useCallback(
    (e) => {
      if (e.pointerId !== undefined && activePointers.current.has(e.pointerId)) {
        activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }

      if (pinchState.current && activePointers.current.size >= 2) {
        const pts = Array.from(activePointers.current.values()).slice(0, 2);
        const [p1, p2] = pts;
        const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
        const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        const ps = pinchState.current;
        const nextZoom = Math.max(0.2, Math.min(5, ps.startZoom * (dist / ps.startDist)));
        const zoomRatio = nextZoom / ps.startZoom;
        // Anchor the zoom at the gesture's starting midpoint, then add the
        // midpoint's own travel so dragging two fingers together also pans.
        const anchoredX = ps.startMid.x - zoomRatio * (ps.startMid.x - ps.startOffset.x);
        const anchoredY = ps.startMid.y - zoomRatio * (ps.startMid.y - ps.startOffset.y);
        setZoom(nextZoom);
        setOffset({
          x: anchoredX + (mid.x - ps.startMid.x),
          y: anchoredY + (mid.y - ps.startMid.y),
        });
        return;
      }

      if (isPanning.current) {
        const cx = e.clientX, cy = e.clientY;
        panLastMouse.current.x = cx;
        panLastMouse.current.y = cy;
        if (panRafId.current === null) {
          panRafId.current = requestAnimationFrame(() => {
            panRafId.current = null;
            setOffset({
              x: panOffset.current.x + panLastMouse.current.x - panStart.current.x,
              y: panOffset.current.y + panLastMouse.current.y - panStart.current.y,
            });
          });
        }
        return;
      }
      if (isMoveDragging.current && moveDragStartCell.current) {
        const cell = mouseToCell(e);
        let dr = cell.r - moveDragStartCell.current.r;
        let dc = cell.c - moveDragStartCell.current.c;
        const bounds = moveDragBounds.current;
        if (bounds) {
          // Clamp so the selection's bounding box never leaves the grid —
          // dragging further just holds the selection at the grid edge
          // instead of letting it drag off and snap back later.
          const minDr = -bounds.minR;
          const maxDr = gridRowsRef.current - 1 - bounds.maxR;
          const minDc = -bounds.minC;
          const maxDc = gridColsRef.current - 1 - bounds.maxC;
          dr = Math.max(minDr, Math.min(maxDr, dr));
          dc = Math.max(minDc, Math.min(maxDc, dc));
        }
        setMoveOffset({ dr, dc });
        return;
      }
      if (isDragging.current) {
        const cell = mouseToCell(e);
        dragCurrent.current = cell;
        setDragRect({ start: dragStart.current, end: cell });
      }
    },
    [mouseToCell]
  );

  const onMouseUp = useCallback((e) => {
    if (e && e.pointerId !== undefined) {
      activePointers.current.delete(e.pointerId);
    }
    if (activePointers.current.size < 2) {
      pinchState.current = null;
    }
    if (isPanning.current) {
      isPanning.current = false;
      if (panRafId.current !== null) {
        cancelAnimationFrame(panRafId.current);
        panRafId.current = null;
      }
      setOffset({
        x: panOffset.current.x + panLastMouse.current.x - panStart.current.x,
        y: panOffset.current.y + panLastMouse.current.y - panStart.current.y,
      });
      return;
    }
    if (isMoveDragging.current) {
      isMoveDragging.current = false;
      moveDragStartCell.current = null;
      moveDragBounds.current = null;
      commitMove();
      return;
    }
    if (isDragging.current) {
      isDragging.current = false;
      setDragRect(null);
      const keys = getCellsInDragRect(dragStart.current, dragCurrent.current);
      const withCtrl = ctrlAtDragStart.current;

      if (keys.length === 1) {
        const key = keys[0];
        if (withCtrl) {
          setSelected((prev) => {
            const n = new Set(prev);
            n.has(key) ? n.delete(key) : n.add(key);
            return n;
          });
        } else {
          setSelected((prev) => {
            if (prev.size === 1 && prev.has(key)) {
              return new Set();
            }
            return new Set([key]);
          });
        }
      } else {
        if (withCtrl) {
          setSelected((prev) => {
            const n = new Set(prev);
            keys.forEach((k) => n.add(k));
            return n;
          });
        } else {
          setSelected(new Set(keys));
        }
      }
    }
  }, [getCellsInDragRect, commitMove]);

  const onWheel = useCallback((e) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const rect = containerRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left,
      my = e.clientY - rect.top;
    setZoom((prev) => {
      const next = Math.max(0.2, Math.min(5, prev * factor));
      setOffset((o) => ({
        x: mx - (next / prev) * (mx - o.x),
        y: my - (next / prev) * (my - o.y),
      }));
      return next;
    });
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // PLACE SYMBOL
  // ═══════════════════════════════════════════════════════════════════════════

  const placeSymbol = useCallback(
    (symbol) => {
      if (!selected.size || bgImageEditingRef.current) return;
      setLastUsedSymbolId(symbol.id);
      const byRow = new Map();
      for (const key of selected) {
        const { r, c } = parseKey(key);
        if (!byRow.has(r)) byRow.set(r, []);
        byRow.get(r).push(c);
      }
      if (symbol.width === 1) {
        setCells((prev) => {
          pushHistory(prev);
          const next = cloneCells(prev);
          for (const key of selected) {
            const existingColor = prev.get(key)?.color || "#ffffff";
            removeSpanContaining(next, key);
            next.set(key, { symbolId: symbol.id, spanWidth: 1, color: existingColor });
          }
          return next;
        });
        return;
      }
      const placements = [];
      for (const [r, cols] of byRow) {
        const sorted = [...cols].sort((a, b) => a - b);
        let rs = 0;
        while (rs < sorted.length) {
          let re = rs;
          while (re + 1 < sorted.length && sorted[re + 1] === sorted[re] + 1) re++;
          if (re - rs + 1 >= symbol.width) {
            let i = rs;
            while (i + symbol.width - 1 <= re) {
              placements.push({ r, startC: sorted[i] });
              i += symbol.width;
            }
          }
          rs = re + 1;
        }
      }
      if (!placements.length) {
        setSelected(new Set());
        return;
      }
      setCells((prev) => {
        pushHistory(prev);
        const next = cloneCells(prev);
        for (const { r, startC } of placements) {
          // Snapshot colors before removeSpanContaining wipes entries
          const colors = [];
          for (let i = 0; i < symbol.width; i++) {
            const key = cellKey(r, startC + i);
            const existing = prev.get(key);
            // For span children, look up the root to find if there's a color there
            const rootKey = existing?.spanRoot ?? key;
            colors.push(prev.get(rootKey)?.color || "#ffffff");
          }
          for (let i = 0; i < symbol.width; i++)
            removeSpanContaining(next, cellKey(r, startC + i));
          for (let i = 0; i < symbol.width; i++) {
            const key = cellKey(r, startC + i);
            if (i === 0) next.set(key, { symbolId: symbol.id, spanWidth: symbol.width, color: colors[i] });
            else
              next.set(key, {
                symbolId: symbol.id,
                spanWidth: 0,
                spanRoot: cellKey(r, startC),
                color: colors[i],
              });
          }
        }
        return next;
      });
    },
    [selected, pushHistory]
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // CLEAR SELECTED
  // ═══════════════════════════════════════════════════════════════════════════

  const clearSelected = useCallback(() => {
    setCells((prev) => {
      pushHistory(prev);
      const next = cloneCells(prev);
      for (const key of selected) {
        const cell = next.get(key);
        if (cell && cell.spanWidth > 1) {
          const { r, c } = parseKey(key);
          for (let i = 0; i < cell.spanWidth; i++) next.delete(cellKey(r, c + i));
        } else if (cell && cell.spanWidth === 0 && cell.spanRoot) {
          const root = next.get(cell.spanRoot);
          if (root) {
            const { r, c: rc } = parseKey(cell.spanRoot);
            for (let i = 0; i < root.spanWidth; i++) next.delete(cellKey(r, rc + i));
          }
        } else {
          next.delete(key);
        }
      }
      return next;
    });
    setSelected(new Set());
  }, [selected, pushHistory]);

  // ═══════════════════════════════════════════════════════════════════════════
  // CLEAR SELECTED COLORS ("Cut Color")
  // ═══════════════════════════════════════════════════════════════════════════
  // Like Clear All Colors, but scoped to the current selection: strips only
  // the color off selected cells, leaving any placed symbol in place. A
  // selected cell that only existed to carry a color (no symbol) is removed
  // entirely, since a colorless, symbol-less cell is the same as nothing
  // being there. Span continuation cells resolve to their root, since color
  // lives on the root cell, not the continuation.
  const clearSelectedColors = useCallback(() => {
    if (bgImageEditingRef.current) return;
    setCells((prev) => {
      const targets = new Set();
      for (const key of selected) {
        const cell = prev.get(key);
        if (!cell) continue;
        if (cell.spanWidth === 0 && cell.spanRoot) targets.add(cell.spanRoot);
        else targets.add(key);
      }
      let anyColor = false;
      for (const key of targets) {
        if (prev.get(key)?.color !== undefined) { anyColor = true; break; }
      }
      if (!anyColor) return prev;
      pushHistory(prev);
      const next = cloneCells(prev);
      for (const key of targets) {
        const cell = next.get(key);
        if (!cell) continue;
        if (cell.symbolId) {
          const { color, ...rest } = cell;
          next.set(key, rest);
        } else {
          next.delete(key);
        }
      }
      return next;
    });
  }, [selected, pushHistory]);

  // ═══════════════════════════════════════════════════════════════════════════
  // COLOR SELECTED CELLS
  // ═══════════════════════════════════════════════════════════════════════════
  // Applies a single color to every selected cell in one action — used by
  // the right-click context menu's quick color-swatch row. Unlike Clear
  // Selected Colors, an empty selected cell (no symbol, no color) still
  // gets a new color-only cell here, since we're adding color rather than
  // removing it. Span continuation cells resolve to their root, since
  // color lives on the root cell, not the continuation.
  const colorSelectedCells = useCallback((hexColor) => {
    if (bgImageEditingRef.current || !selected.size) return;
    setCells((prev) => {
      const targets = new Set();
      for (const key of selected) {
        const cell = prev.get(key);
        if (cell && cell.spanWidth === 0 && cell.spanRoot) targets.add(cell.spanRoot);
        else targets.add(key);
      }
      pushHistory(prev);
      const next = cloneCells(prev);
      for (const key of targets) {
        const existing = next.get(key);
        if (existing) next.set(key, { ...existing, color: hexColor });
        else next.set(key, { color: hexColor });
      }
      return next;
    });
  }, [selected, pushHistory]);

  // ═══════════════════════════════════════════════════════════════════════════
  // CLEAR ALL CELLS
  // ═══════════════════════════════════════════════════════════════════════════
  // Removes every symbol/color from the grid without touching grid size or
  // cell aspect ratio. Unlike Restart (which goes through a confirm modal),
  // this fires immediately — it's backed by the same undo history as every
  // other edit, so a mis-click isn't destructive.

  const clearAllCells = useCallback(() => {
    if (bgImageEditingRef.current) return;
    if (cells.size === 0) return;
    pushHistory(cells);
    setCells(new Map());
    setSelected(new Set());
  }, [cells, pushHistory]);

  // Resets every cell's color back to the default (no color), leaving any
  // placed symbols in place. Cells that only existed to carry a color (no
  // symbol) are removed entirely, since a colorless, symbol-less cell is
  // the same as nothing being there.
  const clearAllColors = useCallback(() => {
    if (bgImageEditingRef.current) return;
    setCells((prev) => {
      let anyColor = false;
      for (const cell of prev.values()) {
        if (cell.color !== undefined) { anyColor = true; break; }
      }
      if (!anyColor) return prev;
      pushHistory(prev);
      const next = new Map();
      for (const [key, cell] of prev) {
        if (cell.symbolId) {
          const { color, ...rest } = cell;
          next.set(key, rest);
        }
        // Cells with no symbolId exist only to carry a color — clearing
        // their color leaves nothing there, so they're dropped entirely.
      }
      return next;
    });
  }, [pushHistory]);

  // ═══════════════════════════════════════════════════════════════════════════
  // RESET
  // ═══════════════════════════════════════════════════════════════════════════

  const resetGrid = () => {
    pushHistory(cells);
    setCells(new Map());
    setSelected(new Set());
    setMovingSelection(false);
    setMoveOffset({ dr: 0, dc: 0 });
    setGridRows(ROWS);
    setGridCols(COLS);
    setCellAspect({ w: 1, h: 1 });
    setBgImage(null);
    setBgImageEditing(false);
    setGuideLines([]);
    setSelectedGuideLineId(null);
    setGuideLineDraft(null);
    setGuideLineMode(false);
    setShowConfirm(false);
  };

  const importGridmark = useCallback((jsonStr, handle) => {
    try {
      const data = JSON.parse(jsonStr);
      if (data.format !== "gridmark" || !data.cells || !data.symbols) {
        alert("Invalid Gridmark file.");
        return;
      }
      pushHistory(cells);
      if (data.gridRows) setGridRows(data.gridRows);
      if (data.gridCols) setGridCols(data.gridCols);
      if (data.cellAspect && typeof data.cellAspect.w === "number" && typeof data.cellAspect.h === "number") {
        setCellAspect(data.cellAspect);
      } else {
        setCellAspect({ w: 1, h: 1 });
      }
      if (data.bgImage && data.bgImage.src) {
        setBgImage(data.bgImage);
      } else {
        setBgImage(null);
      }
      setBgImageEditing(false);
      if (Array.isArray(data.guideLines)) {
        setGuideLines(
          data.guideLines
            .filter((g) => g && (g.orientation === "h" || g.orientation === "v"))
            .map((g) => ({
              id: typeof g.id === "string" ? g.id : genGuideLineId(),
              orientation: g.orientation,
              linePos: g.linePos,
              start: g.start,
              end: g.end,
            }))
        );
      } else {
        setGuideLines([]);
      }
      setSelectedGuideLineId(null);
      setGuideLineDraft(null);
      setGuideLineMode(false);
      setSymbols((prev) => {
        const existingIds = new Set(prev.map((s) => s.id));
        const newSyms = data.symbols.filter((s) => !existingIds.has(s.id));
        return newSyms.length > 0 ? [...prev, ...newSyms] : prev;
      });
      const newCells = new Map();
      for (const entry of data.cells) {
        const { key, ...cellData } = entry;
        newCells.set(key, cellData);
      }
      setCells(newCells);
      setSelected(new Set());
      setMovingSelection(false);
      setMoveOffset({ dr: 0, dc: 0 });
      if (handle) {
        fileHandleRef.current = handle;
        setFileName(handle.name.replace(/\.json$/i, ""));
      }
      // Opening a file pushes history (so the import itself is undoable),
      // which marks dirtyRef true as a side effect — but merely opening a
      // file with no further edits shouldn't count as "unsaved changes".
      dirtyRef.current = false;
      // Return memoText so App.jsx can restore it into its own state
      return typeof data.memoText === "string" ? data.memoText : "";
    } catch (e) {
      alert("Failed to import file: " + e.message);
    }
  }, [cells]);

  // ── Save (File System Access API) ───────────────────────────────────────

  const cellsRef = useRef(cells);
  cellsRef.current = cells;
  const symbolsRef = useRef(symbols);
  symbolsRef.current = symbols;
  const gridRowsRefForSave = useRef(gridRows);
  gridRowsRefForSave.current = gridRows;
  const gridColsRefForSave = useRef(gridCols);
  gridColsRefForSave.current = gridCols;

  const cellAspectRefForSave = useRef(cellAspect);
  cellAspectRefForSave.current = cellAspect;

  const bgImageRefForSave = useRef(bgImage);
  bgImageRefForSave.current = bgImage;

  const guideLinesRefForSave = useRef(guideLines);
  guideLinesRefForSave.current = guideLines;

  // memoText is owned by App.jsx; saveGridmark receives it via this ref,
  // which App.jsx keeps up-to-date by calling setMemoTextRef.
  const memoTextRef = useRef("");

  const buildGridmarkJson = useCallback(() => {
    const c = cellsRef.current;
    const s = symbolsRef.current;
    const cellsArr = [];
    for (const [key, cell] of c) cellsArr.push({ key, ...cell });
    const usedIds = new Set();
    for (const [, cell] of c) { if (cell.symbolId) usedIds.add(cell.symbolId); }
    const usedSymbols = s
      .filter((sym) => usedIds.has(sym.id))
      .map((sym) => ({ id: sym.id, name: sym.name, width: sym.width, svgContent: sym.svgContent }));
    return JSON.stringify({
      format: "gridmark",
      version: 1,
      gridRows: gridRowsRefForSave.current,
      gridCols: gridColsRefForSave.current,
      cellAspect: cellAspectRefForSave.current,
      bgImage: bgImageRefForSave.current || null,
      memoText: memoTextRef.current || "",
      symbols: usedSymbols,
      cells: cellsArr,
      guideLines: guideLinesRefForSave.current.map((g) => ({ ...g })),
    }, null, 2);
  }, []);

  const saveGridmark = useCallback(async () => {
    setSaveError(null);
    const json = buildGridmarkJson();
    const handle = fileHandleRef.current;

    // A FileSystemFileHandle is bound to the file it was opened from — writing
    // to it always overwrites that file under its original name unless we
    // explicitly rename it. If the top-bar filename no longer matches the
    // name the handle points at, the user has renamed it since opening/last
    // saving.
    const handleBaseName = handle ? handle.name.replace(/\.json$/i, "") : null;
    let renamed = handle && handleBaseName !== fileNameRef.current;

    // Try a silent rename first: FileSystemHandle.move() renames the file on
    // disk in place, no picker needed. Support is Chromium-only and fairly
    // recent, so feature-detect and fall back to Save As (below) if it's
    // missing or the call fails (permission revoked, file moved/deleted
    // externally, etc.).
    if (renamed && typeof handle.move === "function") {
      try {
        await handle.move(fileNameRef.current + ".json");
        renamed = false; // handle now matches the new name — proceed to a normal save
      } catch {
        // Unsupported in this state, or the call failed — fall through to Save As.
      }
    }

    if (handle && !renamed) {
      try {
        const writable = await handle.createWritable();
        await writable.write(json);
        await writable.close();
        dirtyRef.current = false;
        return;
      } catch (err) {
        if (err.name === "AbortError") return;
        setSaveError("File not found or inaccessible. Use Save As to choose a new location.");
        setTimeout(() => setSaveError(null), 4000);
        return;
      }
    }

    if (window.showSaveFilePicker) {
      try {
        const newHandle = await window.showSaveFilePicker({
          suggestedName: fileNameRef.current + ".json",
          types: [{ description: "Gridmark JSON", accept: { "application/json": [".json"] } }],
        });
        const writable = await newHandle.createWritable();
        await writable.write(json);
        await writable.close();
        fileHandleRef.current = newHandle;
        setFileName(newHandle.name.replace(/\.json$/i, ""));
        dirtyRef.current = false;
      } catch (err) {
        if (err.name === "AbortError") return;
        setSaveError("Save failed: " + err.message);
        setTimeout(() => setSaveError(null), 4000);
      }
    } else {
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileNameRef.current + ".json";
      a.click();
      URL.revokeObjectURL(url);
      dirtyRef.current = false;
    }
  }, [buildGridmarkJson]);

  // ── Local folder browser ────────────────────────────────────────────────

  // Walks a FileSystemDirectoryHandle into the same { __files: [...], sub: {...} }
  // shape as svgTree/customDirectoryTree, so DirectoryPanel-style TreeNode
  // logic can be reused/mirrored. Only .json files are listed (Gridmark's
  // own export format) — file contents aren't read here, just the handle,
  // so opening a large folder stays cheap.
  const buildFolderTree = useCallback(async (dirHandle) => {
    const tree = { __files: [] };
    for await (const entry of dirHandle.values()) {
      if (entry.kind === "directory") {
        tree[entry.name] = await buildFolderTree(entry);
      } else if (entry.kind === "file" && entry.name.toLowerCase().endsWith(".json")) {
        const id = `dirFile_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        tree.__files.push({ id, name: entry.name, handle: entry });
      }
    }
    return tree;
  }, []);

  const openFolder = useCallback(async () => {
    if (!fileSystemApiSupported) return;
    try {
      const dirHandle = await window.showDirectoryPicker();
      const tree = await buildFolderTree(dirHandle);
      rootDirHandleRef.current = dirHandle;
      setFolderTree(tree);
      setFolderName(dirHandle.name);
      setOpenFileId(null);
      setFolderError("");
    } catch (err) {
      if (err.name === "AbortError") return; // user cancelled the picker
      setFolderError("Couldn't open that folder: " + err.message);
    }
  }, [fileSystemApiSupported, buildFolderTree]);

  const closeFolder = useCallback(() => {
    rootDirHandleRef.current = null;
    setFolderTree(null);
    setFolderName("");
    setOpenFileId(null);
    setFolderError("");
  }, []);

  // Opens a file picked from the folder tree onto the grid. Reuses
  // importGridmark exactly like TopBar's File → Open — passing the file's
  // own handle means saveGridmark() will write straight back to it
  // afterwards, same as a file opened via the native picker.
  const openFileFromTree = useCallback(async (fileEntry) => {
    if (dirtyRef.current) {
      const proceed = window.confirm(
        "You have unsaved changes. Opening this file will discard them. Continue?"
      );
      if (!proceed) return;
    }
    try {
      const file = await fileEntry.handle.getFile();
      const text = await file.text();
      importGridmark(text, fileEntry.handle);
      setOpenFileId(fileEntry.id);
      setFolderError("");
    } catch (err) {
      setFolderError("Couldn't open that file: " + err.message);
    }
  }, [importGridmark]);

  // ═══════════════════════════════════════════════════════════════════════════
  // COPY / PASTE
  // ═══════════════════════════════════════════════════════════════════════════

  const copySelected = useCallback(() => {
    if (!selected.size) {
      setClipboard(null);
      return;
    }
    let maxR = -Infinity,
      minC = Infinity;
    for (const key of selected) {
      const { r, c } = parseKey(key);
      if (r > maxR) maxR = r;
      if (c < minC) minC = c;
    }
    const seenRoots = new Set();
    const entries = [];
    for (const key of selected) {
      const cell = cells.get(key);
      if (!cell) continue;
      // Color-only cell (no symbol) — copy its color directly
      if (!cell.symbolId) {
        if (cell.color) {
          const { r, c } = parseKey(key);
          entries.push({ dr: r - maxR, dc: c - minC, symbolId: null, spanWidth: 1, color: cell.color });
        }
        continue;
      }
      const rk = resolveRoot(cells, key);
      if (!rk || seenRoots.has(rk)) continue;
      seenRoots.add(rk);
      const rc = cells.get(rk);
      const { r: rr, c: rcol } = parseKey(rk);
      entries.push({
        dr: rr - maxR,
        dc: rcol - minC,
        symbolId: rc.symbolId,
        spanWidth: rc.spanWidth,
        color: rc.color,
      });
    }
    setClipboard({ entries });
  }, [selected, cells]);

  const paste = useCallback(() => {
    if (!clipboard || !selected.size) return;
    let maxR = -Infinity,
      minC = Infinity;
    for (const key of selected) {
      const { r, c } = parseKey(key);
      if (r > maxR) maxR = r;
      if (c < minC) minC = c;
    }
    setCells((prev) => {
      pushHistory(prev);
      const next = cloneCells(prev);
      for (const { dr, dc, symbolId, spanWidth, color } of clipboard.entries) {
        const nr = maxR + dr,
          nc = minC + dc;
        if (nr < 0 || nr >= gridRowsRef.current || nc < 0 || nc >= gridColsRef.current) continue;

        // Color-only cell (no symbol) — just set/overwrite the color
        if (!symbolId) {
          if (color) {
            removeSpanContaining(next, cellKey(nr, nc));
            next.set(cellKey(nr, nc), { color });
          }
          continue;
        }

        for (let i = 0; i < spanWidth; i++)
          removeSpanContaining(next, cellKey(nr, nc + i));
        for (let i = 0; i < spanWidth; i++) {
          if (nc + i >= gridColsRef.current) continue;
          const nk = cellKey(nr, nc + i);
          if (i === 0) next.set(nk, { symbolId, spanWidth, ...(color && { color }) });
          else next.set(nk, { symbolId, spanWidth: 0, spanRoot: cellKey(nr, nc), ...(color && { color }) });
        }
      }
      return next;
    });
  }, [clipboard, selected, pushHistory]);

  // ═══════════════════════════════════════════════════════════════════════════
  // COPY / PASTE COLOR
  // ═══════════════════════════════════════════════════════════════════════════
  // Same offset-from-bounding-box shape as the full clipboard above, but
  // captures only color, into its own clipboard slot. Pasting color leaves
  // whatever symbol already occupies the destination untouched — it only
  // ever updates (or adds/removes) the color on top of it.

  const copySelectedColor = useCallback(() => {
    if (!selected.size) { setColorClipboard(null); return; }
    let maxR = -Infinity,
      minC = Infinity;
    for (const key of selected) {
      const { r, c } = parseKey(key);
      if (r > maxR) maxR = r;
      if (c < minC) minC = c;
    }
    const seenRoots = new Set();
    const entries = [];
    for (const key of selected) {
      const cell = cells.get(key);
      if (!cell) continue;
      if (!cell.symbolId) {
        if (cell.color) {
          const { r, c } = parseKey(key);
          entries.push({ dr: r - maxR, dc: c - minC, color: cell.color });
        }
        continue;
      }
      const rk = resolveRoot(cells, key);
      if (!rk || seenRoots.has(rk)) continue;
      seenRoots.add(rk);
      const rc = cells.get(rk);
      if (!rc.color) continue;
      const { r: rr, c: rcol } = parseKey(rk);
      entries.push({ dr: rr - maxR, dc: rcol - minC, color: rc.color });
    }
    setColorClipboard(entries.length ? { entries } : null);
  }, [selected, cells]);

  const pasteColor = useCallback(() => {
    if (!colorClipboard || !selected.size) return;
    let maxR = -Infinity,
      minC = Infinity;
    for (const key of selected) {
      const { r, c } = parseKey(key);
      if (r > maxR) maxR = r;
      if (c < minC) minC = c;
    }
    setCells((prev) => {
      pushHistory(prev);
      const next = cloneCells(prev);
      for (const { dr, dc, color } of colorClipboard.entries) {
        const nr = maxR + dr,
          nc = minC + dc;
        if (nr < 0 || nr >= gridRowsRef.current || nc < 0 || nc >= gridColsRef.current) continue;
        const nk = cellKey(nr, nc);
        const existing = next.get(nk);
        if (existing && existing.symbolId) {
          // A symbol already occupies this cell (possibly a span
          // continuation) — update the root's color, leaving the symbol/
          // span structure untouched.
          if (existing.spanWidth === 0 && existing.spanRoot) {
            const root = next.get(existing.spanRoot);
            if (root) next.set(existing.spanRoot, { ...root, color });
          } else {
            next.set(nk, { ...existing, color });
          }
        } else {
          next.set(nk, { color });
        }
      }
      return next;
    });
  }, [colorClipboard, selected, pushHistory]);

  // ═══════════════════════════════════════════════════════════════════════════
  // COPY / PASTE SYMBOL
  // ═══════════════════════════════════════════════════════════════════════════
  // Same offset-from-bounding-box shape again, capturing only symbolId/
  // spanWidth into its own clipboard slot. Pasting a symbol preserves
  // whatever color already sits at the destination (resolved through a
  // span root if needed) rather than clearing it.

  const copySelectedSymbol = useCallback(() => {
    if (!selected.size) { setSymbolClipboard(null); return; }
    let maxR = -Infinity,
      minC = Infinity;
    for (const key of selected) {
      const { r, c } = parseKey(key);
      if (r > maxR) maxR = r;
      if (c < minC) minC = c;
    }
    const seenRoots = new Set();
    const entries = [];
    for (const key of selected) {
      const cell = cells.get(key);
      if (!cell || !cell.symbolId) continue;
      const rk = resolveRoot(cells, key);
      if (!rk || seenRoots.has(rk)) continue;
      seenRoots.add(rk);
      const rc = cells.get(rk);
      const { r: rr, c: rcol } = parseKey(rk);
      entries.push({ dr: rr - maxR, dc: rcol - minC, symbolId: rc.symbolId, spanWidth: rc.spanWidth });
    }
    setSymbolClipboard(entries.length ? { entries } : null);
  }, [selected, cells]);

  const pasteSymbol = useCallback(() => {
    if (!symbolClipboard || !selected.size) return;
    let maxR = -Infinity,
      minC = Infinity;
    for (const key of selected) {
      const { r, c } = parseKey(key);
      if (r > maxR) maxR = r;
      if (c < minC) minC = c;
    }
    setCells((prev) => {
      pushHistory(prev);
      const next = cloneCells(prev);
      for (const { dr, dc, symbolId, spanWidth } of symbolClipboard.entries) {
        const nr = maxR + dr,
          nc = minC + dc;
        if (nr < 0 || nr >= gridRowsRef.current || nc < 0 || nc >= gridColsRef.current) continue;

        // Preserve whatever color already lives at the landing cell
        // (resolved through a span root if the destination is itself a
        // continuation) before the old span there gets cleared out.
        const landingKey = cellKey(nr, nc);
        const existingAtLanding = next.get(landingKey);
        let existingColor;
        if (existingAtLanding) {
          existingColor = existingAtLanding.spanWidth === 0 && existingAtLanding.spanRoot
            ? next.get(existingAtLanding.spanRoot)?.color
            : existingAtLanding.color;
        }

        for (let i = 0; i < spanWidth; i++)
          removeSpanContaining(next, cellKey(nr, nc + i));
        for (let i = 0; i < spanWidth; i++) {
          if (nc + i >= gridColsRef.current) continue;
          const nk = cellKey(nr, nc + i);
          if (i === 0) next.set(nk, { symbolId, spanWidth, ...(existingColor && { color: existingColor }) });
          else next.set(nk, { symbolId, spanWidth: 0, spanRoot: cellKey(nr, nc), ...(existingColor && { color: existingColor }) });
        }
      }
      return next;
    });
  }, [symbolClipboard, selected, pushHistory]);

  // ═══════════════════════════════════════════════════════════════════════════
  // GROUPS (Sidebar "Groups" folder)
  // ═══════════════════════════════════════════════════════════════════════════
  // Same capture shape as copySelected's clipboard.entries (symbolId +
  // spanWidth + color, resolved through resolveRoot so a symbol that's only
  // partially covered by the selection is still saved in full) — but pushed
  // into a persistent, named `groups` list instead of the transient
  // clipboard, so it survives after the selection changes and can be
  // pasted again later.

  const saveGroup = useCallback(() => {
    if (!selected.size) return;
    let maxR = -Infinity,
      minC = Infinity;
    for (const key of selected) {
      const { r, c } = parseKey(key);
      if (r > maxR) maxR = r;
      if (c < minC) minC = c;
    }
    const seenRoots = new Set();
    const entries = [];
    for (const key of selected) {
      const cell = cells.get(key);
      if (!cell) continue;
      // Color-only cell (no symbol) — save its color directly
      if (!cell.symbolId) {
        if (cell.color) {
          const { r, c } = parseKey(key);
          entries.push({ dr: r - maxR, dc: c - minC, symbolId: null, spanWidth: 1, color: cell.color });
        }
        continue;
      }
      // Resolve to the span's root so a symbol only partially covered by
      // the selection is still saved whole, and only once.
      const rk = resolveRoot(cells, key);
      if (!rk || seenRoots.has(rk)) continue;
      seenRoots.add(rk);
      const rc = cells.get(rk);
      const { r: rr, c: rcol } = parseKey(rk);
      entries.push({
        dr: rr - maxR,
        dc: rcol - minC,
        symbolId: rc.symbolId,
        spanWidth: rc.spanWidth,
        color: rc.color,
      });
    }
    if (!entries.length) return;
    setGroups((prev) => [
      ...prev,
      { id: `group-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: "group", entries },
    ]);
  }, [selected, cells]);

  const pasteGroupAtSelection = useCallback((groupId) => {
    const group = groups.find((g) => g.id === groupId);
    if (!group || !selected.size) return;

    let maxR = -Infinity,
      minC = Infinity;
    for (const key of selected) {
      const { r, c } = parseKey(key);
      if (r > maxR) maxR = r;
      if (c < minC) minC = c;
    }

    setCells((prev) => {
      pushHistory(prev);
      const next = cloneCells(prev);
      for (const { dr, dc, symbolId, spanWidth, color } of group.entries) {
        const nr = maxR + dr,
          nc = minC + dc;
        if (nr < 0 || nr >= gridRowsRef.current || nc < 0 || nc >= gridColsRef.current) continue;

        if (!symbolId) {
          if (color) {
            removeSpanContaining(next, cellKey(nr, nc));
            next.set(cellKey(nr, nc), { color });
          }
          continue;
        }

        for (let i = 0; i < spanWidth; i++)
          removeSpanContaining(next, cellKey(nr, nc + i));
        for (let i = 0; i < spanWidth; i++) {
          if (nc + i >= gridColsRef.current) continue;
          const nk = cellKey(nr, nc + i);
          if (i === 0) next.set(nk, { symbolId, spanWidth, ...(color && { color }) });
          else next.set(nk, { symbolId, spanWidth: 0, spanRoot: cellKey(nr, nc), ...(color && { color }) });
        }
      }
      return next;
    });
  }, [groups, selected, pushHistory]);

  const deleteGroup = useCallback((groupId) => {
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
  }, []);

  const renameGroup = useCallback((groupId, name) => {
    setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, name: name || "group" } : g)));
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // CUT SYMBOL
  // ═══════════════════════════════════════════════════════════════════════════
  // Removes just the symbol from selected cells, keeping color intact —
  // the inverse of Cut Color. For a multi-column symbol, the continuation
  // cells are dropped (they only existed because of the symbol); the root
  // becomes a bare color cell if it had a color, or is removed entirely
  // if it didn't.

  const cutSelectedSymbols = useCallback(() => {
    if (bgImageEditingRef.current) return;
    setCells((prev) => {
      const targets = new Set();
      for (const key of selected) {
        const cell = prev.get(key);
        if (!cell) continue;
        if (cell.spanWidth === 0 && cell.spanRoot) targets.add(cell.spanRoot);
        else targets.add(key);
      }
      let anySymbol = false;
      for (const key of targets) {
        if (prev.get(key)?.symbolId) { anySymbol = true; break; }
      }
      if (!anySymbol) return prev;
      pushHistory(prev);
      const next = cloneCells(prev);
      for (const key of targets) {
        const cell = next.get(key);
        if (!cell || !cell.symbolId) continue;
        const { r, c } = parseKey(key);
        for (let i = 1; i < cell.spanWidth; i++) next.delete(cellKey(r, c + i));
        if (cell.color) next.set(key, { color: cell.color });
        else next.delete(key);
      }
      return next;
    });
  }, [selected, pushHistory]);

  // ═══════════════════════════════════════════════════════════════════════════
  // MIRROR SELECTION
  // ═══════════════════════════════════════════════════════════════════════════
  // Reflects the currently-selected cells across the near edge of their
  // bounding box, placing the mirrored copy adjacent to the original in the
  // given direction. If the grid isn't big enough to hold the mirrored copy,
  // just enough rows/columns are inserted in that direction first (existing
  // cells are shifted, same as insertRowBefore/insertColumnsBefore etc).

  const mirrorSelection = useCallback((direction) => {
    if (!selected.size || bgImageEditingRef.current) return;

    // Bounding box of the selection (by cell, not by symbol root — mirroring
    // operates on whatever's selected, same granularity as copy/paste).
    let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
    for (const key of selected) {
      const { r, c } = parseKey(key);
      if (r < minR) minR = r;
      if (r > maxR) maxR = r;
      if (c < minC) minC = c;
      if (c > maxC) maxC = c;
    }

    // For each selected key, resolve to its root (symbol cells dedup'd by
    // root, color-only cells stand alone) and snapshot what needs to be
    // mirrored, same shape as copySelected's clipboard entries but keyed by
    // absolute position rather than offset from a corner.
    const seenRoots = new Set();
    const entries = []; // { r, c, symbolId, spanWidth, color }
    for (const key of selected) {
      const cell = cells.get(key);
      if (!cell) continue;
      if (!cell.symbolId) {
        if (cell.color) {
          const { r, c } = parseKey(key);
          entries.push({ r, c, symbolId: null, spanWidth: 1, color: cell.color });
        }
        continue;
      }
      const rk = resolveRoot(cells, key);
      if (!rk || seenRoots.has(rk)) continue;
      seenRoots.add(rk);
      const rc = cells.get(rk);
      const { r: rr, c: rcol } = parseKey(rk);
      entries.push({ r: rr, c: rcol, symbolId: rc.symbolId, spanWidth: rc.spanWidth, color: rc.color });
    }
    if (!entries.length) return;

    // Map each entry's root cell to its mirrored position. Mirroring reflects
    // across the near edge of the bounding box, so the copy sits flush
    // against the original on the chosen side. Span symbols are mirrored as
    // a whole block (their internal cell order isn't flipped).
    const mapEntry = (entry) => {
      const { r, c, spanWidth } = entry;
      if (direction === "up") return { r: minR - 1 - (r - minR), c };
      if (direction === "down") return { r: maxR + 1 + (maxR - r), c };
      const spanEndC = c + spanWidth - 1;
      if (direction === "left") return { r, c: minC - 1 - (maxC - spanEndC) - (spanWidth - 1) };
      // direction === "right"
      return { r, c: maxC + 1 + (maxC - c) - (spanWidth - 1) };
    };

    // Compute how far outside the current grid the mirrored copy lands, so
    // we know whether/how much to grow the grid, and in which direction.
    let neededRowsBefore = 0, neededRowsAfter = 0;
    let neededColsBefore = 0, neededColsAfter = 0;
    const mapped = entries.map((entry) => {
      const dest = mapEntry(entry);
      const destEndC = dest.c + entry.spanWidth - 1;
      if (-dest.r > neededRowsBefore) neededRowsBefore = -dest.r;
      if (dest.r > gridRowsRef.current - 1 + neededRowsAfter) {
        neededRowsAfter = dest.r - (gridRowsRef.current - 1);
      }
      if (-dest.c > neededColsBefore) neededColsBefore = -dest.c;
      if (destEndC > gridColsRef.current - 1 + neededColsAfter) {
        neededColsAfter = destEndC - (gridColsRef.current - 1);
      }
      return { ...entry, dest };
    });

    const growingCols = direction === "left" || direction === "right";
    const growBefore = growingCols ? neededColsBefore : neededRowsBefore;
    const growAfter = growingCols ? neededColsAfter : neededRowsAfter;

    setCells((prev) => {
      pushHistory(prev);

      // Step 1: if growing "before" (up/left), shift every existing cell by
      // growBefore along the relevant axis, same as
      // insertRowBefore/insertColumnsBefore.
      let next;
      if (growBefore > 0) {
        next = new Map();
        for (const [key, cell] of prev) {
          const { r, c } = parseKey(key);
          const newR = growingCols ? r : r + growBefore;
          const newC = growingCols ? c + growBefore : c;
          const newKey = cellKey(newR, newC);
          if (cell.spanWidth === 0) {
            // Span child — its spanRoot key needs to shift too.
            const { r: rr, c: rc } = parseKey(cell.spanRoot);
            next.set(newKey, {
              ...cell,
              spanRoot: cellKey(growingCols ? rr : rr + growBefore, growingCols ? rc + growBefore : rc),
            });
          } else {
            next.set(newKey, { ...cell });
          }
        }
      } else {
        next = cloneCells(prev);
      }

      const rowOffset = !growingCols ? growBefore : 0;
      const colOffset = growingCols ? growBefore : 0;

      // Step 2: place the mirrored entries (in shifted coordinates).
      for (const { dest, symbolId, spanWidth, color } of mapped) {
        const nr = dest.r + rowOffset;
        const nc = dest.c + colOffset;

        if (!symbolId) {
          if (color) {
            removeSpanContaining(next, cellKey(nr, nc));
            next.set(cellKey(nr, nc), { color });
          }
          continue;
        }

        for (let i = 0; i < spanWidth; i++) removeSpanContaining(next, cellKey(nr, nc + i));
        for (let i = 0; i < spanWidth; i++) {
          const nk = cellKey(nr, nc + i);
          if (i === 0) next.set(nk, { symbolId, spanWidth, ...(color && { color }) });
          else next.set(nk, { symbolId, spanWidth: 0, spanRoot: cellKey(nr, nc), ...(color && { color }) });
        }
      }

      return next;
    });

    // Step 3: grow grid dimensions and shift the live selection if we grew
    // "before" the original content (mirrors insertRowBefore/
    // insertColumnsBefore's selection-shifting behavior).
    if (growBefore > 0 || growAfter > 0) {
      if (growingCols) {
        setGridCols((prev) => prev + growBefore + growAfter);
      } else {
        setGridRows((prev) => prev + growBefore + growAfter);
      }
    }
    if (growBefore > 0) {
      const newSel = new Set();
      for (const key of selected) {
        const { r, c } = parseKey(key);
        newSel.add(cellKey(growingCols ? r : r + growBefore, growingCols ? c + growBefore : c));
      }
      setSelected(newSel);
    }
  }, [selected, cells, pushHistory]);

  const mirrorUp = useCallback(() => mirrorSelection("up"), [mirrorSelection]);
  const mirrorDown = useCallback(() => mirrorSelection("down"), [mirrorSelection]);
  const mirrorLeft = useCallback(() => mirrorSelection("left"), [mirrorSelection]);
  const mirrorRight = useCallback(() => mirrorSelection("right"), [mirrorSelection]);

  // ═══════════════════════════════════════════════════════════════════════════
  // FLIP SELECTION
  // ═══════════════════════════════════════════════════════════════════════════
  // Unlike mirror (which places a reflected copy adjacent to the original,
  // growing the grid if needed), flip reflects the selected cells in place
  // across the center of their own bounding box — no grid growth, and the
  // originals are replaced by the flipped result rather than duplicated.

  const flipSelection = useCallback((axis) => {
    if (!selected.size || bgImageEditingRef.current) return;

    // Bounding box of the selection (by cell, not by symbol root — same
    // granularity as mirror/copy/paste).
    let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
    for (const key of selected) {
      const { r, c } = parseKey(key);
      if (r < minR) minR = r;
      if (r > maxR) maxR = r;
      if (c < minC) minC = c;
      if (c > maxC) maxC = c;
    }

    // Resolve each selected key to its root (symbol cells dedup'd by root,
    // color-only cells stand alone), same as mirrorSelection.
    const seenRoots = new Set();
    const entries = []; // { r, c, symbolId, spanWidth, color }
    for (const key of selected) {
      const cell = cells.get(key);
      if (!cell) continue;
      if (!cell.symbolId) {
        if (cell.color) {
          const { r, c } = parseKey(key);
          entries.push({ r, c, symbolId: null, spanWidth: 1, color: cell.color });
        }
        continue;
      }
      const rk = resolveRoot(cells, key);
      if (!rk || seenRoots.has(rk)) continue;
      seenRoots.add(rk);
      const rc = cells.get(rk);
      const { r: rr, c: rcol } = parseKey(rk);
      entries.push({ r: rr, c: rcol, symbolId: rc.symbolId, spanWidth: rc.spanWidth, color: rc.color });
    }
    if (!entries.length) return;

    // Map each entry to its flipped position within the same bounding box.
    // Vertical flip reflects rows across the box's vertical center; symbols
    // have no vertical extent so this is a plain per-row mirror. Horizontal
    // flip reflects columns across the box's horizontal center; span symbols
    // move as a whole block (their internal cell order isn't reversed),
    // same convention as mirrorSelection.
    const mapEntry = (entry) => {
      const { r, c, spanWidth } = entry;
      if (axis === "vertical") return { r: minR + maxR - r, c };
      const spanEndC = c + spanWidth - 1;
      return { r, c: minC + maxC - spanEndC };
    };

    setCells((prev) => {
      pushHistory(prev);
      const next = cloneCells(prev);

      // Step 1: clear every cell the selection's entries currently occupy
      // (root + span children) so the flipped placement never collides with
      // leftover fragments of the pre-flip originals.
      for (const entry of entries) {
        for (let i = 0; i < entry.spanWidth; i++) {
          next.delete(cellKey(entry.r, entry.c + i));
        }
      }

      // Step 2: write each entry at its flipped position.
      for (const entry of entries) {
        const dest = mapEntry(entry);
        const { symbolId, spanWidth, color } = entry;

        if (!symbolId) {
          if (color) {
            removeSpanContaining(next, cellKey(dest.r, dest.c));
            next.set(cellKey(dest.r, dest.c), { color });
          }
          continue;
        }

        for (let i = 0; i < spanWidth; i++) removeSpanContaining(next, cellKey(dest.r, dest.c + i));
        for (let i = 0; i < spanWidth; i++) {
          const nk = cellKey(dest.r, dest.c + i);
          if (i === 0) next.set(nk, { symbolId, spanWidth, ...(color && { color }) });
          else next.set(nk, { symbolId, spanWidth: 0, spanRoot: cellKey(dest.r, dest.c), ...(color && { color }) });
        }
      }

      return next;
    });

    // Step 3: carry the selection along with the flipped content, so the
    // same visual cells stay highlighted (per-cell mirror across the box,
    // which — as with the span math above — agrees with the root-level
    // mapping for every cell of a span, not just its start).
    setSelected((prevSel) => {
      const newSel = new Set();
      for (const key of prevSel) {
        const { r, c } = parseKey(key);
        const nr = axis === "vertical" ? minR + maxR - r : r;
        const nc = axis === "horizontal" ? minC + maxC - c : c;
        newSel.add(cellKey(nr, nc));
      }
      return newSel;
    });
  }, [selected, cells, pushHistory]);

  const flipHorizontal = useCallback(() => flipSelection("horizontal"), [flipSelection]);
  const flipVertical = useCallback(() => flipSelection("vertical"), [flipSelection]);

  // ═══════════════════════════════════════════════════════════════════════════
  // SVG UPLOAD (add-symbol form)
  // ═══════════════════════════════════════════════════════════════════════════

  const handleSvgFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".svg") && file.type !== "image/svg+xml") {
      setAddError("Please upload a .svg file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target.result;
      setNewSymSvg({ name: file.name.replace(/\.svg$/i, ""), content });
      setNewSymName((prev) => prev || file.name.replace(/\.svg$/i, ""));
      setAddError("");
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const addSymbol = () => {
    if (!newSymSvg) {
      setAddError("Please upload an SVG file first.");
      return;
    }
    const name = newSymName.trim() || newSymSvg.name || "Symbol";
    const w = parseInt(newSymWidth, 10);
    if (!w || w < 1 || w > 20) {
      setAddError("Width must be 1–20.");
      return;
    }
    const id = `custom_${Date.now()}`;
    setSymbols((prev) => [...prev, { id, name, width: w, svgContent: newSymSvg.content }]);
    setNewSymSvg(null);
    setNewSymName("");
    setNewSymWidth(1);
    setAddError("");
  };

  const deleteSymbol = (id) => setSymbols((prev) => prev.filter((s) => s.id !== id));

  // ═══════════════════════════════════════════════════════════════════════════
  // EDIT EXISTING SYMBOL
  // ═══════════════════════════════════════════════════════════════════════════

  const startEditSymbol = (sym) => {
    setEditingSymbolId(sym.id);
    setEditSymName(sym.name);
    setEditSymWidth(sym.width);
  };

  const saveEditSymbol = () => {
    if (!editingSymbolId) return;
    const name = editSymName.trim();
    const w = parseInt(editSymWidth, 10);
    if (!name) return;
    if (!w || w < 1 || w > 20) return;
    setSymbols((prev) =>
      prev.map((s) => (s.id === editingSymbolId ? { ...s, name, width: w } : s))
    );
    setEditingSymbolId(null);
    setEditSymName("");
    setEditSymWidth(1);
  };

  const cancelEditSymbol = () => {
    setEditingSymbolId(null);
    setEditSymName("");
    setEditSymWidth(1);
  };

  const reorderSymbols = (fromIndex, toIndex) => {
  setSymbols(prev => {
    const next = [...prev];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return next;
  });
};

  // ═══════════════════════════════════════════════════════════════════════════
  // DIRECTORY
  // ═══════════════════════════════════════════════════════════════════════════

  const handleDirSvgUpload = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    for (const file of files) {
      if (!file.name.endsWith(".svg") && file.type !== "image/svg+xml") continue;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const content = ev.target.result;
        const name = file.name
          .replace(/\.svg$/i, "")
          .replace(/[-_]+/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());
        const id = `dirCustom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const vbMatch = content.match(/viewBox\s*=\s*["']([^"']+)["']/);
        let defaultWidth = 1;
        if (vbMatch) {
          const parts = vbMatch[1].trim().split(/[\s,]+/).map(Number);
          if (parts.length >= 4 && parts[3] > 0) {
            defaultWidth = Math.max(1, Math.min(20, Math.round(parts[2] / parts[3])));
          }
        }
        const item = { id, name, svgContent: content, defaultWidth, pathLabel: "Uploaded", fileName: file.name };
        setCustomDirectoryTree((prev) => ({
          ...prev,
          __files: [...prev.__files, item],
        }));
      };
      reader.readAsText(file);
    }
    e.target.value = "";
  };

  const addFromDirectory = (dirItem) => {
    const exists = symbols.some((s) => s.svgContent === dirItem.svgContent);
    if (exists) return;
    const id = `fromDir_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setSymbols((prev) => [
      ...prev,
      { id, name: dirItem.name, width: dirItem.defaultWidth, svgContent: dirItem.svgContent },
    ]);
  };

  const removeFromDirectory = (dirId) => {
    const removeFromNode = (node) => {
      const newNode = { ...node, __files: node.__files.filter((f) => f.id !== dirId) };
      for (const key of Object.keys(node)) {
        if (key === "__files") continue;
        newNode[key] = removeFromNode(node[key]);
      }
      return newNode;
    };
    setCustomDirectoryTree((prev) => removeFromNode(prev));
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // GRID DIMENSION MANIPULATION
  // ═══════════════════════════════════════════════════════════════════════════

  const addColumn = useCallback(() => {
    setCells((prev) => {
      pushHistory(prev);
      const next = new Map();
      for (const [key, cell] of prev) {
        if (cell.spanWidth === 0) continue;
        const { r, c } = parseKey(key);
        const newC = c + 1;
        const newKey = cellKey(r, newC);
        next.set(newKey, { symbolId: cell.symbolId, spanWidth: cell.spanWidth });
        for (let i = 1; i < cell.spanWidth; i++) {
          next.set(cellKey(r, newC + i), { symbolId: cell.symbolId, spanWidth: 0, spanRoot: newKey });
        }
      }
      return next;
    });
    setGridCols((prev) => prev + 1);
  }, [pushHistory]);

  const addRow = useCallback(() => {
    setCells((prev) => {
      pushHistory(prev);
      const next = new Map();
      for (const [key, cell] of prev) {
        if (cell.spanWidth === 0) continue;
        const { r, c } = parseKey(key);
        const newR = r + 1;
        const newKey = cellKey(newR, c);
        next.set(newKey, { symbolId: cell.symbolId, spanWidth: cell.spanWidth });
        for (let i = 1; i < cell.spanWidth; i++) {
          next.set(cellKey(newR, c + i), { symbolId: cell.symbolId, spanWidth: 0, spanRoot: newKey });
        }
      }
      return next;
    });
    setGridRows((prev) => prev + 1);
  }, [pushHistory]);

  const insertColumnsBefore = useCallback(() => {
    if (!selected.size) return;
    const selCols = new Set();
    for (const key of selected) { selCols.add(parseKey(key).c); }
    const sortedSelCols = [...selCols].sort((a, b) => a - b);
    const insertAt = sortedSelCols[0];
    const count = sortedSelCols.length;

    setCells((prev) => {
      pushHistory(prev);
      const next = new Map();
      for (const [key, cell] of prev) {
        if (cell.spanWidth === 0) continue;
        const { r, c } = parseKey(key);
        const spanEnd = c + cell.spanWidth - 1;
        if (spanEnd < insertAt) {
          next.set(key, { symbolId: cell.symbolId, spanWidth: cell.spanWidth });
          for (let i = 1; i < cell.spanWidth; i++) {
            next.set(cellKey(r, c + i), { symbolId: cell.symbolId, spanWidth: 0, spanRoot: key });
          }
        } else {
          const newC = c + count;
          const newKey = cellKey(r, newC);
          next.set(newKey, { symbolId: cell.symbolId, spanWidth: cell.spanWidth });
          for (let i = 1; i < cell.spanWidth; i++) {
            next.set(cellKey(r, newC + i), { symbolId: cell.symbolId, spanWidth: 0, spanRoot: newKey });
          }
        }
      }
      return next;
    });

    const newSel = new Set();
    for (const key of selected) {
      const { r, c } = parseKey(key);
      newSel.add(cellKey(r, c >= insertAt ? c + count : c));
    }
    setSelected(newSel);
    setGridCols((prev) => prev + count);
  }, [selected, pushHistory]);

  const insertColumnsAfter = useCallback(() => {
    if (!selected.size) return;
    const selCols = new Set();
    for (const key of selected) { selCols.add(parseKey(key).c); }
    const sortedSelCols = [...selCols].sort((a, b) => a - b);
    const insertAfter = sortedSelCols[sortedSelCols.length - 1];
    const insertAt = insertAfter + 1;
    const count = sortedSelCols.length;

    setCells((prev) => {
      pushHistory(prev);
      const next = new Map();
      for (const [key, cell] of prev) {
        if (cell.spanWidth === 0) continue;
        const { r, c } = parseKey(key);
        if (c >= insertAt) {
          const newC = c + count;
          const newKey = cellKey(r, newC);
          next.set(newKey, { symbolId: cell.symbolId, spanWidth: cell.spanWidth });
          for (let i = 1; i < cell.spanWidth; i++) {
            next.set(cellKey(r, newC + i), { symbolId: cell.symbolId, spanWidth: 0, spanRoot: newKey });
          }
        } else {
          next.set(key, { symbolId: cell.symbolId, spanWidth: cell.spanWidth });
          for (let i = 1; i < cell.spanWidth; i++) {
            next.set(cellKey(r, c + i), { symbolId: cell.symbolId, spanWidth: 0, spanRoot: key });
          }
        }
      }
      return next;
    });

    const newSel = new Set();
    for (const key of selected) {
      const { r, c } = parseKey(key);
      newSel.add(cellKey(r, c >= insertAt ? c + count : c));
    }
    setSelected(newSel);
    setGridCols((prev) => prev + count);
  }, [selected, pushHistory]);

  const insertRowBefore = useCallback(() => {
    if (!selected.size) return;
    let minSelRow = Infinity;
    let maxSelRow = -Infinity;
    for (const key of selected) {
      const r = parseKey(key).r;
      if (r < minSelRow) minSelRow = r;
      if (r > maxSelRow) maxSelRow = r;
    }
    const numRows = maxSelRow - minSelRow + 1;
    const insertAt = minSelRow;

    setCells((prev) => {
      pushHistory(prev);
      const next = new Map();
      for (const [key, cell] of prev) {
        if (cell.spanWidth === 0) continue;
        const { r, c } = parseKey(key);
        if (r >= insertAt) {
          const newR = r + numRows;
          const newKey = cellKey(newR, c);
          next.set(newKey, { symbolId: cell.symbolId, spanWidth: cell.spanWidth });
          for (let i = 1; i < cell.spanWidth; i++) {
            next.set(cellKey(newR, c + i), { symbolId: cell.symbolId, spanWidth: 0, spanRoot: newKey });
          }
        } else {
          next.set(key, { symbolId: cell.symbolId, spanWidth: cell.spanWidth });
          for (let i = 1; i < cell.spanWidth; i++) {
            next.set(cellKey(r, c + i), { symbolId: cell.symbolId, spanWidth: 0, spanRoot: key });
          }
        }
      }
      return next;
    });

    const newSel = new Set();
    for (const key of selected) {
      const { r, c } = parseKey(key);
      newSel.add(cellKey(r >= insertAt ? r + numRows : r, c));
    }
    setSelected(newSel);
    setGridRows((prev) => prev + numRows);
  }, [selected, pushHistory]);

  const insertRowAfter = useCallback(() => {
    if (!selected.size) return;
    let minSelRow = Infinity;
    let maxSelRow = -Infinity;
    for (const key of selected) {
      const r = parseKey(key).r;
      if (r < minSelRow) minSelRow = r;
      if (r > maxSelRow) maxSelRow = r;
    }
    const numRows = maxSelRow - minSelRow + 1;
    const insertAt = maxSelRow + 1;

    setCells((prev) => {
      pushHistory(prev);
      const next = new Map();
      for (const [key, cell] of prev) {
        if (cell.spanWidth === 0) continue;
        const { r, c } = parseKey(key);
        if (r >= insertAt) {
          const newR = r + numRows;
          const newKey = cellKey(newR, c);
          next.set(newKey, { symbolId: cell.symbolId, spanWidth: cell.spanWidth });
          for (let i = 1; i < cell.spanWidth; i++) {
            next.set(cellKey(newR, c + i), { symbolId: cell.symbolId, spanWidth: 0, spanRoot: newKey });
          }
        } else {
          next.set(key, { symbolId: cell.symbolId, spanWidth: cell.spanWidth });
          for (let i = 1; i < cell.spanWidth; i++) {
            next.set(cellKey(r, c + i), { symbolId: cell.symbolId, spanWidth: 0, spanRoot: key });
          }
        }
      }
      return next;
    });

    const newSel = new Set();
    for (const key of selected) {
      const { r, c } = parseKey(key);
      newSel.add(cellKey(r >= insertAt ? r + numRows : r, c));
    }
    setSelected(newSel);
    setGridRows((prev) => prev + numRows);
  }, [selected, pushHistory]);

  const removeSelectedColumns = useCallback(() => {
    if (!selected.size) return;
    const colsToRemove = new Set();
    for (const key of selected) {
      const { c } = parseKey(key);
      colsToRemove.add(c);
    }
    const sortedCols = [...colsToRemove].sort((a, b) => b - a);

    setCells((prev) => {
      pushHistory(prev);
      const next = new Map();
      for (const [key, cell] of prev) {
        const { r, c } = parseKey(key);
        if (colsToRemove.has(c)) continue;
        let shift = 0;
        for (const rc of sortedCols) {
          if (rc < c) shift++;
        }
        const newC = c - shift;
        const newKey = cellKey(r, newC);
        if (cell.spanWidth >= 1) {
          let newSpan = 0;
          for (let i = 0; i < cell.spanWidth; i++) {
            if (!colsToRemove.has(c + i)) newSpan++;
          }
          if (newSpan > 0) {
            next.set(newKey, { symbolId: cell.symbolId, spanWidth: newSpan });
            for (let i = 1; i < newSpan; i++) {
              next.set(cellKey(r, newC + i), { symbolId: cell.symbolId, spanWidth: 0, spanRoot: newKey });
            }
          }
        }
      }
      return next;
    });

    setGridCols((prev) => Math.max(1, prev - sortedCols.length));
    setSelected(new Set());
  }, [selected, pushHistory]);

  const removeSelectedRows = useCallback(() => {
    if (!selected.size) return;
    const rowsToRemove = new Set();
    for (const key of selected) {
      const { r } = parseKey(key);
      rowsToRemove.add(r);
    }
    const sortedRows = [...rowsToRemove].sort((a, b) => b - a);

    setCells((prev) => {
      pushHistory(prev);
      const next = new Map();
      for (const [key, cell] of prev) {
        const { r, c } = parseKey(key);
        if (rowsToRemove.has(r)) continue;
        let shift = 0;
        for (const rr of sortedRows) {
          if (rr < r) shift++;
        }
        const newR = r - shift;
        const newKey = cellKey(newR, c);
        if (cell.spanWidth >= 1) {
          next.set(newKey, { symbolId: cell.symbolId, spanWidth: cell.spanWidth });
          for (let i = 1; i < cell.spanWidth; i++) {
            next.set(cellKey(newR, c + i), { symbolId: cell.symbolId, spanWidth: 0, spanRoot: newKey });
          }
        }
      }
      return next;
    });

    setGridRows((prev) => Math.max(1, prev - sortedRows.length));
    setSelected(new Set());
  }, [selected, pushHistory]);

  // ═══════════════════════════════════════════════════════════════════════════
  // BACKGROUND IMAGE
  // ═══════════════════════════════════════════════════════════════════════════

  const handleBgImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const currentCsW = csWRef.current;
        const currentCsH = csHRef.current;
        const cellH = 15;
        // Convert image pixel ratio to cell units, accounting for non-square cells.
        // Target pixel size: cellH * csH tall, then width = height * imgRatio.
        // Back-convert width to cell units: cellW = pxW / csW.
        const cellW = cellH * (currentCsH / currentCsW) * (img.width / img.height);
        setBgImage({
          src: ev.target.result,
          col: 2, row: 2,
          cellW, cellH,
          naturalW: img.width,
          naturalH: img.height,
          opacity: 0.5,
        });
        setBgImageEditing(true);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const bgImageRef = useRef(bgImage);
  bgImageRef.current = bgImage;
  const csWRef = useRef(csW);
  csWRef.current = csW;
  const csHRef = useRef(csH);
  csHRef.current = csH;

  const bgImageStartDrag = useCallback((e, type) => {
    e.stopPropagation();
    e.preventDefault();
    const bg = bgImageRef.current;
    const currentCsW = csWRef.current;
    const currentCsH = csHRef.current;
    bgDragState.current = {
      startMx: e.clientX, startMy: e.clientY,
      startCol: bg?.col || 0, startRow: bg?.row || 0,
      startCellW: bg?.cellW || 10, startCellH: bg?.cellH || 10,
      type, csW: currentCsW, csH: currentCsH,
    };
    const onMove = (me) => {
      if (!bgDragState.current) return;
      const ds = bgDragState.current;
      const dx = me.clientX - ds.startMx;
      const dy = me.clientY - ds.startMy;
      if (ds.type === "move") {
        setBgImage((prev) => prev ? {
          ...prev,
          col: ds.startCol + dx / ds.csW,
          row: ds.startRow + dy / ds.csH,
        } : prev);
      } else if (ds.type === "resize") {
        const aspect = ds.startCellW / ds.startCellH;
        const newCellW = Math.max(1, ds.startCellW + dx / ds.csW);
        const newCellH = newCellW / aspect;
        setBgImage((prev) => prev ? { ...prev, cellW: newCellW, cellH: newCellH } : prev);
      } else if (ds.type === "resize-tl") {
        const aspect = ds.startCellW / ds.startCellH;
        const newCellW = Math.max(1, ds.startCellW - dx / ds.csW);
        const newCellH = newCellW / aspect;
        setBgImage((prev) => prev ? {
          ...prev,
          cellW: newCellW, cellH: newCellH,
          col: ds.startCol + (ds.startCellW - newCellW),
          row: ds.startRow + (ds.startCellH - newCellH),
        } : prev);
      } else if (ds.type === "stretch-right") {
        const newCellW = Math.max(1, ds.startCellW + dx / ds.csW);
        setBgImage((prev) => prev ? { ...prev, cellW: newCellW } : prev);
      } else if (ds.type === "stretch-left") {
        const newCellW = Math.max(1, ds.startCellW - dx / ds.csW);
        setBgImage((prev) => prev ? {
          ...prev,
          cellW: newCellW,
          col: ds.startCol + (ds.startCellW - newCellW),
        } : prev);
      } else if (ds.type === "stretch-bottom") {
        const newCellH = Math.max(1, ds.startCellH + dy / ds.csH);
        setBgImage((prev) => prev ? { ...prev, cellH: newCellH } : prev);
      } else if (ds.type === "stretch-top") {
        const newCellH = Math.max(1, ds.startCellH - dy / ds.csH);
        setBgImage((prev) => prev ? {
          ...prev,
          cellH: newCellH,
          row: ds.startRow + (ds.startCellH - newCellH),
        } : prev);
      }
    };
    const onUp = () => {
      bgDragState.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

  const bgImageFix = useCallback(() => {
    setBgImageEditing(false);
  }, []);

  const bgImageEdit = useCallback(() => {
    setBgImageEditing(true);
  }, []);

  const bgImageRemove = useCallback(() => {
    setBgImage(null);
    setBgImageEditing(false);
  }, []);

  // Same pattern as bgImageStartDrag's move/resize updates: a direct, live
  // setBgImage on every slider event, no debounce and no history push —
  // background image placement/appearance isn't part of undo/redo, same as
  // its position and size.
  const setBgImageOpacity = useCallback((opacity) => {
    setBgImage((prev) => (prev ? { ...prev, opacity } : prev));
  }, []);

  // Bakes the background image into actual cell colors: for every grid
  // cell the image overlaps, samples the portion of the *original* image
  // (not the faded on-canvas preview) that falls under that cell and sets
  // the cell's color to the average of those pixels. Unlike position/
  // opacity, this is a real content edit, so it goes through pushHistory
  // like any other cell mutation and is undoable.
  const applyBgImageToColors = useCallback(async () => {
    const bg = bgImageRef.current;
    if (!bg || !bg.src || !bg.naturalW || !bg.naturalH) return;

    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Couldn't load the background image."));
      image.src = bg.src;
    }).catch((err) => {
      alert(err.message);
      return null;
    });
    if (!img) return;

    const canvas = document.createElement("canvas");
    canvas.width = bg.naturalW;
    canvas.height = bg.naturalH;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, bg.naturalW, bg.naturalH);
    let data;
    try {
      data = ctx.getImageData(0, 0, bg.naturalW, bg.naturalH).data;
    } catch (e) {
      alert("Couldn't read the background image's pixels: " + e.message);
      return;
    }

    // Grid cells the image's cell-space box [col, col+cellW) x [row, row+cellH)
    // actually overlaps, clipped to the current grid bounds.
    const rMin = Math.max(0, Math.floor(bg.row));
    const rMax = Math.min(gridRows - 1, Math.ceil(bg.row + bg.cellH) - 1);
    const cMin = Math.max(0, Math.floor(bg.col));
    const cMax = Math.min(gridCols - 1, Math.ceil(bg.col + bg.cellW) - 1);
    if (rMin > rMax || cMin > cMax) return; // image doesn't overlap the grid

    const pxPerCellX = bg.naturalW / bg.cellW;
    const pxPerCellY = bg.naturalH / bg.cellH;

    pushHistory(cells);
    const next = cloneCells(cells);

    for (let r = rMin; r <= rMax; r++) {
      for (let c = cMin; c <= cMax; c++) {
        // Overlap of this cell [c, c+1) x [r, r+1) with the image's box, in
        // the same cell-space units bg.col/row/cellW/cellH are stored in.
        const x0 = Math.max(c, bg.col);
        const x1 = Math.min(c + 1, bg.col + bg.cellW);
        const y0 = Math.max(r, bg.row);
        const y1 = Math.min(r + 1, bg.row + bg.cellH);
        if (x1 <= x0 || y1 <= y0) continue;

        // That overlap, mapped into the source image's pixel space.
        const px0 = Math.max(0, Math.floor((x0 - bg.col) * pxPerCellX));
        const px1 = Math.min(bg.naturalW, Math.ceil((x1 - bg.col) * pxPerCellX));
        const py0 = Math.max(0, Math.floor((y0 - bg.row) * pxPerCellY));
        const py1 = Math.min(bg.naturalH, Math.ceil((y1 - bg.row) * pxPerCellY));
        if (px1 <= px0 || py1 <= py0) continue;

        // Stride large regions so this stays fast on big images/grids —
        // ~24 samples per axis is plenty for an average color.
        const strideX = Math.max(1, Math.floor((px1 - px0) / 24));
        const strideY = Math.max(1, Math.floor((py1 - py0) / 24));
        let rSum = 0, gSum = 0, bSum = 0, count = 0;
        for (let py = py0; py < py1; py += strideY) {
          const rowOffset = py * bg.naturalW * 4;
          for (let px = px0; px < px1; px += strideX) {
            const i = rowOffset + px * 4;
            rSum += data[i]; gSum += data[i + 1]; bSum += data[i + 2];
            count++;
          }
        }
        if (count === 0) continue;
        const hex =
          "#" + [rSum, gSum, bSum]
            .map((sum) => Math.round(sum / count).toString(16).padStart(2, "0"))
            .join("");

        // Color lives on a symbol's root cell, not its continuation cells.
        const key = cellKey(r, c);
        const rootKey = resolveRoot(next, key) || key;
        const existing = next.get(rootKey);
        next.set(rootKey, { ...(existing || {}), color: hex });
      }
    }

    setCells(next);
  }, [cells, gridRows, gridCols]);

  // ═══════════════════════════════════════════════════════════════════════════
  // GUIDE LINES
  // ═══════════════════════════════════════════════════════════════════════════

  // Creation: click to start a guide line, click again to finish it — not a
  // press-and-hold drag. The first click fixes an anchor grid intersection
  // (row, col); the orientation isn't decided yet. As the cursor moves, we
  // compare how far it's moved horizontally vs. vertically from that fixed
  // anchor — farther horizontally means the line is (or becomes)
  // horizontal, farther vertically means vertical — exactly the same
  // "|dx| >= |dy|" test startGuideLineCapDrag uses to flip an existing
  // line's orientation, so drawing behaves consistently with editing: the
  // user can freely switch between a horizontal and vertical guide line
  // right up until the second click commits it. A pointermove listener
  // (independent of button state, since the button isn't held down between
  // the two clicks) drives this live preview; the *next* click — wherever
  // it lands — commits the line using that click's own position, rather
  // than starting a new one.
  //
  // Touch (and pen) input uses a different gesture: press-drag-release.
  // Pressing fixes the anchor, dragging live-previews the dotted line with
  // the same |dx| >= |dy| orientation test, and lifting the finger commits
  // it (a release under 1 grid unit from the anchor creates nothing). A
  // second finger landing mid-drag cancels creation and hands off to
  // pinch/pan via handlePointerGestureStart. Pressing on an existing guide
  // line never reaches this function — the line's own onPointerDown moves
  // it instead (see startGuideLineMove).
  const guideLineCreatePendingRef = useRef(null); // null | { anchorRow, anchorCol, onMove, onUp?, onCancel? }
  // True while an existing guide line's body or end cap is being dragged, so
  // a second finger landing elsewhere doesn't start a new line mid-drag.
  const guideLineDragActiveRef = useRef(false);

  // Removes whichever window listeners the pending creation registered.
  const removeGuideLineCreateListeners = (pending) => {
    window.removeEventListener("pointermove", pending.onMove);
    if (pending.onUp) window.removeEventListener("pointerup", pending.onUp);
    if (pending.onCancel) window.removeEventListener("pointercancel", pending.onCancel);
  };

  const startGuideLineCreate = useCallback((e) => {
    if (e.button !== 0) return;
    if (guideLineDragActiveRef.current) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    e.preventDefault();

    let pending = guideLineCreatePendingRef.current;
    const isDragGesture = e.pointerType === "touch" || e.pointerType === "pen";
    // A touch landing while a mouse two-click creation is waiting (or vice
    // versa) starts over rather than mixing the two gestures.
    if (pending && (isDragGesture || pending.onUp)) {
      removeGuideLineCreateListeners(pending);
      guideLineCreatePendingRef.current = null;
      pending = null;
    }

    // Shared by both the live-preview pointermove and the commit step: given
    // the fixed anchor and a client-space point, decide orientation via
    // the wedge/angle test and compute the resulting linePos/start/end.
    const resolve = (clientX, clientY, anchorRow, anchorCol) => {
      const anchorPxX = rect.left + offsetRef.current.x + anchorCol * csWRef.current;
      const anchorPxY = rect.top + offsetRef.current.y + anchorRow * csHRef.current;
      const dx = clientX - anchorPxX;
      const dy = clientY - anchorPxY;
      const orientation = Math.abs(dx) >= Math.abs(dy) ? "h" : "v";

      const fc = (clientX - rect.left - offsetRef.current.x) / csWRef.current;
      const fr = (clientY - rect.top - offsetRef.current.y) / csHRef.current;

      let linePos, fixedPerp, maxPerp, draggedRaw;
      if (orientation === "h") {
        linePos = anchorRow; maxPerp = gridColsRef.current; fixedPerp = clampInt(anchorCol, 0, maxPerp); draggedRaw = clampInt(fc, 0, maxPerp);
      } else {
        linePos = anchorCol; maxPerp = gridRowsRef.current; fixedPerp = clampInt(anchorRow, 0, maxPerp); draggedRaw = clampInt(fr, 0, maxPerp);
      }
      return { orientation, linePos, start: Math.min(fixedPerp, draggedRaw), end: Math.max(fixedPerp, draggedRaw) };
    };

    const commit = (clientX, clientY, anchorRow, anchorCol) => {
      const final = resolve(clientX, clientY, anchorRow, anchorCol);
      setGuideLineDraft(null);
      if (final.end - final.start >= 1) {
        const id = genGuideLineId();
        pushHistory(cellsRef.current);
        setGuideLines((prev) => [...prev, { id, ...final }]);
        setSelectedGuideLineId(id);
      }
    };

    if (!pending) {
      // First click / touch press: just fix the anchor intersection.
      const fc = (e.clientX - rect.left - offsetRef.current.x) / csWRef.current;
      const fr = (e.clientY - rect.top - offsetRef.current.y) / csHRef.current;
      const anchorRow = clampInt(fr, 0, gridRowsRef.current);
      const anchorCol = clampInt(fc, 0, gridColsRef.current);

      setSelectedGuideLineId(null);
      setGuideLineDraft({ id: null, orientation: "h", linePos: anchorRow, start: anchorCol, end: anchorCol });

      if (isDragGesture) {
        // Touch/pen: press-drag-release. Only this finger's events count.
        const pointerId = e.pointerId;
        const onMove = (me) => {
          if (me.pointerId !== pointerId) return;
          setGuideLineDraft({ id: null, ...resolve(me.clientX, me.clientY, anchorRow, anchorCol) });
        };
        const onUp = (ue) => {
          if (ue.pointerId !== pointerId) return;
          removeGuideLineCreateListeners({ onMove, onUp, onCancel });
          guideLineCreatePendingRef.current = null;
          commit(ue.clientX, ue.clientY, anchorRow, anchorCol);
        };
        const onCancel = (ce) => {
          if (ce.pointerId !== pointerId) return;
          removeGuideLineCreateListeners({ onMove, onUp, onCancel });
          guideLineCreatePendingRef.current = null;
          // The container never sees a pointerup for a cancelled pointer,
          // so drop it from the pinch tracker here.
          activePointers.current.delete(pointerId);
          setGuideLineDraft(null);
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onCancel);
        guideLineCreatePendingRef.current = { anchorRow, anchorCol, onMove, onUp, onCancel };
        return;
      }

      // Mouse: two-click flow. Nothing is held down between clicks, so the
      // move listener runs regardless of button state.
      const onMove = (me) => {
        if (me.pointerType && me.pointerType !== "mouse") return;
        setGuideLineDraft({ id: null, ...resolve(me.clientX, me.clientY, anchorRow, anchorCol) });
      };
      window.addEventListener("pointermove", onMove);
      guideLineCreatePendingRef.current = { anchorRow, anchorCol, onMove };
      return;
    }

    // Second click — commit using THIS click's own position (and its own
    // orientation test), not just whatever the last pointermove reported.
    removeGuideLineCreateListeners(pending);
    guideLineCreatePendingRef.current = null;
    commit(e.clientX, e.clientY, pending.anchorRow, pending.anchorCol);
  }, [pushHistory]);

  // Cancels an in-progress (first-click-made, second-click-pending) guide
  // line, e.g. when the user backs out of guide-line mode or presses Escape
  // instead of clicking a second time.
  const cancelGuideLineCreate = useCallback(() => {
    const pending = guideLineCreatePendingRef.current;
    if (pending) {
      removeGuideLineCreateListeners(pending);
      guideLineCreatePendingRef.current = null;
    }
    setGuideLineDraft(null);
  }, []);

  // Leaving guide-line mode mid-creation shouldn't leave a dangling
  // pointermove listener or a stuck preview line.
  // Guide lines can only be selected/moved/resized in guide-line mode, so
  // leaving it (via the toolbar's Select/Fill buttons, knitting mode, etc.)
  // also drops any guide-line selection — otherwise Delete/Ctrl+C would
  // still act on a line the user can no longer see as selected.
  useEffect(() => {
    if (!guideLineMode) {
      cancelGuideLineCreate();
      setSelectedGuideLineId(null);
    }
  }, [guideLineMode, cancelGuideLineCreate]);

  const selectGuideLine = useCallback((id) => {
    setSelectedGuideLineId(id);
  }, []);

  const deselectGuideLine = useCallback(() => {
    setSelectedGuideLineId(null);
  }, []);

  // Moving: drag the line body freely in 2D — both which grid line it sits
  // on (its perpendicular axis) and where along that line it sits (its
  // parallel axis, sliding the whole segment while keeping its length
  // fixed). Both axes snap live to the nearest grid line, each clamped to
  // the grid's own bounds. Uses the same "live preview via guideLineDraft,
  // commit once on mouse-up" pattern as cell-selection move-drag (see
  // commitMove above), so a whole drag gesture is a single undo step.
  const startGuideLineMove = useCallback((e, id) => {
    e.stopPropagation();
    e.preventDefault();
    const gl = guideLinesRef.current.find((g) => g.id === id);
    if (!gl) return;
    setSelectedGuideLineId(id);

    const startMx = e.clientX, startMy = e.clientY;
    const { orientation, start: startStart, end: startEnd, linePos: startLinePos } = gl;
    const length = startEnd - startStart;
    // linePos (which grid line): a row index for a horizontal line, a
    // column index for a vertical one.
    const maxLinePos = orientation === "h" ? gridRowsRef.current : gridColsRef.current;
    // start/end (where along that line): a column range for a horizontal
    // line, a row range for a vertical one.
    const maxAlong = orientation === "h" ? gridColsRef.current : gridRowsRef.current;

    const pointerId = e.pointerId;
    guideLineDragActiveRef.current = true;
    const onMove = (me) => {
      if (pointerId !== undefined && me.pointerId !== pointerId) return;
      const dx = me.clientX - startMx;
      const dy = me.clientY - startMy;
      const perpDelta = orientation === "h" ? dy / csHRef.current : dx / csWRef.current;
      const alongDelta = orientation === "h" ? dx / csWRef.current : dy / csHRef.current;
      const liveLinePos = clampInt(startLinePos + perpDelta, 0, maxLinePos);
      // Slide the whole segment together (clamping the shift, not each
      // endpoint independently) so the line's length never changes.
      const liveStart = clampInt(startStart + alongDelta, 0, maxAlong - length);
      const liveEnd = liveStart + length;
      setGuideLineDraft({ id, orientation, linePos: liveLinePos, start: liveStart, end: liveEnd });
    };
    const onUp = (ue) => {
      if (pointerId !== undefined && ue.pointerId !== pointerId) return;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      guideLineDragActiveRef.current = false;
      setGuideLineDraft((draft) => {
        if (draft && draft.id === id && (draft.linePos !== startLinePos || draft.start !== startStart || draft.end !== startEnd)) {
          pushHistory(cellsRef.current);
          setGuideLines((prev) => prev.map((g) => (g.id === id ? { ...g, linePos: draft.linePos, start: draft.start, end: draft.end } : g)));
        }
        return null;
      });
    };
    // Touch gesture interrupted by the browser/OS: drop the preview, no commit.
    const onCancel = (ce) => {
      if (pointerId !== undefined && ce.pointerId !== pointerId) return;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      guideLineDragActiveRef.current = false;
      setGuideLineDraft(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  }, [pushHistory]);

  // Length change + orientation flip: dragging one end cap. The OTHER cap
  // (whichCap's opposite) stays pinned at its current grid intersection —
  // that fixed (row, col) point never moves for the whole gesture, even
  // across an orientation flip. Every frame, we compare how far the cursor
  // has moved horizontally vs. vertically from that fixed point: farther
  // horizontally means the line is (or becomes) horizontal, farther
  // vertically means vertical. This is exactly equivalent to the "within
  // 45° of 0°/180° => horizontal, within 45° of 90°/270° => vertical"
  // unit-circle wedge test, just without the trig: the 45° boundaries are
  // precisely where |dx| == |dy|.
  const startGuideLineCapDrag = useCallback((e, id, whichCap) => {
    e.stopPropagation();
    e.preventDefault();
    const gl = guideLinesRef.current.find((g) => g.id === id);
    if (!gl) return;
    setSelectedGuideLineId(id);
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    // The fixed cap's own grid-space (row, col) — the other end from the
    // one being dragged.
    const fixedVal = whichCap === "start" ? gl.end : gl.start;
    let fixedRow, fixedCol;
    if (gl.orientation === "h") { fixedRow = gl.linePos; fixedCol = fixedVal; }
    else { fixedCol = gl.linePos; fixedRow = fixedVal; }

    const pointerId = e.pointerId;
    guideLineDragActiveRef.current = true;
    const onMove = (me) => {
      if (pointerId !== undefined && me.pointerId !== pointerId) return;
      const fixedPxX = rect.left + offsetRef.current.x + fixedCol * csWRef.current;
      const fixedPxY = rect.top + offsetRef.current.y + fixedRow * csHRef.current;
      const dx = me.clientX - fixedPxX;
      const dy = me.clientY - fixedPxY;
      const orientation = Math.abs(dx) >= Math.abs(dy) ? "h" : "v";

      const fc = (me.clientX - rect.left - offsetRef.current.x) / csWRef.current;
      const fr = (me.clientY - rect.top - offsetRef.current.y) / csHRef.current;

      let linePos, fixedPerp, maxPerp, draggedRaw;
      if (orientation === "h") {
        linePos = clampInt(fixedRow, 0, gridRowsRef.current);
        maxPerp = gridColsRef.current;
        fixedPerp = clampInt(fixedCol, 0, maxPerp);
        draggedRaw = clampInt(fc, 0, maxPerp);
      } else {
        linePos = clampInt(fixedCol, 0, gridColsRef.current);
        maxPerp = gridRowsRef.current;
        fixedPerp = clampInt(fixedRow, 0, maxPerp);
        draggedRaw = clampInt(fr, 0, maxPerp);
      }

      let start = Math.min(fixedPerp, draggedRaw);
      let end = Math.max(fixedPerp, draggedRaw);
      // Minimum length: 1 grid unit away from the fixed cap.
      if (end - start < 1) {
        if (end < maxPerp) end = start + 1;
        else start = end - 1;
      }
      start = Math.max(0, start);
      end = Math.min(maxPerp, end);

      setGuideLineDraft({ id, orientation, linePos, start, end });
    };
    const onUp = (ue) => {
      if (pointerId !== undefined && ue.pointerId !== pointerId) return;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      guideLineDragActiveRef.current = false;
      setGuideLineDraft((draft) => {
        if (draft && draft.id === id) {
          const changed = draft.orientation !== gl.orientation || draft.linePos !== gl.linePos || draft.start !== gl.start || draft.end !== gl.end;
          if (changed) {
            pushHistory(cellsRef.current);
            setGuideLines((prev) => prev.map((g) => (g.id === id ? { ...g, orientation: draft.orientation, linePos: draft.linePos, start: draft.start, end: draft.end } : g)));
          }
        }
        return null;
      });
    };
    const onCancel = (ce) => {
      if (pointerId !== undefined && ce.pointerId !== pointerId) return;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      guideLineDragActiveRef.current = false;
      setGuideLineDraft(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  }, [pushHistory]);

  // Copy/Cut/Paste — the guide-line-specific fourth clipboard slot.
  const copyGuideLine = useCallback(() => {
    const id = selectedGuideLineIdRef.current;
    if (!id) return;
    const gl = guideLinesRef.current.find((g) => g.id === id);
    if (!gl) return;
    setGuideLineClipboard({ orientation: gl.orientation, linePos: gl.linePos, start: gl.start, end: gl.end });
    lastClipboardKindRef.current = "guideline";
  }, []);

  const cutGuideLine = useCallback(() => {
    const id = selectedGuideLineIdRef.current;
    if (!id) return;
    const gl = guideLinesRef.current.find((g) => g.id === id);
    if (!gl) return;
    setGuideLineClipboard({ orientation: gl.orientation, linePos: gl.linePos, start: gl.start, end: gl.end });
    lastClipboardKindRef.current = "guideline";
    pushHistory(cellsRef.current);
    setGuideLines((prev) => prev.filter((g) => g.id !== id));
    setSelectedGuideLineId(null);
  }, [pushHistory]);

  // Delete/Backspace on a selected guide line behaves the same as Cut, per
  // the app's own convention that a plain delete doesn't populate the
  // clipboard for cells but guide lines are explicitly specified to work
  // this way (Cut/Delete/Backspace are the same action here).
  const deleteSelectedGuideLine = cutGuideLine;

  const pasteGuideLine = useCallback(() => {
    const clip = guideLineClipboard;
    if (!clip) return;
    const id = genGuideLineId();
    pushHistory(cellsRef.current);
    setGuideLines((prev) => [...prev, { id, ...clip }]);
    // Guide lines are only movable in guide-line mode, so pasting one
    // switches into it (clearing any cell selection, same as the toolbar
    // button) — the pasted line lands stacked on the original and needs
    // to be draggable right away.
    setGuideLineMode(true);
    setSelected(new Set());
    setSelectedGuideLineId(id);
  }, [guideLineClipboard, pushHistory]);

  // ═══════════════════════════════════════════════════════════════════════════
  // KEYBOARD SHORTCUTS
  // ═══════════════════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════════════════
  // ARROW KEY SELECTION / MOVE
  // ═══════════════════════════════════════════════════════════════════════════

  const moveArrow = useCallback((dir) => {
    const sel = selectedRef.current;
    if (!sel.size || bgImageEditingRef.current) return;

    const dr = dir === "up" ? -1 : dir === "down" ? 1 : 0;
    const dc = dir === "left" ? -1 : dir === "right" ? 1 : 0;

    // Find anchor (bottom-most row, then left-most col) and move selection
    let anchorR = -Infinity;
    let anchorC = Infinity;
    for (const key of sel) {
      const { r, c } = parseKey(key);
      if (r > anchorR || (r === anchorR && c < anchorC)) {
        anchorR = r;
        anchorC = c;
      }
    }

    const newR = anchorR + dr;
    const newC = anchorC + dc;
    if (newR < 0 || newR >= gridRowsRef.current || newC < 0 || newC >= gridColsRef.current) return;

    setSelected(new Set([cellKey(newR, newC)]));
  }, []);

  const actionsRef = useRef({});
  actionsRef.current = {
    undo, redo, clearSelected, copySelected, paste, saveGridmark, moveArrow,
    copyGuideLine, cutGuideLine, pasteGuideLine, cancelGuideLineCreate,
  };

  useEffect(() => {
    const handler = (e) => {
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (bgImageEditingRef.current) return;

      const ctrl = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const hasSelectedGuideLine = !!selectedGuideLineIdRef.current;

      if (key === "escape" && guideLineCreatePendingRef.current) {
        e.preventDefault();
        actionsRef.current.cancelGuideLineCreate();
      } else if (ctrl && key === "s") {
        e.preventDefault();
        actionsRef.current.saveGridmark();
      } else if (ctrl && key === "z" && !e.shiftKey) {
        e.preventDefault();
        actionsRef.current.undo();
      } else if (ctrl && (key === "y" || (key === "z" && e.shiftKey))) {
        e.preventDefault();
        actionsRef.current.redo();
      } else if (key === "backspace" || key === "delete" || (ctrl && key === "x")) {
        e.preventDefault();
        if (hasSelectedGuideLine) actionsRef.current.cutGuideLine();
        else actionsRef.current.clearSelected();
      } else if (ctrl && key === "c") {
        e.preventDefault();
        if (hasSelectedGuideLine) {
          actionsRef.current.copyGuideLine();
        } else {
          lastClipboardKindRef.current = "cell";
          actionsRef.current.copySelected();
        }
      } else if (ctrl && key === "v") {
        e.preventDefault();
        if (lastClipboardKindRef.current === "guideline") actionsRef.current.pasteGuideLine();
        else actionsRef.current.paste();
      } else if (ctrl && key === "f") {
        e.preventDefault();
        actionsRef.current.openFind();
      } else if (ctrl && key === "h") {
        e.preventDefault();
        actionsRef.current.openReplace();
      } else if (["arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
        e.preventDefault();
        actionsRef.current.moveArrow(key.replace("arrow", ""));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // FILL CELL
  // ═══════════════════════════════════════════════════════════════════════════

  // Tracks the last cell filled during a drag so we don't re-push history
  // for every pixel of mouse movement over the same cell.
  const lastFilledKey = useRef(null);

  const fillCell = useCallback((r, c) => {
    const key = cellKey(r, c);
    if (key === lastFilledKey.current) return;
    lastFilledKey.current = key;
    const color = cellColorRef.current;
    setCells((prev) => {
      const existing = prev.get(key);
      const currentColor = existing?.color ?? "#ffffff";
      // Only push history if the color is actually changing
      if (currentColor.toLowerCase() !== color.toLowerCase()) {
        pushHistory(prev);
      }
      const next = cloneCells(prev);
      if (existing) {
        next.set(key, { ...existing, color });
      } else {
        next.set(key, { color });
      }
      return next;
    });
  }, [pushHistory]);

  // Reset lastFilledKey when the user lifts the mouse so the next drag
  // can re-fill the same cell if needed.
  const resetFillCell = useCallback(() => {
    lastFilledKey.current = null;
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // RESIZE GRID
  // ═══════════════════════════════════════════════════════════════════════════

  const resizeGrid = useCallback((newRows, newCols) => {
    const oldRows = gridRowsRef.current;
    const oldCols = gridColsRef.current;
    if (newRows === oldRows && newCols === oldCols) return;

    const dR = newRows - oldRows;
    const dC = newCols - oldCols;

    setCells((prev) => {
      pushHistory(prev);
      const next = new Map();
      for (const [key, cell] of prev) {
        // Only process root cells (spanWidth >= 1), skip span children
        if (cell.spanWidth === 0) continue;

        const { r, c } = parseKey(key);
        const newR = r + dR;
        const newC = c + dC;
        // Skip if root falls outside new grid
        if (newR < 0 || newR >= newRows || newC < 0) continue;
        // Skip if span overflows right edge
        if (newC + cell.spanWidth > newCols) continue;

        const newKey = cellKey(newR, newC);
        next.set(newKey, { symbolId: cell.symbolId, spanWidth: cell.spanWidth });
        for (let i = 1; i < cell.spanWidth; i++) {
          next.set(cellKey(newR, newC + i), { symbolId: cell.symbolId, spanWidth: 0, spanRoot: newKey });
        }
      }
      return next;
    });

    // Background image position lives in the same col/row coordinate space
    // as cells (see GridCanvas.jsx: offset.x + bgImage.col * csW). Shift it
    // by the same (dR, dC) as cell content so it stays put relative to the
    // chart instead of drifting when rows/cols are added or removed.
    setBgImage((prev) => (prev ? { ...prev, col: prev.col + dC, row: prev.row + dR } : prev));

    setGridRows(newRows);
    setGridCols(newCols);
    setSelected(new Set());
  }, [pushHistory]);

  // ═══════════════════════════════════════════════════════════════════════════
  // FIND / REPLACE
  // ═══════════════════════════════════════════════════════════════════════════

  const [findOpen, setFindOpen] = useState(false);
  const [findSymbolId, setFindSymbolIdState] = useState(null);
  const [findColor, setFindColor] = useState(null);
  const [findMatchIndex, setFindMatchIndex] = useState(0);
  const [replaceRowOpen, setReplaceRowOpen] = useState(false);

  // Root cells (spanWidth >= 1) carrying the currently-selected find symbol
  // (and, if set, matching the find color filter), in reading order.
  // If findSymbolId is the NO_SYMBOL sentinel, matches depend on the color
  // checkbox: checked (findColor set) matches symbol-less cells with that
  // exact color (Fill-mode color cells only); unchecked matches truly
  // empty grid positions (no symbol AND no color at all).
  // If findSymbolId is the ANY_SYMBOL sentinel, matches depend on the color
  // checkbox: checked (findColor set) matches ANY cell (symbol or not) whose
  // color equals the swatch color; unchecked matches every root cell that
  // carries a symbol, regardless of which one or its color.
  const findMatches = useMemo(() => {
    const matches = [];
    if (findSymbolId === NO_SYMBOL) {
      for (let r = 0; r < gridRows; r++) {
        for (let c = 0; c < gridCols; c++) {
          const key = cellKey(r, c);
          const cell = cells.get(key);
          if (cell && cell.symbolId) continue; // has a symbol — not a match
          if (findColor) {
            if (cell && cell.color === findColor) matches.push(key);
          } else {
            if (!cell) matches.push(key); // truly empty only — no symbol, no color
          }
        }
      }
    } else if (findSymbolId === ANY_SYMBOL) {
      if (findColor) {
        // Any cell (symbol or symbol-less) whose color matches the swatch,
        // resolving span-continuation cells to their root so each placed
        // symbol/fill contributes one match.
        const seenRoots = new Set();
        for (const [key, cell] of cells) {
          if (cell.color !== findColor) continue;
          let rootKey = key;
          if (cell.spanWidth === 0 && cell.spanRoot) rootKey = cell.spanRoot;
          if (seenRoots.has(rootKey)) continue;
          seenRoots.add(rootKey);
          matches.push(rootKey);
        }
      } else {
        // Every root cell carrying a symbol, regardless of which symbol.
        for (const [key, cell] of cells) {
          if (cell.symbolId && cell.spanWidth >= 1) matches.push(key);
        }
      }
      matches.sort((a, b) => {
        const pa = parseKey(a), pb = parseKey(b);
        return pa.r - pb.r || pa.c - pb.c;
      });
    } else if (findSymbolId) {
      for (const [key, cell] of cells) {
        if (cell.symbolId === findSymbolId && cell.spanWidth >= 1 && (!findColor || cell.color === findColor)) {
          matches.push(key);
        }
      }
      matches.sort((a, b) => {
        const pa = parseKey(a), pb = parseKey(b);
        return pa.r - pb.r || pa.c - pb.c;
      });
    }
    return matches;
  }, [cells, findSymbolId, findColor, gridRows, gridCols]);

  // Pans the viewport (without changing zoom) so the given cell is centered.
  const panToCell = useCallback((r, c) => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    const TOPBAR_HEIGHT = 48;
    const availH = clientHeight - TOPBAR_HEIGHT;
    setOffset({
      x: clientWidth / 2 - (c + 0.5) * csW,
      y: TOPBAR_HEIGHT + availH / 2 - (r + 0.5) * csH,
    });
  }, [csW, csH]);

  // Opens the Find window, pre-filling the symbol selector per the rules:
  //  - no selection: top-left-most symbol placed anywhere on the grid
  //  - selection with a symbol in it: top-left-most symbol among selected cells
  //  - selection with no symbols in it: leave the selector empty
  const openFind = useCallback((expandReplace = false) => {
    // Find the anchor cell: the top-left cell of the current selection, or
    // (if nothing is selected) the top-left placed symbol in the grid.
    let bestKey = null;
    if (selected.size === 0) {
      let best = null;
      for (const [key, cell] of cells) {
        if (!cell.symbolId) continue;
        const { r, c } = parseKey(key);
        if (!best || r < best.r || (r === best.r && c < best.c)) best = { r, c, key };
      }
      bestKey = best ? best.key : null;
    } else {
      let best = null;
      for (const key of selected) {
        const { r, c } = parseKey(key);
        if (!best || r < best.r || (r === best.r && c < best.c)) best = { r, c, key };
      }
      bestKey = best ? best.key : null;
    }

    const anchorCell = bestKey ? cells.get(bestKey) : null;

    // Resolve to the span root if the anchor is a continuation cell, so
    // symbol/color prefill reflects the whole placed symbol, not a blank
    // continuation slot.
    let rootKey = bestKey;
    let rootCell = anchorCell;
    if (anchorCell && anchorCell.spanWidth === 0 && anchorCell.spanRoot) {
      rootKey = anchorCell.spanRoot;
      rootCell = cells.get(rootKey) || anchorCell;
    }

    let prefillId, prefillColor;
    if (rootCell && rootCell.symbolId) {
      // Symbol present: checkbox checked, color picker set to the cell's
      // color (falling back to white if the symbol has no color set).
      prefillId = rootCell.symbolId;
      prefillColor = rootCell.color || "#ffffff";
    } else if (rootCell && rootCell.color) {
      // No symbol, but a Fill-mode color: checkbox checked, "No Symbol".
      prefillId = NO_SYMBOL;
      prefillColor = rootCell.color;
    } else {
      // Truly empty: checkbox unchecked, "No Symbol".
      prefillId = NO_SYMBOL;
      prefillColor = null;
    }

    setFindSymbolIdState(prefillId);
    setFindColor(prefillColor);
    setReplaceRowOpen(expandReplace);
    setFindOpen(true);

    // Point the highlighted match at the anchor cell (mapping a selected
    // span-child back to its root), so the outline lands on the instance
    // the user actually found rather than always index 0.
    const matches = [];
    if (prefillId === NO_SYMBOL) {
      for (let r = 0; r < gridRows; r++) {
        for (let c = 0; c < gridCols; c++) {
          const key = cellKey(r, c);
          const cell = cells.get(key);
          if (cell && cell.symbolId) continue;
          if (prefillColor) {
            if (cell && cell.color === prefillColor) matches.push(key);
          } else if (!cell) {
            matches.push(key);
          }
        }
      }
    } else if (prefillId) {
      for (const [key, cell] of cells) {
        if (cell.symbolId === prefillId && cell.spanWidth >= 1 && (!prefillColor || cell.color === prefillColor)) {
          matches.push(key);
        }
      }
      matches.sort((a, b) => {
        const pa = parseKey(a), pb = parseKey(b);
        return pa.r - pb.r || pa.c - pb.c;
      });
    }
    const idx = rootKey ? matches.indexOf(rootKey) : -1;
    setFindMatchIndex(idx >= 0 ? idx : 0);
  }, [selected, cells, gridRows, gridCols]);

  // Opens the Find/Replace window with the replace row already expanded
  const openReplace = useCallback(() => openFind(true), [openFind]);

  // Patch openFind/openReplace into actionsRef (declared after the keyboard effect)
  actionsRef.current.openFind = openFind;
  actionsRef.current.openReplace = openReplace;

  const closeFind = useCallback(() => {
    setFindOpen(false);
  }, []);

  const setFindSymbol = useCallback((id) => {
    setFindSymbolIdState(id);
    setFindMatchIndex(0);
  }, []);

  const findJumpTo = useCallback((index) => {
    if (!findMatches.length) return;
    const clamped = ((index % findMatches.length) + findMatches.length) % findMatches.length;
    const key = findMatches[clamped];
    const { r, c } = parseKey(key);
    setSelected(new Set([key]));
    panToCell(r, c);
    setFindMatchIndex(clamped);
  }, [findMatches, panToCell]);

  const findNext = useCallback(() => findJumpTo(findMatchIndex + 1), [findJumpTo, findMatchIndex]);
  const findPrev = useCallback(() => findJumpTo(findMatchIndex - 1), [findJumpTo, findMatchIndex]);

  // The cell/span currently outlined in the canvas: recomputed every render
  // from live `cells` + `findMatchIndex`, so if the highlighted symbol is
  // edited, moved, or deleted, the index naturally re-targets whichever
  // match now occupies that slot in the (re-sorted) matches list — i.e. the
  // next occurrence — and disappears entirely once no matches remain.
  let findHighlight = null;
  if (findOpen && findMatches.length > 0) {
    const idx = ((findMatchIndex % findMatches.length) + findMatches.length) % findMatches.length;
    const key = findMatches[idx];
    const cell = cells.get(key);
    const { r, c } = parseKey(key);
    findHighlight = { key, r, c, spanWidth: cell ? (cell.spanWidth || 1) : 1 };
  }

  // ── Replace ─────────────────────────────────────────────────────────────
  const [replaceSymbolId, setReplaceSymbolState] = useState(null);
  const [replaceColor, setReplaceColor] = useState(null);
  // Whether the replace color picker is "active". When false, replacing
  // strips any color from the matched cell(s) regardless of the swatch
  // value. When true, the swatch value (replaceColor, falling back to
  // white) is applied. This is what lets Replace express all 4 combos:
  // symbol/no-symbol crossed with color/no-color.
  const [replaceColorEnabled, setReplaceColorEnabledState] = useState(false);

  const setReplaceSymbol = useCallback((id) => {
    setReplaceSymbolState(id);
  }, []);

  const setReplaceColorEnabled = useCallback((enabled) => {
    setReplaceColorEnabledState(enabled);
  }, []);

  // Replace the current match with the replace symbol, growing the grid to
  // the right if the wider replacement symbol would extend past the last column.
  const onReplace = useCallback(() => {
    if (!findMatches.length || !replaceSymbolId) return;
    const idx = ((findMatchIndex % findMatches.length) + findMatches.length) % findMatches.length;
    const key = findMatches[idx];
    const { r, c } = parseKey(key);
    const appliedColor = replaceColorEnabled ? (replaceColor || "#ffffff") : null;

    // Replacing with "No Symbol" removes the symbol. If the color toggle is
    // off, that's a full clear (no symbol, no color) — the cell is deleted
    // entirely. If it's on, the cell becomes a Fill-mode color-only cell.
    if (replaceSymbolId === NO_SYMBOL) {
      setCells((prev) => {
        const cell = prev.get(key);
        if (!cell && !appliedColor) return prev; // already empty, nothing to set
        pushHistory(prev);
        const next = cloneCells(prev);
        // Resolve root position in case this match is a span-continuation cell.
        let rootKey = key, rootR = r, rootC = c, rootCell = cell;
        if (cell && cell.spanWidth === 0 && cell.spanRoot) {
          rootKey = cell.spanRoot;
          const parsed = parseKey(rootKey);
          rootR = parsed.r; rootC = parsed.c;
          rootCell = next.get(rootKey);
        }
        const spanWidth = rootCell ? (rootCell.spanWidth || 1) : 1;
        for (let i = 0; i < spanWidth; i++) next.delete(cellKey(rootR, rootC + i));
        if (appliedColor) next.set(rootKey, { color: appliedColor });
        return next;
      });
      return;
    }

    const repSym = symbols.find((s) => s.id === replaceSymbolId);
    const repWidth = repSym ? repSym.width : 1;

    const neededCols = (c + repWidth - 1) - (gridColsRef.current - 1);
    if (neededCols > 0) setGridCols((prev) => prev + neededCols);

    setCells((prev) => {
      pushHistory(prev);
      const next = cloneCells(prev);
      // Remove old span children if multi-cell
      const cell = prev.get(key) || {};
      if (cell.spanWidth > 1) {
        for (let i = 1; i < cell.spanWidth; i++) {
          next.delete(cellKey(r, c + i));
        }
      }
      // Color toggle off means explicitly strip color, even if the cell
      // had one before — so we don't spread ...cell for the color field.
      const rootCell = { symbolId: replaceSymbolId, spanWidth: repWidth };
      if (appliedColor) rootCell.color = appliedColor;
      next.set(key, rootCell);
      for (let i = 1; i < repWidth; i++) {
        next.set(cellKey(r, c + i), { symbolId: replaceSymbolId, spanWidth: 0, spanRoot: key });
      }
      return next;
    });
  }, [findMatches, findMatchIndex, replaceSymbolId, replaceColor, replaceColorEnabled, symbols, pushHistory]);

  // Replace all matches with the replace symbol, growing the grid to the
  // right just enough to fit the widest overflow among all replaced instances.
  const onReplaceAll = useCallback(() => {
    if (!findMatches.length || !replaceSymbolId) return;
    const appliedColor = replaceColorEnabled ? (replaceColor || "#ffffff") : null;

    // Replacing with "No Symbol" removes the symbol from every matched cell.
    // Color toggle off => full clear (delete entirely); on => Fill-mode
    // color-only cell.
    if (replaceSymbolId === NO_SYMBOL) {
      setCells((prev) => {
        pushHistory(prev);
        const next = cloneCells(prev);
        for (const key of findMatches) {
          const cell = next.get(key);
          if (!cell && !appliedColor) continue; // already empty, nothing to set
          const { r, c } = parseKey(key);
          let rootKey = key, rootR = r, rootC = c, rootCell = cell;
          if (cell && cell.spanWidth === 0 && cell.spanRoot) {
            rootKey = cell.spanRoot;
            const parsed = parseKey(rootKey);
            rootR = parsed.r; rootC = parsed.c;
            rootCell = next.get(rootKey);
          }
          const spanWidth = rootCell ? (rootCell.spanWidth || 1) : 1;
          for (let i = 0; i < spanWidth; i++) next.delete(cellKey(rootR, rootC + i));
          if (appliedColor) next.set(rootKey, { color: appliedColor });
        }
        return next;
      });
      return;
    }

    const repSym = symbols.find((s) => s.id === replaceSymbolId);
    const repWidth = repSym ? repSym.width : 1;

    let neededCols = 0;
    for (const key of findMatches) {
      const { c } = parseKey(key);
      const endC = c + repWidth - 1;
      const need = endC - (gridColsRef.current - 1);
      if (need > neededCols) neededCols = need;
    }
    if (neededCols > 0) setGridCols((prev) => prev + neededCols);

    setCells((prev) => {
      pushHistory(prev);
      const next = cloneCells(prev);
      for (const key of findMatches) {
        const cell = prev.get(key) || {};
        const { r, c } = parseKey(key);
        // Remove old span children
        if (cell.spanWidth > 1) {
          for (let i = 1; i < cell.spanWidth; i++) next.delete(cellKey(r, c + i));
        }
        // Color toggle off means explicitly strip color, even if the cell
        // had one before — so we don't spread ...cell for the color field.
        const rootCell = { symbolId: replaceSymbolId, spanWidth: repWidth };
        if (appliedColor) rootCell.color = appliedColor;
        next.set(key, rootCell);
        for (let i = 1; i < repWidth; i++) {
          next.set(cellKey(r, c + i), { symbolId: replaceSymbolId, spanWidth: 0, spanRoot: key });
        }
      }
      return next;
    });
  }, [findMatches, replaceSymbolId, replaceColor, replaceColorEnabled, symbols, pushHistory]);

  // ═══════════════════════════════════════════════════════════════════════════
  // RETURN
  // ═══════════════════════════════════════════════════════════════════════════

  return {
    symbols, lastUsedSymbolId, reorderSymbols, showEditSymbols, setShowEditSymbols,
    newSymName, setNewSymName, newSymWidth, setNewSymWidth, newSymSvg, addError,
    fileInputRef, handleSvgFileChange, addSymbol, deleteSymbol, placeSymbol,
    editingSymbolId, editSymName, setEditSymName, editSymWidth, setEditSymWidth,
    startEditSymbol, saveEditSymbol, cancelEditSymbol,
    showDirectory, setShowDirectory, svgTree, customDirectoryTree,
    dirFileInputRef, handleDirSvgUpload, addFromDirectory, removeFromDirectory,
    fileSystemApiSupported, folderTree, folderName, openFolder, closeFolder,
    openFileFromTree, openFileId, folderError,
    offset, zoom, setZoom, csW, csH, containerRef, spaceDown, getViewport, fitGridToPage,
    selected, setSelected, dragRect,
    cells,
    gridRows, gridCols,
    addColumn, addRow, insertColumnsBefore, insertColumnsAfter,
    insertRowBefore, insertRowAfter, removeSelectedColumns, removeSelectedRows,
    historyLen, undo, redo,
    clipboard, copySelected, paste,
    colorClipboard, copySelectedColor, pasteColor,
    symbolClipboard, copySelectedSymbol, pasteSymbol,
    groups, saveGroup, pasteGroupAtSelection, deleteGroup, renameGroup,
    mirrorUp, mirrorDown, mirrorLeft, mirrorRight,
    flipHorizontal, flipVertical,
    movingSelection, moveOffset,
    clearSelected, clearSelectedColors, colorSelectedCells, cutSelectedSymbols, resetGrid, clearAllCells, clearAllColors, importGridmark, saveGridmark, saveError,
    showConfirm, setShowConfirm,
    bgImage, bgImageEditing, bgFileInputRef, handleBgImageUpload,
    bgImageStartDrag, bgImageFix, bgImageEdit, bgImageRemove, setBgImageOpacity,
    applyBgImageToColors,
    onMouseDown, onMouseMove, onMouseUp, onWheel, handlePointerGestureStart,
    dirtyRef,
    fileName, setFileName,
    cellColor, setCellColor,
    fillCell, resetFillCell,
    resizeGrid,
    cellAspect, resizeCell,
    memoTextRef,
    findOpen, openFind, closeFind, findSymbolId, setFindSymbol,
    findMatches, findMatchIndex, findNext, findPrev,
    findHighlight, findColor, setFindColor,
    replaceSymbolId, setReplaceSymbol, onReplace, onReplaceAll,
    replaceColor, setReplaceColor, replaceColorEnabled, setReplaceColorEnabled,
    openReplace, replaceRowOpen, setReplaceRowOpen,
    guideLines, guideLineDraft, guideLineMode, setGuideLineMode, toggleGuideLineMode,
    selectedGuideLineId, selectGuideLine, deselectGuideLine,
    startGuideLineCreate, cancelGuideLineCreate, startGuideLineMove, startGuideLineCapDrag,
    guideLineClipboard, copyGuideLine, cutGuideLine, pasteGuideLine, deleteSelectedGuideLine,
  };
}