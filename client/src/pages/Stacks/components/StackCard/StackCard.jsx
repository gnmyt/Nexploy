import "./styles.sass";
import Icon from "@mdi/react";
import { mdiDotsVertical, mdiCog, mdiPlay, mdiStop, mdiRestart, mdiCloseOctagon, mdiDelete, mdiPencil } from "@mdi/js";
import { ContextMenu, ContextMenuItem } from "@/common/components/ContextMenu";
import { useState } from "react";

export const StackCard = ({ stack, onClick, onAction, viewMode = "grid" }) => {
    const [contextMenuOpen, setContextMenuOpen] = useState(false);
    const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
    const [menuTrigger, setMenuTrigger] = useState(null);

    const isRunning = stack.status === "running" || stack.status === "partial";
    const isStopped = stack.status === "stopped" || stack.status === "unknown" || stack.status === "orphaned";

    const handleContextMenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenuPosition({ x: e.clientX, y: e.clientY });
        setContextMenuOpen(true);
    };

    const handleMenuClick = (e) => {
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        setMenuTrigger(e.currentTarget);
        setContextMenuPosition({ 
            x: rect.right - 10, 
            y: rect.bottom + 5 
        });
        setContextMenuOpen(true);
    };

    const handleAction = (action) => {
        onAction?.(stack.id, action);
        setContextMenuOpen(false);
    };

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 30) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    };

    if (viewMode === "list") {
        return (
            <>
                <div className="stack-card-list" onClick={() => onClick(stack)} onContextMenu={handleContextMenu}>
                    <div className="list-left">
                        <div className={`stack-icon-small ${isRunning ? 'running' : 'stopped'}`}>
                            {stack.icon ? (
                                <img src={stack.icon} alt={stack.name} className="stack-icon-img" />
                            ) : (
                                <Icon path={mdiCog} />
                            )}
                        </div>
                        <div className="list-info">
                            <div className="list-name-row">
                                <h3 className="stack-name">{stack.name}</h3>
                                <span className={`status-badge ${stack.status}`}>
                                    {stack.status.charAt(0).toUpperCase() + stack.status.slice(1)}
                                </span>
                            </div>
                            <p className="stack-description">{stack.directory}</p>
                        </div>
                    </div>
                    <div className="list-right">
                        <div className="list-meta">
                            <span className="meta-item">{stack.services} services</span>
                            <span className="meta-separator">•</span>
                            <span className="meta-item">{formatDate(stack.lastUpdated)}</span>
                        </div>
                        <button 
                            className="stack-menu-btn" 
                            onClick={handleMenuClick}
                            aria-label="Stack options"
                        >
                            <Icon path={mdiDotsVertical} />
                        </button>
                    </div>
                </div>

                <ContextMenu 
                    isOpen={contextMenuOpen} 
                    position={contextMenuPosition} 
                    onClose={() => setContextMenuOpen(false)}
                    trigger={menuTrigger}
                >
                    <ContextMenuItem 
                        icon={mdiPencil} 
                        label="Edit" 
                        onClick={() => onClick(stack)}
                    />
                    {isStopped && (
                        <ContextMenuItem 
                            icon={mdiPlay} 
                            label="Start" 
                            onClick={() => handleAction('start')}
                        />
                    )}
                    {isRunning && (
                        <>
                            <ContextMenuItem 
                                icon={mdiStop} 
                                label="Stop" 
                                onClick={() => handleAction('stop')}
                            />
                            <ContextMenuItem 
                                icon={mdiRestart} 
                                label="Restart" 
                                onClick={() => handleAction('restart')}
                            />
                            <ContextMenuItem 
                                icon={mdiCloseOctagon} 
                                label="Hard Stop" 
                                onClick={() => handleAction('down')}
                            />
                        </>
                    )}
                    <ContextMenuItem 
                        icon={mdiDelete} 
                        label="Delete" 
                        danger={true}
                        onClick={() => handleAction('delete')}
                    />
                </ContextMenu>
            </>
        );
    }

    return (
        <>
            <div className="stack-card" onClick={() => onClick(stack)} onContextMenu={handleContextMenu}>
                <div className="stack-card-header">
                    <div className="stack-status-wrapper">
                        <div className={`stack-icon ${isRunning ? 'running' : 'stopped'}`}>
                            {stack.icon ? (
                                <img src={stack.icon} alt={stack.name} className="stack-icon-img" />
                            ) : (
                                <Icon path={mdiCog} />
                            )}
                        </div>
                    </div>
                    <button 
                        className="stack-menu-btn" 
                        onClick={handleMenuClick}
                        aria-label="Stack options"
                    >
                        <Icon path={mdiDotsVertical} />
                    </button>
                </div>
                
                <div className="stack-card-content">
                    <h3 className="stack-name">{stack.name}</h3>
                    <p className="stack-description">{stack.directory}</p>
                    <div className="stack-meta">
                        <div className="meta-item">
                            <span className="meta-label">Services:</span>
                            <span className="meta-value">{stack.services}</span>
                        </div>
                        <div className="meta-item">
                            <span className="meta-label">Updated:</span>
                            <span className="meta-value">{formatDate(stack.lastUpdated)}</span>
                        </div>
                    </div>
                </div>
            </div>

            <ContextMenu 
                isOpen={contextMenuOpen} 
                position={contextMenuPosition} 
                onClose={() => setContextMenuOpen(false)}
                trigger={menuTrigger}
            >
                <ContextMenuItem 
                    icon={mdiPencil} 
                    label="Edit" 
                    onClick={() => onClick(stack)}
                />
                {isStopped && (
                    <ContextMenuItem 
                        icon={mdiPlay} 
                        label="Start" 
                        onClick={() => handleAction('start')}
                    />
                )}
                {isRunning && (
                    <>
                        <ContextMenuItem 
                            icon={mdiStop} 
                            label="Stop" 
                            onClick={() => handleAction('stop')}
                        />
                        <ContextMenuItem 
                            icon={mdiRestart} 
                            label="Restart" 
                            onClick={() => handleAction('restart')}
                        />
                        <ContextMenuItem 
                            icon={mdiCloseOctagon} 
                            label="Hard Stop" 
                            onClick={() => handleAction('down')}
                        />
                    </>
                )}
                <ContextMenuItem 
                    icon={mdiDelete} 
                    label="Delete" 
                    danger={true}
                    onClick={() => handleAction('delete')}
                />
            </ContextMenu>
        </>
    );
};
