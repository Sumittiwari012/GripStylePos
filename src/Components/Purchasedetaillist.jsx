import React from 'react';
import DataTable from './DataTable';

const API_BASE_URL = 'https://gripstyleapi.runasp.net';

function PurchaseDetailList() {
  const counterId = localStorage.getItem('counterId');

  const columns = [
    { key: 'invoiceNumber', label: 'Invoice #' },
    { key: 'productName', label: 'Product' },
    { key: 'barcode', label: 'Barcode' },
    { key: 'quantity', label: 'Qty' },
    {
      key: 'mrp',
      label: 'MRP',
      render: (row) => `₹${Number(row.mrp).toFixed(2)}`
    },
    {
      key: 'discount',
      label: 'Discount',
      render: (row) => `₹${Number(row.discount).toFixed(2)}`
    },
    {
      key: 'salePrice',
      label: 'Sale Value',
      render: (row) => `₹${(Number(row.salePrice) * Number(row.quantity)).toFixed(2)}`
    }
  ];

  if (!counterId) {
    return <p style={{ color: '#dc3545' }}>Counter ID missing — please log in again.</p>;
  }

  return (
    <DataTable
      buildEndpoint={(fromDate, toDate) =>
        `${API_BASE_URL}/getPurchaseDetails?CounterId=${encodeURIComponent(counterId)}&FromDate=${fromDate}&ToDate=${toDate}`
      }
      columns={columns}
      title="Invoice Detail"
      emptyMessage="No invoice line items found."
    />
  );
}

export default PurchaseDetailList;