import React from 'react';
import DataTable from './DataTable';

const API_BASE_URL = 'http://gripstyleapi.runasp.net';

function CustomerList() {
  const columns = [
    { key: 'customerName', label: 'Name' },
    { key: 'mobileNumber', label: 'Mobile Number' },
    {
      key: 'address',
      label: 'Address',
      render: (row) => row.address || '—'
    }
  ];

  return (
    <DataTable
      endpoint={`${API_BASE_URL}/getCustomer`}
      columns={columns}
      title="Customers"
      emptyMessage="No customers found."
    />
  );
}

export default CustomerList;