import { Navigate, Route } from "react-router-dom";
import { RACK_BASE, rackSession } from "./rackApi";
import RackLogin from "./RackLogin";
import { RackDetail, RackHome } from "./RackAdminPages";
import { RackFind, RackScan, RackView } from "./RackPublic";

// Sends people without a rack OTP session to the rack login page.
function RequireRackManager({ children }) {
  if (!rackSession.get()) return <Navigate to={`${RACK_BASE}/login`} replace />;
  return children;
}

// Use inside your <Routes>:   <Routes> {auditRoutes} {rackRoutes} ...your other routes... </Routes>
//
//   /rack                 public: scan a rack QR code or find a barcode
//   /rack/scan            public: camera opens at once; scan a barcode or a rack QR code
//   /rack/:rackId         public: what is on this rack (the address inside the QR code)
//   /rack/login           manager login (OTP)
//   /rack/manage          manager: rack list, create, find a barcode
//   /rack/manage/:rackId  manager: QR code, add products, move, delete
//
// "scan", "login" and "manage" are fixed words, so React Router ranks them above /rack/:rackId.
export const rackRoutes = (
  <>
    <Route path={RACK_BASE} element={<RackFind />} />
    <Route path={`${RACK_BASE}/scan`} element={<RackScan />} />
    <Route path={`${RACK_BASE}/:rackId`} element={<RackView />} />

    <Route path={`${RACK_BASE}/login`} element={<RackLogin />} />
    <Route path={`${RACK_BASE}/manage`} element={<RequireRackManager><RackHome /></RequireRackManager>} />
    <Route path={`${RACK_BASE}/manage/:rackId`} element={<RequireRackManager><RackDetail /></RequireRackManager>} />
  </>
);
