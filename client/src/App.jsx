import "@fontsource/plus-jakarta-sans/300.css";
import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
import "@fontsource/plus-jakarta-sans/800.css";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import "@/common/styles/main.sass";
import { lazy } from "react";
import Root from "@/common/layouts/Root.jsx";

const Servers = lazy(() => import("@/pages/Servers"));
const Containers = lazy(() => import("@/pages/Containers"));

const App = () => {
    const router = createBrowserRouter([
        {
            path: "/",
            element: <Root />,
            children: [
                { path: "/", element: <Navigate to="/servers" /> },
                { path: "/servers/*", element: <Servers/> },
                { path: "/containers/*", element: <Containers/> },
            ],
        },
    ]);

    return <RouterProvider router={router}/>;
};

export default App;