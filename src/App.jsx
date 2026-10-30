

import './App.css'
import Pdtsection from './Components/pdtsection'
import { Routes, Route } from "react-router-dom";

import Accounts from "./Components/accounts";
import Offers from "./Components/Offers/Offers";
import CouponVoucher from './Components/Offers/CouponVoucher';
import CategorySalesDashboard from './Components/CategorySalesDashBoard/CategorySalesDashBoard';
import WhatsAppCampaignManager from './Components/WhatsAppCampaignManager';
import InboxPage from './Components/mfwp/InboxPage';
import MyChatsPage from './Components/mfwp/MyChatsPage';
import AdminPage from './Components/mfwp/AdminPage';

function App() {
  
  return (
    <Routes>
            <Route path="/" element={<Pdtsection />} />
            <Route path="/accounts" element={<Accounts />} />
            <Route path="/offers" element={<Offers />} />
            <Route path="/offers/coupon" element={<CouponVoucher/>}/>
            <Route path="/Sales" element={<CategorySalesDashboard />} />
            <Route path="/whatsappcampaign" element={<WhatsAppCampaignManager />} />
            <Route path="/inbox" element={<InboxPage />} />
<Route path="/minewp" element={<MyChatsPage />} />
<Route path="/adminwp" element={<AdminPage />} />
            
        </Routes>
  )
}

export default App
