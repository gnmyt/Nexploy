import "./styles.sass";
import { DialogProvider } from "@/common/components/Dialog/Dialog.jsx";
import { Icon } from "@mdi/react";
import { mdiDownload, mdiLoading, mdiServer, mdiAlertCircleOutline, mdiArrowLeft, mdiArrowRight, mdiEthernetCable } from "@mdi/js";
import Button from "@/common/components/Button";
import SelectBox from "@/common/components/SelectBox";
import WizardSteps from "@/common/components/WizardSteps";
import ToggleSwitch from "@/common/components/ToggleSwitch";
import { useState, useEffect, useMemo } from "react";
import { getRequest, postRequest } from "@/common/utils/RequestUtil.js";
import { useToast } from "@/common/contexts/ToastContext.jsx";
import AppIcon from "../AppIcon";

const INPUT_TYPE_MAP = { password: "password", number: "number", email: "email", url: "url" };

const InputField = ({ input, value, onChange }) => {
    if (input.type === "select") {
        return (
            <SelectBox
                options={(input.options || []).map(o => ({ label: o, value: o }))}
                selected={value || ""}
                setSelected={(v) => onChange(v)}
            />
        );
    }

    if (input.type === "toggle") {
        return (
            <ToggleSwitch
                checked={!!value}
                onChange={(checked) => onChange(checked)}
                id={`input-${input.id}`}
            />
        );
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

export const InstallDialog = ({ app, open, onClose, onInstalled }) => {
    const [servers, setServers] = useState([]);
    const [selectedServer, setSelectedServer] = useState(null);
    const [loading, setLoading] = useState(false);
    const [installing, setInstalling] = useState(false);
    const [error, setError] = useState(null);
    const [step, setStep] = useState(0);
    const [inputValues, setInputValues] = useState({});
    const [portMappings, setPortMappings] = useState([]);
    const { sendToast } = useToast();

    const hasInputs = app?.inputs?.length > 0;
    const hasPorts = portMappings.length > 0;

    const steps = useMemo(() => {
        const s = [{ key: "server", label: "Server" }];
        if (hasInputs) s.push({ key: "inputs", label: "Configure" });
        if (hasPorts) s.push({ key: "ports", label: "Ports" });
        s.push({ key: "confirm", label: "Install" });
        return s;
    }, [hasInputs, hasPorts]);

    useEffect(() => {
        if (!open || !app) return;
        setError(null);
        setInstalling(false);
        setStep(0);
        fetchServers();
        fetchPorts();

        const defaults = {};
        for (const input of app.inputs || []) {
            defaults[input.id] = input.default ?? "";
        }
        setInputValues(defaults);
    }, [open, app]);

    const fetchServers = async () => {
        try {
            setLoading(true);
            const result = await getRequest("servers");
            const active = result.filter(s => s.status === "active");
            setServers(active.map(s => ({ label: `${s.name} (${s.host})`, value: s.id })));
            if (active.length > 0 && !selectedServer) setSelectedServer(active[0].id);
        } catch {
            sendToast("Error", "Failed to load servers");
        } finally {
            setLoading(false);
        }
    };

    const fetchPorts = async () => {
        if (!app?.source || !app?.slug) return;
        try {
            const result = await getRequest(`apps/${app.source}/${app.slug}/ports`);
            setPortMappings(result.ports?.length > 0 ? result.ports.map(p => ({ ...p })) : []);
        } catch {
            setPortMappings([]);
        }
    };

    const handleInstall = async () => {
        if (!selectedServer || !app) return;
        setInstalling(true);
        setError(null);

        try {
            const body = { serverId: selectedServer };
            if (hasInputs && Object.keys(inputValues).length > 0) body.inputs = inputValues;
            if (portMappings.length > 0) body.portMappings = portMappings.map(p => ({ host: p.host, container: p.container }));

            const result = await postRequest(`apps/${app.source}/${app.slug}/install`, body);
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

    const handlePortChange = (index, value) => {
        setPortMappings(prev => {
            const next = [...prev];
            next[index] = { ...next[index], host: Number.parseInt(value) || 0 };
            return next;
        });
    };

    const canAdvance = () => {
        const key = steps[step]?.key;
        if (key === "server") return selectedServer && servers.length > 0;
        if (key === "inputs") return app.inputs.filter(i => i.required).every(i => inputValues[i.id] !== undefined && inputValues[i.id] !== "");
        if (key === "ports") return portMappings.every(p => p.host > 0 && p.host <= 65535);
        return true;
    };

    if (!app) return null;

    const isBundle = app.type === "bundle" && app.applications;
    const currentStepKey = steps[step]?.key;
    const isLastStep = step === steps.length - 1;

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

                {steps.length > 2 && (
                    <div className="install-dialog-wizard">
                        <WizardSteps steps={steps} currentStep={step} />
                    </div>
                )}

                <div className="install-dialog-body">
                    {currentStepKey === "server" && (
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
                                    <span>No active servers available</span>
                                </div>
                            )}

                            {isBundle && (
                                <div className="bundle-info">
                                    <h3>This bundle will install:</h3>
                                    <ul>
                                        {app.applications.map((ref, i) => (
                                            <li key={i}>{ref.includes("@") ? ref.split("@")[0] : ref}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}

                    {currentStepKey === "inputs" && app.inputs && (
                        <div className="input-fields">
                            {app.inputs.map(input => (
                                <div key={input.id} className="input-field">
                                    <label>
                                        {input.label}
                                        {input.required && <span className="required">*</span>}
                                    </label>
                                    {input.description && <p className="input-description">{input.description}</p>}
                                    <InputField
                                        input={input}
                                        value={inputValues[input.id]}
                                        onChange={(v) => setInputValues(prev => ({ ...prev, [input.id]: v }))}
                                    />
                                </div>
                            ))}
                        </div>
                    )}

                    {currentStepKey === "ports" && (
                        <div className="port-mappings">
                            <label className="section-label">
                                <Icon path={mdiEthernetCable} />
                                Port Mapping
                            </label>
                            <div className="port-list">
                                <div className="port-header">
                                    <span>Host Port</span>
                                    <span></span>
                                    <span>Container Port</span>
                                </div>
                                {portMappings.map((pm, i) => (
                                    <div key={i} className="port-row">
                                        <input
                                            type="number"
                                            value={pm.host}
                                            onChange={(e) => handlePortChange(i, e.target.value)}
                                            min="1"
                                            max="65535"
                                            className="field-input"
                                        />
                                        <span className="port-arrow">→</span>
                                        <input
                                            type="number"
                                            value={pm.container}
                                            disabled
                                            className="field-input"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {currentStepKey === "confirm" && (
                        <div className="confirm-summary">
                            <label className="section-label">Summary</label>
                            <div className="summary-grid">
                                <div className="summary-item">
                                    <span className="summary-label">Server</span>
                                    <span className="summary-value">{servers.find(s => s.value === selectedServer)?.label || "—"}</span>
                                </div>
                                {hasInputs && Object.entries(inputValues).filter(([, v]) => v !== "" && v !== undefined).map(([key, value]) => {
                                    const input = app.inputs.find(i => i.id === key);
                                    return (
                                        <div key={key} className="summary-item">
                                            <span className="summary-label">{input?.label || key}</span>
                                            <span className="summary-value">{input?.type === "password" ? "••••••" : String(value)}</span>
                                        </div>
                                    );
                                })}
                                {portMappings.map((pm, i) => (
                                    <div key={`port-${i}`} className="summary-item">
                                        <span className="summary-label">Port</span>
                                        <span className="summary-value">{pm.host} → {pm.container}</span>
                                    </div>
                                ))}
                            </div>
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
                    {step > 0 && !installing && (
                        <Button text="Back" type="secondary" icon={mdiArrowLeft} onClick={() => setStep(s => s - 1)} />
                    )}
                    <div className="footer-spacer" />
                    <Button text="Cancel" type="secondary" onClick={onClose} disabled={installing} />
                    {isLastStep ? (
                        <Button
                            text={installing ? "Installing..." : isBundle ? "Install All" : "Install"}
                            icon={mdiDownload}
                            loading={installing}
                            disabled={installing || !canAdvance()}
                            onClick={handleInstall}
                        />
                    ) : (
                        <Button
                            text="Next"
                            icon={mdiArrowRight}
                            onClick={() => setStep(s => s + 1)}
                            disabled={!canAdvance()}
                        />
                    )}
                </div>
            </div>
        </DialogProvider>
    );
};
