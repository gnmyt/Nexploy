import { Outlet } from "react-router-dom";
import { UserProvider } from "@/common/contexts/UserContext.jsx";
import { ToastProvider } from "@/common/contexts/ToastContext.jsx";
import { SessionProvider } from "@/common/contexts/SessionContext.jsx";
import { Suspense, lazy } from "react";
import Loading from "@/common/components/Loading";

const Sidebar = lazy(() => import("@/common/components/Sidebar"));

export default () => {
    return (
        <ToastProvider>
            <UserProvider>
                <SessionProvider>
                    <div className="content-wrapper">
                        <div className="main-content">
                            <Suspense fallback={<Loading />}>
                                <Outlet />
                            </Suspense>
                        </div>
                        <Suspense fallback={<Loading />}>
                            <Sidebar />
                        </Suspense>
                    </div>
                </SessionProvider>
            </UserProvider>
        </ToastProvider>
    );
}