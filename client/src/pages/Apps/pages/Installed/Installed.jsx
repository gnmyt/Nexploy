import "./styles.sass";
import { useState, useEffect, useMemo, useCallback } from "react";
import { Icon } from "@mdi/react";
import { mdiUpdate, mdiPackageVariantClosed, mdiMagnify, mdiChevronRight, mdiLoading, mdiServer, mdiDelete } from "@mdi/js";
import Button from "@/common/components/Button";
import IconInput from "@/common/components/IconInput";
import { getRequest, postRequest, deleteRequest } from "@/common/utils/RequestUtil.js";
import { useToast } from "@/common/contexts/ToastContext.jsx";
import AppIcon from "../../components/AppIcon";
import ManageDialog from "../../components/ManageDialog";

export const Installed = () => {
    const [selectedInstanceId, setSelectedInstanceId] = useState(null);
    const [manageOpen, setManageOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [installedApps, setInstalledApps] = useState([]);
    const [servers, setServers] = useState({});
    const [loading, setLoading] = useState(true);
    const [updatingIds, setUpdatingIds] = useState(new Set());
    const { sendToast } = useToast();

    const fetchInstalledApps = useCallback(async () => {
        try {
            setLoading(true);
            const [apps, serverList] = await Promise.all([
                getRequest("apps/installed"),
                getRequest("servers"),
            ]);
            setInstalledApps(apps);
            const serverMap = {};
            for (const s of serverList) {
                serverMap[s.id] = s;
            }
            setServers(serverMap);
        } catch {
            sendToast("Error", "Failed to load installed apps");
        } finally {
            setLoading(false);
        }
    }, [sendToast]);

    useEffect(() => {
        fetchInstalledApps();
    }, []);

    const flatInstances = useMemo(() => {
        const rows = [];
        for (const app of installedApps) {
            for (const inst of app.instances) {
                rows.push({
                    ...app,
                    instanceId: inst.id,
                    serverId: inst.serverId,
                    stackId: inst.stackId,
                    version: inst.version,
                    updateAvailable: inst.updateAvailable,
                    installedAt: inst.installedAt,
                });
            }
        }
        return rows;
    }, [installedApps]);

    const appsWithUpdates = useMemo(() => 
        flatInstances.filter(a => a.updateAvailable),
    [flatInstances]);

    const filteredApps = useMemo(() => {
        let apps = flatInstances;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            apps = apps.filter(app => 
                app.name.toLowerCase().includes(q) ||
                app.category?.toLowerCase().includes(q) ||
                app.slug.toLowerCase().includes(q)
            );
        }
        return apps;
    }, [searchQuery, flatInstances]);

    const handleViewDetails = (app) => {
        setSelectedInstanceId(app.instanceId);
        setManageOpen(true);
    };

    const handleUpdate = async (app) => {
        const id = app.instanceId;
        setUpdatingIds(prev => new Set([...prev, id]));

        try {
            await postRequest(`apps/installed/${id}/update`);
            sendToast("Success", `${app.name} updated successfully`);
            fetchInstalledApps();
        } catch (err) {
            sendToast("Error", err?.message || "Update failed");
        } finally {
            setUpdatingIds(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }
    };

    const handleUpdateAll = async () => {
        const allIds = appsWithUpdates.map(a => a.instanceId);
        setUpdatingIds(new Set(allIds));

        try {
            for (const id of allIds) {
                await postRequest(`apps/installed/${id}/update`);
            }
            sendToast("Success", "All apps updated successfully");
            fetchInstalledApps();
        } catch (err) {
            sendToast("Error", err?.message || "Some updates failed");
        } finally {
            setUpdatingIds(new Set());
        }
    };

    const handleUninstall = async (instanceId, appName) => {
        try {
            await deleteRequest(`apps/installed/${instanceId}`);
            sendToast("Success", `${appName} uninstalled`);
            fetchInstalledApps();
        } catch (err) {
            sendToast("Error", err?.message || "Uninstall failed");
        }
    };

    const getServerName = (serverId) => {
        const server = servers[serverId];
        return server ? server.name : `Server #${serverId}`;
    };

    if (loading) {
        return (
            <div className="installed-page">
                <div className="no-results">
                    <Icon path={mdiLoading} spin={true} size={2} />
                    <p>Loading installed apps...</p>
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="installed-page">
                {appsWithUpdates.length > 0 && (
                    <div className="updates-section">
                        <div className="section-header">
                            <div className="header-left">
                                <Icon path={mdiUpdate} />
                                <h2>Updates Available</h2>
                                <span className="badge">{appsWithUpdates.length}</span>
                            </div>
                            <div className="header-line"></div>
                            <Button 
                                text="Update All" 
                                icon={mdiUpdate}
                                onClick={handleUpdateAll}
                                disabled={updatingIds.size > 0}
                            />
                        </div>
                        
                        <div className="updates-list">
                            {appsWithUpdates.map((app) => {
                                const isUpdating = updatingIds.has(app.instanceId);
                                return (
                                    <div key={app.instanceId} className="update-item" onClick={() => handleViewDetails(app)}>
                                        <AppIcon app={app} size="medium" />
                                        <div className="update-info">
                                            <h3>{app.name}</h3>
                                            <div className="update-meta">
                                                <div className="version-update">
                                                    <span className="version-current">v{app.version}</span>
                                                    <Icon path={mdiChevronRight} className="version-arrow" />
                                                    <span className="version-new">v{app.updateAvailable}</span>
                                                </div>
                                                <span className="server-label">
                                                    <Icon path={mdiServer} />
                                                    {getServerName(app.serverId)}
                                                </span>
                                            </div>
                                        </div>
                                        <Button 
                                            text={isUpdating ? "Updating..." : "Update"}
                                            icon={mdiUpdate}
                                            loading={isUpdating}
                                            disabled={isUpdating}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleUpdate(app);
                                            }}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                <div className="installed-apps-section">
                    <div className="section-header">
                        <div className="header-left">
                            <Icon path={mdiPackageVariantClosed} />
                            <h2>All Installed Apps</h2>
                            <span className="badge">{flatInstances.length}</span>
                        </div>
                        <div className="header-line"></div>
                        <div className="search-container">
                            <IconInput 
                                type="text"
                                placeholder="Search installed apps..."
                                icon={mdiMagnify}
                                value={searchQuery}
                                setValue={setSearchQuery}
                            />
                        </div>
                    </div>
                    
                    {filteredApps.length > 0 ? (
                        <div className="apps-list">
                            {filteredApps.map((app) => (
                                <div key={app.instanceId} className="installed-app-row" onClick={() => handleViewDetails(app)}>
                                    <AppIcon app={app} size="small" />
                                    <div className="app-info">
                                        <div className="app-header">
                                            <h3>{app.name}</h3>
                                            {app.category && <span className="app-category">{app.category}</span>}
                                            <span className="app-version">v{app.version}</span>
                                        </div>
                                        <span className="server-label">
                                            <Icon path={mdiServer} />
                                            {getServerName(app.serverId)}
                                        </span>
                                    </div>
                                    <div className="app-actions">
                                        <Button
                                            type="secondary"
                                            text="Uninstall"
                                            icon={mdiDelete}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleUninstall(app.instanceId, app.name);
                                            }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : flatInstances.length === 0 ? (
                        <div className="no-results">
                            <Icon path={mdiPackageVariantClosed} />
                            <h3>No apps installed</h3>
                            <p>Browse the store to install apps</p>
                        </div>
                    ) : (
                        <div className="no-results">
                            <Icon path={mdiMagnify} />
                            <h3>No apps found</h3>
                            <p>Try a different search term</p>
                        </div>
                    )}
                </div>
            </div>

            <ManageDialog
                instanceId={selectedInstanceId}
                open={manageOpen}
                onClose={() => setManageOpen(false)}
                onChanged={fetchInstalledApps}
            />
        </>
    );
};
