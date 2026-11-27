// Download the "To verify" products as a PDF, grouped Category > Sub category.
// Needs:  npm i jspdf jspdf-autotable   (loaded only when the button is clicked)
//
// groups: [{ categoryName, subCategories: [{ subCategoryName, items: [line] }] }]
//         items are already only the products waiting for verification.
// figures(line) -> { stockAt, physical, balance, live }   (same numbers as the report)
export async function downloadToVerifyPdf({ auditName, auditCode, groups, figures, fmtQty, fmtDate, fileName }) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 36;
  const total = groups.reduce((n, g) => n + g.subCategories.reduce((m, s) => m + s.items.length, 0), 0);

  const show = (v) => (v === null || v === undefined ? "-" : fmtQty(v));
  const signed = (v) => (v === null || v === undefined ? "-" : `${v > 0 ? "+" : ""}${fmtQty(v)}`);

  // ── title ──
  doc.setFont("helvetica", "bold").setFontSize(16).setTextColor(22, 35, 59);
  doc.text(`Products to verify: ${auditName || "Audit"}`, M, 40);
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(95, 107, 124);
  doc.text(`Audit code ${auditCode || "-"}  |  ${total} product(s) waiting for verification  |  Generated ${fmtDate(new Date())}`, M, 56);

  let y = 76;
  const room = (need) => {
    if (y + need > H - 40) { doc.addPage(); y = 40; }
  };

  for (const g of groups) {
    const count = g.subCategories.reduce((n, s) => n + s.items.length, 0);
    room(60);
    doc.setFillColor(13, 92, 99).rect(M, y, W - M * 2, 20, "F");
    doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(255, 255, 255);
    doc.text(`${g.categoryName}  (${count} to verify)`, M + 8, y + 14);
    y += 28;

    for (const sg of g.subCategories) {
      room(60);
      doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(22, 35, 59);
      doc.text(`${sg.subCategoryName}  (${sg.items.length})`, M, y + 8);
      y += 14;

      autoTable(doc, {
        startY: y,
        margin: { left: M, right: M, top: 40, bottom: 40 },
        head: [["Barcode", "Product", "Stock at verification", "Physical count", "Balance", "Live stock", "Counted by", "Remarks"]],
        body: sg.items.map((l) => {
          const f = figures(l);
          return [
            l.barcode || "-",
            l.productName || "-",
            show(f.stockAt),
            show(f.physical),
            signed(f.balance),
            show(f.live),
            l.verifiedBy || "-",
            [l.reasonCode, l.note].filter(Boolean).join(" - ") || "-",
          ];
        }),
        styles: { fontSize: 8, cellPadding: 3, textColor: [22, 35, 59], lineColor: [216, 222, 230], lineWidth: 0.5 },
        headStyles: { fillColor: [238, 241, 244], textColor: [95, 107, 124], fontStyle: "bold" },
        columnStyles: {
          0: { cellWidth: 90 },
          2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" },
        },
        didParseCell: (d) => {
          if (d.section === "body" && d.column.index === 4) {
            const t = String(d.cell.raw);
            if (t.startsWith("-") && t !== "-") d.cell.styles.textColor = [179, 38, 30];
            else if (t.startsWith("+")) d.cell.styles.textColor = [106, 76, 186];
          }
        },
      });
      y = doc.lastAutoTable.finalY + 16;
    }
    y += 6;
  }

  // ── page numbers ──
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(95, 107, 124);
    doc.text(`Page ${i} of ${pages}`, W - M, H - 18, { align: "right" });
  }

  doc.save(fileName || `to-verify-${auditCode || "audit"}.pdf`);
}
