

import './App.css'
import Pdtsection from './Components/pdtsection'
import { Routes, Route } from "react-router-dom";

import Accounts from "./Components/accounts";
import Offers from "./Components/Offers/Offers";
import CouponVoucher from './Components/Offers/CouponVoucher';
import CategorySalesDashboard from './Components/CategorySalesDashboard/CategorySalesDashBoard';

function App() {
  
  return (
    <Routes>
            <Route path="/" element={<Pdtsection />} />
            <Route path="/accounts" element={<Accounts />} />
            <Route path="/offers" element={<Offers />} />
            <Route path="/offers/coupon" element={<CouponVoucher/>}/>
            <Route path="/Sales" element={<CategorySalesDashboard />} />
        </Routes>
  )
}

export default App
