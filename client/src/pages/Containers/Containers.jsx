import "./styles.sass";
import Icon from "@mdi/react";
import { mdiDocker } from "@mdi/js";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import AllContainers from "./pages/AllContainers";
import ContainerDetail from "./pages/ContainerDetail";

export const Containers = () => {
    const location = useLocation();
    
    const isDetailPage = location.pathname.includes('/containers/detail/');
    
    return (
        <div className="containers-page">
            {!isDetailPage && (
                <div className="containers-header">
                    <div className="header-content">
                        <div className="header-icon">
                            <Icon path={mdiDocker} />
                        </div>
                        <div className="header-text">
                            <h1>Containers</h1>
                            <p>Manage your Docker containers</p>
                        </div>
                    </div>
                </div>
            )}

            <div className={`containers-content ${!isDetailPage ? 'has-padding' : ''}`}>
                <Routes>
                    <Route path="all" element={<AllContainers />} />
                    <Route path="detail/:id" element={<ContainerDetail />} />
                    <Route path="*" element={<Navigate to="/containers/all" replace />} />
                </Routes>
            </div>
        </div>
    )
}
