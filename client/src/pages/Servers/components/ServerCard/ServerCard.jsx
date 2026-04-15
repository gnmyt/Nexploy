import "./styles.sass";
import Icon from "@mdi/react";
import { mdiDotsVertical, mdiServerOutline, mdiMemory, mdiHarddisk, mdiChip } from "@mdi/js";
import ProgressRing from "../ProgressRing";

const STATUS_LABELS = {
    active: "Online",
    error: "Error",
    provisioning: "Provisioning",
    pending: "Offline",
};

const formatBytes = (bytes) => {
    if (bytes == null || isNaN(bytes)) return "—";
    const gb = bytes / (1024 ** 3);
    if (gb >= 1) return `${gb.toFixed(1)} GB`;
    const mb = bytes / (1024 ** 2);
    return `${mb.toFixed(0)} MB`;
};

const formatUptime = (seconds) => {
    if (seconds == null || isNaN(seconds)) return "—";
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    if (days > 0) return `${days}d ${hours}h`;
    const mins = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
};

const MetricBar = ({ label, icon, value, total, unit, percentage }) => {
    const pct = percentage != null ? percentage : (total > 0 ? (value / total) * 100 : 0);
    const displayPct = Math.min(100, Math.max(0, pct));
    const barClass = displayPct > 90 ? "critical" : displayPct > 70 ? "warning" : "";

    return (
        <div className="metric-item">
            <div className="metric-header">
                <div className="metric-label">
                    <Icon path={icon} />
                    <span>{label}</span>
                </div>
                <span className="metric-value">
                    {unit ? `${value != null ? value : "—"} ${unit}` : `${displayPct.toFixed(0)}%`}
                </span>
            </div>
            <div className="metric-bar">
                <div className={`metric-bar-fill ${barClass}`} style={{ width: `${displayPct}%` }} />
            </div>
        </div>
    );
};

export const ServerCard = ({ server, onClick, onMenuClick }) => {
    const isProvisioning = server.status === "provisioning";
    const isActive = server.status === "active";
    const isError = server.status === "error";
    const hasMetrics = isActive && server.metricsUpdatedAt;

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
        <div className={`server-card ${hasMetrics ? "has-metrics" : ""}`} onClick={() => onClick?.(server)} onContextMenu={handleContextMenu}>
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
                <div className="server-card-title">
                    <h3 className="server-name">{server.name}</h3>
                    <span className={`status-badge ${server.status}`}>
                        {STATUS_LABELS[server.status] || server.status}
                    </span>
                </div>
                <div className="menu-button" onClick={handleMenuClick}>
                    <Icon path={mdiDotsVertical} />
                </div>
            </div>

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

            {hasMetrics && (
                <div className="server-metrics">
                    <MetricBar
                        label="CPU"
                        icon={mdiChip}
                        percentage={server.cpuUsage}
                    />
                    <MetricBar
                        label="Memory"
                        icon={mdiMemory}
                        value={formatBytes(server.memoryUsed)}
                        total={server.memoryTotal}
                        percentage={server.memoryTotal > 0 ? (server.memoryUsed / server.memoryTotal) * 100 : 0}
                    />
                    <MetricBar
                        label="Disk"
                        icon={mdiHarddisk}
                        value={formatBytes(server.diskUsed)}
                        total={server.diskTotal}
                        percentage={server.diskTotal > 0 ? (server.diskUsed / server.diskTotal) * 100 : 0}
                    />
                </div>
            )}

            {hasMetrics && (
                <div className="server-card-footer">
                    {server.osInfo && <span className="os-info">{server.osInfo}</span>}
                    {server.uptime != null && <span className="uptime">Up {formatUptime(server.uptime)}</span>}
                </div>
            )}
        </div>
    );
};
