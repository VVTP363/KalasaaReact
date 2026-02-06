const FIX_DASH = (s) =>
  String(s ?? "")
    .replaceAll("â€“", "–")
    .replaceAll("â€”", "—");

const formatNum = (v, decimals = 2, decimalComma = false) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  const rounded = Math.round(n * 10 ** decimals) / 10 ** decimals;
  const s = String(rounded);
  return decimalComma ? s.replace(".", ",") : s;
};

const csvEscape = (v) => {
  const s = FIX_DASH(v);
  // aina lainausmerkit, niin pysyy varmasti sarakkeissa myös ääkköset/erikoismerkit
  return `"${s.replaceAll('"', '""')}"`;
};

export function toCsv({ rows, columns, delimiter = "," }) {
  const decimalComma = delimiter === ";"; // ✅ Suomi/Excel

  const header = columns.map((c) => csvEscape(c.label)).join(delimiter);

  const lines = rows.map((r) => {
    const cells = columns.map((c) => {
      const raw = r?.[c.key];

      if (c.type === "int") return csvEscape(Number.isFinite(+raw) ? Math.round(+raw) : "");
      if (c.type === "num") return csvEscape(formatNum(raw, c.decimals ?? 2, decimalComma));
      return csvEscape(raw ?? "");
    });

    return cells.join(delimiter);
  });

  return "\uFEFF" + [header, ...lines].join("\n");
}

export function downloadCsv(csvText, filename = "export.csv") {
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}