import "./styles.sass";
import { useState, useMemo } from "react";
import { Icon } from "@mdi/react";
import {
    mdiPlay,
    mdiAlertCircleOutline,
    mdiCheckCircleOutline,
    mdiConsoleLine,
} from "@mdi/js";
import { postRequest } from "@/common/utils/RequestUtil.js";
import Button from "@/common/components/Button";
import PaginatedTable from "@/common/components/PaginatedTable";

export const SqliteQueryExecutor = ({ stackId, filePath, sendToast }) => {
    const [query, setQuery] = useState("");
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    const executeQuery = async () => {
        if (!query.trim()) return;
        setLoading(true);
        setError(null);
        setResult(null);

        try {
            const res = await postRequest(`stacks/${stackId}/sqlite/query`, {
                path: filePath,
                query: query.trim(),
            });

            if (res?.code) {
                setError(res.message || "Query failed");
            } else {
                setResult(res);
            }
        } catch (err) {
            setError(err.message || "Query execution failed");
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            executeQuery();
        }
    };

    const columns = useMemo(() =>
        (result?.columns || []).map((col) => ({
            key: col.name,
            label: col.name,
            render: (row) => row[col.name] === null
                ? <span className="null-value">NULL</span>
                : String(row[col.name]),
        })),
    [result?.columns]);

    return (
        <div className="sqlite-query-executor">
            <div className="query-input-area">
                <textarea
                    className="query-textarea"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="SELECT * FROM table_name LIMIT 100;"
                    spellCheck={false}
                    rows={4}
                />
                <div className="query-actions">
                    <span className="query-hint">Ctrl+Enter to execute</span>
                    <Button
                        text={loading ? "Running..." : "Execute"}
                        icon={mdiPlay}
                        loading={loading}
                        onClick={executeQuery}
                        disabled={!query.trim() || loading}
                    />
                </div>
            </div>

            {error && (
                <div className="query-error">
                    <Icon path={mdiAlertCircleOutline} />
                    <span>{error}</span>
                </div>
            )}

            {result && (
                <div className="query-result">
                    {result.message && (
                        <div className="query-success">
                            <Icon path={mdiCheckCircleOutline} />
                            <span>{result.message}</span>
                        </div>
                    )}

                    {result.rows && result.rows.length > 0 && (
                        <PaginatedTable
                            data={result.rows}
                            columns={columns}
                            pagination={{ total: result.rows.length, currentPage: 1, itemsPerPage: result.rows.length }}
                            onPageChange={() => {}}
                            getRowKey={(_, i) => i}
                            emptyState={{ icon: mdiConsoleLine, title: "No results" }}
                            className="sqlite-paginated-table"
                        />
                    )}

                    {result.rows && (
                        <div className="query-row-count">
                            {result.rows.length} row{result.rows.length !== 1 && "s"} returned
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
