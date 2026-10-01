import { CELL_SIZE } from "../constants";
import { cellKey, parseKey } from "./cellUtils";
import { svgToDataUrl } from "./svgUtils";

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORT UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

export function getOccupiedBounds(cells) {
  let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
  for (const [key, cell] of cells) {
    const { r, c } = parseKey(key);
    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
    if (cell.spanWidth >= 1) {
      if (c < minC) minC = c;
      if (c + cell.spanWidth - 1 > maxC) maxC = c + cell.spanWidth - 1;
    } else {
      if (c < minC) minC = c;
      if (c > maxC) maxC = c;
    }
  }
  if (minR === Infinity) return null;
  return { minR, maxR, minC, maxC };
}

// Guide lines are stored in absolute grid-line coordinates (0..gridRows /
// 0..gridCols), but PNG/SVG export only renders the occupied-cells
// bounding box, re-based so minR/minC become the origin (see the cell x/y
// math in buildPngBlob/buildSvgBlob below). This re-bases each guide line
// the same way and clips it to the exported crop, dropping any that fall
// entirely outside it. A cell bounding box [minR..maxR] x [minC..maxC]
// spans grid LINES [minR..maxR+1] x [minC..maxC+1].
function clipGuideLinesForExport(guideLines, minR, maxR, minC, maxC) {
  const rowLineMin = minR, rowLineMax = maxR + 1;
  const colLineMin = minC, colLineMax = maxC + 1;
  const out = [];
  for (const gl of guideLines || []) {
    if (gl.orientation === "h") {
      if (gl.linePos < rowLineMin || gl.linePos > rowLineMax) continue;
      const s = Math.max(gl.start, colLineMin);
      const e = Math.min(gl.end, colLineMax);
      if (e <= s) continue;
      out.push({ orientation: "h", linePos: gl.linePos - rowLineMin, start: s - colLineMin, end: e - colLineMin });
    } else {
      if (gl.linePos < colLineMin || gl.linePos > colLineMax) continue;
      const s = Math.max(gl.start, rowLineMin);
      const e = Math.min(gl.end, rowLineMax);
      if (e <= s) continue;
      out.push({ orientation: "v", linePos: gl.linePos - colLineMin, start: s - rowLineMin, end: e - rowLineMin });
    }
  }
  return out;
}

export async function svgStringToImage(svgStr, w, h) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = svgToDataUrl(svgStr);
  });
}

// Helper: save a Blob via File System Access API (file picker) or fallback download
export async function saveBlobWithPicker(blob, suggestedName, description, accept) {
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [{ description, accept }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err) {
      if (err.name === "AbortError") return; // user cancelled
      // Fall through to legacy download
    }
  }
  // Fallback
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = suggestedName;
  a.click();
  URL.revokeObjectURL(url);
}

// Like saveBlobWithPicker, but offers several formats in a single native
// "Save as type" dropdown instead of one fixed format. `formats` is an
// array of { ext, description, mime } in preference order; `getBlob(ext)`
// is called with whichever extension the user actually chose (or typed)
// and must return/resolve the matching Blob. Browsers without File System
// Access API can't offer a format choice outside that API, so those fall
// back to a plain download in the first listed format.
export async function saveBlobWithFormatPicker(formats, suggestedNameBase, getBlob) {
  if (window.showSaveFilePicker) {
    let handle;
    try {
      handle = await window.showSaveFilePicker({
        suggestedName: suggestedNameBase + formats[0].ext,
        types: formats.map((f) => ({ description: f.description, accept: { [f.mime]: [f.ext] } })),
      });
    } catch (err) {
      if (err.name === "AbortError") return;
      return;
    }
    try {
      const chosen = formats.find((f) => handle.name.toLowerCase().endsWith(f.ext)) || formats[0];
      const blob = await getBlob(chosen.ext);
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
    } catch {
      // Save was cancelled or failed partway through — nothing else to do here.
    }
    return;
  }
  // Fallback: no format choice available outside the native picker, so use
  // the first format in the list.
  const fallback = formats[0];
  const blob = await getBlob(fallback.ext);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = suggestedNameBase + fallback.ext;
  a.click();
  URL.revokeObjectURL(url);
}

// Renders the grid to a PNG Blob without saving it — shared by exportAsPng
// and the "Save as" format-choice picker.
export async function buildPngBlob(cells, symbols, cellSize, guideLines = []) {
  const bounds = getOccupiedBounds(cells);
  if (!bounds) return null;
  const { minR, maxR, minC, maxC } = bounds;
  const cols = maxC - minC + 1;
  const rows = maxR - minR + 1;
  const csW = (cellSize && cellSize.w) || cellSize || CELL_SIZE;
  const csH = (cellSize && cellSize.h) || cellSize || CELL_SIZE;
  const gridWidth = cols * csW;
  const gridHeight = rows * csH;

  // Reserve margins around the grid for perimeter row/column counts
  const fontSize = Math.max(9, Math.min(12, Math.min(csW, csH) * 0.5));
  const marginTop = Math.ceil(fontSize + 8);
  const marginBottom = Math.ceil(fontSize + 8);
  const marginLeft = Math.ceil(fontSize * 2.2 + 8);
  const marginRight = Math.ceil(fontSize * 2.2 + 8);

  const width = gridWidth + marginLeft + marginRight;
  const height = gridHeight + marginTop + marginBottom;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.translate(marginLeft, marginTop);

  // Fill background for occupied cells — use cell color if set, else white
  for (const [key, cell] of cells) {
    const { r, c } = parseKey(key);
    const x = (c - minC) * csW;
    const y = (r - minR) * csH;
    ctx.fillStyle = cell.color || "#ffffff";
    ctx.fillRect(x + 0.5, y + 0.5, csW - 1, csH - 1);
  }

  // Grid lines across the full bounding box of the saved portion
  ctx.strokeStyle = "#1e2a4a";
  ctx.lineWidth = 0.5;
  for (let lr = 0; lr <= rows; lr++) {
    const y = lr * csH;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(gridWidth, y); ctx.stroke();
  }
  for (let lc = 0; lc <= cols; lc++) {
    const x = lc * csW;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, gridHeight); ctx.stroke();
  }

  // Draw symbols
  const drawn = new Set();
  for (const [key, cell] of cells) {
    if (cell.spanWidth === 0 || drawn.has(key)) continue;
    drawn.add(key);
    const { r, c } = parseKey(key);
    const sym = symbols.find((s) => s.id === cell.symbolId);
    if (!sym?.svgContent) continue;
    const x = (c - minC) * csW;
    const y = (r - minR) * csH;
    const w = cell.spanWidth * csW;
    try {
      const img = await svgStringToImage(sym.svgContent, w, csH);
      ctx.drawImage(img, x + 2, y + 2, w - 4, csH - 4);
    } catch (e) { /* skip broken SVGs */ }
  }

  // Guide lines — thicker, distinctly colored strokes, drawn on top of
  // symbols so they always read clearly, re-based/clipped to this export's
  // cropped bounding box (see clipGuideLinesForExport).
  const clippedGuideLines = clipGuideLinesForExport(guideLines, minR, maxR, minC, maxC);
  ctx.strokeStyle = "#8250DF";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  for (const gl of clippedGuideLines) {
    ctx.beginPath();
    if (gl.orientation === "h") {
      const y = gl.linePos * csH;
      ctx.moveTo(gl.start * csW, y);
      ctx.lineTo(gl.end * csW, y);
    } else {
      const x = gl.linePos * csW;
      ctx.moveTo(x, gl.start * csH);
      ctx.lineTo(x, gl.end * csH);
    }
    ctx.stroke();
  }

  // Perimeter row/column counts, relative to the exported (saved) portion:
  // bottom-right corner is 1, increasing going up (rows) and left (columns).
  ctx.fillStyle = "#7d88b5";
  ctx.font = `${fontSize}px 'JetBrains Mono', ui-monospace, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let c = minC; c <= maxC; c++) {
    const num = maxC - c + 1;
    const x = (c - minC) * csW + csW / 2;
    ctx.fillText(String(num), x, -fontSize / 2 - 2);
    ctx.fillText(String(num), x, gridHeight + fontSize / 2 + 2);
  }
  ctx.textAlign = "right";
  for (let r = minR; r <= maxR; r++) {
    const num = maxR - r + 1;
    const y = (r - minR) * csH + csH / 2;
    ctx.fillText(String(num), -6, y);
  }
  ctx.textAlign = "left";
  for (let r = minR; r <= maxR; r++) {
    const num = maxR - r + 1;
    const y = (r - minR) * csH + csH / 2;
    ctx.fillText(String(num), gridWidth + 6, y);
  }

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

export async function exportAsPng(cells, symbols, cellSize, fileName, guideLines = []) {
  const blob = await buildPngBlob(cells, symbols, cellSize, guideLines);
  if (blob) {
    await saveBlobWithPicker(blob, (fileName || "gridmark-export") + ".png", "PNG Image", { "image/png": [".png"] });
  }
}

// Renders the grid to an SVG Blob without saving it — shared by exportAsSvg
// and the "Save as" format-choice picker.
export async function buildSvgBlob(cells, symbols, cellSize, guideLines = []) {
  const bounds = getOccupiedBounds(cells);
  if (!bounds) return null;
  const { minR, maxR, minC, maxC } = bounds;
  const cols = maxC - minC + 1;
  const rows = maxR - minR + 1;
  const csW = (cellSize && cellSize.w) || cellSize || CELL_SIZE;
  const csH = (cellSize && cellSize.h) || cellSize || CELL_SIZE;
  const gridWidth = cols * csW;
  const gridHeight = rows * csH;

  // Reserve margins around the grid for perimeter row/column counts
  const fontSize = Math.max(9, Math.min(12, Math.min(csW, csH) * 0.5));
  const marginTop = Math.ceil(fontSize + 8);
  const marginBottom = Math.ceil(fontSize + 8);
  const marginLeft = Math.ceil(fontSize * 2.2 + 8);
  const marginRight = Math.ceil(fontSize * 2.2 + 8);

  const width = gridWidth + marginLeft + marginRight;
  const height = gridHeight + marginTop + marginBottom;

  let svgParts = [];
  svgParts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`);
  svgParts.push(`<g transform="translate(${marginLeft},${marginTop})">`);

  // Fill backgrounds for occupied cells — use cell color if set, else white
  for (const [key, cell] of cells) {
    const { r, c } = parseKey(key);
    const x = (c - minC) * csW;
    const y = (r - minR) * csH;
    const fill = cell.color || "#ffffff";
    svgParts.push(`<rect x="${x + 0.5}" y="${y + 0.5}" width="${csW - 1}" height="${csH - 1}" fill="${fill}"/>`);
  }

  // Grid lines across the full bounding box of the saved portion
  svgParts.push(`<g stroke="#1e2a4a" stroke-width="0.5">`);
  for (let lr = 0; lr <= rows; lr++) {
    const y = lr * csH;
    svgParts.push(`<line x1="0" y1="${y}" x2="${gridWidth}" y2="${y}"/>`);
  }
  for (let lc = 0; lc <= cols; lc++) {
    const x = lc * csW;
    svgParts.push(`<line x1="${x}" y1="0" x2="${x}" y2="${gridHeight}"/>`);
  }
  svgParts.push(`</g>`);

  // Symbols — embed each SVG inline using <image> with data URL
  const drawn = new Set();
  for (const [key, cell] of cells) {
    if (cell.spanWidth === 0 || drawn.has(key)) continue;
    drawn.add(key);
    const { r, c } = parseKey(key);
    const sym = symbols.find((s) => s.id === cell.symbolId);
    if (!sym?.svgContent) continue;
    const x = (c - minC) * csW;
    const y = (r - minR) * csH;
    const w = cell.spanWidth * csW;
    const dataUrl = svgToDataUrl(sym.svgContent);
    svgParts.push(`<image x="${x + 2}" y="${y + 2}" width="${w - 4}" height="${csH - 4}" href="${dataUrl}"/>`);
  }

  // Guide lines — thicker, distinctly colored strokes, drawn on top of
  // symbols so they always read clearly, re-based/clipped to this export's
  // cropped bounding box (see clipGuideLinesForExport).
  const clippedGuideLines = clipGuideLinesForExport(guideLines, minR, maxR, minC, maxC);
  if (clippedGuideLines.length) {
    svgParts.push(`<g stroke="#8250DF" stroke-width="3" stroke-linecap="round">`);
    for (const gl of clippedGuideLines) {
      if (gl.orientation === "h") {
        const y = gl.linePos * csH;
        svgParts.push(`<line x1="${gl.start * csW}" y1="${y}" x2="${gl.end * csW}" y2="${y}"/>`);
      } else {
        const x = gl.linePos * csW;
        svgParts.push(`<line x1="${x}" y1="${gl.start * csH}" x2="${x}" y2="${gl.end * csH}"/>`);
      }
    }
    svgParts.push(`</g>`);
  }

  // Perimeter row/column counts, relative to the exported (saved) portion:
  // bottom-right corner is 1, increasing going up (rows) and left (columns).
  svgParts.push(`<g fill="#7d88b5" font-family="'JetBrains Mono', ui-monospace, monospace" font-size="${fontSize}">`);
  for (let c = minC; c <= maxC; c++) {
    const num = maxC - c + 1;
    const x = (c - minC) * csW + csW / 2;
    svgParts.push(`<text x="${x}" y="${-fontSize / 2 - 2}" text-anchor="middle" dominant-baseline="middle">${num}</text>`);
    svgParts.push(`<text x="${x}" y="${gridHeight + fontSize / 2 + 2}" text-anchor="middle" dominant-baseline="middle">${num}</text>`);
  }
  for (let r = minR; r <= maxR; r++) {
    const num = maxR - r + 1;
    const y = (r - minR) * csH + csH / 2;
    svgParts.push(`<text x="-6" y="${y}" text-anchor="end" dominant-baseline="middle">${num}</text>`);
    svgParts.push(`<text x="${gridWidth + 6}" y="${y}" text-anchor="start" dominant-baseline="middle">${num}</text>`);
  }
  svgParts.push(`</g>`);

  svgParts.push(`</g>`);
  svgParts.push(`</svg>`);
  const svgStr = svgParts.join("\n");

  return new Blob([svgStr], { type: "image/svg+xml" });
}

export async function exportAsSvg(cells, symbols, cellSize, fileName, guideLines = []) {
  const blob = await buildSvgBlob(cells, symbols, cellSize, guideLines);
  if (blob) {
    await saveBlobWithPicker(blob, (fileName || "gridmark-export") + ".svg", "SVG Image", { "image/svg+xml": [".svg"] });
  }
}

export async function exportGridmarkJson(cells, symbols, gridRows, gridCols, cellAspect, bgImage, guideLines = []) {
  const cellsArr = [];
  for (const [key, cell] of cells) {
    cellsArr.push({ key, ...cell });
  }
  // Only include symbols that are actually used in cells
  const usedIds = new Set();
  for (const [, cell] of cells) {
    if (cell.symbolId) usedIds.add(cell.symbolId);
  }
  const usedSymbols = symbols
    .filter((s) => usedIds.has(s.id))
    .map((s) => ({ id: s.id, name: s.name, width: s.width, svgContent: s.svgContent }));

  const data = {
    format: "gridmark",
    version: 1,
    gridRows,
    gridCols,
    cellAspect: cellAspect || { w: 1, h: 1 },
    bgImage: bgImage || null,
    symbols: usedSymbols,
    cells: cellsArr,
    guideLines: (guideLines || []).map((g) => ({ ...g })),
  };
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  await saveBlobWithPicker(blob, "gridmark-project.json", "Gridmark JSON", { "application/json": [".json"] });
}