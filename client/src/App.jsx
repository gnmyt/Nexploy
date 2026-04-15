import "@fontsource/plus-jakarta-sans/300.css";
import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
import "@fontsource/plus-jakarta-sans/800.css";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import "@/common/styles/main.sass";
import { lazy } from "react";
import Root from "@/common/layouts/Root.jsx";
import Stacks from "@/pages/Stacks";
import Apps from "@/pages/Apps";

const Servers = lazy(() => import("@/pages/Servers"));
const Containers = lazy(() => import("@/pages/Containers"));
const Images = lazy(() => import("@/pages/Images"));

const App = () => {
    const router = createBrowserRouter([
        {
            path: "/",
            element: <Root />,
            children: [
                { path: "/", element: <Navigate to="/servers" /> },
                { path: "/servers/*", element: <Servers/> },
                { path: "/containers/*", element: <Containers/> },
                { path: "/images", element: <Images/> },
                { path: "/stacks/*", element: <Stacks/> },
                { path: "/apps/*", element: <Apps/> },
            ],
        },
    ]);

    return <RouterProvider router={router}/>;
};

export default App;