import React, { useState } from 'react';
import DataTable from './DataTable';
import InvoiceBill from './invoiceBill';

const API_BASE_URL = 'https://gripstyleapi.runasp.net';

const toDateParam = (date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

function PurchaseMasterList() {
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  // ── Counter ID from the logged-in session ──
  const counterId = localStorage.getItem('counterId');
  const today = toDateParam(new Date());

  const handlePrint = async (invoiceNumber) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/getTransactionDetails/${encodeURIComponent(invoiceNumber)}`
      );

      if (!response.ok) {
        throw new Error("Unable to load invoice");
      }

      const data = await response.json();

      const invoiceData = {
        invoiceNumber: data.invoiceNumber,
        customer: {
          customerName: data.customerName,
          mobileNumber: data.customerMobile
        },
        cart: data.items.map(item => ({
          id: item.productId,
          name: item.productName,
          quantity: item.quantity,
          price: item.salePrice,
          cgst: item.cgst ?? 0,
          hsnCode: item.hsnCode ?? item.hsn ?? item.HSNCode ?? '-'
        })),
        totalAmount: data.totalAmount,
        discount: data.discount,
        taxAmount: data.taxAmount ?? 0,
        payableAmount: data.totalAmount - data.discount,
        payments: data.payments.map(p => ({
          method: p.paymentMethod,
          amount: p.amountPaid
        })),
        completedAt: data.purchaseDate
      };

      setSelectedInvoice(invoiceData);
    }
    catch (err) {
      console.error(err);
      alert(err.message);
    }
  };

  const columns = [
    { key: 'invoiceNumber', label: 'Invoice' },
    {
      key: 'customerName',
      label: 'Customer',
      render: row => (
        <div
          style={{
            maxWidth: '110px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {row.customerName}
        </div>
      )
    },
    {
      key: 'purchaseDate',
      label: 'Date',
      render: row => new Date(row.purchaseDate).toLocaleDateString()
    },
    {
      key: 'totalAmount',
      label: 'Total',
      render: row => `₹${Number(row.totalAmount).toFixed(0)}`
    },
    {
      key: 'discount',
      label: 'Disc',
      render: row => `₹${Number(row.discount).toFixed(0)}`
    },
    {
      key: 'isReturned',
      label: 'Ret',
      render: row => row.isReturned ? 'Y' : 'N'
    },
    {
      key: 'print',
      label: '',
      render: row => (
        <button
          onClick={() => handlePrint(row.invoiceNumber)}
          style={{
            padding: '4px 8px',
            fontSize: '11px',
            border: 'none',
            borderRadius: '4px',
            backgroundColor: '#2C6B4B',
            color: 'white',
            cursor: 'pointer'
          }}
        >
          Print
        </button>
      )
    }
  ];

  // ── Guard: don't hit the API without a CounterId, it's a required param now ──
  if (!counterId) {
    return <p style={{ color: '#dc3545' }}>Counter ID missing — please log in again.</p>;
  }

  return (
    <>
      <DataTable
        buildEndpoint={(fromDate, toDate) =>
  `${API_BASE_URL}/getPurchaseMaster?CounterId=${encodeURIComponent(counterId)}&FromDate=${fromDate}&ToDate=${toDate}`
}
        columns={columns}
        title="Invoices"
        emptyMessage="No invoices found."
      />

      {selectedInvoice && (
        <InvoiceBill
          invoice={selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
        />
      )}
    </>
  );
}

export default PurchaseMasterList;