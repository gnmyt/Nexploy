import "./styles.sass";
import { useState, useCallback, useEffect, useMemo } from "react";
import { mdiArrowLeftBold, mdiKeyVariant, mdiDatabaseOutline } from "@mdi/js";
import { getRequest } from "@/common/utils/RequestUtil.js";
import Button from "@/common/components/Button";
import PaginatedTable from "@/common/components/PaginatedTable";

export const SqliteTableView = ({ stackId, filePath, table, onBack, sendToast }) => {
    const [data, setData] = useState({ columns: [], rows: [], total: 0 });
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const pageSize = 50;

    const fetchData = useCallback(async (p) => {
        setLoading(true);
        try {
            const res = await getRequest(
                `stacks/${stackId}/sqlite/table?path=${encodeURIComponent(filePath)}&table=${encodeURIComponent(table)}&page=${p}&pageSize=${pageSize}`
            );
            if (res?.code) {
                sendToast("Error", res.message || "Failed to load data");
            } else {
                setData(res);
            }
        } catch {
            sendToast("Error", "Failed to load table data");
        } finally {
            setLoading(false);
        }
    }, [stackId, filePath, table, sendToast]);

    useEffect(() => {
        fetchData(page);
    }, [page, fetchData]);

    const columns = useMemo(() =>
        data.columns.map((col) => ({
            key: col.name,
            label: col.name,
            icon: col.pk ? mdiKeyVariant : undefined,
            render: (row) => row[col.name] === null
                ? <span className="null-value">NULL</span>
                : String(row[col.name]),
        })),
    [data.columns]);

    return (
        <div className="sqlite-table-view">
            <div className="sqlite-table-view-header">
                <Button type="secondary" icon={mdiArrowLeftBold} text="Back" onClick={onBack} />
                <span className="sqlite-table-title">{table}</span>
                <span className="sqlite-table-count">{data.total} row{data.total !== 1 && "s"}</span>
            </div>

            <PaginatedTable
                data={data.rows}
                columns={columns}
                loading={loading}
                pagination={{ total: data.total, currentPage: page, itemsPerPage: pageSize }}
                onPageChange={setPage}
                getRowKey={(_, i) => i}
                emptyState={{ icon: mdiDatabaseOutline, title: "No rows", subtitle: "This table is empty" }}
                className="sqlite-paginated-table"
            />
        </div>
    );
};
