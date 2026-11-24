import './App.css'
import Pdtsection from './Components/pdtsection'
import { Routes, Route } from "react-router-dom";

import Accounts from "./Components/accounts";
import Offers from "./Components/Offers/Offers";
import CouponVoucher from './Components/Offers/CouponVoucher';
import ProductDiscounts from './Components/Offers/ProductDiscount/ProductDiscounts';
import CategorySalesDashboard from './Components/CategorySalesDashBoard/CategorySalesDashBoard';
import WhatsAppCampaignManager from './Components/WhatsAppCampaignManager';
import InboxPage from './Components/mfwp/InboxPage';
import MyChatsPage from './Components/mfwp/MyChatsPage';
import AdminPage from './Components/mfwp/AdminPage';
import { auditRoutes } from "./Components/Audit/routes";
import { rackRoutes } from "./Components/Rack/rackRoutes";
import ProductStockReport from './Components/ProductStockReport';
import StoreLogin, { RequireStoreUser } from './Components/Store/StoreLogin';
import StorePanel from './Components/Store/StorePanel';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Pdtsection />} />
      <Route path="/accounts" element={<Accounts />} />
      <Route path="/offers" element={<Offers />} />
      <Route path="/offers/coupon" element={<CouponVoucher/>}/>
      <Route path="/offers/product" element={<ProductDiscounts/>}/>
      <Route path="/Sales" element={<CategorySalesDashboard />} />
      <Route path="/whatsappcampaign" element={<WhatsAppCampaignManager />} />
      <Route path="/inbox" element={<InboxPage />} />
      <Route path="/minewp" element={<MyChatsPage />} />
      <Route path="/adminwp" element={<AdminPage />} />
      <Route path="/pdtstockreport" element={<ProductStockReport />}  />

      {/* Store: login first, then the panel (only for logged-in store users) */}
      <Route path="/store-login" element={<StoreLogin />} />
      <Route path="/store" element={<RequireStoreUser><StorePanel /></RequireStoreUser>} />

      {auditRoutes}   {/* all audit routes */}
      {rackRoutes}    {/* all rack routes */}
    </Routes>
  )
}

export default App