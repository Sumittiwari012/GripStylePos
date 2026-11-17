import { Navigate, Route } from "react-router-dom";
import { ROUTE_BASE, session } from "./api";
import MemberLogin from "./MemberLogin";
import { OwnerAudit, OwnerHome } from "./OwnerPages";
import InchargePage from "./InchargePage";
import ManagerPage from "./ManagerPage";
import ReportPage from "./ReportPage";

// Sends people without an OTP session (or with the wrong role) to the login page.
function RequireMember({ roleId, children }) {
  const s = session.get();
  if (!s?.member || s.member.roleId !== roleId) return <Navigate to={`${ROUTE_BASE}/login`} replace />;
  return children;
}

// Use inside your <Routes>:   <Routes> {auditRoutes} ...your other routes... </Routes>
export const auditRoutes = (
  <>
    <Route path={`${ROUTE_BASE}/login`} element={<MemberLogin />} />

    {/* Owner: wrap these in your existing owner-only guard if you have one */}
    <Route path={`${ROUTE_BASE}/owner`} element={<OwnerHome />} />
    <Route path={`${ROUTE_BASE}/owner/:auditId`} element={<OwnerAudit />} />
    <Route path={`${ROUTE_BASE}/owner/:auditId/report`} element={<ReportPage who="owner" />} />

    <Route path={`${ROUTE_BASE}/incharge`} element={<RequireMember roleId={2}><InchargePage /></RequireMember>} />
    <Route path={`${ROUTE_BASE}/incharge/report`} element={<RequireMember roleId={2}><ReportPage who="member" /></RequireMember>} />

    <Route path={`${ROUTE_BASE}/manager`} element={<RequireMember roleId={3}><ManagerPage /></RequireMember>} />
  </>
);
