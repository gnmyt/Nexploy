import "./styles.sass";
import { DialogProvider } from "@/common/components/Dialog/Dialog.jsx";
import { Icon } from "@mdi/react";
import { mdiDownload, mdiLoading, mdiServer, mdiAlertCircleOutline } from "@mdi/js";
import Button from "@/common/components/Button";
import SelectBox from "@/common/components/SelectBox";
import { useState, useEffect } from "react";
import { getRequest, postRequest } from "@/common/utils/RequestUtil.js";
import { useToast } from "@/common/contexts/ToastContext.jsx";
import AppIcon from "../AppIcon";

export const InstallDialog = ({ app, open, onClose, onInstalled }) => {
    const [servers, setServers] = useState([]);
    const [selectedServer, setSelectedServer] = useState(null);
    const [loading, setLoading] = useState(false);
    const [installing, setInstalling] = useState(false);
    const [error, setError] = useState(null);
    const { sendToast } = useToast();

    useEffect(() => {
        if (open) {
            setError(null);
            setInstalling(false);
            fetchServers();
        }
    }, [open]);

    const fetchServers = async () => {
        try {
            setLoading(true);
            const result = await getRequest("servers");
            const activeServers = result.filter(s => s.status === "active");
            setServers(activeServers.map(s => ({ label: `${s.name} (${s.host})`, value: s.id })));
            if (activeServers.length > 0 && !selectedServer) {
                setSelectedServer(activeServers[0].id);
            }
        } catch {
            sendToast("Error", "Failed to load servers");
        } finally {
            setLoading(false);
        }
    };

    const handleInstall = async () => {
        if (!selectedServer || !app) return;
        setInstalling(true);
        setError(null);

        try {
            const result = await postRequest(`apps/${app.source}/${app.slug}/install`, {
                serverId: selectedServer,
            });
            sendToast("Success", result.message || `${app.name} installed successfully`);
            onInstalled?.();
            onClose();
        } catch (err) {
            const msg = err?.message || "Installation failed";
            setError(msg);
            sendToast("Error", msg);
        } finally {
            setInstalling(false);
        }
    };

    if (!app) return null;

    const isBundle = app.type === "bundle" && app.applications;

    return (
        <DialogProvider open={open} onClose={onClose}>
            <div className="install-dialog">
                <div className="install-dialog-header">
                    <AppIcon app={app} size="large" />
                    <div className="install-dialog-info">
                        <h2>Install {app.name}</h2>
                        <p className="install-dialog-version">
                            v{app.version} &middot; {app.type}
                            {isBundle && ` (${app.applications.length} apps)`}
                        </p>
                    </div>
                </div>

                <div className="install-dialog-body">
                    <div className="server-select">
                        <label>
                            <Icon path={mdiServer} />
                            Target Server
                        </label>
                        {loading ? (
                            <div className="loading-servers">
                                <Icon path={mdiLoading} spin={true} />
                                <span>Loading servers...</span>
                            </div>
                        ) : servers.length > 0 ? (
                            <SelectBox
                                options={servers}
                                selected={selectedServer}
                                setSelected={setSelectedServer}
                                searchable={servers.length > 3}
                            />
                        ) : (
                            <div className="no-servers">
                                <Icon path={mdiAlertCircleOutline} />
                                <span>No active servers available. Add a server first.</span>
                            </div>
                        )}
                    </div>

                    {isBundle && (
                        <div className="bundle-info">
                            <h3>This bundle will install:</h3>
                            <ul>
                                {app.applications.map((ref, i) => {
                                    const slug = ref.includes("@") ? ref.split("@")[0] : ref;
                                    return <li key={i}>{slug}</li>;
                                })}
                            </ul>
                        </div>
                    )}

                    {error && (
                        <div className="install-error">
                            <Icon path={mdiAlertCircleOutline} />
                            <span>{error}</span>
                        </div>
                    )}
                </div>

                <div className="install-dialog-footer">
                    <Button text="Cancel" type="secondary" onClick={onClose} />
                    <Button
                        text={installing ? "Installing..." : isBundle ? "Install All" : "Install"}
                        icon={installing ? mdiLoading : mdiDownload}
                        disabled={installing || !selectedServer || servers.length === 0}
                        onClick={handleInstall}
                    />
                </div>
            </div>
        </DialogProvider>
    );
};
