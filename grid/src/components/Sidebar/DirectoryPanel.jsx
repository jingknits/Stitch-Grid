import { useState } from "react";
import { svgToDataUrl } from "../../utils/svgUtils";

/** Count total files in a tree node recursively */
function countFiles(node) {
  let count = (node.__files || []).length;
  for (const key of Object.keys(node)) {
    if (key === "__files") continue;
    count += countFiles(node[key]);
  }
  return count;
}

/** Capitalize folder name for display */
function folderLabel(name) {
  return name
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Single file row inside the tree */
function DirFileRow({ item, symbols, addFromDirectory, removeFromDirectory, isCustom, depth }) {
  const alreadyAdded = symbols.some((s) => s.svgContent === item.svgContent);
  return (
    <div
      style={{
        marginLeft: (depth + 1) * 10,
        marginBottom: 2,
        background: "#0f1828",
        border: "1px solid #1a2840",
        borderRadius: 4,
        overflowX: "auto",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          padding: "4px 6px",
          gap: 8,
        }}
      >
        <div
          style={{
            width: 36 * (item.defaultWidth || 1),
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
          <img
            src={svgToDataUrl(item.svgContent)}
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
            alt=""
          />
        </div>
        <div style={{ flexShrink: 0 }}>
          <div
            style={{
              color: "#c0c0e0",
              fontSize: 16,
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            {item.name}
          </div>
          <div style={{ color: "#4a5a7a", fontSize: 12 }}>{item.defaultWidth}W</div>
        </div>
        <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
          {isCustom && (
            <button
              onClick={() => removeFromDirectory(item.id)}
              style={{
                background: "#3a1a1a",
                border: "1px solid #5a2a2a",
                borderRadius: 3,
                color: "#e94560",
                cursor: "pointer",
                fontSize: 12,
                padding: "2px 6px",
                fontWeight: 700,
              }}
            >
              ✕
            </button>
          )}
          <button
            onClick={() => addFromDirectory(item)}
            disabled={alreadyAdded}
            style={{
              background: alreadyAdded ? "#1a2a1a" : "#1a3a2a",
              border: `1px solid ${alreadyAdded ? "#2a3a2a" : "#3a7a5a"}`,
              borderRadius: 3,
              color: alreadyAdded ? "#3a5a3a" : "#60d090",
              cursor: alreadyAdded ? "default" : "pointer",
              fontSize: 12,
              padding: "2px 7px",
              fontWeight: 700,
            }}
          >
            {alreadyAdded ? "✓" : "+"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Recursive collapsible tree node.
 * Each node has { __files: [...items], subfolderA: {...}, subfolderB: {...} }
 */
function TreeNode({
  node,
  label,
  depth,
  defaultOpen,
  symbols,
  addFromDirectory,
  removeFromDirectory,
  isCustomTree,
}) {
  const [open, setOpen] = useState(defaultOpen ?? depth === 0);

  const subfolders = Object.keys(node).filter((k) => k !== "__files");
  const files = node.__files || [];

  if (subfolders.length === 0 && files.length === 0) return null;

  return (
    <div style={{ marginLeft: depth > 0 ? 8 : 0 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          width: "100%",
          padding: "4px 6px",
          marginBottom: 1,
          background: "transparent",
          border: "none",
          borderRadius: 4,
          cursor: "pointer",
          color: depth === 0 ? "#7090c0" : "#6080a0",
          fontSize: depth === 0 ? 14 : 13,
          fontWeight: 700,
          fontFamily: "inherit",
          letterSpacing: depth === 0 ? 0.5 : 0,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "#1a2a40")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <span
          style={{
            display: "inline-block",
            width: 12,
            fontSize: 10,
            color: "#5070a0",
            transition: "transform 0.15s",
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
          }}
        >
          ▶
        </span>
        <span style={{ color: "#5a7ab0", fontSize: 14 }}>📁</span>
        {label}
        <span style={{ color: "#3a5a80", fontSize: 11, fontWeight: 400, marginLeft: 2 }}>
          ({countFiles(node)})
        </span>
      </button>

      {open && (
        <div>
          {subfolders.sort().map((key) => (
            <TreeNode
              key={key}
              node={node[key]}
              label={folderLabel(key)}
              depth={depth + 1}
              symbols={symbols}
              addFromDirectory={addFromDirectory}
              removeFromDirectory={removeFromDirectory}
              isCustomTree={isCustomTree}
            />
          ))}

          {files.map((item) => (
            <DirFileRow
              key={item.id}
              item={item}
              symbols={symbols}
              addFromDirectory={addFromDirectory}
              removeFromDirectory={removeFromDirectory}
              isCustom={isCustomTree}
              depth={depth}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function DirectoryPanel({
  svgTree,
  customDirectoryTree,
  dirFileInputRef,
  handleDirSvgUpload,
  addFromDirectory,
  removeFromDirectory,
  symbols,
}) {
  const hasCustomContent = customDirectoryTree.__files.length > 0 ||
    Object.keys(customDirectoryTree).filter((k) => k !== "__files").length > 0;

  return (
    <div
      style={{
        borderBottom: "1px solid #0f3460",
        background: "#0d1626",
        flexShrink: 0,
        maxHeight: 360,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ padding: "8px 8px 4px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ color: "#5080e0", fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>SVG DIRECTORY</div>
        <button
          onClick={() => dirFileInputRef.current?.click()}
          style={{
            background: "#1a3050",
            border: "1px solid #3a6a9a",
            borderRadius: 4,
            color: "#60a0d0",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 700,
            padding: "3px 10px",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#2a4060")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#1a3050")}
        >
          + ADD SVG
        </button>
        <input
          ref={dirFileInputRef}
          type="file"
          accept=".svg,image/svg+xml"
          multiple
          style={{ display: "none" }}
          onChange={handleDirSvgUpload}
        />
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "2px 4px 8px" }}>
        {/* Built-in SVGs from src/assets/svgs/ */}
        <TreeNode
          node={svgTree}
          label="Built-in"
          depth={0}
          defaultOpen={true}
          symbols={symbols}
          addFromDirectory={addFromDirectory}
          removeFromDirectory={removeFromDirectory}
          isCustomTree={false}
        />
        {/* Custom uploads (runtime) */}
        {hasCustomContent && (
          <TreeNode
            node={customDirectoryTree}
            label="Custom Uploads"
            depth={0}
            defaultOpen={true}
            symbols={symbols}
            addFromDirectory={addFromDirectory}
            removeFromDirectory={removeFromDirectory}
            isCustomTree={true}
          />
        )}
      </div>
    </div>
  );
}