import { useState } from "react";

export default function ResizeGridModal({ gridRows, gridCols, onCancel, onResize }) {
    const [rows, setRows] = useState(gridRows);
    const [cols, setCols] = useState(gridCols);

    const handleOk = () => {
        const r = Math.max(1, Math.min(9999, parseInt(rows, 10) || 1));
        const c = Math.max(1, Math.min(9999, parseInt(cols, 10) || 1));
        onResize(r, c);
    };

    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.7)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 100,
            }}
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) onCancel();
            }}
        >
            <div
                style={{
                    background: "#16213e",
                    border: "1px solid #3a6a9a",
                    borderRadius: 12,
                    padding: 28,
                    minWidth: 280,
                    boxShadow: "0 0 40px rgba(80,128,224,0.2)",
                }}
            >
                <div
                    style={{
                        color: "#e0e0ff",
                        fontSize: 16,
                        fontWeight: 700,
                        marginBottom: 20,
                        textAlign: "center",
                    }}
                >
                    Resize Grid
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <label
                            style={{
                                color: "#7090c0",
                                fontSize: 13,
                                fontWeight: 600,
                                width: 70,
                                textAlign: "right",
                            }}
                        >
                            Rows:
                        </label>
                        <input
                            type="number"
                            min={1}
                            max={9999}
                            value={rows}
                            onChange={(e) => setRows(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") handleOk();
                                if (e.key === "Escape") onCancel();
                            }}
                            autoFocus
                            style={{
                                flex: 1,
                                padding: "6px 10px",
                                background: "#0f1e30",
                                border: "1px solid #3a6a9a",
                                borderRadius: 6,
                                color: "#e0e0ff",
                                fontSize: 14,
                                fontFamily: "inherit",
                                outline: "none",
                            }}
                        />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <label
                            style={{
                                color: "#7090c0",
                                fontSize: 13,
                                fontWeight: 600,
                                width: 70,
                                textAlign: "right",
                            }}
                        >
                            Columns:
                        </label>
                        <input
                            type="number"
                            min={1}
                            max={9999}
                            value={cols}
                            onChange={(e) => setCols(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") handleOk();
                                if (e.key === "Escape") onCancel();
                            }}
                            style={{
                                flex: 1,
                                padding: "6px 10px",
                                background: "#0f1e30",
                                border: "1px solid #3a6a9a",
                                borderRadius: 6,
                                color: "#e0e0ff",
                                fontSize: 14,
                                fontFamily: "inherit",
                                outline: "none",
                            }}
                        />
                    </div>
                </div>

                <div
                    style={{
                        color: "#5a7a9a",
                        fontSize: 11,
                        marginBottom: 16,
                        lineHeight: 1.5,
                        textAlign: "center",
                    }}
                >
                    Rows/columns are added or removed from the left and top edges.
                </div>

                <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                    <button
                        onClick={onCancel}
                        style={{
                            padding: "8px 24px",
                            background: "#0f3460",
                            border: "1px solid #1a4080",
                            borderRadius: 6,
                            color: "#e0e0ff",
                            cursor: "pointer",
                            fontSize: 13,
                            fontWeight: 700,
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleOk}
                        style={{
                            padding: "8px 24px",
                            background: "#1a5a3a",
                            border: "1px solid #3a8a5a",
                            borderRadius: 6,
                            color: "#60d090",
                            cursor: "pointer",
                            fontSize: 13,
                            fontWeight: 700,
                        }}
                    >
                        OK
                    </button>
                </div>
            </div>
        </div>
    );
}