import "./styles.sass";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { getRequest, postRequest, deleteRequest } from "@/common/utils/RequestUtil.js";
import { useToast } from "@/common/contexts/ToastContext.jsx";
import Icon from "@mdi/react";
import TabSwitcher from "@/common/components/TabSwitcher";
import Loading from "@/common/components/Loading";
import Terminal from "@/common/components/Terminal";
import LogViewer from "@/common/components/LogViewer";
import { 
    mdiArrowLeft, mdiPlay, mdiStop, mdiRestart, mdiDelete, mdiDocker,
    mdiInformationOutline, mdiTextBox, mdiConsole, mdiChevronRight,
    mdiLanConnect, mdiHarddisk, mdiCodeBraces
} from "@mdi/js";
import { Button } from "@/common/components/Button/Button.jsx";

const STATUS_MAP = { running: "running", stopped: "stopped", exited: "exited", paused: "paused", restarting: "restarting" };

const TABS = [
    { key: "overview", label: "Overview", icon: mdiInformationOutline },
    { key: "network", label: "Network", icon: mdiLanConnect },
    { key: "volumes", label: "Volumes", icon: mdiHarddisk },
    { key: "environment", label: "Environment", icon: mdiCodeBraces },
    { key: "logs", label: "Logs", icon: mdiTextBox },
    { key: "terminal", label: "Terminal", icon: mdiConsole },
];

const parseEnvironment = (env) => {
    if (!Array.isArray(env)) return [];
    return env.map(e => {
        const i = e.indexOf("=");
        return i !== -1 ? { key: e.substring(0, i), value: e.substring(i + 1) } : { key: e, value: "" };
    });
};

const parsePorts = (ports) => {
    if (!Array.isArray(ports)) return [];
    return ports.filter(p => p.PublicPort || p.PrivatePort).map(p => ({
        host: p.PublicPort || "-",
        container: p.PrivatePort || "-",
        protocol: p.Type || "tcp",
    }));
};

export const ContainerDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { sendToast } = useToast();
    const [container, setContainer] = useState(null);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "overview");
    const [logs, setLogs] = useState("");
    const [logsLoading, setLogsLoading] = useState(false);
    const [logsTailLines, setLogsTailLines] = useState(200);
    const [liveMode, setLiveMode] = useState(false);
    const [liveLogs, setLiveLogs] = useState("");
    const liveWsRef = useRef(null);

    const terminalWsUrl = useMemo(() => {
        if (!container || activeTab !== "terminal") return null;
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const token = localStorage.getItem("overrideToken") || localStorage.getItem("sessionToken");
        return `${protocol}//${window.location.host}/api/containers/${id}/terminal?token=${encodeURIComponent(token)}`;
    }, [id, container, activeTab]);

    const fetchContainer = useCallback(async () => {
        try {
            const data = await getRequest(`containers/${id}`);
            if (data?.code) {
                sendToast("Error", data.message || "Container not found");
                navigate("/containers/all");
                return;
            }
            setContainer(data);
        } catch {
            sendToast("Error", "Failed to load container");
            navigate("/containers/all");
        } finally {
            setLoading(false);
        }
    }, [id, navigate, sendToast]);

    const fetchStats = useCallback(async () => {
        if (!container) return;
        try {
            const data = await getRequest(`containers/${id}/stats`);
            if (!data?.code) setStats(data);
        } catch {}
    }, [id, container]);

    const fetchLogs = useCallback(async (initial = false) => {
        if (initial) setLogsLoading(true);
        try {
            const data = await getRequest(`containers/${id}/logs?tail=${logsTailLines}`);
            setLogs(!data?.code ? (data.logs || "No logs available") : `Failed to load logs: ${data.message || "Unknown error"}`);
        } catch {
            setLogs("Failed to load logs");
        } finally {
            if (initial) setLogsLoading(false);
        }
    }, [id, logsTailLines]);

    useEffect(() => { fetchContainer(); }, [fetchContainer]);

    useEffect(() => {
        if (container && activeTab === "overview") {
            fetchStats();
            const interval = setInterval(fetchStats, 5000);
            return () => clearInterval(interval);
        }
    }, [container, activeTab, fetchStats]);

    useEffect(() => {
        if (activeTab === "logs" && container) fetchLogs(true);
    }, [activeTab, container, fetchLogs]);

    useEffect(() => {
        if (!liveMode || activeTab !== "logs" || !container) return;
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const token = localStorage.getItem("overrideToken") || localStorage.getItem("sessionToken");
        const wsUrl = `${protocol}//${window.location.host}/api/containers/${id}/logs/stream?token=${encodeURIComponent(token)}&tail=${logsTailLines}`;

        setLiveLogs("");
        const ws = new WebSocket(wsUrl);
        liveWsRef.current = ws;
        ws.onmessage = (e) => setLiveLogs(prev => prev + e.data);
        ws.onclose = () => setLiveMode(false);
        ws.onerror = () => { sendToast("Error", "Live log connection failed"); setLiveMode(false); };
        return () => { ws.close(); liveWsRef.current = null; };
    }, [liveMode, activeTab, container, id, logsTailLines, sendToast]);

    useEffect(() => {
        if (activeTab !== "logs" && liveMode) setLiveMode(false);
    }, [activeTab, liveMode]);

    const handleAction = async (action) => {
        if (action === "remove") {
            try {
                await deleteRequest(`containers/${id}`);
                sendToast("Success", "Container removed");
                navigate("/containers/all");
            } catch (err) {
                sendToast("Error", err.message || "Failed to remove container");
            }
            return;
        }
        try {
            await postRequest(`containers/${id}/action`, { action });
            sendToast("Success", `Container ${action} successful`);
            fetchContainer();
        } catch (err) {
            sendToast("Error", err.message || `Failed to ${action} container`);
        }
    };

    if (loading) return <Loading />;
    if (!container) return null;

    const status = container.status?.toLowerCase();
    const statusColor = STATUS_MAP[status] || "unknown";
    const isRunning = status === "running";
    const isStopped = status === "stopped" || status === "exited";
    const isPaused = status === "paused";
    const ports = parsePorts(container.ports);
    const networks = Array.isArray(container.networks) ? container.networks : [];
    const volumes = Array.isArray(container.volumes) ? container.volumes : [];
    const environment = parseEnvironment(container.environment);

    return (
        <div className="container-detail-page">
            <div className="detail-header">
                <div className="header-left">
                    <button className="back-btn" onClick={() => navigate("/containers/all")}>
                        <Icon path={mdiArrowLeft} />
                    </button>
                    <div className={`container-status-icon ${statusColor}`}>
                        <Icon path={mdiDocker} />
                    </div>
                    <div className="container-info">
                        <h1>{container.name}</h1>
                        <div className="container-meta">
                            <span className={`status-badge ${statusColor}`}>
                                {status?.charAt(0).toUpperCase() + status?.slice(1)}
                            </span>
                            <span className="container-id">ID: {container.containerId}</span>
                        </div>
                    </div>
                </div>
                <div className="header-actions">
                    {(isStopped || isPaused) && (
                        <Button text="Start" icon={mdiPlay} onClick={() => handleAction("start")} />
                    )}
                    {isRunning && (
                        <>
                            <Button text="Stop" icon={mdiStop} type="secondary" onClick={() => handleAction("stop")} />
                            <Button text="Restart" icon={mdiRestart} type="secondary" onClick={() => handleAction("restart")} />
                        </>
                    )}
                    {isPaused && (
                        <Button text="Unpause" icon={mdiPlay} onClick={() => handleAction("unpause")} />
                    )}
                    <Button text="Remove" icon={mdiDelete} type="danger" onClick={() => handleAction("remove")} disabled={isRunning} />
                </div>
            </div>

            <div className="detail-container">
                <div className="detail-main">
                    <div className="detail-section">
                        <TabSwitcher tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} variant="flat" />

                        <div className="tab-content">
                            {activeTab === "overview" && (
                                <div className="overview-tab">
                                    <div className="overview-grid">
                                        <div className="info-card">
                                            <span className="info-label">Image</span>
                                            <span className="info-value">{container.image}</span>
                                        </div>
                                        <div className="info-card">
                                            <span className="info-label">Status</span>
                                            <span className={`info-value status-${statusColor}`}>
                                                {container.state || container.status}
                                            </span>
                                        </div>
                                        <div className="info-card">
                                            <span className="info-label">Created</span>
                                            <span className="info-value">
                                                {container.created ? new Date(container.created).toLocaleString() : "N/A"}
                                            </span>
                                        </div>
                                        <div className="info-card">
                                            <span className="info-label">Container ID</span>
                                            <span className="info-value mono">{container.containerId}</span>
                                        </div>
                                    </div>

                                    {stats && (
                                        <div className="resource-section">
                                            <h3>Resource Usage</h3>
                                            <div className="resource-grid">
                                                {[
                                                    ["CPU", stats.cpu],
                                                    ["Memory", stats.memory],
                                                    ["Memory %", stats.memoryPercentage],
                                                    ["Network RX", stats.networkRx],
                                                    ["Network TX", stats.networkTx],
                                                    ["Block Read", stats.blockRead],
                                                    ["Block Write", stats.blockWrite],
                                                ].map(([label, value]) => (
                                                    <div key={label} className="resource-card">
                                                        <span className="resource-label">{label}</span>
                                                        <span className="resource-value">{value}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {container.command && (
                                        <div className="command-section">
                                            <h3>Command</h3>
                                            <div className="command-block">
                                                <code>{container.command}</code>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === "network" && (
                                <div className="network-tab">
                                    {ports.length > 0 && (
                                        <div className="network-section">
                                            <h3>Port Mappings</h3>
                                            <div className="ports-table">
                                                <div className="ports-header">
                                                    <span>Host Port</span>
                                                    <span>Container Port</span>
                                                    <span>Protocol</span>
                                                </div>
                                                {ports.map((port, i) => (
                                                    <div key={i} className="ports-row">
                                                        <span className="port-value">{port.host}</span>
                                                        <span className="port-value">{port.container}</span>
                                                        <span className="port-protocol">{port.protocol.toUpperCase()}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {networks.length > 0 && (
                                        <div className="network-section">
                                            <h3>Connected Networks</h3>
                                            <div className="networks-grid">
                                                {networks.map((network, i) => (
                                                    <div key={i} className="network-card">
                                                        <Icon path={mdiLanConnect} />
                                                        <span>{network}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {ports.length === 0 && networks.length === 0 && (
                                        <div className="empty-state">
                                            <Icon path={mdiLanConnect} />
                                            <p>No network configuration available</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === "volumes" && (
                                <div className="volumes-tab">
                                    {volumes.length > 0 ? (
                                        <div className="volumes-list">
                                            {volumes.map((volume, i) => (
                                                <div key={i} className="volume-card">
                                                    <div className="volume-mapping">
                                                        <div className="volume-endpoint">
                                                            <span className="endpoint-label">Host</span>
                                                            <span className="endpoint-path">{volume.host}</span>
                                                        </div>
                                                        <Icon path={mdiChevronRight} className="volume-arrow" />
                                                        <div className="volume-endpoint">
                                                            <span className="endpoint-label">Container</span>
                                                            <span className="endpoint-path">{volume.container}</span>
                                                        </div>
                                                    </div>
                                                    <span className={`volume-mode ${volume.mode}`}>{volume.mode}</span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="empty-state">
                                            <Icon path={mdiHarddisk} />
                                            <p>No volumes mounted</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === "environment" && (
                                <div className="environment-tab">
                                    {environment.length > 0 ? (
                                        <div className="env-list">
                                            {environment.map((env, i) => (
                                                <div key={i} className="env-item">
                                                    <span className="env-key">{env.key}</span>
                                                    <span className="env-value">{env.value}</span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="empty-state">
                                            <Icon path={mdiCodeBraces} />
                                            <p>No environment variables defined</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === "logs" && (
                                <div className="logs-tab">
                                    <LogViewer 
                                        logs={logs}
                                        loading={logsLoading}
                                        onRefresh={fetchLogs}
                                        tailLines={logsTailLines}
                                        onTailChange={setLogsTailLines}
                                        liveMode={liveMode}
                                        onLiveModeToggle={() => setLiveMode(m => !m)}
                                        liveLogs={liveLogs}
                                    />
                                </div>
                            )}

                            {activeTab === "terminal" && (
                                <div className="terminal-tab">
                                    {isRunning ? (
                                        <div className="terminal-container">
                                            <Terminal 
                                                wsUrl={terminalWsUrl}
                                                onConnect={() => {}}
                                                onDisconnect={() => {}}
                                                onError={() => sendToast("Error", "Terminal connection failed")}
                                            />
                                        </div>
                                    ) : (
                                        <div className="terminal-unavailable">
                                            <Icon path={mdiConsole} />
                                            <p>Terminal is only available for running containers</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
