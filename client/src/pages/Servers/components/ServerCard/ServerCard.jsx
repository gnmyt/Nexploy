import "./styles.sass";
import Icon from "@mdi/react";
import { mdiDotsVertical, mdiServerOutline } from "@mdi/js";
import ProgressRing from "../ProgressRing";

const STATUS_LABELS = {
    active: "Online",
    error: "Error",
    provisioning: "Provisioning",
    pending: "Offline",
};

export const ServerCard = ({ server, onClick, onMenuClick }) => {
    const isProvisioning = server.status === "provisioning";
    const isActive = server.status === "active";
    const isError = server.status === "error";

    const handleMenuClick = (e) => {
        e.stopPropagation();
        if (onMenuClick) {
            onMenuClick(e, server);
        }
    };

    const handleContextMenu = (e) => {
        e.preventDefault();
        if (onMenuClick) {
            onMenuClick(e, server);
        }
    };

    return (
        <div className="server-card" onClick={() => onClick?.(server)} onContextMenu={handleContextMenu}>
            <div className="server-card-header">
                <div className="server-icon-wrapper">
                    {isProvisioning ? (
                        <ProgressRing progress={server.provisioningProgress || 0} size={48} strokeWidth={3} />
                    ) : (
                        <div className={`server-icon ${isActive ? 'active' : ''} ${isError ? 'error' : ''}`}>
                            <Icon path={mdiServerOutline} />
                        </div>
                    )}
                </div>
                <div className="menu-button" onClick={handleMenuClick}>
                    <Icon path={mdiDotsVertical} />
                </div>
            </div>
            
            <div className="server-card-content">
                <h3 className="server-name">{server.name}</h3>
                <span className={`status-badge ${server.status}`}>
                    {STATUS_LABELS[server.status] || server.status}
                </span>
                {isProvisioning && server.provisioningMessage && (
                    <div className="server-status-message">
                        {server.provisioningMessage}
                    </div>
                )}
                {isError && server.lastError && (
                    <div className="server-error-message">
                        {server.lastError}
                    </div>
                )}
            </div>
        </div>
    );
};
