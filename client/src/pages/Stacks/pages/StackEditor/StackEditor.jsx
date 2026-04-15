import "./styles.sass";
import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect, useCallback, useRef } from "react";
import { getRequest, postRequest, putRequest } from "@/common/utils/RequestUtil.js";
import { useToast } from "@/common/contexts/ToastContext.jsx";
import Editor from "@monaco-editor/react";
import Icon from "@mdi/react";
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
    mdiRocket
} from "@mdi/js";
import Button from "@/common/components/Button";
import IconInput from "@/common/components/IconInput";

const DEFAULT_COMPOSE = `services:
  app:
    image: nginx:alpine
    ports:
      - "8080:80"
    restart: unless-stopped
`;

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
        if (activeTab === "logs" && !isNew) {
            fetchLogs(true);
        }
    }, [activeTab, isNew, fetchLogs]);

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
        setSaving(true);
        try {
            await putRequest(`stacks/${id}/compose`, { content: composeContent });
            setOriginalContent(composeContent);
            setHasChanges(false);
            sendToast("Success", "Compose file saved");
        } catch (err) {
            sendToast("Error", err.message || "Failed to save compose file");
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
        try {
            await postRequest(`stacks/${id}/action`, { action });
            sendToast("Success", `Stack ${action} successful`);
            fetchStack();
        } catch (err) {
            sendToast("Error", err.message || `Failed to ${action} stack`);
        }
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
                    {isNew ? (
                        <Button
                            text={creating ? "Creating..." : "Deploy Stack"}
                            icon={creating ? mdiLoading : mdiRocket}
                            onClick={handleCreate}
                            disabled={creating || !stackName.trim() || !selectedServer}
                        />
                    ) : (
                        <Button
                            text={saving ? "Saving..." : "Save Changes"}
                            icon={saving ? mdiLoading : mdiContentSave}
                            onClick={handleSave}
                            disabled={!hasChanges || saving}
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
                                        />
                                    )}
                                    {isRunning && (
                                        <>
                                            <Button
                                                text="Stop"
                                                icon={mdiStop}
                                                type="secondary"
                                                onClick={() => handleAction('stop')}
                                            />
                                            <Button
                                                text="Restart"
                                                icon={mdiRestart}
                                                type="secondary"
                                                onClick={() => handleAction('restart')}
                                            />
                                            <Button
                                                text="Hard Stop"
                                                icon={mdiCloseOctagon}
                                                type="danger"
                                                onClick={() => handleAction('down')}
                                            />
                                        </>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
