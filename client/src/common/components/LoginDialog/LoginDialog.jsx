import { DialogProvider } from "@/common/components/Dialog";
import "./styles.sass";
import Button from "@/common/components/Button";
import Input from "@/common/components/IconInput";
import { mdiAccountCircleOutline, mdiKeyOutline } from "@mdi/js";
import { useContext, useState } from "react";
import { request } from "@/common/utils/RequestUtil.js";
import { UserContext } from "@/common/contexts/UserContext.jsx";
import { useToast } from "@/common/contexts/ToastContext.jsx";

export const LoginDialog = ({ open }) => {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [code, setCode] = useState("");

    const { sendToast } = useToast();

    const [totpRequired, setTotpRequired] = useState(false);

    const { updateSessionToken, firstTimeSetup } = useContext(UserContext);

    const createAccountFirst = async () => {
        try {
            await request("accounts/register", "POST", { username, password, firstName, lastName });
            return true;
        } catch (error) {
            sendToast("Error", error.message || "An error occurred");
            return false;
        }
    };

    const submit = async (event) => {
        event.preventDefault();

        if (firstTimeSetup && !await createAccountFirst()) return;

        let resultObj;
        try {
            resultObj = await request("auth/login", "POST", {
                username,
                password,
                code: totpRequired ? code : undefined,
            });
        } catch (error) {
            sendToast("Error", error.message || "An error occurred");
            return;
        }

        if (resultObj.code === 201) sendToast("Error", "Invalid credentials");
        if (resultObj.code === 202) setTotpRequired(true);
        if (resultObj.code === 203) sendToast("Error", "Invalid two-factor authentication code");
        if (resultObj.token) {
            updateSessionToken(resultObj.token);
        }
    };
    return (
        <DialogProvider disableClosing open={open}>
            <div className="login-dialog">
                <div className="login-logo">
                    <h1>{firstTimeSetup ? "Register" : "Login"}</h1>
                </div>
                <form className="login-form" onSubmit={submit}>
                    {firstTimeSetup ? (
                        <div className="register-name-row">
                            <div className="form-group">
                                <label htmlFor="firstName">First Name</label>
                                <Input type="text" id="firstName" required icon={mdiAccountCircleOutline}
                                       placeholder="First Name" autoComplete="given-name"
                                       value={firstName} setValue={setFirstName} />
                            </div>
                            <div className="form-group">
                                <label htmlFor="lastName">Last Name</label>
                                <Input type="text" id="lastName" required icon={mdiAccountCircleOutline}
                                       placeholder="Last Name" autoComplete="family-name"
                                       value={lastName} setValue={setLastName} />
                            </div>
                        </div>
                    ) : null}

                    {!totpRequired ? (
                        <>
                            <div className="form-group">
                                <label htmlFor="username">Username</label>
                                <Input type="text" id="username" required icon={mdiAccountCircleOutline}
                                       placeholder="Username" autoComplete="username"
                                       value={username} setValue={setUsername} />
                            </div>

                            <div className="form-group">
                                <label htmlFor="password">Password</label>
                                <Input type="password" id="password" required icon={mdiKeyOutline}
                                       placeholder="Password" autoComplete="current-password"
                                       value={password} setValue={setPassword} />
                            </div>
                        </>
                    ) : null}

                    {totpRequired ? (
                        <>
                            <div className="form-group">
                                <label htmlFor="code">Two-Factor Code</label>
                                <Input type="number" id="code" required icon={mdiKeyOutline}
                                       placeholder="Code" autoComplete="one-time-code"
                                       value={code} setValue={setCode} />
                            </div>
                        </>
                    ) : null}

                 <Button text={firstTimeSetup ? "Register" : "Login"} />
                </form>
            </div>
        </DialogProvider>
    );
};