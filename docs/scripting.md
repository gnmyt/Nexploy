# Scripting

Nexploy apps can include scripts that run at specific points during an app's lifecycle. These scripts are written in
JavaScript and are executed inside a lightweight, sandboxed runtime on the target server. They have no access to the
network of the host machine beyond what the provided APIs expose, and file access is restricted to the app's own
directory.

This page covers everything you need to know to write scripts for your apps: what hooks are available, what you can do
inside them, and how the runtime works.

## How it works

When a hook is triggered, Nexploy uploads a small runner binary to the target server (if it isn't already there) and
executes your script remotely. The script runs with two things available to it:

- A set of built-in global functions and objects (documented below)
- A `context` object containing information about the app, the current hook, and any user-provided configuration

The runner is a self-contained binary based on QuickJS. Scripts run synchronously from top to bottom. There are no
`async`/`await` or promises - every API call blocks and returns its result directly.

## Hooks

Hooks are defined in your app's `manifest.yml` under the `hooks` key. Each entry maps a hook name to a JavaScript file
inside the `hooks/` directory of your app.

```yaml
hooks:
  postInstall: postInstall.js
  onConfigure: onConfigure.js
  postUpdate: postUpdate.js
```

### Available hook types

| Hook | When it runs |
|---|---|
| `postInstall` | Right after the app's containers are started for the first time. The compose stack is brought up again afterwards, so any environment changes you make will take effect. |
| `postUpdate` | After the app is updated and the new containers are started. |
| `onConfigure` | When a user changes the app's configuration through the UI. The compose stack is restarted afterwards. |

You can also define custom hooks with any name you like. These won't be triggered automatically, but users can run them
manually through the API or the management interface.

## The context object

Every script receives a global `context` object with information about the current execution:

```js
context.appName     // "Nexterm"
context.appVersion  // "1.2.0"
context.slug        // "nexterm"
context.source      // "official"
context.directory   // "/opt/nexploy/apps/nexploy-nexterm"
context.hook        // "postInstall"
context.config      // { encryption_key: "abc123", port: "6989" }
```

The `config` field contains all values the user provided through the app's input fields. If an input was left empty, it
either won't be present or will be an empty string, depending on whether a default was set.

## API reference

All of the functions below are available as globals. You don't need to import anything.

### console

```js
console.log("Server is ready")
console.log("Port:", 8080, "Host:", "0.0.0.0")
```

Prints to stdout. Objects and arrays are automatically serialized to JSON. Mostly useful for debugging - the output
shows up in the server logs.

### shell

Run arbitrary shell commands on the target server.

```js
var result = shell("whoami")
// result is a JSON string, parse it:
var parsed = JSON.parse(result)
parsed.success    // true/false
parsed.exitCode   // 0
parsed.stdout     // "root\n"
parsed.stderr     // ""
```

If you need to pass arguments separately (useful to avoid escaping issues):

```js
var result = shellWithArgs("grep", '["-r", "TODO", "/app/src"]')
```

Note that `shellWithArgs` expects the arguments as a JSON array string, not as an actual array.

### sleep

```js
sleep(2000) // pauses execution for 2 seconds
```

Blocks the script for the given number of milliseconds. Can be useful when waiting for a service to become ready.

### fetch

A synchronous HTTP client. Works similarly to the browser's `fetch`, but everything is blocking.

```js
var resp = fetch("https://api.example.com/health")
resp.ok          // true if status is 2xx
resp.status      // 200
resp.statusText  // "OK"
resp.headers     // { "content-type": "application/json", ... }

var body = resp.text()  // raw string
var data = resp.json()  // parsed object
```

You can pass options for other methods:

```js
var resp = fetch("https://api.example.com/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: "value" })
})
```

Supported methods: `GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `HEAD`.

### success / fail

These are helper functions for returning structured results from your script.

```js
success("Configuration applied")
// script output: {"success": true, "data": "Configuration applied"}

fail("Missing required key")
// script output: {"success": false, "error": "Missing required key"}
```

You don't have to use these. The runner will also report success if the script finishes without throwing an error.
They're mainly useful when you want to pass a specific message back.

### fs

File system operations, sandboxed to the app's directory. You cannot read or write files outside of it - any attempt to
use `..` to escape will be blocked.

```js
fs.writeFile("config.json", JSON.stringify({ port: 8080 }))
var content = fs.readFile("config.json")

fs.appendFile("log.txt", "Started at " + new Date().toISOString() + "\n")

fs.exists("config.json")  // true
fs.deleteFile("config.json")

fs.mkdir("data/backups")  // creates intermediate directories
fs.readdir("data")
// [{ name: "backups", isFile: false, isDirectory: true }]
```

### env

Read and write `.env` files. This is the primary way to pass configuration into Docker containers, since most images
read their settings from environment variables.

```js
// Set a single variable (creates the file if it doesn't exist)
env.set(".env", "DATABASE_URL", "postgres://localhost/mydb")

// Read a single variable
var url = env.get(".env", "DATABASE_URL")

// Read all variables
var all = env.load(".env")  // or env.getAll(".env")
// { DATABASE_URL: "postgres://localhost/mydb", ... }

// Remove a variable
env.remove(".env", "OLD_KEY")

// Overwrite the entire file
env.save(".env", { DATABASE_URL: "postgres://localhost/mydb", SECRET: "abc" })
```

The `set` and `remove` functions preserve comments and formatting in the existing file. The `save` function replaces
the file entirely.

All file paths are relative to the app directory and sandboxed the same way as `fs`.

### docker

Control the app's Docker containers. All commands operate in the app's directory, so they automatically pick up the
`docker-compose.yml` that ships with the app.

#### Compose lifecycle

```js
docker.compose.up({ detach: true, force_recreate: false })
docker.compose.down()
docker.compose.pull()
docker.compose.restart()          // all services
docker.compose.restart("nginx")   // specific service
docker.compose.logs()             // all logs
docker.compose.logs("nginx", 50)  // last 50 lines of one service
```

#### Container operations

```js
docker.ps()                           // list running containers
docker.start()                        // start all / docker.start("nginx")
docker.stop()                         // stop all / docker.stop("nginx")
docker.exec("nginx", "nginx -t")      // run a command inside a container
docker.inspect("nginx")               // full container inspect output
docker.images()                       // list images
docker.prune()                        // remove unused resources
```

#### File copy

```js
docker.cp.toContainer("nginx", "./nginx.conf", "/etc/nginx/nginx.conf")
docker.cp.fromContainer("nginx", "/var/log/nginx/access.log", "./access.log")
```

### compose

Manipulate the `docker-compose.yml` file directly, without restarting anything. This is useful when you need to change
environment variables, ports, or images before bringing the stack up.

The first argument is always the compose file path (usually just `"docker-compose.yml"`).

#### Environment variables

```js
compose.setEnv("docker-compose.yml", "app", "NODE_ENV", "production")
compose.getEnv("docker-compose.yml", "app", "NODE_ENV")  // "production"
compose.getAllEnv("docker-compose.yml", "app")            // { NODE_ENV: "production", ... }
compose.setAllEnv("docker-compose.yml", "app", { NODE_ENV: "production", PORT: "3000" })
compose.removeEnv("docker-compose.yml", "app", "OLD_VAR")
```

#### Ports

```js
compose.getPorts("docker-compose.yml", "app")
// [{ host: "3000", container: "3000" }]

compose.setPort("docker-compose.yml", "app", "3000", "8080")
// Maps host port 8080 to container port 3000
```

#### Images

```js
compose.getImage("docker-compose.yml", "app")         // "node:20-alpine"
compose.setImage("docker-compose.yml", "app", "node:22-alpine")
```

#### Services

```js
compose.getServices("docker-compose.yml")  // ["app", "redis", "postgres"]
```

## Putting it all together

Here's a realistic example of a `postInstall` hook. It reads user input, generates a secret if none was provided,
writes it to the `.env` file, and logs what it did:

```js
var secret = context.config.encryption_key;

if (!secret || secret.trim() === "") {
    var chars = "0123456789abcdef";
    secret = "";
    for (var i = 0; i < 64; i++) {
        secret += chars[Math.floor(Math.random() * chars.length)];
    }
    console.log("No encryption key provided, generated a random one");
}

env.set(".env", "ENCRYPTION_KEY", secret);
console.log("Wrote ENCRYPTION_KEY to .env");
```

Since `postInstall` triggers a compose restart after it finishes, the container will pick up the new environment
variable automatically.

## Things to keep in mind

- Scripts run synchronously. There is no event loop, no `setTimeout`, no promises.
- All file operations are sandboxed. You can only access files inside the app's directory.
- The `shell` function runs commands on the host, not inside a container. Use `docker.exec` if you need to run
  something inside a container.
- The `fetch` function is fully synchronous and blocking.
- Variables declared with `var` are function-scoped as usual. `let` and `const` work as expected.
- If a script throws an uncaught error, the hook is considered failed and Nexploy will report the error message.
