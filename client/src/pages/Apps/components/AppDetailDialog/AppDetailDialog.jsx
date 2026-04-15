import "./styles.sass";
import { DialogProvider } from "@/common/components/Dialog/Dialog.jsx";
import { Icon } from "@mdi/react";
import { mdiDownload, mdiPackageVariant } from "@mdi/js";
import Button from "@/common/components/Button";
import { useState } from "react";
import AppIcon from "../AppIcon";

export const AppDetailDialog = ({ app, open, onClose, onInstall }) => {
    const [selectedScreenshot, setSelectedScreenshot] = useState(0);

    if (!app) return null;

    const isBundle = app.type === "bundle" && app.applications;
    const galleryUrls = (app.gallery || []).map(
        f => `/api/apps/${app.source}/${app.slug}/gallery/${f}`
    );

    return (
        <DialogProvider open={open} onClose={onClose}>
            <div className="app-detail-dialog">
                <div className="app-detail-header">
                    <AppIcon app={app} size="large" />
                    <div className="app-detail-info">
                        <h2>{app.name}</h2>
                        <div className="app-detail-meta">
                            {app.category && <span className="app-category">{app.category}</span>}
                            {isBundle && (
                                <span className="app-bundle-badge">
                                    <Icon path={mdiPackageVariant} />
                                    Bundle ({app.applications.length} apps)
                                </span>
                            )}
                            <span className="app-author">Source: {app.source}</span>
                        </div>
                    </div>
                </div>

                <div className="app-detail-description">
                    <h3>About</h3>
                    <p>{app.description}</p>
                </div>

                {isBundle && (
                    <div className="app-detail-bundled">
                        <h3>Included Applications</h3>
                        <div className="bundled-apps-list">
                            {app.applications.map((ref, index) => {
                                const [source, slug] = ref.includes("/") ? ref.split("/") : [null, ref];

                                return (
                                    <div key={index} className="bundled-app-item">
                                        <div className="bundled-app-info">
                                            {source ? (
                                                <img src={`/api/apps/${source}/${slug}/logo`} alt={slug} />
                                            ) : (
                                                <Icon path={mdiPackageVariant} />
                                            )}
                                            <span className="bundled-app-name">{slug}</span>
                                        </div>
                                        <Button
                                            text="Install"
                                            icon={mdiDownload}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                            }}
                                            small
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {galleryUrls.length > 0 && (
                    <div className="app-detail-screenshots">
                        <h3>Screenshots</h3>
                        <div className="screenshot-main">
                            <img src={galleryUrls[selectedScreenshot]} alt={`Screenshot ${selectedScreenshot + 1}`} />
                        </div>
                        {galleryUrls.length > 1 && (
                            <div className="screenshot-thumbnails">
                                {galleryUrls.map((url, index) => (
                                    <img
                                        key={index}
                                        src={url}
                                        alt={`Thumbnail ${index + 1}`}
                                        className={selectedScreenshot === index ? "active" : ""}
                                        onClick={() => setSelectedScreenshot(index)}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}

                <div className="app-detail-specs">
                    <h3>Details</h3>
                    <div className="specs-grid">
                        <div className="spec-item">
                            <span className="spec-label">Version</span>
                            <span className="spec-value">{app.version}</span>
                        </div>
                        {app.category && (
                            <div className="spec-item">
                                <span className="spec-label">Category</span>
                                <span className="spec-value">{app.category}</span>
                            </div>
                        )}
                        <div className="spec-item">
                            <span className="spec-label">Type</span>
                            <span className="spec-value">{app.type}</span>
                        </div>
                    </div>
                </div>

                <div className="app-detail-footer">
                    <Button
                        text={app.installed ? "Installed" : isBundle ? "Install All" : "Install"} 
                        icon={mdiDownload}
                        disabled={app.installed}
                        onClick={() => !app.installed && onInstall(app)}
                        type={app.installed ? "secondary" : undefined}
                    />
                </div>
            </div>
        </DialogProvider>
    );
};
