import "./styles.sass";
import { Icon } from "@mdi/react";
import { mdiRocketLaunchOutline, mdiPlus } from "@mdi/js";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import AllDeployments from "./pages/AllDeployments";
import DeploymentEditor from "./pages/DeploymentEditor";
import Button from "@/common/components/Button";

export const Deployments = () => {
    const location = useLocation();
    const navigate = useNavigate();

    const isEditPage = location.pathname.includes("/deployments/edit/");

    return (
        <div className="deployments-page">
            {!isEditPage && (
                <div className="deployments-header">
                    <div className="header-content">
                        <div className="header-icon">
                            <Icon path={mdiRocketLaunchOutline} />
                        </div>
                        <div className="header-text">
                            <h1>Deployments</h1>
                            <p>Build and deploy from Git repositories</p>
                        </div>
                    </div>
                    <div className="header-actions">
                        <Button
                            text="New Deployment"
                            icon={mdiPlus}
                            onClick={() => navigate("/deployments/edit/new")}
                        />
                    </div>
                </div>
            )}

            <div className={`deployments-content ${!isEditPage ? "has-padding" : ""}`}>
                <Routes>
                    <Route path="all" element={<AllDeployments />} />
                    <Route path="edit/:id" element={<DeploymentEditor />} />
                    <Route path="*" element={<Navigate to="/deployments/all" replace />} />
                </Routes>
            </div>
        </div>
    );
};
