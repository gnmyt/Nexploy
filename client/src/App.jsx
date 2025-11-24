import "@fontsource/plus-jakarta-sans/300.css";
import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
import "@fontsource/plus-jakarta-sans/800.css";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import "@/common/styles/main.sass";
import { lazy } from "react";
import Root from "@/common/layouts/Root.jsx";

const Settings = lazy(() => import("@/pages/Settings"));

const App = () => {
    const router = createBrowserRouter([
        {
            path: "/",
            element: <Root />,
            children: [
                { path: "/", element: <Navigate to="/settings" /> },
                { path: "/settings/*", element: <Settings/> },
            ],
        },
    ]);

    return <RouterProvider router={router}/>;
};

export default App;