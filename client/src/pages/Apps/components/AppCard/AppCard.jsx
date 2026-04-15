import "./styles.sass";
import { mdiDownload } from "@mdi/js";
import Button from "@/common/components/Button";
import AppIcon from "../AppIcon";

export const AppCard = ({ app, onInstall, onViewDetails, variant = "list" }) => {
    const isBundle = app.type === "bundle" && app.applications;

    const installButton = (
        <Button
            text={app.installed ? "Installed" : "Install"}
            icon={mdiDownload}
            disabled={app.installed}
            onClick={(e) => {
                e.stopPropagation();
                if (!app.installed) onInstall(app);
            }}
            type={app.installed ? "secondary" : undefined}
        />
    );

    if (variant === "grid") {
        return (
            <div className="app-card app-card-grid" onClick={() => onViewDetails(app)}>
                <div className="card-header">
                    <AppIcon app={app} size="medium" />
                    <div className="card-title">
                        <h3>{app.name}</h3>
                        <div className="app-meta">
                            {app.category && <span className="app-category">{app.category}</span>}
                            {isBundle && (
                                <span className="app-bundle-badge">{app.applications.length} Apps</span>
                            )}
                            <span className="app-version">v{app.version}</span>
                        </div>
                    </div>
                </div>
                <div className="card-body">
                    <p className="app-description">{app.description}</p>
                </div>
                <div className="card-footer">
                    {installButton}
                </div>
            </div>
        );
    }

    return (
        <div className="app-card app-card-list" onClick={() => onViewDetails(app)}>
            <AppIcon app={app} size="small" />
            <div className="app-info">
                <div className="app-header">
                    <h3>{app.name}</h3>
                    {app.category && <span className="app-category">{app.category}</span>}
                    {isBundle && (
                        <span className="app-bundle-badge">{app.applications.length} Apps</span>
                    )}
                </div>
                <p className="app-description">{app.description}</p>
            </div>
            <div className="app-actions">
                {installButton}
            </div>
        </div>
    );
};
