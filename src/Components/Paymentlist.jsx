import React from 'react';
import DataTable from './DataTable';

const API_BASE_URL = 'http://gripstyleapi.runasp.net';

function PaymentList() {
  const columns = [
    { key: 'invoiceNumber', label: 'Invoice #' },
    { key: 'customerName', label: 'Customer' },
    { key: 'paymentMethod', label: 'Method' },
    {
      key: 'bankAccountNumber',
      label: 'Bank Account',
      render: (row) => row.bankAccountNumber || '—'
    },
    {
      key: 'amountPaid',
      label: 'Amount Paid',
      render: (row) => `₹${Number(row.amountPaid).toFixed(2)}`
    }
  ];

  return (
    <DataTable
      endpoint={`${API_BASE_URL}/getPayments`}
      columns={columns}
      title="Payments"
      emptyMessage="No payments found."
    />
  );
}

export default PaymentList;