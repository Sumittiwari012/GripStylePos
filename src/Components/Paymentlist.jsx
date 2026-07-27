import React from 'react';
import DataTable from './DataTable';

const API_BASE_URL = 'https://gripstyleapi.runasp.net';

function PaymentList() {
  const counterId = localStorage.getItem('counterId');

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

  if (!counterId) {
    return <p style={{ color: '#dc3545' }}>Counter ID missing — please log in again.</p>;
  }

  return (
    <DataTable
      buildEndpoint={(fromDate, toDate) =>
        `${API_BASE_URL}/getPayments?CounterId=${encodeURIComponent(counterId)}&FromDate=${fromDate}&ToDate=${toDate}`
      }
      columns={columns}
      title="Payments"
      emptyMessage="No payments found."
    />
  );
}

export default PaymentList;