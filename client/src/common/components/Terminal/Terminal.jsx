import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import "./styles.sass";

export const Terminal = ({ wsUrl, onConnect, onDisconnect, onError }) => {
    const terminalRef = useRef(null);
    const xtermRef = useRef(null);
    const fitAddonRef = useRef(null);
    const wsRef = useRef(null);
    const initializedRef = useRef(false);
    const callbacksRef = useRef({ onConnect, onDisconnect, onError });

    useEffect(() => {
        callbacksRef.current = { onConnect, onDisconnect, onError };
    }, [onConnect, onDisconnect, onError]);

    useEffect(() => {
        if (!terminalRef.current || !wsUrl) return;

        if (initializedRef.current) {
            return;
        }
        initializedRef.current = true;

        const term = new XTerm({
            cursorBlink: true,
            cursorStyle: "block",
            fontSize: 13,
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
            theme: {
                background: "#1a1a1a",
                foreground: "#e5e7eb",
                cursor: "#9333ea",
                cursorAccent: "#1a1a1a",
                selectionBackground: "rgba(147, 51, 234, 0.3)",
                selectionForeground: "#ffffff",
                black: "#1a1a1a",
                red: "#ef4444",
                green: "#22c55e",
                yellow: "#eab308",
                blue: "#3b82f6",
                magenta: "#a855f7",
                cyan: "#06b6d4",
                white: "#e5e7eb",
                brightBlack: "#6b7280",
                brightRed: "#f87171",
                brightGreen: "#4ade80",
                brightYellow: "#facc15",
                brightBlue: "#60a5fa",
                brightMagenta: "#c084fc",
                brightCyan: "#22d3ee",
                brightWhite: "#ffffff",
            },
            allowProposedApi: true,
            scrollback: 5000,
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);

        xtermRef.current = term;
        fitAddonRef.current = fitAddon;

        term.open(terminalRef.current);
        setTimeout(() => fitAddon.fit(), 0);

        term.onData((data) => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: "input", data }));
            }
        });

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            callbacksRef.current.onConnect?.();

            if (xtermRef.current) {
                ws.send(JSON.stringify({
                    type: "resize",
                    cols: xtermRef.current.cols,
                    rows: xtermRef.current.rows,
                }));
            }
        };

        ws.onmessage = (event) => {
            xtermRef.current?.write(event.data);
        };

        ws.onclose = (event) => {
            callbacksRef.current.onDisconnect?.(event.code, event.reason);
            xtermRef.current?.write("\r\n\x1b[31m[Connection closed]\x1b[0m\r\n");
        };

        ws.onerror = (error) => {
            callbacksRef.current.onError?.(error);
        };

        const handleResize = () => {
            if (fitAddonRef.current) {
                fitAddonRef.current.fit();
                
                if (wsRef.current?.readyState === WebSocket.OPEN && xtermRef.current) {
                    wsRef.current.send(JSON.stringify({
                        type: "resize",
                        cols: xtermRef.current.cols,
                        rows: xtermRef.current.rows,
                    }));
                }
            }
        };

        window.addEventListener("resize", handleResize);

        const currentTerminalRef = terminalRef.current;
        const resizeObserver = new ResizeObserver(handleResize);
        resizeObserver.observe(currentTerminalRef);
    }, [wsUrl]);

    useEffect(() => {
        return () => {
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
            if (xtermRef.current) {
                xtermRef.current.dispose();
                xtermRef.current = null;
            }
            fitAddonRef.current = null;
            initializedRef.current = false;
        };
    }, []);

    return (
        <div className="terminal-wrapper">
            <div ref={terminalRef} className="terminal-element" />
        </div>
    );
};