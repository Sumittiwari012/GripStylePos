// Download the "To verify" products as a PDF, grouped Category > Sub category.
// Needs:  npm i jspdf jspdf-autotable   (loaded only when the button is clicked)
//
// groups: [{ categoryName, subCategories: [{ subCategoryName, items: [line] }] }]
//         items are already only the products waiting for verification.
// figures(line) -> { physical, ... }   (only the physical count is printed)
export async function downloadToVerifyPdf({ auditName, auditCode, groups, figures, fmtQty, fmtDate, fileName }) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 36;
  const total = groups.reduce((n, g) => n + g.subCategories.reduce((m, s) => m + s.items.length, 0), 0);

  const show = (v) => (v === null || v === undefined ? "-" : fmtQty(v));

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
        head: [["Barcode", "Product", "Physical count"]],
        body: sg.items.map((l) => [l.barcode || "-", l.productName || "-", show(figures(l).physical)]),
        styles: { fontSize: 9, cellPadding: 4, textColor: [22, 35, 59], lineColor: [216, 222, 230], lineWidth: 0.5 },
        headStyles: { fillColor: [238, 241, 244], textColor: [95, 107, 124], fontStyle: "bold" },
        columnStyles: { 0: { cellWidth: 140 }, 2: { halign: "right", cellWidth: 110 } },
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
