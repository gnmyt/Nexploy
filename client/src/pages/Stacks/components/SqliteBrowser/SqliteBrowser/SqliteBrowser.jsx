import "./styles.sass";
import { useState, useCallback } from "react";
import { Icon } from "@mdi/react";
import {
    mdiTable,
    mdiArrowLeftBold,
    mdiLoading,
    mdiRefresh,
    mdiConsoleLine,
    mdiDatabaseOutline,
} from "@mdi/js";
import { getRequest } from "@/common/utils/RequestUtil.js";
import TabSwitcher from "@/common/components/TabSwitcher";
import Button from "@/common/components/Button";
import SqliteTableView from "../SqliteTableView";
import SqliteQueryExecutor from "../SqliteQueryExecutor";

export const SqliteBrowser = ({ stackId, file, onBack, sendToast }) => {
    const [tables, setTables] = useState([]);
    const [tablesLoading, setTablesLoading] = useState(false);
    const [selectedTable, setSelectedTable] = useState(null);
    const [activeView, setActiveView] = useState("tables");
    const [loaded, setLoaded] = useState(false);

    const fetchTables = useCallback(async () => {
        setTablesLoading(true);
        try {
            const data = await getRequest(
                `stacks/${stackId}/sqlite/tables?path=${encodeURIComponent(file.path)}`
            );
            if (data?.code) {
                sendToast("Error", data.message || "Failed to list tables");
            } else {
                setTables(data.tables || []);
            }
        } catch {
            sendToast("Error", "Failed to load tables");
        } finally {
            setTablesLoading(false);
            setLoaded(true);
        }
    }, [stackId, file.path, sendToast]);

    if (!loaded && !tablesLoading) {
        fetchTables();
    }

    return (
        <div className="sqlite-browser">
            <div className="sqlite-header">
                <Button type="secondary" icon={mdiArrowLeftBold} text="Back" onClick={onBack} />
                <Icon path={mdiDatabaseOutline} className="sqlite-header-icon" />
                <span className="sqlite-file-name">{file.name}</span>
                <div className="sqlite-header-right">
                    <TabSwitcher
                        tabs={[
                            { key: "tables", label: "Tables", icon: mdiTable },
                            { key: "query", label: "Query", icon: mdiConsoleLine },
                        ]}
                        activeTab={activeView}
                        onTabChange={setActiveView}
                        variant="flat"
                        iconOnly
                    />
                    <Button type="secondary" icon={mdiRefresh} text="Refresh" onClick={fetchTables} />
                </div>
            </div>

            <div className="sqlite-content">
                {activeView === "tables" && (
                    <>
                        {tablesLoading ? (
                            <div className="sqlite-loading">
                                <Icon path={mdiLoading} spin={true} size={1.5} />
                            </div>
                        ) : selectedTable ? (
                            <SqliteTableView
                                stackId={stackId}
                                filePath={file.path}
                                table={selectedTable}
                                onBack={() => setSelectedTable(null)}
                                sendToast={sendToast}
                            />
                        ) : tables.length > 0 ? (
                            <div className="sqlite-table-list">
                                {tables.map((table) => (
                                    <div
                                        key={table}
                                        className="sqlite-table-card"
                                        onClick={() => setSelectedTable(table)}
                                    >
                                        <div className="sqlite-table-icon">
                                            <Icon path={mdiTable} />
                                        </div>
                                        <span className="sqlite-table-name">{table}</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="sqlite-empty">
                                <Icon path={mdiDatabaseOutline} size={2} />
                                <h3>No tables found</h3>
                                <p>This database appears to be empty</p>
                            </div>
                        )}
                    </>
                )}

                {activeView === "query" && (
                    <SqliteQueryExecutor
                        stackId={stackId}
                        filePath={file.path}
                        sendToast={sendToast}
                    />
                )}
            </div>
        </div>
    );
};
