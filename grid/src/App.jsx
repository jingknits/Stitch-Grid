import { useState, useCallback, useEffect } from "react";
import useGridState from "./hooks/useGridState";
import { parseKey } from "./utils/cellUtils";
import Sidebar from "./components/Sidebar/Sidebar";
import GridCanvas from "./components/GridCanvas";
import TopBar from "./components/TopBar/TopBar";
import ResetModal from "./components/Modals/ResetModal";
import MemoPanel from "./components/MemoPanel/MemoPanel";

export default function App() {
  const state = useGridState();

  // Knitting mode state
  const [knittingMode, setKnittingMode] = useState(false);
  const [slashedRows, setSlashedRows] = useState(new Set());

  // Fill mode state
  const [fillMode, setFillMode] = useState(false);

  // Row shading (View menu): "none" (default) or "alternate"
  const [rowShading, setRowShading] = useState("none");

  // Memo pad state
  const [memoOpen, setMemoOpen] = useState(false);
  const [memoText, setMemoText] = useState("");

  // Context menu (right-click on canvas → Edit menu at cursor)
  const [contextMenuPos, setContextMenuPos] = useState(null); // {x, y} | null

  // Keep the hook's ref in sync so saveGridmark always writes the latest text
  useEffect(() => {
    state.memoTextRef.current = memoText;
  }, [memoText, state.memoTextRef]);

  // Wrap importGridmark so we can restore memoText from the loaded file
  const importGridmark = useCallback((jsonStr, handle) => {
    const restoredMemo = state.importGridmark(jsonStr, handle);
    if (typeof restoredMemo === "string") setMemoText(restoredMemo);
  }, [state.importGridmark]);

  // Deactivate fill mode when knitting mode, bg editing, or guide-line
  // drawing mode is active — these are mutually exclusive canvas modes.
  useEffect(() => {
    if (knittingMode || state.bgImageEditing || state.guideLineMode) setFillMode(false);
  }, [knittingMode, state.bgImageEditing, state.guideLineMode]);

  // Exiting to knitting mode or bg-image editing should also drop out of
  // guide-line drawing mode, same exclusivity as above.
  useEffect(() => {
    if ((knittingMode || state.bgImageEditing) && state.guideLineMode) state.setGuideLineMode(false);
  }, [knittingMode, state.bgImageEditing, state.guideLineMode, state.setGuideLineMode]);

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
    <div style={{ display: "flex", height: "100%", width: "100%", background: "#FFFFFF", fontFamily: "Arial, sans-serif", overflow: "hidden" }}>
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
          fileSystemApiSupported={state.fileSystemApiSupported} folderTree={state.folderTree}
          folderName={state.folderName} openFolder={state.openFolder} closeFolder={state.closeFolder}
          openFileFromTree={state.openFileFromTree} openFileId={state.openFileId} folderError={state.folderError}
          selected={state.selected} setSelected={state.setSelected} moveMode={state.movingSelection}
          reorderSymbols={state.reorderSymbols}
          groups={state.groups} pasteGroupAtSelection={state.pasteGroupAtSelection}
          deleteGroup={state.deleteGroup} renameGroup={state.renameGroup}
        />
      )}
      <GridCanvas
        containerRef={state.containerRef} spaceDown={state.spaceDown} movingSelection={knittingMode ? false : state.movingSelection}
        onMouseDown={knittingMode ? knittingMouseDown : state.onMouseDown}
        onMouseMove={knittingMode ? knittingMouseMove : state.onMouseMove}
        onMouseUp={knittingMode ? knittingMouseUp : state.onMouseUp}
        onWheel={state.onWheel}
        offset={state.offset} csW={state.csW} csH={state.csH} zoom={state.zoom} cells={state.cells} symbols={state.symbols}
        selected={knittingMode ? new Set() : state.selected} clipboard={state.clipboard} dragRect={knittingMode ? null : state.dragRect} moveOffset={state.moveOffset}
        getViewport={state.getViewport} selectionInfo={knittingMode ? null : selectionInfo}
        bgImage={state.bgImage} bgImageEditing={knittingMode ? false : state.bgImageEditing} bgImageStartDrag={state.bgImageStartDrag}
        bgImageFix={state.bgImageFix} bgImageRemove={state.bgImageRemove} setBgImageOpacity={state.setBgImageOpacity}
        gridRows={state.gridRows} gridCols={state.gridCols}
        guideLines={state.guideLines} guideLineDraft={knittingMode ? null : state.guideLineDraft}
        guideLineMode={knittingMode ? false : state.guideLineMode} selectedGuideLineId={knittingMode ? null : state.selectedGuideLineId}
        selectGuideLine={state.selectGuideLine} startGuideLineCreate={state.startGuideLineCreate}
        handlePointerGestureStart={state.handlePointerGestureStart}
        startGuideLineMove={state.startGuideLineMove} startGuideLineCapDrag={state.startGuideLineCapDrag}
        knittingMode={knittingMode} slashedRows={slashedRows} onNextRow={knitNextRow} onPrevRow={knitPrevRow}
        fillMode={fillMode} fillCell={state.fillCell} onFillMouseUp={state.resetFillCell}
        onContextMenu={(x, y) => setContextMenuPos({ x, y })}
        findOpen={state.findOpen} findSymbolId={state.findSymbolId} setFindSymbol={state.setFindSymbol}
        findMatches={state.findMatches} findMatchIndex={state.findMatchIndex} findNext={state.findNext} findPrev={state.findPrev}
        closeFind={state.closeFind}
        replaceSymbolId={state.replaceSymbolId} setReplaceSymbol={state.setReplaceSymbol}
        onReplace={state.onReplace} onReplaceAll={state.onReplaceAll}
        replaceRowOpen={state.replaceRowOpen} setReplaceRowOpen={state.setReplaceRowOpen}
        findColor={state.findColor} setFindColor={state.setFindColor}
        replaceColor={state.replaceColor} setReplaceColor={state.setReplaceColor}
        replaceColorEnabled={state.replaceColorEnabled} setReplaceColorEnabled={state.setReplaceColorEnabled}
        findHighlight={state.findHighlight}
        rowShading={rowShading}
      />
      <TopBar
        selected={state.selected} setSelected={state.setSelected}
        historyLen={state.historyLen} undo={state.undo} redo={state.redo}
        clipboard={state.clipboard} copySelected={state.copySelected} paste={state.paste}
        colorClipboard={state.colorClipboard} copySelectedColor={state.copySelectedColor} pasteColor={state.pasteColor}
        symbolClipboard={state.symbolClipboard} copySelectedSymbol={state.copySelectedSymbol} pasteSymbol={state.pasteSymbol}
        saveGroup={state.saveGroup}
        cutSelectedSymbols={state.cutSelectedSymbols}
        mirrorUp={state.mirrorUp} mirrorDown={state.mirrorDown} mirrorLeft={state.mirrorLeft} mirrorRight={state.mirrorRight}
        flipHorizontal={state.flipHorizontal} flipVertical={state.flipVertical}
        clearSelected={state.clearSelected} clearSelectedColors={state.clearSelectedColors} colorSelectedCells={state.colorSelectedCells} setShowConfirm={state.setShowConfirm}
        clearAllCells={state.clearAllCells} clearAllColors={state.clearAllColors}
        cells={state.cells} symbols={state.symbols}
        bgImage={state.bgImage} bgImageEditing={state.bgImageEditing}
        bgFileInputRef={state.bgFileInputRef} handleBgImageUpload={state.handleBgImageUpload}
        bgImageFix={state.bgImageFix} bgImageEdit={state.bgImageEdit} bgImageRemove={state.bgImageRemove}
        applyBgImageToColors={state.applyBgImageToColors}
        addColumn={state.addColumn} addRow={state.addRow}
        insertColumnsBefore={state.insertColumnsBefore} insertColumnsAfter={state.insertColumnsAfter}
        insertRowBefore={state.insertRowBefore} insertRowAfter={state.insertRowAfter}
        removeSelectedColumns={state.removeSelectedColumns} removeSelectedRows={state.removeSelectedRows}
        importGridmark={importGridmark} saveGridmark={state.saveGridmark} saveError={state.saveError}
        gridRows={state.gridRows} gridCols={state.gridCols}
        guideLines={state.guideLines}
        guideLineMode={state.guideLineMode} toggleGuideLineMode={state.toggleGuideLineMode}
        selectedGuideLineId={state.selectedGuideLineId} guideLineClipboard={state.guideLineClipboard}
        copyGuideLine={state.copyGuideLine} cutGuideLine={state.cutGuideLine} pasteGuideLine={state.pasteGuideLine}
        knittingMode={knittingMode} toggleKnittingMode={toggleKnittingMode}
        fileName={state.fileName} setFileName={state.setFileName}
        resizeGrid={state.resizeGrid} resizeCell={state.resizeCell} cellAspect={state.cellAspect}
        cellColor={state.cellColor} setCellColor={state.setCellColor}
        fillMode={fillMode} setFillMode={setFillMode}
        fitGridToPage={state.fitGridToPage}
        memoOpen={memoOpen} onMemoToggle={() => setMemoOpen((o) => !o)}
        contextMenuPos={contextMenuPos} onContextMenuClose={() => setContextMenuPos(null)}
        openFind={state.openFind}
        openReplace={state.openReplace}
        lastUsedSymbolId={state.lastUsedSymbolId}
        placeSymbol={state.placeSymbol}
        rowShading={rowShading} setRowShading={setRowShading}
        zoom={state.zoom} setZoom={state.setZoom}
      />
      {state.showConfirm && <ResetModal onCancel={() => state.setShowConfirm(false)} onReset={state.resetGrid} />}
      {memoOpen && <MemoPanel text={memoText} onChange={setMemoText} onClose={() => setMemoOpen(false)} />}
    </div>
  );
}