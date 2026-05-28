import { useState, useCallback, useEffect } from "react";
import useGridState from "./hooks/useGridState";
import { parseKey } from "./utils/cellUtils";
import Sidebar from "./components/Sidebar/Sidebar";
import GridCanvas from "./components/GridCanvas";
import TopBar from "./components/TopBar/TopBar";
import ResetModal from "./components/Modals/ResetModal";

export default function App() {
  const state = useGridState();

  // Knitting mode state
  const [knittingMode, setKnittingMode] = useState(false);
  const [slashedRows, setSlashedRows] = useState(new Set());

  const toggleKnittingMode = useCallback(() => {
    setKnittingMode((prev) => {
      if (prev) setSlashedRows(new Set());
      return !prev;
    });
  }, []);

  const knitNextRow = useCallback(() => {
    setSlashedRows((prev) => {
      let bottomUnslashed = -1;
      for (let r = state.gridRows - 1; r >= 0; r--) {
        if (!prev.has(r)) { bottomUnslashed = r; break; }
      }
      if (bottomUnslashed < 0) return prev;
      const next = new Set(prev);
      next.add(bottomUnslashed);
      return next;
    });
  }, [state.gridRows]);

  const knitPrevRow = useCallback(() => {
    setSlashedRows((prev) => {
      if (prev.size === 0) return prev;
      let topSlashed = Infinity;
      for (const r of prev) {
        if (r < topSlashed) topSlashed = r;
      }
      const next = new Set(prev);
      next.delete(topSlashed);
      return next;
    });
  }, []);

  // Global style reset
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      *, *::before, *::after { box-sizing: border-box; }
      html, body, #root { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  // Intercept browser/tab close with native prompt only if there are unsaved changes
  useEffect(() => {
    const handler = (e) => {
      if (!state.dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [state.dirtyRef]);

  let selectionInfo = null;
  if (state.selected.size > 0) {
    let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
    for (const key of state.selected) {
      const { r, c } = parseKey(key);
      if (r < minR) minR = r; if (r > maxR) maxR = r;
      if (c < minC) minC = c; if (c > maxC) maxC = c;
    }
    selectionInfo = { rows: maxR - minR + 1, cols: maxC - minC + 1, startR: state.gridRows - minR, startC: state.gridCols - minC, endR: state.gridRows - maxR, endC: state.gridCols - maxC };
  }

  // In knitting mode: override mouse handlers to only allow panning
  const knittingMouseDown = useCallback((e) => {
    if (e.button === 1 || state.spaceDown.current) {
      state.onMouseDown(e);
    }
    e.preventDefault();
  }, [state.onMouseDown, state.spaceDown]);

  const knittingMouseMove = useCallback((e) => {
    state.onMouseMove(e);
  }, [state.onMouseMove]);

  const knittingMouseUp = useCallback((e) => {
    state.onMouseUp(e);
  }, [state.onMouseUp]);

  return (
    <div style={{ display: "flex", height: "100%", width: "100%", background: "#1a1a2e", fontFamily: "'JetBrains Mono', 'Courier New', monospace", overflow: "hidden" }}>
      {!knittingMode && (
        <Sidebar
          symbols={state.symbols} showEditSymbols={state.showEditSymbols} setShowEditSymbols={state.setShowEditSymbols}
          newSymName={state.newSymName} setNewSymName={state.setNewSymName} newSymWidth={state.newSymWidth} setNewSymWidth={state.setNewSymWidth}
          newSymSvg={state.newSymSvg} addError={state.addError} fileInputRef={state.fileInputRef}
          handleSvgFileChange={state.handleSvgFileChange} addSymbol={state.addSymbol} deleteSymbol={state.deleteSymbol} placeSymbol={state.placeSymbol}
          editingSymbolId={state.editingSymbolId} editSymName={state.editSymName} setEditSymName={state.setEditSymName}
          editSymWidth={state.editSymWidth} setEditSymWidth={state.setEditSymWidth}
          startEditSymbol={state.startEditSymbol} saveEditSymbol={state.saveEditSymbol} cancelEditSymbol={state.cancelEditSymbol}
          showDirectory={state.showDirectory} setShowDirectory={state.setShowDirectory}
          svgTree={state.svgTree} customDirectoryTree={state.customDirectoryTree}
          dirFileInputRef={state.dirFileInputRef} handleDirSvgUpload={state.handleDirSvgUpload}
          addFromDirectory={state.addFromDirectory} removeFromDirectory={state.removeFromDirectory}
          selected={state.selected} setSelected={state.setSelected} moveMode={state.moveMode}
        />
      )}
      <GridCanvas
        containerRef={state.containerRef} spaceDown={state.spaceDown} moveMode={knittingMode ? false : state.moveMode}
        onMouseDown={knittingMode ? knittingMouseDown : state.onMouseDown}
        onMouseMove={knittingMode ? knittingMouseMove : state.onMouseMove}
        onMouseUp={knittingMode ? knittingMouseUp : state.onMouseUp}
        onWheel={state.onWheel}
        offset={state.offset} cs={state.cs} zoom={state.zoom} cells={state.cells} symbols={state.symbols}
        selected={knittingMode ? new Set() : state.selected} dragRect={knittingMode ? null : state.dragRect} moveOffset={state.moveOffset}
        getViewport={state.getViewport} selectionInfo={knittingMode ? null : selectionInfo}
        bgImage={state.bgImage} bgImageEditing={knittingMode ? false : state.bgImageEditing} bgImageStartDrag={state.bgImageStartDrag}
        gridRows={state.gridRows} gridCols={state.gridCols}
        guideLineMode={knittingMode ? false : state.guideLineMode} guideLines={state.guideLines} guideLinePreview={knittingMode ? null : state.guideLinePreview}
        knittingMode={knittingMode} slashedRows={slashedRows} onNextRow={knitNextRow} onPrevRow={knitPrevRow}
      />
      <TopBar
        selected={state.selected} setSelected={state.setSelected} moveMode={state.moveMode}
        enterMoveMode={state.enterMoveMode} commitMove={state.commitMove}
        historyLen={state.historyLen} undo={state.undo} redo={state.redo}
        clipboard={state.clipboard} copySelected={state.copySelected} paste={state.paste}
        clearSelected={state.clearSelected} setShowConfirm={state.setShowConfirm}
        cells={state.cells} symbols={state.symbols}
        bgImage={state.bgImage} bgImageEditing={state.bgImageEditing}
        bgFileInputRef={state.bgFileInputRef} handleBgImageUpload={state.handleBgImageUpload}
        bgImageFix={state.bgImageFix} bgImageEdit={state.bgImageEdit} bgImageRemove={state.bgImageRemove}
        addColumn={state.addColumn} addRow={state.addRow}
        insertColumnsBefore={state.insertColumnsBefore} insertColumnsAfter={state.insertColumnsAfter}
        insertRowBefore={state.insertRowBefore} insertRowAfter={state.insertRowAfter}
        removeSelectedColumns={state.removeSelectedColumns} removeSelectedRows={state.removeSelectedRows}
        importGridmark={state.importGridmark} saveGridmark={state.saveGridmark} saveError={state.saveError}
        gridRows={state.gridRows} gridCols={state.gridCols}
        guideLineMode={state.guideLineMode} startGuideLine={state.startGuideLine} endGuideLine={state.endGuideLine}
        guideLines={state.guideLines} clearGuideLines={state.clearGuideLines} removeLastGuideLine={state.removeLastGuideLine}
        knittingMode={knittingMode} toggleKnittingMode={toggleKnittingMode}
        fileName={state.fileName} setFileName={state.setFileName}
        resizeGrid={state.resizeGrid}
      />
      {state.showConfirm && <ResetModal onCancel={() => state.setShowConfirm(false)} onReset={state.resetGrid} />}
    </div>
  );
}
