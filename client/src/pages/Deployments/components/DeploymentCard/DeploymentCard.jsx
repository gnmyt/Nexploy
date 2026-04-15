import "./styles.sass";
import { Icon } from "@mdi/react";
import {
    mdiSourceBranch,
    mdiRocketLaunchOutline,
    mdiHammer,
    mdiDelete,
    mdiLoading,
    mdiCheckCircleOutline,
    mdiCloseCircleOutline,
    mdiClockOutline,
    mdiAutorenew,
} from "@mdi/js";

const STATUS_CONFIG = {
    deployed: { label: "Deployed", className: "deployed", icon: mdiCheckCircleOutline },
    building: { label: "Building", className: "building", icon: mdiLoading },
    pending: { label: "Pending", className: "pending", icon: mdiClockOutline },
    failed: { label: "Failed", className: "failed", icon: mdiCloseCircleOutline },
};

export const DeploymentCard = ({ deployment, onClick, onBuild, onDelete }) => {
    const status = STATUS_CONFIG[deployment.status] || STATUS_CONFIG.pending;

    const formatTime = (dateStr) => {
        if (!dateStr) return "Never";
        const d = new Date(dateStr);
        const now = new Date();
        const diff = now - d;
        if (diff < 60000) return "Just now";
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return d.toLocaleDateString();
    };

    const repoName = deployment.repoUrl
        ? deployment.repoUrl.replace(/\.git$/, "").split("/").slice(-2).join("/")
        : "Unknown";

    return (
        <div className="deployment-card" onClick={() => onClick(deployment)}>
            <div className="deployment-card-header">
                <div className="deployment-icon-wrap">
                    <Icon path={mdiRocketLaunchOutline} />
                </div>
                <div className="deployment-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                        className="action-btn build"
                        title="Build"
                        onClick={() => onBuild(deployment.id)}
                        disabled={deployment.status === "building"}
                    >
                        <Icon path={deployment.status === "building" ? mdiLoading : mdiHammer} spin={deployment.status === "building"} />
                    </button>
                    <button className="action-btn delete" title="Delete" onClick={() => onDelete(deployment.id)}>
                        <Icon path={mdiDelete} />
                    </button>
                </div>
            </div>

            <div className="deployment-card-body">
                <h3 className="deployment-name">{deployment.name}</h3>
                <p className="deployment-repo">{repoName}</p>
            </div>

            <div className="deployment-card-footer">
                <div className={`status-badge ${status.className}`}>
                    <Icon path={status.icon} spin={deployment.status === "building"} />
                    <span>{status.label}</span>
                </div>
                <div className="deployment-meta">
                    <div className="meta-item">
                        <Icon path={mdiSourceBranch} />
                        <span>{deployment.branch || "main"}</span>
                    </div>
                    {!!deployment.autoBuild && (
                        <div className="meta-item auto-build">
                            <Icon path={mdiAutorenew} />
                        </div>
                    )}
                </div>
            </div>

            {deployment.lastBuildAt && (
                <div className="deployment-card-build-info">
                    <span className="build-time">Built {formatTime(deployment.lastBuildAt)}</span>
                    {deployment.lastCommitMessage && (
                        <span className="commit-msg" title={deployment.lastCommitMessage}>
                            {deployment.lastCommitMessage.length > 50
                                ? deployment.lastCommitMessage.substring(0, 50) + "..."
                                : deployment.lastCommitMessage}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
};
