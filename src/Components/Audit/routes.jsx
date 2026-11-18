import { Navigate, Route } from "react-router-dom";
import { ROUTE_BASE, session } from "./api";
import MemberLogin from "./MemberLogin";
import OwnerLogin from "./OwnerLogin";
import { OwnerAudit, OwnerHome } from "./OwnerPages";
import InchargePage from "./InchargePage";
import ManagerPage from "./ManagerPage";
import SubordinatePage from "./SubordinatePage";
import ReportPage from "./ReportPage";

// Sends people without an OTP session (or with the wrong role) to the right login page.
function RequireMember({ roleId, children }) {
  const s = session.get();
  if (!s?.member || s.member.roleId !== roleId) return <Navigate to={`${ROUTE_BASE}/login`} replace />;
  return children;
}

function RequireOwner({ children }) {
  if (!session.get()?.owner) return <Navigate to={`${ROUTE_BASE}/owner-login`} replace />;
  return children;
}

// Use inside your <Routes>:   <Routes> {auditRoutes} ...your other routes... </Routes>
export const auditRoutes = (
  <>
    <Route path={`${ROUTE_BASE}/login`} element={<MemberLogin />} />
    <Route path={`${ROUTE_BASE}/owner-login`} element={<OwnerLogin />} />

    <Route path={`${ROUTE_BASE}/owner`} element={<RequireOwner><OwnerHome /></RequireOwner>} />
    <Route path={`${ROUTE_BASE}/owner/:auditId`} element={<RequireOwner><OwnerAudit /></RequireOwner>} />
    <Route path={`${ROUTE_BASE}/owner/:auditId/report`} element={<RequireOwner><ReportPage who="owner" /></RequireOwner>} />

    <Route path={`${ROUTE_BASE}/incharge`} element={<RequireMember roleId={2}><InchargePage /></RequireMember>} />
    <Route path={`${ROUTE_BASE}/incharge/report`} element={<RequireMember roleId={2}><ReportPage who="member" /></RequireMember>} />

    <Route path={`${ROUTE_BASE}/manager`} element={<RequireMember roleId={3}><ManagerPage /></RequireMember>} />
    <Route path={`${ROUTE_BASE}/subordinate`} element={<RequireMember roleId={4}><SubordinatePage /></RequireMember>} />
  </>
);
