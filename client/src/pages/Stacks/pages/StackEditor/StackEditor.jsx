import "./styles.sass";
import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect, useCallback, useRef } from "react";
import { getRequest, postRequest, putRequest } from "@/common/utils/RequestUtil.js";
import { useToast } from "@/common/contexts/ToastContext.jsx";
import { useEventBus } from "@/common/contexts/EventContext.jsx";
import Editor from "@monaco-editor/react";
import { Icon } from "@mdi/react";
import TabSwitcher from "@/common/components/TabSwitcher";
import LogViewer from "@/common/components/LogViewer";
import SelectBox from "@/common/components/SelectBox";
import {
    mdiArrowLeft,
    mdiContentSave,
    mdiPlay,
    mdiStop,
    mdiRestart,
    mdiCloseOctagon,
    mdiCog,
    mdiCalendarClock,
    mdiLayers,
    mdiFileDocumentOutline,
    mdiTextBox,
    mdiLoading,
    mdiRocket,
    mdiPackageVariantClosed,
    mdiDocker,
    mdiOpenInNew,
    mdiPlus,
    mdiDelete,
    mdiApplicationVariableOutline,
    mdiFileCogOutline,
    mdiArrowLeftBold,
    mdiRefresh,
    mdiDatabaseOutline,
} from "@mdi/js";
import Button from "@/common/components/Button";
import IconInput from "@/common/components/IconInput";
import ComposerizeDialog from "../../components/ComposerizeDialog";
import { SqliteBrowser } from "../../components/SqliteBrowser";

const SQLITE_EXTENSIONS = ["db", "sqlite", "sqlite3"];

const isSqliteFile = (filename) => {
    const ext = filename.split(".").pop()?.toLowerCase();
    return SQLITE_EXTENSIONS.includes(ext);
};

const DEFAULT_COMPOSE = `services:
  app:
    image: nginx:alpine
    ports:
      - "8080:80"
    restart: unless-stopped
`;

const EDITOR_LANG_MAP = {
    json: "json",
    yml: "yaml",
    yaml: "yaml",
    toml: "ini",
    ini: "ini",
    conf: "ini",
    cfg: "ini",
    properties: "ini",
    xml: "xml",
};

const getEditorLanguage = (filename) => {
    const ext = filename.split(".").pop()?.toLowerCase();
    return EDITOR_LANG_MAP[ext] || "plaintext";
};

export const StackEditor = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { sendToast } = useToast();
    const [stack, setStack] = useState(null);
    const [composeContent, setComposeContent] = useState("");
    const [originalContent, setOriginalContent] = useState("");
    const [hasChanges, setHasChanges] = useState(false);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState("compose");
    const [logs, setLogs] = useState("");
    const [logsLoading, setLogsLoading] = useState(false);
    const [logsTailLines, setLogsTailLines] = useState(200);
    const [liveMode, setLiveMode] = useState(false);
    const [liveLogs, setLiveLogs] = useState("");
    const liveWsRef = useRef(null);

    const [servers, setServers] = useState([]);
    const [selectedServer, setSelectedServer] = useState("");
    const [stackName, setStackName] = useState("");
    const [creating, setCreating] = useState(false);
    const [containers, setContainers] = useState([]);
    const [containersLoading, setContainersLoading] = useState(false);
    const [envVars, setEnvVars] = useState([]);
    const [originalEnvVars, setOriginalEnvVars] = useState([]);
    const [envLoading, setEnvLoading] = useState(false);
    const [envHasChanges, setEnvHasChanges] = useState(false);
    const [composerizeOpen, setComposerizeOpen] = useState(false);
    const [actionLoading, setActionLoading] = useState(null);
    const [configFiles, setConfigFiles] = useState([]);
    const [configLoading, setConfigLoading] = useState(false);
    const [selectedConfigFile, setSelectedConfigFile] = useState(null);
    const [configContent, setConfigContent] = useState("");
    const [originalConfigContent, setOriginalConfigContent] = useState("");
    const [configFileLoading, setConfigFileLoading] = useState(false);
    const [configSaving, setConfigSaving] = useState(false);
    const eventBus = useEventBus();

    const isNew = id === "new";

    const fetchStack = useCallback(async () => {
        if (isNew) return;
        try {
            const data = await getRequest(`stacks/${id}`);
            if (data?.code) {
                sendToast("Error", data.message || "Stack not found");
                navigate("/stacks/all");
                return;
            }
            setStack(data);
        } catch {
            sendToast("Error", "Failed to load stack");
            navigate("/stacks/all");
        }
    }, [id, isNew, navigate, sendToast]);

    const fetchCompose = useCallback(async () => {
        if (isNew) return;
        try {
            const data = await getRequest(`stacks/${id}/compose`);
            if (!data?.code) {
                setComposeContent(data.content || "");
                setOriginalContent(data.content || "");
            }
        } catch {
            sendToast("Error", "Failed to load compose file");
        }
    }, [id, isNew, sendToast]);

    const fetchLogs = useCallback(async (initial = false) => {
        if (isNew) return;
        if (initial) setLogsLoading(true);
        try {
            const data = await getRequest(`stacks/${id}/logs?tail=${logsTailLines}`);
            if (!data?.code) {
                setLogs(data.logs || "No logs available");
            } else {
                setLogs("Failed to load logs: " + (data.message || "Unknown error"));
            }
        } catch {
            setLogs("Failed to load logs");
        } finally {
            if (initial) setLogsLoading(false);
        }
    }, [id, isNew, logsTailLines]);

    const fetchContainers = useCallback(async () => {
        if (isNew) return;
        setContainersLoading(true);
        try {
            const data = await getRequest(`stacks/${id}/containers`);
            if (Array.isArray(data)) setContainers(data);
        } catch {
            sendToast("Error", "Failed to load containers");
        } finally {
            setContainersLoading(false);
        }
    }, [id, isNew, sendToast]);

    const fetchEnv = useCallback(async () => {
        if (isNew) return;
        setEnvLoading(true);
        try {
            const data = await getRequest(`stacks/${id}/env`);
            if (!data?.code) {
                const vars = data.variables || [];
                setEnvVars(vars);
                setOriginalEnvVars(JSON.stringify(vars));
                setEnvHasChanges(false);
            }
        } catch {
            sendToast("Error", "Failed to load environment variables");
        } finally {
            setEnvLoading(false);
        }
    }, [id, isNew, sendToast]);

    useEffect(() => {
        if (isNew) {
            setComposeContent(DEFAULT_COMPOSE);
            setOriginalContent("");
            getRequest("servers").then(data => {
                if (Array.isArray(data)) {
                    const active = data.filter(s => s.status === "active");
                    setServers(active);
                    if (active.length === 1) setSelectedServer(String(active[0].id));
                }
            }).catch(() => {});
            return;
        }
        fetchStack();
        fetchCompose();
    }, [isNew, fetchStack, fetchCompose]);

    useEffect(() => {
        if (!eventBus || isNew) return;
        return eventBus.subscribe("stacks:updated", fetchStack);
    }, [eventBus, isNew, fetchStack]);

    const fetchConfigFiles = useCallback(async () => {
        if (isNew) return;
        setConfigLoading(true);
        try {
            const data = await getRequest(`stacks/${id}/config-files`);
            if (!data?.code) {
                setConfigFiles(data.files || []);
            }
        } catch {
            sendToast("Error", "Failed to discover config files");
        } finally {
            setConfigLoading(false);
        }
    }, [id, isNew, sendToast]);

    const fetchConfigFileContent = useCallback(async (filePath) => {
        setConfigFileLoading(true);
        try {
            const data = await getRequest(`stacks/${id}/config-file?path=${encodeURIComponent(filePath)}`);
            if (!data?.code) {
                setConfigContent(data.content || "");
                setOriginalConfigContent(data.content || "");
            } else {
                sendToast("Error", data.message || "Failed to read file");
            }
        } catch {
            sendToast("Error", "Failed to read config file");
        } finally {
            setConfigFileLoading(false);
        }
    }, [id, sendToast]);

    const handleConfigSave = async () => {
        if (!selectedConfigFile) return;
        setConfigSaving(true);
        try {
            await putRequest(`stacks/${id}/config-file`, {
                path: selectedConfigFile.path,
                content: configContent,
            });
            setOriginalConfigContent(configContent);
            sendToast("Success", "Config file saved");
        } catch (err) {
            sendToast("Error", err.message || "Failed to save config file");
        } finally {
            setConfigSaving(false);
        }
    };

    const configHasChanges = selectedConfigFile && configContent !== originalConfigContent;

    useEffect(() => {
        if (activeTab === "logs" && !isNew) {
            fetchLogs(true);
        }
        if (activeTab === "containers" && !isNew) {
            fetchContainers();
        }
        if (activeTab === "environment" && !isNew) {
            fetchEnv();
        }
        if (activeTab === "configuration" && !isNew) {
            fetchConfigFiles();
            setSelectedConfigFile(null);
            setConfigContent("");
            setOriginalConfigContent("");
        }
    }, [activeTab, isNew, fetchLogs, fetchContainers, fetchEnv, fetchConfigFiles]);

    useEffect(() => {
        if (!liveMode || activeTab !== "logs" || isNew) return;

        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const token = localStorage.getItem("overrideToken") || localStorage.getItem("sessionToken");
        const wsUrl = `${protocol}//${window.location.host}/api/stacks/${id}/logs/stream?token=${encodeURIComponent(token)}&tail=${logsTailLines}`;

        setLiveLogs("");
        const ws = new WebSocket(wsUrl);
        liveWsRef.current = ws;

        ws.onmessage = (event) => {
            setLiveLogs(prev => prev + event.data);
        };

        ws.onclose = () => {
            setLiveMode(false);
        };

        ws.onerror = () => {
            sendToast("Error", "Live log connection failed");
            setLiveMode(false);
        };

        return () => {
            ws.close();
            liveWsRef.current = null;
        };
    }, [liveMode, activeTab, isNew, id, logsTailLines, sendToast]);

    useEffect(() => {
        if (activeTab !== "logs" && liveMode) {
            setLiveMode(false);
        }
    }, [activeTab, liveMode]);

    const anyChanges = hasChanges || envHasChanges || configHasChanges;

    const handleEditorChange = (value) => {
        setComposeContent(value || "");
        if (!isNew) {
            setHasChanges((value || "") !== originalContent);
        }
    };

    const handleEditorMount = (editor) => {
        editor.focus();
    };

    const handleSave = async () => {
        const invalid = envVars.some(v => v.key && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(v.key));
        if (invalid) {
            sendToast("Error", "Variable names must start with a letter or underscore and contain only alphanumeric characters");
            return;
        }

        setSaving(true);
        try {
            const promises = [];

            if (hasChanges) {
                promises.push(
                    putRequest(`stacks/${id}/compose`, { content: composeContent }).then(() => {
                        setOriginalContent(composeContent);
                        setHasChanges(false);
                    })
                );
            }

            if (envHasChanges) {
                const filtered = envVars.filter(v => v.key.trim());
                promises.push(
                    putRequest(`stacks/${id}/env`, { variables: filtered }).then(() => {
                        setEnvVars(filtered);
                        setOriginalEnvVars(JSON.stringify(filtered));
                        setEnvHasChanges(false);
                    })
                );
            }

            if (configHasChanges && selectedConfigFile) {
                promises.push(
                    putRequest(`stacks/${id}/config-file`, {
                        path: selectedConfigFile.path,
                        content: configContent,
                    }).then(() => {
                        setOriginalConfigContent(configContent);
                    })
                );
            }

            await Promise.all(promises);
            sendToast("Success", "Changes saved");
        } catch (err) {
            sendToast("Error", err.message || "Failed to save changes");
        } finally {
            setSaving(false);
        }
    };

    const handleCreate = async () => {
        if (!stackName.trim()) {
            sendToast("Error", "Stack name is required");
            return;
        }
        if (!selectedServer) {
            sendToast("Error", "Please select a server");
            return;
        }

        setCreating(true);
        try {
            const result = await postRequest("stacks", {
                serverId: parseInt(selectedServer, 10),
                name: stackName.trim(),
                composeContent,
            });
            if (result?.code) {
                sendToast("Error", result.message);
            } else {
                sendToast("Success", "Stack created");
                navigate(`/stacks/edit/${result.id}`);
            }
        } catch (err) {
            sendToast("Error", err.message || "Failed to create stack");
        } finally {
            setCreating(false);
        }
    };

    const handleAction = async (action) => {
        setActionLoading(action);
        try {
            await postRequest(`stacks/${id}/action`, { action });
            sendToast("Success", `Stack ${action} successful`);
        } catch (err) {
            sendToast("Error", err.message || `Failed to ${action} stack`);
        } finally {
            setActionLoading(null);
        }
    };

    const updateEnvVar = (index, field, value) => {
        setEnvVars(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], [field]: value };
            setEnvHasChanges(JSON.stringify(updated) !== originalEnvVars);
            return updated;
        });
    };

    const addEnvVar = () => {
        setEnvVars(prev => {
            const updated = [...prev, { key: "", value: "" }];
            setEnvHasChanges(JSON.stringify(updated) !== originalEnvVars);
            return updated;
        });
    };

    const removeEnvVar = (index) => {
        setEnvVars(prev => {
            const updated = prev.filter((_, i) => i !== index);
            setEnvHasChanges(JSON.stringify(updated) !== originalEnvVars);
            return updated;
        });
    };

    const formatDate = (dateString) => {
        if (!dateString) return "-";
        return new Date(dateString).toLocaleString();
    };

    const isRunning = stack?.status === "running" || stack?.status === "partial";
    const isStopped = !stack || stack.status === "stopped" || stack.status === "unknown";

    return (
        <div className="stack-editor-page">
            <div className="editor-header">
                <div className="header-left">
                    <button className="back-btn" onClick={() => navigate("/stacks/all")}>
                        <Icon path={mdiArrowLeft} />
                    </button>
                    <div className="stack-info">
                        <h1>{isNew ? "Create Stack" : stack?.name}</h1>
                        {!isNew && stack && (
                            <div className="stack-meta">
                                <span className={`status-badge ${stack.status}`}>
                                    {stack.status.charAt(0).toUpperCase() + stack.status.slice(1)}
                                </span>
                                <span className="stack-description">{stack.directory}</span>
                            </div>
                        )}
                    </div>
                </div>
                <div className="header-actions">
                    {activeTab === 'compose' && (
                        <Button
                            text="Import docker run"
                            icon={mdiDocker}
                            type="secondary"
                            onClick={() => setComposerizeOpen(true)}
                        />
                    )}
                    {isNew ? (
                        <Button
                            text={creating ? "Creating..." : "Deploy Stack"}
                            icon={mdiRocket}
                            loading={creating}
                            onClick={handleCreate}
                            disabled={creating || !stackName.trim() || !selectedServer}
                        />
                    ) : (
                        <Button
                            text={saving ? "Saving..." : "Save Changes"}
                            icon={mdiContentSave}
                            loading={saving}
                            onClick={handleSave}
                            disabled={!anyChanges || saving}
                        />
                    )}
                </div>
            </div>

            <div className="editor-container">
                <div className="editor-main">
                    <div className="editor-section">
                        {!isNew && (
                            <TabSwitcher
                                tabs={[
                                    { key: "compose", label: "Compose File", icon: mdiFileDocumentOutline },
                                    { key: "environment", label: "Environment", icon: mdiApplicationVariableOutline },
                                    { key: "configuration", label: "Configuration", icon: mdiFileCogOutline },
                                    { key: "containers", label: "Containers", icon: mdiPackageVariantClosed },
                                    { key: "logs", label: "Logs", icon: mdiTextBox }
                                ]}
                                activeTab={activeTab}
                                onTabChange={setActiveTab}
                                variant="flat"
                            />
                        )}

                        <div className="tab-content">
                            {activeTab === 'compose' && (
                                <div className="monaco-wrapper">
                                    <Editor
                                        height="100%"
                                        defaultLanguage="yaml"
                                        value={composeContent}
                                        onChange={handleEditorChange}
                                        onMount={handleEditorMount}
                                        theme="vs-dark"
                                        options={{
                                            minimap: { enabled: true },
                                            fontSize: 14,
                                            lineNumbers: "on",
                                            roundedSelection: false,
                                            scrollBeyondLastLine: false,
                                            readOnly: false,
                                            automaticLayout: true,
                                            tabSize: 2,
                                            wordWrap: "on",
                                            padding: { top: 16, bottom: 16 }
                                        }}
                                    />
                                </div>
                            )}

                            {activeTab === 'logs' && !isNew && (
                                <LogViewer
                                    logs={logs}
                                    loading={logsLoading}
                                    onRefresh={() => fetchLogs(true)}
                                    onTailChange={setLogsTailLines}
                                    tailLines={logsTailLines}
                                    liveMode={liveMode}
                                    onLiveModeToggle={() => setLiveMode(prev => !prev)}
                                    liveLogs={liveLogs}
                                />
                            )}

                            {activeTab === 'containers' && !isNew && (
                                <div className="stack-containers">
                                    {containersLoading ? (
                                        <div className="stack-containers-loading">
                                            <Icon path={mdiLoading} spin={true} size={1.5} />
                                        </div>
                                    ) : containers.length > 0 ? (
                                        containers.map((c) => (
                                            <div
                                                key={c.id}
                                                className="stack-container-card"
                                                onClick={() => navigate(`/containers/detail/${c.containerId}`)}
                                            >
                                                <div className="stack-container-left">
                                                    <div className={`stack-container-icon ${c.state?.toLowerCase()}`}>
                                                        <Icon path={mdiDocker} />
                                                    </div>
                                                    <div className="stack-container-details">
                                                        <div className="stack-container-name-row">
                                                            <span className="stack-container-name">{c.name}</span>
                                                            <span className={`stack-container-badge ${c.state?.toLowerCase()}`}>
                                                                {c.state?.charAt(0).toUpperCase() + c.state?.slice(1)}
                                                            </span>
                                                        </div>
                                                        <span className="stack-container-image">{c.image}</span>
                                                    </div>
                                                </div>
                                                <div className="stack-container-right">
                                                    <span className="stack-container-status">{c.status}</span>
                                                    <Icon path={mdiOpenInNew} className="stack-container-link" />
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="stack-containers-empty">
                                            <Icon path={mdiPackageVariantClosed} size={2} />
                                            <h3>No containers</h3>
                                            <p>Start the stack to create containers</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === 'environment' && !isNew && (
                                <div className="stack-environment">
                                    {envLoading ? (
                                        <div className="stack-env-loading">
                                            <Icon path={mdiLoading} spin={true} size={1.5} />
                                        </div>
                                    ) : (
                                        <>
                                            {envVars.length > 0 ? (
                                                <div className="env-list">
                                                    <div className="env-header-row">
                                                        <span className="env-col-key">Variable Name</span>
                                                        <span className="env-col-value">Value</span>
                                                        <span className="env-col-actions"></span>
                                                    </div>
                                                    {envVars.map((v, i) => (
                                                        <div key={i} className="env-row">
                                                            <input
                                                                className="env-input env-key"
                                                                type="text"
                                                                placeholder="VARIABLE_NAME"
                                                                value={v.key}
                                                                onChange={(e) => updateEnvVar(i, "key", e.target.value)}
                                                                spellCheck={false}
                                                            />
                                                            <input
                                                                className="env-input env-value"
                                                                type="text"
                                                                placeholder="value"
                                                                value={v.value}
                                                                onChange={(e) => updateEnvVar(i, "value", e.target.value)}
                                                                spellCheck={false}
                                                            />
                                                            <button
                                                                className="env-remove-btn"
                                                                onClick={() => removeEnvVar(i)}
                                                                title="Remove variable"
                                                            >
                                                                <Icon path={mdiDelete} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                    <Button
                                                        text="Add Variable"
                                                        icon={mdiPlus}
                                                        type="secondary"
                                                        onClick={addEnvVar}
                                                    />
                                                </div>
                                            ) : (
                                                <div className="env-empty">
                                                    <Icon path={mdiApplicationVariableOutline} size={2} />
                                                    <h3>No environment variables</h3>
                                                    <p>Add variables that will be available to your Docker Compose services via a .env file</p>
                                                    <Button
                                                        text="Add Variable"
                                                        icon={mdiPlus}
                                                        type="secondary"
                                                        onClick={addEnvVar}
                                                    />
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}

                            {activeTab === 'configuration' && !isNew && (
                                <div className="stack-configuration">
                                    {configLoading ? (
                                        <div className="config-loading">
                                            <Icon path={mdiLoading} spin={true} size={1.5} />
                                        </div>
                                    ) : selectedConfigFile && isSqliteFile(selectedConfigFile.name) ? (
                                        <SqliteBrowser
                                            stackId={id}
                                            file={selectedConfigFile}
                                            onBack={() => setSelectedConfigFile(null)}
                                            sendToast={sendToast}
                                        />
                                    ) : selectedConfigFile ? (
                                        <div className="config-editor">
                                            <div className="config-editor-header">
                                                <button className="config-back-btn" onClick={() => {
                                                    setSelectedConfigFile(null);
                                                    setConfigContent("");
                                                    setOriginalConfigContent("");
                                                }}>
                                                    <Icon path={mdiArrowLeftBold} />
                                                </button>
                                                <span className="config-file-path">{selectedConfigFile.name}</span>
                                                <div className="config-editor-actions">
                                                    {configHasChanges && (
                                                        <span className="config-unsaved">Unsaved</span>
                                                    )}
                                                    <Button
                                                        text={configSaving ? "Saving..." : "Save"}
                                                        icon={mdiContentSave}
                                                        loading={configSaving}
                                                        onClick={handleConfigSave}
                                                        disabled={!configHasChanges || configSaving}
                                                    />
                                                </div>
                                            </div>
                                            {configFileLoading ? (
                                                <div className="config-loading">
                                                    <Icon path={mdiLoading} spin={true} size={1.5} />
                                                </div>
                                            ) : (
                                                <div className="monaco-wrapper">
                                                    <Editor
                                                        height="100%"
                                                        defaultLanguage={getEditorLanguage(selectedConfigFile.name)}
                                                        value={configContent}
                                                        onChange={(value) => setConfigContent(value || "")}
                                                        theme="vs-dark"
                                                        options={{
                                                            minimap: { enabled: false },
                                                            fontSize: 14,
                                                            lineNumbers: "on",
                                                            roundedSelection: false,
                                                            scrollBeyondLastLine: false,
                                                            automaticLayout: true,
                                                            tabSize: 2,
                                                            wordWrap: "on",
                                                            padding: { top: 16, bottom: 16 }
                                                        }}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    ) : configFiles.length > 0 ? (
                                        <div className="config-file-list">
                                            <div className="config-list-header">
                                                <span>Found {configFiles.length} configuration file{configFiles.length !== 1 && "s"}</span>
                                                <button className="config-refresh-btn" onClick={fetchConfigFiles}>
                                                    <Icon path={mdiRefresh} />
                                                </button>
                                            </div>
                                            {configFiles.map((file) => (
                                                <div
                                                    key={file.path}
                                                    className="config-file-card"
                                                    onClick={() => {
                                                        setSelectedConfigFile(file);
                                                        if (!isSqliteFile(file.name)) {
                                                            fetchConfigFileContent(file.path);
                                                        }
                                                    }}
                                                >
                                                    <div className={`config-file-icon ${file.type === "sqlite" ? "sqlite" : ""}`}>
                                                        <Icon path={file.type === "sqlite" ? mdiDatabaseOutline : mdiFileCogOutline} />
                                                    </div>
                                                    <div className="config-file-info">
                                                        <span className="config-file-name">{file.name.split("/").pop()}</span>
                                                        <span className="config-file-rel">{file.name}</span>
                                                    </div>
                                                    <Icon path={mdiOpenInNew} className="config-file-open" />
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="config-empty">
                                            <Icon path={mdiFileCogOutline} size={2} />
                                            <h3>No configuration files</h3>
                                            <p>No configuration or database files were found in the stack directory</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="editor-sidebar">
                    {isNew ? (
                        <div className="sidebar-section">
                            <h3>Stack Configuration</h3>
                            <div className="create-form">
                                <div className="form-field">
                                    <label>Stack Name</label>
                                    <IconInput
                                        type="text"
                                        placeholder="my-stack"
                                        icon={mdiLayers}
                                        value={stackName}
                                        setValue={setStackName}
                                    />
                                </div>
                                <div className="form-field">
                                    <label>Server</label>
                                    <SelectBox
                                        options={servers.map(s => ({ label: s.name, value: String(s.id) }))}
                                        selected={selectedServer}
                                        setSelected={setSelectedServer}
                                        placeholder="Select a server"
                                    />
                                </div>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="sidebar-section">
                                <h3>Stack Details</h3>
                                <div className="detail-item">
                                    <div className="detail-icon">
                                        <Icon path={mdiCog} />
                                    </div>
                                    <div className="detail-content">
                                        <span className="detail-label">Status</span>
                                        <span className={`detail-value status-${stack?.status}`}>
                                            {stack?.status?.charAt(0).toUpperCase() + stack?.status?.slice(1)}
                                        </span>
                                    </div>
                                </div>
                                <div className="detail-item">
                                    <div className="detail-icon">
                                        <Icon path={mdiLayers} />
                                    </div>
                                    <div className="detail-content">
                                        <span className="detail-label">Services</span>
                                        <span className="detail-value">{stack?.services}</span>
                                    </div>
                                </div>
                                <div className="detail-item">
                                    <div className="detail-icon">
                                        <Icon path={mdiCalendarClock} />
                                    </div>
                                    <div className="detail-content">
                                        <span className="detail-label">Last Updated</span>
                                        <span className="detail-value small">{formatDate(stack?.lastUpdated)}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="sidebar-section">
                                <h3>Actions</h3>
                                <div className="action-buttons">
                                    {isStopped && (
                                        <Button
                                            text="Start Stack"
                                            icon={mdiPlay}
                                            onClick={() => handleAction('start')}
                                            loading={actionLoading === 'start'}
                                            disabled={!!actionLoading}
                                        />
                                    )}
                                    {isRunning && (
                                        <>
                                            <Button
                                                text="Stop"
                                                icon={mdiStop}
                                                type="secondary"
                                                onClick={() => handleAction('stop')}
                                                loading={actionLoading === 'stop'}
                                                disabled={!!actionLoading}
                                            />
                                            <Button
                                                text="Restart"
                                                icon={mdiRestart}
                                                type="secondary"
                                                onClick={() => handleAction('restart')}
                                                loading={actionLoading === 'restart'}
                                                disabled={!!actionLoading}
                                            />
                                            <Button
                                                text="Hard Stop"
                                                icon={mdiCloseOctagon}
                                                type="danger"
                                                onClick={() => handleAction('down')}
                                                loading={actionLoading === 'down'}
                                                disabled={!!actionLoading}
                                            />
                                        </>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
            <ComposerizeDialog
                open={composerizeOpen}
                onClose={() => setComposerizeOpen(false)}
                onConvert={(yaml) => {
                    setComposeContent(yaml);
                    if (!isNew) setHasChanges(yaml !== originalContent);
                }}
            />
        </div>
    );
};
