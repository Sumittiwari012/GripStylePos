import React from 'react';
import DataTable from './DataTable';

const API_BASE_URL = 'http://gripstyleapi.runasp.net';

function PurchaseMasterList() {
  const columns = [
    { key: 'invoiceNumber', label: 'Invoice #' },
    { key: 'customerName', label: 'Customer' },
    {
      key: 'purchaseDate',
      label: 'Date',
      render: (row) => new Date(row.purchaseDate).toLocaleString()
    },
    {
      key: 'totalAmount',
      label: 'Total',
      render: (row) => `₹${Number(row.totalAmount).toFixed(2)}`
    },
    {
      key: 'discount',
      label: 'Discount',
      render: (row) => `₹${Number(row.discount).toFixed(2)}`
    },
    {
      key: 'discountPercentage',
      label: 'Discount %',
      render: (row) => `${Number(row.discountPercentage).toFixed(2)}%`
    },
    {
      key: 'isReturned',
      label: 'Returned',
      render: (row) => (row.isReturned ? 'Yes' : 'No')
    }
  ];

  return (
    <DataTable
      endpoint={`${API_BASE_URL}/getPurchaseMaster`}
      columns={columns}
      title="All Invoices"
      emptyMessage="No invoices found."
    />
  );
}

export default PurchaseMasterList;