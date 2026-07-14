import React from 'react';
import DataTable from './DataTable';

const API_BASE_URL = 'https://gripstyleapi.runasp.net';

function PurchaseDetailList() {
  const columns = [
    { key: 'invoiceNumber', label: 'Invoice #' },
    { key: 'productName', label: 'Product' },
    { key: 'barcode', label: 'Barcode' },
    { key: 'quantity', label: 'Qty' },
    {
      key: 'salePrice',
      label: 'Sale Price',
      render: (row) => `₹${Number(row.salePrice).toFixed(2)}`
    },
    {
      key: 'afterTaxation',
      label: 'After Tax',
      render: (row) => `₹${Number(row.afterTaxation).toFixed(2)}`
    }
  ];

  return (
    <DataTable
      endpoint={`${API_BASE_URL}/getPurchaseDetails`}
      columns={columns}
      title="Invoice Detail"
      emptyMessage="No invoice line items found."
    />
  );
}

export default PurchaseDetailList;