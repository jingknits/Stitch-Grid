import { useState, useRef, useCallback, useEffect, useLayoutEffect } from "react";
import { CELL_SIZE } from "../../constants";
import { buildPngBlob, buildSvgBlob, svgStringToImage, saveBlobWithFormatPicker } from "../../utils/exportUtils";
import { svgToDataUrl } from "../../utils/svgUtils";
import ResizeGridModal from "../Modals/ResizeGridModal";
import ResizeCellModal from "../Modals/ResizeCellModal";
import ReportIssueModal from "../Modals/ReportIssueModal";
import helpRaw from "../../help.md?raw";

function parseHelpMd(md) {
  const sections = [];
  let current = null;
  for (const raw of md.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("## ")) {
      if (current) sections.push(current);
      const title = line.slice(3).trim();
      current = { title, items: [], cols: title === "KEYBOARD SHORTCUTS" };
    } else if (current && line) {
      current.items.push(line);
    }
  }
  if (current) sections.push(current);
  return sections;
}

const HELP_SECTIONS = parseHelpMd(helpRaw);

// TODO: replace with your real Web3Forms access key from https://web3forms.com/
const WEB3FORMS_ACCESS_KEY = "7d145e0d-55d9-4379-9102-d8002d7926d2";
// The "KEYBOARD SHORTCUTS" section is the only one laid out as key:value
// pairs (cols) — everything else is prose/bullet content about using the
// grid itself.
const GRID_HELP_SECTIONS = HELP_SECTIONS.filter((s) => !s.cols);
const KEYBOARD_SHORTCUT_SECTIONS = HELP_SECTIONS.filter((s) => s.cols);

// ═══════════════════════════════════════════════════════════════════════════════
// MENU ICON SVG PATHS (viewBox "0 0 16 16", fill-rule evenodd)
// ═══════════════════════════════════════════════════════════════════════════════

const ICON_PATHS = {
  undo: "M3.5 2v3.5L4 6h3.5V5H4.979l.941-.941a3.552 3.552 0 1 1 5.023 5.023L5.746 14.28l.72.72 5.198-5.198A4.57 4.57 0 0 0 5.2 3.339l-.7.7V2h-1z",
  redo: "M12.5 2v3.5L12 6H8.5V5h2.521l-.941-.941a3.552 3.552 0 1 0-5.023 5.023l5.197 5.198-.72.72-5.198-5.198A4.57 4.57 0 0 1 10.8 3.339l.7.7V2h1z",
  cut: "M7.116 8l-4.558 4.558.884.884L8 8.884l4.558 4.558.884-.884L8.884 8l4.558-4.558-.884-.884L8 7.116 3.442 2.558l-.884.884L7.116 8z",
  copy: ["M4 4l1-1h5.414L14 6.586V14l-1 1H5l-1-1V4zm9 3l-3-3H5v10h8V7z", "M3 1L2 2v10l1 1V2h6.414l-1-1H3z"],
  paste: ["M4 4l1-1h5.414L14 6.586V14l-1 1H5l-1-1V4z", "M3 1L2 2v10l1 1V2h6.414l-1-1H3z"],
  replace: "M4.207 15.061L1 11.854v-.707L4.207 7.94l.707.707-2.353 2.354H15v1H2.56l2.354 2.353-.707.707zm7.586-7L15 4.854v-.707L11.793.94l-.707.707L13.439 4H1v1h12.44l-2.354 2.354.707.707z",
  trash: "M10 3h3v1h-1v9l-1 1H4l-1-1V4H2V3h3V2a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1zM9 2H6v1h3V2zM4 13h7V4H4v9zm2-8H5v7h1V5zm1 0h1v7H7V5zm2 0h1v7H9V5z",
  resizeCell: [
    "M14.5 1l.5 .5v4.5h-1v-4h-4v-1h4z",
    "M1.5 15l-.5-.5v-4.5h1v4h4v1h-3z",
    "M8.707 8l5.647-5.646-.707-.708L8 7.293 7.293 8 1.646 13.646l.708.708L8 8.707l.707-.707z",
  ],
  resizeGrid: "M11 1v4h4v1h-4v4h4v1h-4v4h-1v-4H6v4H5v-4H1v-1h4V6H1V5h4V1h1v4h4V1h1zM6 6v4h4V6H6z",
  flipVertical: "M9 3l2.146 2.146.708-.707-3-3h-.708l-3 3 .708.707L8 3v10l-2.146-2.146-.708.707 3 3h.708l3-3-.708-.707L9 13V3z",
  flipHorizontal: "M3 9l2.146 2.146-.707.708-3-3v-.708l3-3 .707.708L3 8h10l-2.146-2.146.707-.708 3 3v.708l-3 3-.707-.707L13 9H3z",
  mirror: "M8.57 1l6.2 4 .23.38v9.2l-.76.42L8 11l-6.24 4-.76-.42v-9.2L1.23 5l6.2-4h1.14zm-.06 9.13L14 13.67V5.65l-5.49-3.5V5h-1V2.13L2 5.67v8l5.51-3.56v.02h1zm.9-4.78l.71-.7 2.47 2.48v.71l-2.46 2.46-.7-.7L11.02 8h-6L6.6 9.6l-.7.7-2.46-2.46v-.71l2.48-2.48.7.7L4.98 7h6.08L9.41 5.35z",
  mirrorUp: "M5 6.5L7.5 4h.7l2.5 2.5-.7.71-1.65-1.64v5.57h-1V5.57L5.7 7.22 5 6.5z",
  mirrorDown: "M10.7 8.64l-2.5 2.5h-.7L5 8.64l.7-.71 1.65 1.64V4h1v5.57L10 7.92l.7.72z",
  mirrorLeft: "M6.5 10.7L4 8.2v-.7L6.5 5l.71.7-1.64 1.65h5.57v1H5.57L7.22 10l-.72.7z",
  mirrorRight: "M8.64 5l2.5 2.5v.7l-2.5 2.5-.71-.7 1.64-1.65H4v-1h5.57L7.92 5.7l.72-.7z",
  clearAllColors:
    "M2.99994 15.006H8.00746C7.62983 14.7234 7.29348 14.3888 7.00908 14.0126L2.99994 14.017L4.54094 11.006H5.99997L5.99997 11C5.99997 10.6597 6.03398 10.3273 6.09878 10.006H5.04894L6.89294 6.408L6.99994 6.193V2.036L8.99994 2.012V6.007V6.249L9.07058 6.38584C9.38043 6.25613 9.7061 6.15672 10.0439 6.09131L9.99994 6.006V2.006H10.9999V1.006H9.99394V1L9.53794 1.005H4.99994V2H5.99994V5.952L2.10594 13.561C2.03023 13.7133 1.99465 13.8825 2.00254 14.0524C2.01044 14.2224 2.06156 14.3875 2.15106 14.5321C2.24057 14.6768 2.3655 14.7962 2.51404 14.8792C2.66258 14.9621 2.82982 15.0057 2.99994 15.006ZM8.77769 7.67407C9.43548 7.23455 10.2089 7 11 7C12.0608 7 13.0782 7.42149 13.8283 8.17163C14.5785 8.92178 15 9.93913 15 11C15 11.7911 14.7654 12.5645 14.3259 13.2223C13.8864 13.8801 13.2616 14.3928 12.5307 14.6956C11.7998 14.9983 10.9955 15.0774 10.2196 14.9231C9.44366 14.7688 8.73102 14.3878 8.17161 13.8284C7.6122 13.269 7.23122 12.5563 7.07688 11.7804C6.92254 11.0045 7.00167 10.2001 7.30442 9.46924C7.60717 8.73833 8.11989 8.1136 8.77769 7.67407ZM8.87864 13.1213C9.44125 13.6839 10.2043 14 11 14C11.623 14.0018 12.2312 13.8095 12.74 13.45L8.55003 9.26001C8.19046 9.76883 7.99818 10.377 7.99998 11C7.99998 11.7956 8.31603 12.5587 8.87864 13.1213ZM9.25999 8.55005L13.4499 12.74C13.8095 12.2312 14.0018 11.623 14 11C14 10.2044 13.6839 9.44127 13.1213 8.87866C12.5587 8.31605 11.7956 8 11 8C10.3769 7.9982 9.7688 8.19048 9.25999 8.55005Z",
  clearAllCells: [
    "M8.621 8.086l-.707-.707L6.5 8.793 5.086 7.379l-.707.707L5.793 9.5l-1.414 1.414.707.707L6.5 10.207l1.414 1.414.707-.707L7.207 9.5l1.414-1.414z",
    "M5 3l1-1h7l1 1v7l-1 1h-2v2l-1 1H3l-1-1V6l1-1h2V3zm1 2h4l1 1v4h2V3H6v2zm4 1H3v7h7V6z",
  ],
  edit: "M13.23 1h-1.46L3.52 9.25l-.16.22L1 13.59 2.41 15l4.12-2.36.22-.16L15 4.23V2.77L13.23 1zM2.41 13.59l1.51-3 1.45 1.45-2.96 1.55zm3.83-2.06L4.47 9.76l8-8 1.77 1.77-8 8z",
  knittingMode: "M2 10V9h12v1H2zm0-4h12v1H2V6zm12-3v1H2V3h12zM2 12v1h12v-1H2z",
  backgroundImage: "M4 2h8v4c.341.035.677.112 1 .23V1H3v8.48l1-1.75V2zm2.14 8L5 8 4 9.75 3.29 11 1 15h8l-2.29-4-.57-1zm-3.42 4l1.72-3L5 10l.56 1 1.72 3H2.72zm6.836-6.41a3.5 3.5 0 1 1 3.888 5.82 3.5 3.5 0 0 1-3.888-5.82zm.555 4.989a2.5 2.5 0 1 0 2.778-4.157 2.5 2.5 0 0 0-2.778 4.157z",
  memo: "M2 2l1-1h9l1 1v12l-1 1H3l-1-1V2zm1 0v12h9V2H3zm1 2l1-1h5l1 1v1l-1 1H5L4 5V4zm1 0v1h5V4H5zm10 1h-1v2h1V5zm-1 3h1v2h-1V8zm1 3h-1v2h1v-2z",
  listSelect: "M1 12v-1h9v1H1zm0-5h14v1H1V7zm11-4v1H1V3h11z",
  // Four corner brackets (viewfinder/selection-frame motif) for "Group",
  // matching the app's existing filled-path icon style.
  group: "M1 1h4v1H2v3H1V1zm10 0h4v4h-1V2h-3V1zM1 11h1v3h3v1H1v-4zm14 0v4h-4v-1h3v-3h1z",
  deselect: ["M1.5 1h13l.5.5v13l-.5.5h-13l-.5-.5v-13l.5-.5zM2 14h12V2H2v11z", "M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.707.708L7.293 8l-3.646 3.646.707.708L8 8.707z"],
  search: "M15.25 0a8.25 8.25 0 0 0-6.18 13.72L1 22.88l1.12 1 8.05-9.12A8.251 8.251 0 1 0 15.25.01V0zm0 15a6.75 6.75 0 1 1 0-13.5 6.75 6.75 0 0 1 0 13.5z",
  import: "M4 15v-1c2 0 2-.6 2-1H1.5l-.5-.5v-10l.5-.5h13l.5.5v9.24l-1-1V3H2v9h5.73l-.5.5 2.5 2.5H4zm7.86 0l2.5-2.5-.71-.7L12 13.45V7h-1v6.44l-1.64-1.65-.71.71 2.5 2.5h.71z",
  fitToPage: "M3 12h10V4H3v8zm2-6h6v4H5V6zM2 6H1V2.5l.5-.5H5v1H2v3zm13-3.5V6h-1V3h-3V2h3.5l.5.5zM14 10h1v3.5l-.5.5H11v-1h3v-3zM2 13h3v1H1.5l-.5-.5V10h1v3z",
  chevRight: "M10.072 8.024L5.715 3.667l.618-.62L11 7.716v.618L6.333 13l-.618-.619 4.357-4.357z",
  save: "M13.353 1.146l1.5 1.5L15 3v11.5l-.5.5h-13l-.5-.5v-13l.5-.5H13l.353.146zM2 2v12h12V3.208L12.793 2H11v4H4V2H2zm6 0v3h2V2H8z",
  saveAs: "M11.04 1.33L12.71 3l.29.71v.33h-.5l-.5.5v-.83l-1.67-1.67H10v4H4v-4H2v10h3l-.5 1H2l-1-1v-10l1-1h8.33l.71.29zM7 5h2V2H7v3zm6.5 0L15 6.5l-.02.69-5.5 5.5-.13.12-.37.37-.1.09-3 1.5-.67-.67 1.5-3 .09-.1.37-.37.12-.13 5.5-5.5h.71zm-6.22 7.24l-.52 1 1.04-.48-.52-.52zm.69-1.03l.79.79 5.15-5.15-.79-.79-5.15 5.15z",
  rowAdd:"M1 7.5 h14 v1 h-14zM10.5 3.5 h2v-2h1v2h2v1h-2v2h-1v-2h-2v-1z",
  rowDel:"M1 7.5 h14 v1 h-14zM10.5 3.5 h5v1h-5v-1z",
  colAdd:"M7.5 1 h1 v14 h-1 v-12 M10.5 3.5 h2v-2h1v2h2v1h-2v2h-1v-2h-2v-1z",
  colDel:"M7.5 1 h1 v14 h-1 v-12 M10.5 3.5 h5v1h-5v-1z",
  rowAft:"M1 3 h14 v1 h-14zM10.7 10.64l-2.5 2.5h-.7L5 10.64l.7-.71 1.65 1.64V6h1v5.57L10 9.92l.7.72z",
  rowBef:"M1 12 h14 v1 h-14zM5 5.5L7.5 3h.7l2.5 2.5-.7.71-1.65-1.64v5.57h-1V4.57L5.7 6.22 5 5.5z",
  colAft:"M3 1 v14 h1 v-14zM10.64 5l2.5 2.5v.7l-2.5 2.5-.71-.7 1.64-1.65H6v-1h5.57L9.92 5.7l.72-.7z",
  colBef:"M12 1 v14 h1 v-14zM4.5 10.7L2 8.2v-.7L4.5 5l.71.7-1.64 1.65h5.57v1H3.57L5.22 10l-.72.7z",
  check: "M6.173 12.414L2.16 8.402l.94-.94 3.073 3.072 6.727-6.727.94.94-7.667 7.667z",
  shading: [
    "M1.5 1h13l.5.5v13l-.5.5h-13l-.5-.5v-13l.5-.5zM2 14h12v-12h-12v12z",
    "M1 5 h14 v-3.25 h-14 v3.25zM1 11.25 h14 v-3.25 h-14 v3.25z",
  ],
  noShading: [
    "M1.5 1h13l.5.5v13l-.5.5h-13l-.5-.5v-13l.5-.5zM2 14h12v-12h-12v12z",
    "M1 4.25 h13 v1 h-13 v-1z M1 7.5 h13 v1 h-13 v-1z M1 10.75 h13 v1 h-13 v-1z",
  ],
  // "Add" plus icon (from add.svg) used for Guide Line entries in the Edit
  // menu's Cut/Copy/Paste flyouts.
  guideLine: "M14 6.75v1.5H8.25V14h-1.5V8.25H1v-1.5h5.75V1h1.5v5.75H14z",
};

// App icon shown at the very left of the top bar (VS Code-style corner
// mark, ahead of the File/Edit/... menus). Native viewBox is 0-100 with
// stroked lines rather than filled paths, unlike the menu icons above, so
// it gets its own tiny renderer instead of going through MenuIcon.
function AppGridIcon({ size = 18 }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} xmlns="http://www.w3.org/2000/svg" style={{ display: "block", flexShrink: 0 }}>
      <path d="M 10 33 L 90 33" stroke="#4b4b4b" strokeWidth="5" strokeLinecap="round" />
      <path d="M 10 66 L 90 66" stroke="#4b4b4b" strokeWidth="5" strokeLinecap="round" />
      <path d="M 33 10 L 33 90" stroke="#4b4b4b" strokeWidth="5" strokeLinecap="round" />
      <path d="M 66 10 L 66 90" stroke="#4b4b4b" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}
// symbol/name instead of a hardcoded one. userAgentData.platform is checked
// first since navigator.platform is deprecated; both are only present in
// the browser, so this stays a no-op (defaults to non-Mac) during any SSR.
const isMac =
  typeof navigator !== "undefined" &&
  /mac/i.test(navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || "");

// Builds a menu-displayed shortcut string for the primary modifier key,
// e.g. modKey("Z") → "⌘Z" on macOS, "Ctrl+Z" on Windows/Linux.
function modKey(letter) {
  return isMac ? `⌘${letter}` : `Ctrl+${letter}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// LEGEND EXPORT ("Save Legend")
// ═══════════════════════════════════════════════════════════════════════════
// Builds an icon+name legend of the symbols actually placed on the grid.
// Mirrors exportAsSvg's own convention for embedding symbol markup: each
// symbol is a data-URL <image>, not a raw inline <svg>, so this stays
// consistent with how the grid/vector export already does it.

function escapeXml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const LEGEND_ROW_H = 28;
const LEGEND_ICON_UNIT = 18;
const LEGEND_PADDING = 14;
const LEGEND_FONT_SIZE = 14;
const LEGEND_GAP = 10; // between icon column and name text
const LEGEND_ICON_COL_W = LEGEND_ICON_UNIT * 3; // room for a 3-wide symbol

// Every symbol id actually placed on the grid, in the order the symbol
// library lists them — not the full library, just what's in use.
function buildLegendEntries(cellsMap, symbolList) {
  const usedIds = new Set();
  for (const cell of cellsMap.values()) {
    if (cell.symbolId) usedIds.add(cell.symbolId);
  }
  return symbolList.filter((s) => usedIds.has(s.id));
}

// Returns { svgString, width, height } so callers (SVG save, PNG
// rasterization) both get exact dimensions without re-parsing the string.
function buildLegendSvg(entries) {
  const maxNameLen = entries.reduce((m, s) => Math.max(m, (s.name || "").length), 0);
  const width = Math.round(LEGEND_PADDING * 2 + LEGEND_ICON_COL_W + LEGEND_GAP + maxNameLen * (LEGEND_FONT_SIZE * 0.62) + 8);
  const height = LEGEND_PADDING * 2 + entries.length * LEGEND_ROW_H;

  const rows = entries.map((s, i) => {
    const rowY = LEGEND_PADDING + i * LEGEND_ROW_H;
    const span = Math.max(1, s.width || 1);
    const iconW = LEGEND_ICON_UNIT * span;
    const iconY = rowY + (LEGEND_ROW_H - LEGEND_ICON_UNIT) / 2;
    const textY = rowY + LEGEND_ROW_H / 2;
    const dataUrl = svgToDataUrl(s.svgContent || "<svg></svg>");
    return (
      `<image x="${LEGEND_PADDING}" y="${iconY}" width="${iconW}" height="${LEGEND_ICON_UNIT}" href="${dataUrl}"/>` +
      `<text x="${LEGEND_PADDING + LEGEND_ICON_COL_W + LEGEND_GAP}" y="${textY}" font-family="Arial, sans-serif" font-size="${LEGEND_FONT_SIZE}" fill="#1E1E1E" dominant-baseline="middle">${escapeXml(s.name || "")}</text>`
    );
  }).join("\n");

  const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#FFFFFF"/>${rows}</svg>`;
  return { svgString, width, height };
}

// Rasterizes the legend to a PNG blob at 2x for crispness, reusing the same
// svgStringToImage helper exportAsPng uses for individual symbol icons.
async function legendSvgToPngBlob(svgString, width, height, scale = 2) {
  const img = await svgStringToImage(svgString, width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("PNG conversion failed"));
    }, "image/png");
  });
}

function MenuIcon({ d, color, viewBox = "0 0 16 16" }) {
  const paths = Array.isArray(d) ? d : [d];
  return (
    <svg viewBox={viewBox} width="16" height="16" xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
      {paths.map((p, i) => (
        <path key={i} fillRule="evenodd" clipRule="evenodd" d={p} fill={color} />
      ))}
    </svg>
  );
}

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
        border: accent ? `2px solid ${color}` : `1px solid ${disabled ? "#E7E8EC" : "#EEEEF2"}`,
        background: hov && !disabled ? (hoverBg || "#C9DEF5") : (accent ? "#F5F5F5" : "transparent"),
        color: disabled ? "#AAAAAA" : color, cursor: disabled ? "default" : "pointer",
        fontSize: 16, fontWeight: 400, fontFamily: "inherit", opacity: disabled ? 0.5 : 1,
        transition: "background 0.12s, border-color 0.12s", whiteSpace: "nowrap"
      }}>
      <span style={{ fontSize: 16, display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 16, flexShrink: 0 }}>
        {typeof icon === "object" && icon !== null
          ? <MenuIcon d={icon.d} color={disabled ? "#AAAAAA" : color} viewBox={icon.viewBox} />
          : icon}
      </span>
      <span>{label}</span>
      {shortcut && !disabled && (
        <span style={{ fontSize: 16, color: "#8A8A8A", fontWeight: 400, marginLeft: 2 }}>{shortcut}</span>
      )}
    </button>
  );
}

export function TBarDivider() {
  return <div style={{ width: 1, height: 22, background: "#EEEEF2", margin: "0 4px", flexShrink: 0 }} />;
}

function DropdownItem({ icon, label, shortcut, color, onAction, disabled, noIcon }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={(e) => { e.stopPropagation(); if (!disabled) onAction(); }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      disabled={disabled}
      style={{
        display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 14px",
        background: hov && !disabled ? "#C9DEF5" : "transparent",
        border: "none", cursor: disabled ? "default" : "pointer",
        fontFamily: "inherit", fontSize: 16, fontWeight: 400,
        color: disabled ? "#AAAAAA" : (color || "#4B4B4B"),
        opacity: disabled ? 0.5 : 1, textAlign: "left",
        transition: "background 0.1s",
      }}
    >
      {!noIcon && (
        <span style={{ fontSize: 16, width: 18, height: 16, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {typeof icon === "object" && icon !== null
            ? <MenuIcon d={icon.d} color={disabled ? "#AAAAAA" : "#4B4B4B"} viewBox={icon.viewBox} />
            : icon}
        </span>
      )}
      <span style={{ flex: 1, whiteSpace: "nowrap", color: disabled ? "#AAAAAA" : "#4B4B4B" }}>{label}</span>
      {shortcut && (
        <span style={{ fontSize: 12, color: "#8A8A8A", fontWeight: 400, marginLeft: 8 }}>{shortcut}</span>
      )}
    </button>
  );
}

function FlyoutItem({ icon, label, color, items, disabled, closeMenu, isOpen, onRequestOpen, onRequestClose }) {
  const [hov, setHov] = useState(false);
  const closeTimer = useRef(null);

  const openNow = () => {
    if (disabled) return;
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
    onRequestOpen();
  };
  const closeSoon = () => {
    closeTimer.current = setTimeout(() => {
      onRequestClose();
      closeTimer.current = null;
    }, 150);
  };
  const cancelClose = () => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
  };

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  const displayColor = disabled ? "#AAAAAA" : (color || "#4B4B4B");

  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={() => { setHov(true); openNow(); }}
      onMouseLeave={() => { setHov(false); closeSoon(); }}
    >
      <button
        onClick={(e) => { e.stopPropagation(); if (!disabled) { if (isOpen) onRequestClose(); else onRequestOpen(); } }}
        disabled={disabled}
        style={{
          display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 14px",
          background: (hov || isOpen) && !disabled ? "#C9DEF5" : "transparent",
          border: "none", cursor: disabled ? "default" : "pointer",
          fontFamily: "inherit", fontSize: 16, fontWeight: 400,
          color: displayColor,
          opacity: disabled ? 0.5 : 1, textAlign: "left",
          transition: "background 0.1s",
        }}
      >
        <span style={{ fontSize: 16, width: 18, height: 16, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {typeof icon === "object" && icon !== null
            ? <MenuIcon d={icon.d} color={disabled ? "#AAAAAA" : "#4B4B4B"} viewBox={icon.viewBox} />
            : icon}
        </span>
        <span style={{ flex: 1, whiteSpace: "nowrap", color: disabled ? "#AAAAAA" : "#4B4B4B" }}>{label}</span>
        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 12, height: 16, marginLeft: 8, flexShrink: 0 }}>
          <MenuIcon d={ICON_PATHS.chevRight} color={disabled ? "#AAAAAA" : "#8A8A8A"} />
        </span>
      </button>
      {isOpen && !disabled && (
        <div
          onMouseEnter={cancelClose}
          onMouseLeave={closeSoon}
          style={{
            position: "absolute", top: -4, left: "100%", marginLeft: 4, minWidth: 160, zIndex: 210,
            background: "#E7E8EC", border: "1px solid #EEEEF2", borderRadius: 8, padding: "4px 0",
            overflow: "hidden",
          }}
        >
          {items.map((item, i) => item.divider ? (
            <div key={`fdiv-${i}`} style={{ height: 1, background: "#C9DEF5", margin: "4px 8px" }} />
          ) : (
            <DropdownItem
              key={item.label}
              {...item}
              onAction={() => { item.onClick(); onRequestClose(); if (closeMenu) closeMenu(); }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const ZOOM_MIN = 0.2;   // 20% — matches useGridState's onWheel/fitGridToPage clamp
const ZOOM_MAX = 5;     // 500% — matches useGridState's onWheel/fitGridToPage clamp
const ZOOM_STEP = 0.05; // 5% per slider tick

function clampZoomPct(pct) {
  return Math.min(ZOOM_MAX * 100, Math.max(ZOOM_MIN * 100, pct));
}

// Zoom In / Out + key-in + slider, rendered as a custom row inside the View
// dropdown menu. Lives inside the already-open menu, so it doesn't need its
// own open/close or outside-click handling — just has to not trigger the
// parent DropdownItem's close-on-click behavior, which `item.custom` rows
// are exempt from.
function ZoomMenuControl({ zoom, setZoom, disabled }) {
  const [draft, setDraft] = useState(Math.round(zoom * 100));
  const [inputText, setInputText] = useState(String(Math.round(zoom * 100)));
  const debounceRef = useRef(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    if (!draggingRef.current) {
      const pct = Math.round(zoom * 100);
      setDraft(pct);
      setInputText(String(pct));
    }
  }, [zoom]);

  const commitZoom = useCallback((pct) => {
    if (disabled) return;
    setZoom(clampZoomPct(pct) / 100);
  }, [setZoom, disabled]);

  const handleSliderChange = useCallback((e) => {
    draggingRef.current = true;
    const pct = Number(e.target.value);
    setDraft(pct);
    setInputText(String(pct));
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      commitZoom(pct);
      draggingRef.current = false;
    }, 80);
  }, [commitZoom]);

  const commitInputText = useCallback(() => {
    const parsed = parseFloat(inputText);
    if (!Number.isNaN(parsed)) {
      const clamped = clampZoomPct(parsed);
      setDraft(clamped);
      setInputText(String(clamped));
      commitZoom(clamped);
    } else {
      const pct = Math.round(zoom * 100);
      setDraft(pct);
      setInputText(String(pct));
    }
  }, [inputText, zoom, commitZoom]);

  const step = useCallback((deltaPct) => {
    const next = clampZoomPct(draft + deltaPct);
    setDraft(next);
    setInputText(String(next));
    commitZoom(next);
  }, [draft, commitZoom]);

  return (
    <div
      style={{
        padding: "8px 14px", display: "flex", flexDirection: "column", gap: 8,
        opacity: disabled ? 0.5 : 1, pointerEvents: disabled ? "none" : "auto",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 16, color: "#4B4B4B" }}>Zoom</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, justifyContent: "center" }}>
          <button
            onClick={(e) => { e.stopPropagation(); step(-5); }}
            disabled={disabled}
            style={{
              width: 32, height: 32, borderRadius: 4, border: "1px solid #EEEEF2",
              background: "#FFFFFF", color: "#4B4B4B", cursor: disabled ? "default" : "pointer",
              fontSize: 16, lineHeight: 1, flexShrink: 0,
            }}
          >
            −
          </button>
          <input
            type="number"
            value={inputText}
            disabled={disabled}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setInputText(e.target.value)}
            onBlur={commitInputText}
            onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
            style={{
              width: 60, height: 32, boxSizing: "border-box", textAlign: "left", fontSize: 14,
              border: "1px solid #EEEEF2", borderRadius: 4,
              padding: "3px 8px", color: "#1E1E1E",
            }}
          />
          <span style={{ fontSize: 14, color: "#4B4B4B" }}>%</span>
          <button
            onClick={(e) => { e.stopPropagation(); step(5); }}
            disabled={disabled}
            style={{
              width: 32, height: 32, borderRadius: 4, border: "1px solid #EEEEF2",
              background: "#FFFFFF", color: "#4B4B4B", cursor: disabled ? "default" : "pointer",
              fontSize: 16, lineHeight: 1, flexShrink: 0,
            }}
          >
            +
          </button>
        </div>
      </div>

      <input
        type="range"
        min={ZOOM_MIN * 100}
        max={ZOOM_MAX * 100}
        step={ZOOM_STEP * 100}
        value={draft}
        disabled={disabled}
        onClick={(e) => e.stopPropagation()}
        onChange={handleSliderChange}
        style={{ width: "100%" }}
      />

      <button
        onClick={(e) => { e.stopPropagation(); setDraft(100); setInputText("100"); commitZoom(100); }}
        disabled={disabled}
        style={{
          alignSelf: "flex-start", background: "none", border: "none",
          color: "#007ACC", fontSize: 14, cursor: disabled ? "default" : "pointer", padding: 0,
          textAlign: "left",
        }}
      >
        Reset to 100%
      </button>
    </div>
  );
}

function DropdownMenu({ label, items, disabled, minWidth = 200 }) {
  const [open, setOpen] = useState(false);
  const [hov, setHov] = useState(false);
  const [openFlyoutLabel, setOpenFlyoutLabel] = useState(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (!open) setOpenFlyoutLabel(null);
  }, [open]);

  return (
    <div ref={menuRef} style={{ position: "relative" }}>
      <button
        onClick={() => { if (!disabled) setOpen((p) => !p); }}
        onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
        style={{
          display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 6,
          border: open ? "1px solid #4B4B4B" : "1px solid transparent",
          background: open ? "#C9DEF5" : hov && !disabled ? "#E7E8EC" : "transparent",
          color: disabled ? "#AAAAAA" : "#4B4B4B", cursor: disabled ? "default" : "pointer",
          fontSize: 16, fontWeight: 400, fontFamily: "inherit", opacity: disabled ? 0.5 : 1,
          transition: "background 0.12s", whiteSpace: "nowrap",
        }}
      >
        <span>{label}</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, minWidth, zIndex: 200,
          background: "#E7E8EC", border: "1px solid #EEEEF2", borderRadius: 8, padding: "4px 0",
          overflow: openFlyoutLabel ? "visible" : "hidden",
        }}>
          {items.map((item, i) => item.divider ? (
            <div key={`div-${i}`} style={{ height: 1, background: "#C9DEF5", margin: "4px 8px" }} />
          ) : item.custom ? (
            <div key={item.key || `custom-${i}`}>{item.content}</div>
          ) : item.flyout ? (
            <FlyoutItem
              key={item.label}
              {...item}
              closeMenu={() => setOpen(false)}
              isOpen={openFlyoutLabel === item.label}
              onRequestOpen={() => setOpenFlyoutLabel(item.label)}
              onRequestClose={() => setOpenFlyoutLabel((cur) => (cur === item.label ? null : cur))}
            />
          ) : (
            <DropdownItem key={item.label} {...item} onAction={() => { item.onClick(); setOpen(false); }} />
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COLOR CONVERSION UTILS (for the custom HSV picker below)
// ═══════════════════════════════════════════════════════════════════════════════

function hsvToRgb(h, s, v) {
  h = h / 360; s = s / 100; v = v / 100;
  let r, g, b;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    default: r = v; g = p; b = q; break;
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function hexToRgb(hex) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h;
  if (d === 0) h = 0;
  else if (max === r) h = 60 * (((g - b) / d) % 6);
  else if (max === g) h = 60 * ((b - r) / d + 2);
  else h = 60 * ((r - g) / d + 4);
  if (h < 0) h += 360;
  const s = max === 0 ? 0 : d / max;
  return [h, s * 100, max * 100];
}

function hexToHsv(hex) {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHsv(r, g, b);
}

function hsvToHex(h, s, v) {
  const [r, g, b] = hsvToRgb(h, s, v);
  return rgbToHex(r, g, b);
}

function hsvToHsl(h, s, v) {
  s /= 100; v /= 100;
  const l = v * (1 - s / 2);
  const sl = (l === 0 || l === 1) ? 0 : (v - l) / Math.min(l, 1 - l);
  return [h, sl * 100, l * 100];
}

function hslToHsv(h, s, l) {
  s /= 100; l /= 100;
  const v = l + s * Math.min(l, 1 - l);
  const sv = v === 0 ? 0 : 2 * (1 - l / v);
  return [h, sv * 100, v * 100];
}

// ═══════════════════════════════════════════════════════════════════════════════
// CUSTOM HSV PICKER SUBCOMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

// Rounded-rectangle swatch button used inside the popover for "Color 1"
// and "Color 2". Clicking the one that's already active is a no-op (it's
// already the target of the SV square / value fields below); clicking the
// other one switches which slot is active — that slot's color then also
// becomes the fill color and is mirrored on the top-bar button.
function ColorRectButton({ color, active, disabled, onClick, label }) {
  const [hover, setHover] = useState(false);
  const borderColor = active ? "#007ACC" : (!disabled && hover) ? "#007ACC" : "#EEEEF2";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        flex: 1,
        height: 32,
        borderRadius: 8,
        border: `2px solid ${borderColor}`,
        background: color,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.4 : 1,
        padding: 0,
        boxSizing: "border-box",
      }}
    />
  );
}

// Saturation/Value square for a given hue. Dragging updates live (onDrag);
// releasing the mouse fires onCommit once, which is when the color should
// be recorded into "recent colors". Hue itself comes from the hue slider
// directly below it (or the hex/RGB/HSL fields, or the eyedropper).
function SVSquare({ hue, sat, val, onDrag, onCommit, disabled }) {
  const boxRef = useRef(null);
  const draggingRef = useRef(false);

  const pointFromEvent = (e) => {
    const box = boxRef.current;
    if (!box) return null;
    const rect = box.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    return { s: (x / rect.width) * 100, v: 100 - (y / rect.height) * 100 };
  };

  const handleMouseDown = (e) => {
    if (disabled) return;
    e.preventDefault();
    draggingRef.current = true;
    const p0 = pointFromEvent(e);
    if (p0) onDrag(p0.s, p0.v);
    const handleMove = (ev) => {
      if (!draggingRef.current) return;
      const p = pointFromEvent(ev);
      if (p) onDrag(p.s, p.v);
    };
    const handleUp = (ev) => {
      draggingRef.current = false;
      const p = pointFromEvent(ev) || { s: sat, v: val };
      onCommit(p.s, p.v);
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
    };
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
  };

  return (
    <div
      ref={boxRef}
      onMouseDown={handleMouseDown}
      style={{
        position: "relative",
        width: "100%",
        height: 120,
        borderRadius: 6,
        cursor: disabled ? "default" : "crosshair",
        userSelect: "none",
        opacity: disabled ? 0.5 : 1,
        background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), hsl(${hue}, 100%, 50%)`,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: `${sat}%`,
          top: `${100 - val}%`,
          width: 12, height: 12,
          borderRadius: "50%",
          border: "2px solid #fff",
          boxShadow: "0 0 0 1px rgba(0,0,0,0.45)",
          transform: "translate(-50%, -50%)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

// Hue slider, 0-360 across the width, sitting directly under the SV
// square. Dragging updates live (onDrag); releasing the mouse fires
// onCommit once, which is when the color should be recorded into
// "recent colors". Only hue changes here — saturation/value stay as they
// were on the SV square.
function HueSlider({ hue, onDrag, onCommit, disabled }) {
  const barRef = useRef(null);
  const draggingRef = useRef(false);

  const hueFromEvent = (e) => {
    const bar = barRef.current;
    if (!bar) return null;
    const rect = bar.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    return (x / rect.width) * 360;
  };

  const handleMouseDown = (e) => {
    if (disabled) return;
    e.preventDefault();
    draggingRef.current = true;
    const h0 = hueFromEvent(e);
    if (h0 != null) onDrag(h0);
    const handleMove = (ev) => {
      if (!draggingRef.current) return;
      const h = hueFromEvent(ev);
      if (h != null) onDrag(h);
    };
    const handleUp = (ev) => {
      draggingRef.current = false;
      const h = hueFromEvent(ev);
      onCommit(h != null ? h : hue);
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
    };
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
  };

  return (
    <div
      ref={barRef}
      onMouseDown={handleMouseDown}
      style={{
        position: "relative",
        width: "100%",
        height: 14,
        borderRadius: 7,
        cursor: disabled ? "default" : "pointer",
        userSelect: "none",
        opacity: disabled ? 0.5 : 1,
        background: "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: `${(hue / 360) * 100}%`,
          top: "50%",
          width: 14, height: 14,
          borderRadius: "50%",
          border: "2px solid #fff",
          boxShadow: "0 0 0 1px rgba(0,0,0,0.45)",
          background: `hsl(${hue}, 100%, 50%)`,
          transform: "translate(-50%, -50%)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

// Small eyedropper icon (approximated with basic paths — no external
// asset needed).
function EyedropperIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 2.2a1.6 1.6 0 012.3 2.3l-1 1-2.3-2.3 1-1z" fill="currentColor" stroke="none" />
      <path d="M10.3 3.9l1.8 1.8-6.4 6.4-2.4.6.6-2.4 6.4-6.4z" />
      <path d="M3.3 11.7l-.9 2.4 2.4-.9" />
    </svg>
  );
}

// Eyedropper button — uses the browser's native EyeDropper API (Chrome/
// Edge) to sample any pixel on screen. Feature-detected: disabled with an
// explanatory tooltip in browsers that don't support it (Firefox, Safari).
function EyedropperButton({ onPick, disabled }) {
  const supported = typeof window !== "undefined" && "EyeDropper" in window;
  const [hover, setHover] = useState(false);
  const isDisabled = disabled || !supported;

  const handleClick = async () => {
    if (isDisabled) return;
    try {
      const dropper = new window.EyeDropper();
      const result = await dropper.open();
      if (result && result.sRGBHex) onPick(result.sRGBHex.toLowerCase());
    } catch {
      // User cancelled (Escape) or the pick failed — nothing to do.
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isDisabled}
      title={supported ? "Pick color from screen" : "Eyedropper isn't supported in this browser"}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 28, height: 28,
        borderRadius: 6,
        border: `1px solid ${!isDisabled && hover ? "#007ACC" : "#EEEEF2"}`,
        background: "#FFFFFF",
        color: !isDisabled && hover ? "#007ACC" : "#4B4B4B",
        cursor: isDisabled ? "default" : "pointer",
        opacity: isDisabled ? 0.4 : 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        padding: 0,
        boxSizing: "border-box",
      }}
    >
      <EyedropperIcon />
    </button>
  );
}

// A single labeled numeric field, used for the RGB/HSL entry rows. Commits
// (clamped to [min, max]) on blur or Enter; reverts to the last valid
// value if what's typed doesn't parse.
function NumberField({ label, value, min, max, onCommit }) {
  const [draft, setDraft] = useState(String(Math.round(value)));
  useEffect(() => { setDraft(String(Math.round(value))); }, [value]);

  const commit = () => {
    const n = parseFloat(draft);
    if (Number.isFinite(n)) {
      onCommit(Math.max(min, Math.min(max, n)));
    } else {
      setDraft(String(Math.round(value)));
    }
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
      <input
        type="number"
        value={draft}
        min={min}
        max={max}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") { commit(); e.currentTarget.blur(); } }}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "5px 6px",
          borderRadius: 6,
          border: "1px solid #EEEEF2",
          background: "#FFFFFF",
          color: "#1E1E1E",
          fontSize: 12,
          fontFamily: "inherit",
        }}
      />
      <span style={{ fontSize: 10, color: "#8A8A8A", textAlign: "center" }}>{label}</span>
    </div>
  );
}

// Typeable hex field. Accepts 3- or 6-digit hex (with or without a leading
// "#"); reverts to the last valid color on blur/Enter if what's typed
// doesn't parse.
function HexInput({ hex, onCommit }) {
  const [draft, setDraft] = useState(hex);
  useEffect(() => { setDraft(hex); }, [hex]);

  const commit = () => {
    let v = draft.trim();
    if (!v.startsWith("#")) v = "#" + v;
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      onCommit(v.toLowerCase());
    } else if (/^#[0-9a-fA-F]{3}$/.test(v)) {
      onCommit(("#" + v.slice(1).split("").map((c) => c + c).join("")).toLowerCase());
    } else {
      setDraft(hex);
    }
  };

  return (
    <input
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") { commit(); e.currentTarget.blur(); } }}
      spellCheck={false}
      style={{
        flex: 1,
        minWidth: 0,
        boxSizing: "border-box",
        padding: "5px 8px",
        borderRadius: 6,
        border: "1px solid #EEEEF2",
        background: "#FFFFFF",
        color: "#1E1E1E",
        fontSize: 13,
        fontFamily: "inherit",
      }}
    />
  );
}

// The value-entry row: a Hex field, RGB fields, or HSL fields depending on
// the active mode, plus the mode-toggle buttons underneath. Whichever
// fields are shown, committing a value converts back to HSV and reports
// it up via onCommitHsv.
function ColorValueFields({ hsv, onCommitHsv }) {
  const [mode, setMode] = useState("hex");
  const [h, s, v] = hsv;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {mode === "hex" && (
        <HexInput
          hex={hsvToHex(h, s, v)}
          onCommit={(hex) => onCommitHsv(hexToHsv(hex))}
        />
      )}

      {mode === "rgb" && (() => {
        const [r, g, b] = hsvToRgb(h, s, v);
        return (
          <div style={{ display: "flex", gap: 6 }}>
            <NumberField label="R" value={r} min={0} max={255} onCommit={(nr) => onCommitHsv(rgbToHsv(nr, g, b))} />
            <NumberField label="G" value={g} min={0} max={255} onCommit={(ng) => onCommitHsv(rgbToHsv(r, ng, b))} />
            <NumberField label="B" value={b} min={0} max={255} onCommit={(nb) => onCommitHsv(rgbToHsv(r, g, nb))} />
          </div>
        );
      })()}

      {mode === "hsl" && (() => {
        const [hh, sl, l] = hsvToHsl(h, s, v);
        return (
          <div style={{ display: "flex", gap: 6 }}>
            <NumberField label="H" value={hh} min={0} max={360} onCommit={(nh) => onCommitHsv(hslToHsv(nh, sl, l))} />
            <NumberField label="S" value={sl} min={0} max={100} onCommit={(ns) => onCommitHsv(hslToHsv(hh, ns, l))} />
            <NumberField label="L" value={l} min={0} max={100} onCommit={(nl) => onCommitHsv(hslToHsv(hh, sl, nl))} />
          </div>
        );
      })()}

      <div style={{ display: "flex", gap: 6 }}>
        {["hex", "rgb", "hsl"].map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            style={{
              flex: 1,
              padding: "4px 0",
              borderRadius: 6,
              border: `1px solid ${mode === m ? "#007ACC" : "#EEEEF2"}`,
              background: mode === m ? "#DCEEFB" : "#FFFFFF",
              color: mode === m ? "#007ACC" : "#4B4B4B",
              fontSize: 11,
              fontWeight: mode === m ? 600 : 400,
              cursor: "pointer",
              textTransform: "uppercase",
            }}
          >
            {m}
          </button>
        ))}
      </div>
    </div>
  );
}

// Single color-picker button on the top bar, showing whichever of
// "Color 1"/"Color 2" is currently active. Clicking it toggles a popover
// open/closed (border turns #007ACC while open). Inside the popover:
// the two swatches as rounded-rectangle buttons side by side; an SV
// square below them (saturation/value for the current hue) with a hue
// slider directly beneath it; a value row — hex, RGB, or HSL fields
// (toggled via buttons underneath) plus an eyedropper to the right for
// sampling any color from the screen; and a shared, in-memory
// (session-only) row of recently-picked colors at the bottom.
function ColorPicker({ colors, setColors, active, setActive, onChange, onCommit, disabled, fillMode }) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const containerRef = useRef(null);
  const btnRef = useRef(null);
  const panelRef = useRef(null);
  // Popover position in viewport (fixed) coordinates — computed and clamped
  // after each open so the panel can never extend past any edge of the
  // window, not just left/right.
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  // Shared, in-memory (session-only) recent colors, most-recent-first,
  // shared across both Color 1 and Color 2, capped at 8.
  const [recentColors, setRecentColors] = useState([]);
  const addRecent = useCallback((hex) => {
    setRecentColors((prev) => [hex, ...prev.filter((c) => c.toLowerCase() !== hex.toLowerCase())].slice(0, 8));
  }, []);

  // Local HSV draft for whichever swatch is active, so dragging the SV
  // square feels instant. Re-synced from the active swatch's stored color
  // each time the popover opens, or whenever the active slot changes while
  // it's already open (clicking the other rectangle button).
  const [hsv, setHsv] = useState(() => hexToHsv(colors[active]));
  useEffect(() => {
    if (open) setHsv(hexToHsv(colors[active]));
  }, [open, active]);

  const timerRef = useRef(null);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  // If the picker becomes disabled while its popover is open — e.g. the
  // selection is cleared in selection mode via Escape or the Edit menu's
  // Deselect, neither of which clicks outside the popover — close it.
  // Several of the popover's inner controls (the SV square, hue slider,
  // value fields, recent-colors row) don't individually check `disabled`,
  // so leaving a stale popover open would leave them fully interactive.
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Keep the popover fully on-screen: position it in fixed (viewport)
  // coordinates, anchored under the button, then clamp so none of its
  // edges — left, right, top, or bottom — can run past the window. This
  // matters most at the top edge, since the top bar itself sits flush
  // against it, so a naive "flip above the button" would push the panel
  // off the top of the screen instead of fixing anything.
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const btn = btnRef.current;
      const panel = panelRef.current;
      if (!btn || !panel) return;
      const margin = 8;
      const btnRect = btn.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();

      let left = btnRect.left;
      left = Math.min(left, window.innerWidth - panelRect.width - margin);
      left = Math.max(left, margin);

      let top = btnRect.bottom + 6;
      if (top + panelRect.height > window.innerHeight - margin) {
        const above = btnRect.top - panelRect.height - 6;
        top = above >= margin ? above : Math.max(margin, window.innerHeight - panelRect.height - margin);
      }

      setCoords({ top, left });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open]);

  // Live push while dragging the SV square: update shared color state +
  // cellColor, but debounced so a fast drag doesn't re-render the grid
  // every frame.
  const scheduleLivePush = (h, s, v) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const hex = hsvToHex(h, s, v);
      setColors((prev) => prev.map((c, i) => (i === active ? hex : c)));
      onChange(hex);
    }, 80);
  };

  // Committed change (mouse released on the SV square, a value field
  // confirmed, the eyedropper used, or a recent color clicked): push
  // immediately and record it into recent colors.
  const commitAndRecord = (h, s, v) => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    const hex = hsvToHex(h, s, v);
    setColors((prev) => prev.map((c, i) => (i === active ? hex : c)));
    onChange(hex);
    if (onCommit) onCommit(hex);
    addRecent(hex);
  };

  const handleRectClick = (i) => {
    if (disabled || active === i) return;
    setActive(i);
    onChange(colors[i]);
    if (onCommit) onCommit(colors[i]);
  };

  const applyRecent = (hex) => {
    const next = hexToHsv(hex);
    setHsv(next);
    setColors((prev) => prev.map((c, i) => (i === active ? hex : c)));
    onChange(hex);
    if (onCommit) onCommit(hex);
    addRecent(hex);
  };

  const handleEyedropperPick = (hex) => {
    const next = hexToHsv(hex);
    setHsv(next);
    commitAndRecord(next[0], next[1], next[2]);
  };

  const mainBorder = open ? "#007ACC" : (!disabled && hover) ? "#007ACC" : "#EEEEF2";

  return (
    <div ref={containerRef} style={{ position: "relative", flexShrink: 0, display: "flex", alignItems: "center" }}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => { if (!disabled) setOpen((p) => !p); }}
        disabled={disabled}
        title="Cell colour"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          width: 24, height: 24,
          borderRadius: "50%",
          border: `2px solid ${mainBorder}`,
          background: colors[active],
          cursor: disabled ? "default" : "pointer",
          opacity: disabled ? 0.4 : 1,
          padding: 0,
          flexShrink: 0,
        }}
      />

      {open && (
        <div
          ref={panelRef}
          style={{
            position: "fixed",
            top: coords.top,
            left: coords.left,
            zIndex: 200,
            background: "#E7E8EC",
            border: "1px solid #EEEEF2",
            borderRadius: 8,
            padding: 10,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            width: 200,
          }}
        >
          <div style={{ display: "flex", gap: 8 }}>
            <ColorRectButton
              color={colors[0]}
              active={active === 0}
              disabled={disabled}
              onClick={() => handleRectClick(0)}
              label="Color 1"
            />
            <ColorRectButton
              color={colors[1]}
              active={active === 1}
              disabled={disabled}
              onClick={() => handleRectClick(1)}
              label="Color 2"
            />
          </div>

          <SVSquare
            hue={hsv[0]} sat={hsv[1]} val={hsv[2]}
            onDrag={(s, v) => { setHsv([hsv[0], s, v]); scheduleLivePush(hsv[0], s, v); }}
            onCommit={(s, v) => { setHsv([hsv[0], s, v]); commitAndRecord(hsv[0], s, v); }}
            disabled={disabled}
          />

          <HueSlider
            hue={hsv[0]}
            onDrag={(h) => { setHsv([h, hsv[1], hsv[2]]); scheduleLivePush(h, hsv[1], hsv[2]); }}
            onCommit={(h) => { setHsv([h, hsv[1], hsv[2]]); commitAndRecord(h, hsv[1], hsv[2]); }}
            disabled={disabled}
          />

          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <ColorValueFields
                hsv={hsv}
                onCommitHsv={(next) => { setHsv(next); commitAndRecord(next[0], next[1], next[2]); }}
              />
            </div>
            <EyedropperButton disabled={disabled} onPick={handleEyedropperPick} />
          </div>

          {recentColors.length > 0 && (
            <>
              <div style={{ height: 1, background: "#EEEEF2" }} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {recentColors.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => { if (!disabled) applyRecent(c); }}
                    disabled={disabled}
                    title={c}
                    style={{
                      width: 18, height: 18,
                      borderRadius: "50%",
                      border: "1px solid #EEEEF2",
                      background: c,
                      cursor: disabled ? "default" : "pointer",
                      opacity: disabled ? 0.5 : 1,
                      padding: 0,
                      flexShrink: 0,
                      boxSizing: "border-box",
                    }}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ModeBtn({ svg, label, active, onClick, disabled, disabledCursor }) {
  const [hov, setHov] = useState(false);
  const color = disabled ? "#AAAAAA" : active ? "#007ACC" : hov ? "#4B4B4B" : "#8A8A8A";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 28, height: 28, flexShrink: 0,
        border: "none", background: "transparent", padding: 0,
        cursor: disabled ? (disabledCursor || "default") : "pointer",
        opacity: disabled ? 0.4 : 1,
        transition: "filter 0.12s",
      }}
    >
      <svg viewBox={svg.viewBox} width="20" height="20" xmlns="http://www.w3.org/2000/svg"
        style={{ display: "block", flexShrink: 0 }}
      >
        {svg.paths.map((p, i) => (
          <path key={i} d={p.d} fill={p.fill === "stroke" ? "none" : color}
            stroke={p.fill === "stroke" ? color : undefined}
            strokeWidth={p.strokeWidth} strokeLinecap={p.strokeLinecap} strokeLinejoin={p.strokeLinejoin}
          />
        ))}
      </svg>
    </button>
  );
}

const MOUSE_POINTER_SVG = {
  viewBox: "0 0 24 24",
  paths: [{ d: "M4 4l7.07 17 2.51-7.39L21 11.07z", fill: "stroke", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }],
};

const COLOR_FILL_SVG = {
  viewBox: "0 0 24 24",
  paths: [
    { d: "M20 14c-.092.064-2 2.083-2 3.5 0 1.494.949 2.448 2 2.5.906.044 2-.891 2-2.5 0-1.5-1.908-3.436-2-3.5zM9.586 20c.378.378.88.586 1.414.586s1.036-.208 1.414-.586l7-7-.707-.707L11 4.586 8.707 2.293 7.293 3.707 9.586 6 4 11.586c-.378.378-.586.88-.586 1.414s.208 1.036.586 1.414L9.586 20zM11 7.414 16.586 13H5.414L11 7.414z", fill: "fill" },
  ],
};

// "Add" plus icon (from add.svg), reused as the toolbar's "Guide Line mode"
// icon — native 16x16 viewBox, unlike the other mode icons' 0-24, but
// ModeBtn scales whatever viewBox is given so this renders at the same
// size as its neighbors.
const GUIDE_LINE_MODE_SVG = {
  viewBox: "0 0 16 16",
  paths: [{ d: "M14 6.75v1.5H8.25V14h-1.5V8.25H1v-1.5h5.75V1h1.5v5.75H14z", fill: "fill" }],
};

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
          background: "#FFFFFF",
          border: "1px solid #EEEEF2",
          borderRadius: 6,
          color: "#1E1E1E",
          fontSize: 16,
          fontWeight: 400,
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
        color: "#8A8A8A",
        fontSize: 16,
        fontWeight: 400,
        padding: "3px 10px",
        borderRadius: 6,
        cursor: "text",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        maxWidth: 300,
        transition: "color 0.12s, background 0.12s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = "#4B4B4B"; e.currentTarget.style.background = "#E7E8EC"; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = "#8A8A8A"; e.currentTarget.style.background = "transparent"; }}
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
          return <strong key={i} style={{ color: "#4B4B4B", fontWeight: 400 }}>{part.slice(2, -2)}</strong>;
        if (part.startsWith("`") && part.endsWith("`"))
          return <code key={i} style={{ background: "#E7E8EC", color: "#007ACC", borderRadius: 3, padding: "1px 5px", fontSize: 11, fontFamily: "Arial, sans-serif" }}>{part.slice(1, -1)}</code>;
        return part;
      })}
    </>
  );
}



function HelpModal({ title, sections, onClose }) {
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
          background: "#E7E8EC",
          border: "1px solid #EEEEF2",
          borderRadius: 12,
          padding: "24px 28px",
          maxWidth: 520,
          maxHeight: "80vh",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            color: "#C42B1C",
            fontSize: 20,
            fontWeight: 400,
            letterSpacing: 2,
            marginBottom: 16,
            textAlign: "left",
          }}
        >
          {title}
        </div>
        {sections.map((section) => (
          <div key={section.title} style={{ marginBottom: 14 }}>
            <div
              style={{
                color: "#007ACC",
                fontSize: 13,
                fontWeight: 400,
                letterSpacing: 1,
                marginBottom: 4,
                textAlign: "left",
              }}
            >
              {section.title}
            </div>
            {section.cols ? (
              <div style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "1px 12px", paddingLeft: 8 }}>
                {section.items.map((item, i) => {
                  // Real shortcut lines look like "**ctrl + z:** undo" —
                  // the bold wraps *around* the colon, so a naive
                  // first-colon split would leave stray "**" on both
                  // sides. Match that shape explicitly; fall back to a
                  // plain colon split (with any "**" stripped) for
                  // anything that doesn't fit it.
                  const match = item.match(/^\*\*(.+?):\*\*\s*(.*)$/);
                  let key, val;
                  if (match) {
                    key = match[1];
                    val = match[2];
                  } else {
                    const colon = item.indexOf(":");
                    key = (colon !== -1 ? item.slice(0, colon) : item).replace(/\*\*/g, "");
                    val = (colon !== -1 ? item.slice(colon + 1).trim() : "").replace(/\*\*/g, "");
                  }
                  return [
                    <span key={`k${i}`} style={{ color: "#4B4B4B", fontSize: 12, fontWeight: 400, lineHeight: 1.8, whiteSpace: "nowrap", textAlign: "left" }}>{key}</span>,
                    <span key={`v${i}`} style={{ color: "#8A8A8A", fontSize: 12, lineHeight: 1.8, textAlign: "left" }}>{val}</span>,
                  ];
                })}
              </div>
            ) : (
              section.items.map((item, i) => (
                <div key={i} style={{ color: "#8A8A8A", fontSize: 12, lineHeight: 1.7, paddingLeft: 8, textAlign: "left" }}>
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
// CONTEXT MENU (right-click on canvas)
// ═══════════════════════════════════════════════════════════════════════════════

function ContextEditMenu({ items, x, y, onClose, lastUsedSymbol, onUseLastSymbol, lastUsedDisabled, quickColors, onQuickColor, quickColorsDisabled }) {
  const menuRef = useRef(null);
  const [openFlyoutLabel, setOpenFlyoutLabel] = useState(null);
  const [pos, setPos] = useState({ left: x, top: y, ready: false });

  // Close on any mousedown outside the menu
  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    };
    // Use capture so we catch clicks before they reach other handlers
    document.addEventListener("mousedown", handler, true);
    return () => document.removeEventListener("mousedown", handler, true);
  }, [onClose]);

  // Last-used symbol chip: scale width proportionally to how many cells it spans,
  // same convention as the grid/sidebar (width-N symbols render N cells wide).
  const SYMBOL_UNIT = 18;
  const symbolSpan = lastUsedSymbol ? Math.max(1, lastUsedSymbol.width || 1) : 1;
  const symbolImgWidth = SYMBOL_UNIT * symbolSpan;
  const chipWidth = symbolImgWidth + 16;
  const chipHeight = SYMBOL_UNIT + 10;

  const MENU_W = Math.max(220, chipWidth + 28);

  // Measure the menu's actual rendered size and clamp it fully on-screen.
  // Item count varies with selection state and which flyouts exist, so a
  // fixed height guess drifts out of date as options are added — measuring
  // after layout keeps this correct regardless of how tall the menu grows.
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const margin = 8;
    const rect = el.getBoundingClientRect();
    const left = Math.max(margin, Math.min(x, window.innerWidth - rect.width - margin));
    const top = Math.max(margin, Math.min(y, window.innerHeight - rect.height - margin));
    setPos({ left, top, ready: true });
  }, [x, y, items, lastUsedSymbol]);

  return (
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        left: pos.left,
        top: pos.top,
        visibility: pos.ready ? "visible" : "hidden",
        minWidth: MENU_W,
        zIndex: 300,
        background: "#E7E8EC",
        border: "1px solid #EEEEF2",
        borderRadius: 8,
        padding: "4px 0",
        overflow: openFlyoutLabel ? "visible" : "hidden",
      }}
    >
      {/* Last used symbol — quick re-apply, context-menu only */}
      {lastUsedSymbol && (
        <>
          <button
            onClick={() => { if (!lastUsedDisabled) { onUseLastSymbol(); onClose(); } }}
            disabled={lastUsedDisabled}
            title="Apply last used symbol"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", width: "100%",
              padding: "8px 14px", background: "transparent", border: "none",
              cursor: lastUsedDisabled ? "default" : "pointer", fontFamily: "inherit",
              opacity: lastUsedDisabled ? 0.5 : 1,
              boxSizing: "border-box",
            }}
            onMouseEnter={(e) => { if (!lastUsedDisabled) e.currentTarget.style.background = "#E7E8EC"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <span style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: chipWidth, height: chipHeight, borderRadius: 6, background: "#FFFFFF",
            }}>
              <img src={svgToDataUrl(lastUsedSymbol.svgContent)} alt="" style={{ width: symbolImgWidth, height: SYMBOL_UNIT, flexShrink: 0 }} />
            </span>
          </button>
          <div style={{ height: 1, background: "#C9DEF5", margin: "4px 8px" }} />
        </>
      )}

      {/* Quick color swatches — Color 1 / Color 2 from the fill-mode color
          picker. Colors the current selection with one click. */}
      {quickColors && quickColors.length === 2 && (
        <>
          <div style={{ display: "flex", gap: 8, padding: "8px 14px", boxSizing: "border-box" }}>
            {quickColors.map((hex, i) => (
              <button
                key={i}
                onClick={() => { if (!quickColorsDisabled) { onQuickColor(hex); onClose(); } }}
                disabled={quickColorsDisabled}
                title={`Color selected cells: ${hex}`}
                style={{
                  flex: 1, height: 28, borderRadius: 6, border: "1px solid #C9DEF5",
                  background: hex, cursor: quickColorsDisabled ? "default" : "pointer",
                  opacity: quickColorsDisabled ? 0.5 : 1, padding: 0, boxSizing: "border-box",
                }}
              />
            ))}
          </div>
          <div style={{ height: 1, background: "#C9DEF5", margin: "4px 8px" }} />
        </>
      )}

      {items.map((item, i) =>
        item.divider ? (
          <div key={`cdiv-${i}`} style={{ height: 1, background: "#C9DEF5", margin: "4px 8px" }} />
        ) : item.flyout ? (
          <FlyoutItem
            key={item.label}
            {...item}
            closeMenu={onClose}
            isOpen={openFlyoutLabel === item.label}
            onRequestOpen={() => setOpenFlyoutLabel(item.label)}
            onRequestClose={() => setOpenFlyoutLabel((cur) => (cur === item.label ? null : cur))}
          />
        ) : (
          <DropdownItem
            key={item.label}
            {...item}
            onAction={() => { item.onClick(); onClose(); }}
          />
        )
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOP BAR
// ═══════════════════════════════════════════════════════════════════════════════

export default function TopBar({ selected, setSelected, historyLen, undo, redo, clipboard, copySelected, paste, colorClipboard, copySelectedColor, pasteColor, symbolClipboard, copySelectedSymbol, pasteSymbol, cutSelectedSymbols, mirrorUp, mirrorDown, mirrorLeft, mirrorRight, flipHorizontal, flipVertical, clearSelected, clearSelectedColors, colorSelectedCells, clearAllCells, clearAllColors, setShowConfirm, cells, symbols, bgImage, bgImageEditing, bgFileInputRef, handleBgImageUpload, bgImageFix, bgImageEdit, bgImageRemove, applyBgImageToColors, addColumn, addRow, insertColumnsBefore, insertColumnsAfter, insertRowBefore, insertRowAfter, removeSelectedColumns, removeSelectedRows, importGridmark, saveGridmark, saveError, resizeGrid, resizeCell, cellAspect, gridRows, gridCols, knittingMode, toggleKnittingMode, fileName, setFileName, cellColor, setCellColor, fillMode, setFillMode, fitGridToPage, memoOpen, onMemoToggle, contextMenuPos, onContextMenuClose, openFind, openReplace, lastUsedSymbolId, placeSymbol, rowShading = "none", setRowShading, zoom, setZoom, saveGroup, guideLines = [], guideLineMode = false, toggleGuideLineMode, selectedGuideLineId = null, guideLineClipboard = null, copyGuideLine, cutGuideLine, pasteGuideLine }) {
  const importFileRef = useRef(null);
  const hasContent = cells.size > 0;
  let hasSymbolsUsed = false;
  for (const cell of cells.values()) {
    if (cell.symbolId) { hasSymbolsUsed = true; break; }
  }

  useEffect(() => {
    if (fileName) document.title = `${fileName}`;
  }, [fileName]);
  const allDisabled = bgImageEditing || knittingMode;
  const menusDisabled = allDisabled;
  const hasSel = selected.size > 0;
  const lastUsedSymbol = symbols.find((s) => s.id === lastUsedSymbolId) || null;
  const [showResizeModal, setShowResizeModal] = useState(false);
  const [showResizeCellModal, setShowResizeCellModal] = useState(false);
  // null | "grid" | "shortcuts" — which Help modal (if any) is open.
  const [helpModal, setHelpModal] = useState(null);
  const [showReportIssueModal, setShowReportIssueModal] = useState(false);

  // "Color 1" / "Color 2" swatches. Both default to white, "Color 1"
  // active. Whichever slot is active supplies the fill color (cellColor);
  // switching slots re-points cellColor at the newly active slot's color.
  const [colorSlots, setColorSlots] = useState(["#ffffff", "#ffffff"]);
  const [activeColorSlot, setActiveColorSlot] = useState(0);

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
    { icon: { d: ICON_PATHS.undo }, label: "Undo", shortcut: modKey("Z"), onClick: undo, disabled: menusDisabled || historyLen.undo === 0 },
    { icon: { d: ICON_PATHS.redo }, label: "Redo", shortcut: modKey("Y"), onClick: redo, disabled: menusDisabled || historyLen.redo === 0 },
    { divider: true },
    {
      flyout: true,
      icon: { d: ICON_PATHS.cut },
      label: "Cut",
      disabled: menusDisabled,
      items: [
        { icon: { d: ICON_PATHS.cut }, label: "All", shortcut: modKey("X"), onClick: clearSelected, disabled: menusDisabled || !hasSel },
        { icon: { d: ICON_PATHS.clearAllColors }, label: "Color", onClick: clearSelectedColors, disabled: menusDisabled || !hasSel },
        { icon: { d: ICON_PATHS.edit }, label: "Symbol", onClick: cutSelectedSymbols, disabled: menusDisabled || !hasSel },
        { icon: { d: ICON_PATHS.guideLine }, label: "Guide Line", onClick: cutGuideLine, disabled: menusDisabled || !selectedGuideLineId },
      ],
    },
    {
      flyout: true,
      icon: { d: ICON_PATHS.copy },
      label: "Copy",
      disabled: menusDisabled,
      items: [
        { icon: { d: ICON_PATHS.copy }, label: "All", shortcut: modKey("C"), onClick: copySelected, disabled: menusDisabled || !hasSel },
        { icon: { d: ICON_PATHS.clearAllColors }, label: "Color", onClick: copySelectedColor, disabled: menusDisabled || !hasSel },
        { icon: { d: ICON_PATHS.edit }, label: "Symbol", onClick: copySelectedSymbol, disabled: menusDisabled || !hasSel },
        { icon: { d: ICON_PATHS.guideLine }, label: "Guide Line", onClick: copyGuideLine, disabled: menusDisabled || !selectedGuideLineId },
      ],
    },
    {
      flyout: true,
      icon: { d: ICON_PATHS.paste },
      label: "Paste",
      disabled: menusDisabled,
      items: [
        { icon: { d: ICON_PATHS.paste }, label: "All", shortcut: modKey("V"), onClick: paste, disabled: menusDisabled || !clipboard || !hasSel },
        { icon: { d: ICON_PATHS.clearAllColors }, label: "Color", onClick: pasteColor, disabled: menusDisabled || !colorClipboard || !hasSel },
        { icon: { d: ICON_PATHS.edit }, label: "Symbol", onClick: pasteSymbol, disabled: menusDisabled || !symbolClipboard || !hasSel },
        { icon: { d: ICON_PATHS.guideLine }, label: "Guide Line", onClick: pasteGuideLine, disabled: menusDisabled || !guideLineClipboard },
      ],
    },
    { icon: { d: ICON_PATHS.group }, label: "Group", onClick: saveGroup, disabled: menusDisabled || !hasSel },
    { divider: true },
    {
      flyout: true,
      icon: { d: ICON_PATHS.mirror },
      label: "Mirror",
      color: "#8250DF",
      disabled: menusDisabled || !hasSel,
      items: [
        { icon: { d: ICON_PATHS.mirrorUp }, label: "Up", onClick: mirrorUp, disabled: menusDisabled || !hasSel },
        { icon: { d: ICON_PATHS.mirrorDown }, label: "Down", onClick: mirrorDown, disabled: menusDisabled || !hasSel },
        { icon: { d: ICON_PATHS.mirrorLeft }, label: "Left", onClick: mirrorLeft, disabled: menusDisabled || !hasSel },
        { icon: { d: ICON_PATHS.mirrorRight }, label: "Right", onClick: mirrorRight, disabled: menusDisabled || !hasSel },
      ],
    },
    { icon: { d: ICON_PATHS.flipHorizontal }, label: "Flip Horizontal", onClick: flipHorizontal, disabled: menusDisabled || !hasSel },
    { icon: { d: ICON_PATHS.flipVertical }, label: "Flip Vertical", onClick: flipVertical, disabled: menusDisabled || !hasSel },
    { divider: true },
    { icon: { d: ICON_PATHS.search, viewBox: "0 0 24 24" }, label: "Find", shortcut: modKey("F"), onClick: openFind, disabled: menusDisabled },
    { icon: { d: ICON_PATHS.replace }, label: "Replace", shortcut: modKey("H"), onClick: openReplace, disabled: menusDisabled },
    { divider: true },
    { icon: { d: ICON_PATHS.deselect }, label: "Deselect", onClick: () => setSelected(new Set()), disabled: menusDisabled || !hasSel },
    { divider: true },
    { icon: { d: ICON_PATHS.resizeGrid }, label: "Resize Grid", onClick: () => setShowResizeModal(true), disabled: menusDisabled },
    { icon: { d: ICON_PATHS.resizeCell }, label: "Resize Cell", onClick: () => setShowResizeCellModal(true), disabled: menusDisabled },
    { divider: true },
    { icon: { d: ICON_PATHS.clearAllColors }, label: "Clear All Colors", onClick: clearAllColors, disabled: menusDisabled || knittingMode || !hasContent },
    { icon: { d: ICON_PATHS.clearAllCells }, label: "Clear All Cells", onClick: clearAllCells, disabled: menusDisabled || knittingMode || !hasContent },
    { icon: { d: ICON_PATHS.trash }, label: "Restart", onClick: () => setShowConfirm(true), disabled: menusDisabled || knittingMode },
  ];

  const insertItems = [
    { icon: { d: ICON_PATHS.colBef }, label: "Column Before", onClick: insertColumnsBefore, disabled: menusDisabled || !hasSel },
    { icon: { d: ICON_PATHS.colAft }, label: "Column After", onClick: insertColumnsAfter, disabled: menusDisabled || !hasSel },
    { icon: { d:ICON_PATHS.rowBef }, label: "Row Before", onClick: insertRowBefore, disabled: menusDisabled || !hasSel },
    { icon: { d: ICON_PATHS.rowAft }, label: "Row After", onClick: insertRowAfter, disabled: menusDisabled || !hasSel },
    { divider: true },
    { icon: { d: ICON_PATHS.colAdd }, label: "Add Column", onClick: addColumn, disabled: menusDisabled },
    { icon: { d: ICON_PATHS.rowAdd }, label: "Add Row", onClick: addRow, disabled: menusDisabled },
    { divider: true },
    { icon: { d: ICON_PATHS.colDel }, label: "Remove Column", onClick: removeSelectedColumns, disabled: menusDisabled || !hasSel },
    { icon: { d: ICON_PATHS.rowDel }, label: "Remove Row", onClick: removeSelectedRows, disabled: menusDisabled || !hasSel },
  ];

  const viewItems = [
    {
      icon: { d: ICON_PATHS.knittingMode },
      label: knittingMode ? "Exit Knitting Mode" : "Knitting Mode",
      color: knittingMode ? "#BF3989" : "#BF3989",
      onClick: toggleKnittingMode,
      disabled: bgImageEditing,
    },
    { divider: true },
    {
      icon: { d: ICON_PATHS.noShading },
      label: "No Shading",
      color: rowShading === "none" ? "#007ACC" : "#4B4B4B",
      onClick: () => setRowShading("none"),
      disabled: menusDisabled,
    },
    {
      icon: { d: ICON_PATHS.shading },
      label: "Shading",
      color: rowShading === "alternate" ? "#007ACC" : "#4B4B4B",
      onClick: () => setRowShading("alternate"),
      disabled: menusDisabled,
    },
    { divider: true },
    { icon: { d: ICON_PATHS.backgroundImage }, label: "Background Image", color: "#4B4B4B", onClick: () => bgFileInputRef.current?.click(), disabled: menusDisabled || knittingMode },
    { icon: { d: ICON_PATHS.edit }, label: "Edit Background Image", color: "#4B4B4B", onClick: bgImageEdit, disabled: menusDisabled || !bgImage },
    { icon: { d: ICON_PATHS.cut }, label: "Remove Background Image", color: "#4B4B4B", onClick: bgImageRemove, disabled: menusDisabled || !bgImage },
    { icon: { d: COLOR_FILL_SVG.paths[0].d, viewBox: COLOR_FILL_SVG.viewBox }, label: "Trace Background to Colors", color: "#4B4B4B", onClick: applyBgImageToColors, disabled: menusDisabled || !bgImage },
    { divider: true },
    { icon: { d: ICON_PATHS.memo }, label: "Memo", color: "#4B4B4B", onClick: onMemoToggle, disabled: menusDisabled },
    { divider: true },
    { icon: { d: ICON_PATHS.fitToPage }, label: "Fit to Page", color: "#007ACC", onClick: fitGridToPage, disabled: menusDisabled },
    {
      custom: true,
      key: "zoom-control",
      content: <ZoomMenuControl zoom={zoom} setZoom={setZoom} disabled={menusDisabled} />,
    },
  ];

  // Offers both SVG and PNG as the native "Save as type" choice, via the
  // shared multi-format picker in exportUtils.js.
  const saveLegend = useCallback(async () => {
    const entries = buildLegendEntries(cells, symbols);
    if (!entries.length) return;
    const { svgString, width, height } = buildLegendSvg(entries);

    await saveBlobWithFormatPicker(
      [
        { ext: ".svg", description: "SVG image", mime: "image/svg+xml" },
        { ext: ".png", description: "PNG image", mime: "image/png" },
      ],
      (fileName || "legend") + "-legend",
      async (ext) => ext === ".png"
        ? legendSvgToPngBlob(svgString, width, height)
        : new Blob([svgString], { type: "image/svg+xml" }),
    );
  }, [cells, symbols, fileName]);

  // Single "Save As" entry replacing the separate "Save as Image"/"Save as
  // Vector" items: one native "Save as type" dialog offering both formats.
  // SVG is listed first so it's the dialog's default selection.
  const saveAs = useCallback(async () => {
    const cellSize = { w: CELL_SIZE * cellAspect.w, h: CELL_SIZE * cellAspect.h };
    await saveBlobWithFormatPicker(
      [
        { ext: ".svg", description: "SVG image", mime: "image/svg+xml" },
        { ext: ".png", description: "PNG image", mime: "image/png" },
      ],
      fileName || "gridmark-export",
      async (ext) => ext === ".png"
        ? buildPngBlob(cells, symbols, cellSize, guideLines)
        : buildSvgBlob(cells, symbols, cellSize, guideLines),
    );
  }, [cells, symbols, cellAspect, fileName, guideLines]);

  const fileItems = [
    { icon: { d: ICON_PATHS.import }, label: "Import", color: "#8250DF", onClick: handleImport, disabled: menusDisabled },
    { divider: true },
    { icon: { d: ICON_PATHS.save }, label: "Save", shortcut: modKey("S"), onClick: saveGridmark, disabled: menusDisabled || !hasContent },
    { icon: { d: ICON_PATHS.saveAs }, label: "Save as", onClick: saveAs, disabled: menusDisabled || !hasContent },
    { icon: { d: ICON_PATHS.listSelect }, label: "Save Legend", onClick: saveLegend, disabled: menusDisabled || !hasSymbolsUsed },
  ];

  return (
    <>
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "6px 12px",
        background: "#DDDDDD",
        borderBottom: bgImageEditing ? "1px solid #CA5010" : "1px solid #EEEEF2",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", padding: "0 8px 0 2px" }}>
            <AppGridIcon size={18} />
          </div>
          <DropdownMenu label="File" items={fileItems} disabled={menusDisabled} />
          <DropdownMenu label="Edit" items={editItems} disabled={menusDisabled} minWidth={240} />
          <DropdownMenu label="Insert" items={insertItems} disabled={menusDisabled} />
          <DropdownMenu label="View" items={viewItems} disabled={bgImageEditing} />
          <DropdownMenu
            label="Help"
            items={[
              { label: "Grid Help", onClick: () => setHelpModal("grid"), noIcon: true },
              { label: "Keyboard Shortcuts", onClick: () => setHelpModal("shortcuts"), noIcon: true },
              { label: "Report Issue", onClick: () => setShowReportIssueModal(true), noIcon: true },
            ]}
          />
        </div>

        <FileNameDisplay fileName={fileName} setFileName={setFileName} />

        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {fillMode && (
            <style>{`[data-grid-canvas], [data-grid-canvas] * { cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' fill='%23ffffff' stroke='%23000' stroke-width='1' d='M20 14c-.092.064-2 2.083-2 3.5 0 1.494.949 2.448 2 2.5.906.044 2-.891 2-2.5 0-1.5-1.908-3.436-2-3.5zM9.586 20c.378.378.88.586 1.414.586s1.036-.208 1.414-.586l7-7-.707-.707L11 4.586 8.707 2.293 7.293 3.707 9.586 6 4 11.586c-.378.378-.586.88-.586 1.414s.208 1.036.586 1.414L9.586 20zM11 7.414 16.586 13H5.414L11 7.414z'/%3E%3C/svg%3E") 10 20, crosshair !important; }`}</style>
          )}
          <ModeBtn svg={MOUSE_POINTER_SVG} label="Select mode" active={!fillMode && !guideLineMode} onClick={() => { setFillMode(false); if (guideLineMode) toggleGuideLineMode(); }} disabled={allDisabled} />
          <ModeBtn
            svg={GUIDE_LINE_MODE_SVG}
            label="Guide line mode"
            active={guideLineMode}
            onClick={() => {
              toggleGuideLineMode();
              setSelected(new Set());
            }}
            disabled={allDisabled}
          />
          <ModeBtn
            svg={COLOR_FILL_SVG}
            label="Fill mode"
            active={fillMode}
            onClick={() => {
              setFillMode(true);
              setSelected(new Set());
              if (guideLineMode) toggleGuideLineMode();
            }}
            disabled={allDisabled}
          />
          <ColorPicker
            colors={colorSlots}
            setColors={setColorSlots}
            active={activeColorSlot}
            setActive={setActiveColorSlot}
            onChange={setCellColor}
            onCommit={(hex) => { if (!fillMode && hasSel) colorSelectedCells(hex); }}
            disabled={menusDisabled || (!fillMode && !hasSel)}
            fillMode={fillMode}
          />
          <input type="file" accept=".json" ref={importFileRef} style={{ display: "none" }} onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => { importGridmark(ev.target.result, null); };
            reader.readAsText(file);
            e.target.value = "";
          }} />
          <input type="file" accept="image/*" ref={bgFileInputRef} style={{ display: "none" }} onChange={handleBgImageUpload} />
        </div>
      </div>
      {saveError && (
        <div style={{
          position: "fixed", top: 48, left: "50%", transform: "translateX(-50%)", zIndex: 200,
          background: "#FDECEA", border: "1px solid #C42B1C", borderRadius: 8,
          padding: "10px 20px", color: "#C42B1C", fontSize: 16, fontWeight: 400, whiteSpace: "nowrap",
          fontFamily: "Arial, sans-serif",
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
      {showResizeCellModal && (
        <ResizeCellModal
          cellAspect={cellAspect}
          onCancel={() => setShowResizeCellModal(false)}
          onResize={(values) => { resizeCell(values); setShowResizeCellModal(false); }}
        />
      )}
      {helpModal === "grid" && (
        <HelpModal title="GRID HELP" sections={GRID_HELP_SECTIONS} onClose={() => setHelpModal(null)} />
      )}
      {helpModal === "shortcuts" && (
        <HelpModal  sections={KEYBOARD_SHORTCUT_SECTIONS} onClose={() => setHelpModal(null)} />
      )}
      {showReportIssueModal && (
        <ReportIssueModal
          onCancel={() => setShowReportIssueModal(false)}
          onSubmit={async ({ name, email, description }) => {
            const res = await fetch("https://api.web3forms.com/submit", {
              method: "POST",
              headers: { "Content-Type": "application/json", Accept: "application/json" },
              body: JSON.stringify({
                access_key: WEB3FORMS_ACCESS_KEY,
                subject: `Stitch Grid issue report from ${name}`,
                name,
                email,
                message: description,
              }),
            });
            const data = await res.json();
            if (!data.success) {
              throw new Error(data.message || "Couldn't send the report. Please try again.");
            }
          }}
        />
      )}
      {contextMenuPos && !allDisabled && (
        <ContextEditMenu
          items={editItems
            .filter((item) => !item.label || !["Resize Grid", "Resize Cell", "Restart"].includes(item.label))
            .filter((item, i, arr) => {
              // Remove dividers that are consecutive or at the end
              if (!item.divider) return true;
              const prev = arr[i - 1];
              const next = arr[i + 1];
              if (!prev || prev.divider) return false; // leading or consecutive divider
              if (!next) return false;                  // trailing divider
              return true;
            })
          }
          x={contextMenuPos.x}
          y={contextMenuPos.y}
          onClose={onContextMenuClose}
          lastUsedSymbol={lastUsedSymbol}
          lastUsedDisabled={!hasSel}
          onUseLastSymbol={() => placeSymbol(lastUsedSymbol)}
          quickColors={colorSlots}
          onQuickColor={colorSelectedCells}
          quickColorsDisabled={!hasSel}
        />
      )}
    </>
  );
}