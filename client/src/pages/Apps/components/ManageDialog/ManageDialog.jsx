import "./styles.sass";
import { DialogProvider } from "@/common/components/Dialog/Dialog.jsx";
import { useState, useEffect, useCallback } from "react";
import { Icon } from "@mdi/react";
import {
    mdiPlay, mdiStop, mdiRestart, mdiDelete, mdiUpdate,
    mdiLoading, mdiServer, mdiCog, mdiCodeBraces, mdiInformation,
    mdiContentSave,
} from "@mdi/js";
import Button from "@/common/components/Button";
import TabSwitcher from "@/common/components/TabSwitcher";
import SelectBox from "@/common/components/SelectBox";
import ToggleSwitch from "@/common/components/ToggleSwitch";
import { getRequest, postRequest, patchRequest, deleteRequest } from "@/common/utils/RequestUtil.js";
import { useToast } from "@/common/contexts/ToastContext.jsx";
import AppIcon from "../AppIcon";

const INPUT_TYPE_MAP = { password: "password", number: "number", email: "email", url: "url" };

const ConfigField = ({ input, value, onChange }) => {
    if (input.type === "select") {
        return (
            <SelectBox
                options={(input.options || []).map(o => ({ label: o, value: o }))}
                selected={value || ""}
                setSelected={onChange}
            />
        );
    }

    if (input.type === "toggle") {
        return <ToggleSwitch checked={!!value} onChange={onChange} id={`config-${input.id}`} />;
    }

    if (input.type === "textarea") {
        return (
            <textarea
                value={value || ""}
                onChange={(e) => onChange(e.target.value)}
                placeholder={input.placeholder || ""}
                className="field-input"
                rows={3}
            />
        );
    }

    return (
        <input
            type={INPUT_TYPE_MAP[input.type] || "text"}
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={input.placeholder || ""}
            className="field-input"
        />
    );
};

export const ManageDialog = ({ instanceId, open, onClose, onChanged }) => {
    const { sendToast } = useToast();
    const [app, setApp] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState("overview");
    const [configValues, setConfigValues] = useState({});
    const [configDirty, setConfigDirty] = useState(false);
    const [actionLoading, setActionLoading] = useState(null);
    const [hookOutput, setHookOutput] = useState(null);

    const fetchApp = useCallback(async () => {
        if (!instanceId) return;
        try {
            setLoading(true);
            const result = await getRequest(`apps/installed/${instanceId}`);
            if (result?.code) {
                sendToast("Error", result.message);
                onClose?.();
                return;
            }
            setApp(result);
            setConfigValues(result.config || {});
            setConfigDirty(false);
        } catch {
            sendToast("Error", "Failed to load app details");
            onClose?.();
        } finally {
            setLoading(false);
        }
    }, [instanceId]);

    useEffect(() => {
        if (open && instanceId) {
            setActiveTab("overview");
            setHookOutput(null);
            fetchApp();
        }
    }, [open, instanceId]);

    const withAction = async (name, fn) => {
        setActionLoading(name);
        try {
            await fn();
        } catch (err) {
            sendToast("Error", err?.message || `Action failed`);
        } finally {
            setActionLoading(null);
        }
    };

    const handleStackAction = (action) => withAction(action, async () => {
        await postRequest(`stacks/${app.stackId}/action`, { action });
        sendToast("Success", `Stack ${action} successful`);
        setTimeout(fetchApp, 2000);
    });

    const handleUpdate = () => withAction("update", async () => {
        await postRequest(`apps/installed/${instanceId}/update`);
        sendToast("Success", `${app.name} updated`);
        fetchApp();
        onChanged?.();
    });

    const handleUninstall = () => withAction("uninstall", async () => {
        await deleteRequest(`apps/installed/${instanceId}`);
        sendToast("Success", `${app.name} uninstalled`);
        onChanged?.();
        onClose?.();
    });

    const handleConfigSave = () => withAction("config", async () => {
        await patchRequest(`apps/installed/${instanceId}/config`, { config: configValues });
        sendToast("Success", "Configuration saved");
        setConfigDirty(false);
        fetchApp();
    });

    const handleRunHook = (hookName) => withAction(`hook-${hookName}`, async () => {
        const result = await postRequest(`apps/installed/${instanceId}/hooks/${hookName}`);
        setHookOutput({ hook: hookName, ...result });
        sendToast("Success", `Hook "${hookName}" executed`);
    });

    if (!instanceId) return null;

    const hasInputs = app?.inputs?.length > 0;
    const manualHooks = app?.hooks
        ? Object.keys(app.hooks).filter(h => !["postInstall", "postUpdate"].includes(h))
        : [];

    const tabs = [{ key: "overview", label: "Overview", icon: mdiInformation }];
    if (hasInputs) tabs.push({ key: "configure", label: "Configure", icon: mdiCog });
    if (manualHooks.length > 0) tabs.push({ key: "hooks", label: "Hooks", icon: mdiCodeBraces });

    const statusClass = app?.stack?.status === "running" ? "status-running"
        : app?.stack?.status === "stopped" ? "status-stopped" : "status-unknown";

    return (
        <DialogProvider open={open} onClose={onClose}>
            <div className="manage-dialog">
                {loading ? (
                    <div className="manage-loading">
                        <Icon path={mdiLoading} spin={true} size={2} />
                        <p>Loading app details...</p>
                    </div>
                ) : app && (
                    <>
                        <div className="manage-header">
                            <AppIcon app={app} size="large" />
                            <div className="header-info">
                                <h2>{app.name}</h2>
                                <div className="header-meta">
                                    <span className="app-version">v{app.version}</span>
                                    {app.category && <span className="app-category">{app.category}</span>}
                                    <span className={`app-status ${statusClass}`}>
                                        {app.stack?.status || "unknown"}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="manage-actions">
                            {app.stack && (
                                <>
                                    <Button text="Start" icon={mdiPlay} type="secondary"
                                        onClick={() => handleStackAction("start")}
                                        loading={actionLoading === "start"}
                                        disabled={!!actionLoading || app.stack.status === "running"} />
                                    <Button text="Stop" icon={mdiStop} type="secondary"
                                        onClick={() => handleStackAction("stop")}
                                        loading={actionLoading === "stop"}
                                        disabled={!!actionLoading || app.stack.status === "stopped"} />
                                    <Button text="Restart" icon={mdiRestart} type="secondary"
                                        onClick={() => handleStackAction("restart")}
                                        loading={actionLoading === "restart"}
                                        disabled={!!actionLoading} />
                                </>
                            )}
                            {app.updateAvailable && (
                                <Button text={`Update to v${app.updateAvailable}`} icon={mdiUpdate}
                                    onClick={handleUpdate} loading={actionLoading === "update"}
                                    disabled={!!actionLoading} />
                            )}
                            <Button text="Uninstall" icon={mdiDelete} type="danger"
                                onClick={handleUninstall} loading={actionLoading === "uninstall"}
                                disabled={!!actionLoading} />
                        </div>

                        {tabs.length > 1 && (
                            <div className="manage-tabs">
                                <TabSwitcher tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
                            </div>
                        )}

                        <div className="manage-content">
                            {activeTab === "overview" && (
                                <div className="overview-tab">
                                    {app.description && (
                                        <div className="info-card">
                                            <h3>About</h3>
                                            <p>{app.description}</p>
                                        </div>
                                    )}

                                    <div className="info-card">
                                        <h3>Details</h3>
                                        <div className="details-grid">
                                            {[
                                                ["Source", app.source],
                                                ["Version", app.version],
                                                ["Type", app.type],
                                                app.mainService && ["Main Service", app.mainService],
                                                app.stack && ["Stack", app.stack.name],
                                                app.stack && ["Services", app.stack.services],
                                            ].filter(Boolean).map(([label, value]) => (
                                                <div key={label} className="detail-item">
                                                    <span className="detail-label">{label}</span>
                                                    <span className="detail-value">{value}</span>
                                                </div>
                                            ))}
                                            <div className="detail-item">
                                                <span className="detail-label">Server</span>
                                                <span className="detail-value">
                                                    <Icon path={mdiServer} />#{app.serverId}
                                                </span>
                                            </div>
                                            <div className="detail-item">
                                                <span className="detail-label">Installed</span>
                                                <span className="detail-value">{new Date(app.installedAt).toLocaleDateString()}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {app.ports?.length > 0 && (
                                        <div className="info-card">
                                            <h3>Ports</h3>
                                            <div className="port-list">
                                                {app.ports.map((p) => (
                                                    <div key={`${p.host}-${p.container}`} className="port-item">
                                                        <span className="port-host">{p.host}</span>
                                                        <span className="port-arrow">→</span>
                                                        <span className="port-container">{p.container}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === "configure" && hasInputs && (
                                <div className="configure-tab">
                                    <div className="info-card">
                                        <div className="card-header">
                                            <h3>Configuration</h3>
                                            <Button text="Save" icon={mdiContentSave}
                                                onClick={handleConfigSave}
                                                loading={actionLoading === "config"}
                                                disabled={!configDirty || !!actionLoading} />
                                        </div>
                                        <div className="config-fields">
                                            {app.inputs.map(input => (
                                                <div key={input.id} className="config-field">
                                                    <label>
                                                        {input.label}
                                                        {input.required && <span className="required">*</span>}
                                                    </label>
                                                    {input.description && <p className="field-description">{input.description}</p>}
                                                    <ConfigField
                                                        input={input}
                                                        value={configValues[input.id]}
                                                        onChange={(v) => {
                                                            setConfigValues(prev => ({ ...prev, [input.id]: v }));
                                                            setConfigDirty(true);
                                                        }}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === "hooks" && manualHooks.length > 0 && (
                                <div className="hooks-tab">
                                    <div className="info-card">
                                        <h3>Available Hooks</h3>
                                        <div className="hooks-list">
                                            {manualHooks.map(hookName => (
                                                <div key={hookName} className="hook-item">
                                                    <div className="hook-info">
                                                        <span className="hook-name">{hookName}</span>
                                                        <span className="hook-file">{app.hooks[hookName]}</span>
                                                    </div>
                                                    <Button text="Run" icon={mdiPlay} type="secondary"
                                                        onClick={() => handleRunHook(hookName)}
                                                        loading={actionLoading === `hook-${hookName}`}
                                                        disabled={!!actionLoading} />
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {hookOutput && (
                                        <div className="info-card">
                                            <h3>Output — {hookOutput.hook}</h3>
                                            <pre className="hook-output">{hookOutput.stdout || hookOutput.stderr || "No output"}</pre>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </DialogProvider>
    );
};
