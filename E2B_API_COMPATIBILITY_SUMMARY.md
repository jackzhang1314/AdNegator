# E2B SDK API Compatibility Analysis

## Executive Summary
The E2B platform provides two fully mirrored SDKs (TypeScript/JavaScript and Python) with identical API surfaces, supporting both sync and async operations. Both SDKs communicate with the E2B API via REST/OpenAPI for management operations and use gRPC (via protobuf/Connect RPC) for sandbox operations.

---

## 1. SDK Structure Overview

### TypeScript/JavaScript SDK (`/packages/js-sdk/`)
- **Version**: 2.6.2
- **Runtime Support**: Node.js (>=20), Deno, Bun, Browser, Vercel Edge, Cloudflare Workers
- **Location**: `/packages/js-sdk/src/`
- **Key Components**:
  - `api/` - REST/OpenAPI client generation
  - `envd/` - gRPC client for sandbox operations (protobuf)
  - `sandbox/` - Core sandbox class and operations
  - `template/` - Template building and management
  - `connectionConfig.ts` - Connection configuration

### Python SDK (`/packages/python-sdk/`)
- **Version**: 2.6.2
- **Python Version**: 3.9+
- **Location**: `/packages/python-sdk/e2b/`
- **Structure**:
  - Sync implementation: `sandbox_sync/`, `template_sync/`
  - Async implementation: `sandbox_async/`, `template_async/`
  - Shared components: `sandbox/`, `template/`, `api/`, `envd/`

---

## 2. API Authentication & Connection

### Authentication Methods
Both SDKs support **two authentication mechanisms** (checked in order):
1. **API Key** (Team/Organization level)
   - Header: `X-API-Key`
   - Environment Variable: `E2B_API_KEY`
   - Use case: Sandbox creation, management operations

2. **Access Token** (Personal/Bearer token)
   - Header: `Authorization: Bearer <token>`
   - Environment Variable: `E2B_ACCESS_TOKEN`
   - Use case: Personal sandbox operations

### Connection Configuration
**TypeScript** (`connectionConfig.ts`):
```typescript
interface ConnectionOpts {
  apiKey?: string
  accessToken?: string
  domain?: string (default: 'e2b.app')
  apiUrl?: string (default: 'https://api.${domain}')
  debug?: boolean (internal use)
  requestTimeoutMs?: number (default: 60,000ms)
  headers?: Record<string, string>
  logger?: Logger
}
```

**Python** (`connection_config.py`):
```python
class ApiParams(TypedDict):
  api_key: Optional[str]
  access_token: Optional[str]
  domain: Optional[str]
  api_url: Optional[str]
  debug: Optional[bool]
  request_timeout: Optional[float] (in seconds)
  headers: Optional[Dict[str, str]]
  proxy: Optional[ProxyTypes]
```

### Key Constants
- **REQUEST_TIMEOUT**: 60 seconds (both)
- **DEFAULT_SANDBOX_TIMEOUT_MS**: 300,000ms (300 seconds)
- **KEEPALIVE_PING_INTERVAL_SEC**: 50 seconds
- **KEEPALIVE_PING_HEADER**: "Keepalive-Ping-Interval"

---

## 3. Sandbox Lifecycle & Management

### Sandbox Creation
**Entry Points**:
- `Sandbox.create()` - Default 'base' template
- `Sandbox.create(templateId)` - Specific template
- `Sandbox.betaCreate()` - With beta features (auto-pause support)
- `Sandbox.connect(sandboxId)` - Reconnect to running sandbox

**Creation Options** (SandboxOpts):
```
- metadata: Record<string, string> (custom metadata)
- envs: Record<string, string> (environment variables)
- timeoutMs: number (300,000 by default; max 86,400,000 for Pro, 3,600,000 for Hobby)
- secure: boolean (default: true - use auth tokens)
- allowInternetAccess: boolean (default: true)
- mcp?: McpServer (optional MCP server configuration)
```

### API Endpoints for Sandbox Management
- **POST /sandboxes** - Create new sandbox
- **GET /sandboxes/{sandboxID}** - Get sandbox info
- **POST /sandboxes/{sandboxID}/connect** - Resume paused sandbox
- **POST /sandboxes/{sandboxID}/timeout** - Update timeout
- **POST /sandboxes/{sandboxID}/pause** - Pause sandbox (beta)
- **DELETE /sandboxes/{sandboxID}** - Kill sandbox
- **GET /sandboxes/{sandboxID}/metrics** - Get resource metrics
- **GET /v2/sandboxes** - List sandboxes with pagination

### Sandbox Information
**SandboxInfo** (returned by getInfo()):
```
- sandboxId: string
- templateId: string
- name?: string
- metadata: Record<string, string>
- startedAt: Date
- endAt: Date
- state: 'running' | 'paused'
- cpuCount: number
- memoryMB: number
- envdVersion: string
```

### Sandbox State
- `running` - Sandbox is active
- `paused` - Sandbox can be resumed

---

## 4. Commands & Process Execution

### Command Execution Interface
**Available Methods**:
- `commands.run(cmd, opts)` - Run command and wait for completion
- `commands.run(cmd, {background: true})` - Run in background, get CommandHandle
- `commands.start(cmd, opts)` - Internal method used by run()
- `commands.list()` - List running processes
- `commands.kill(pid)` - Kill process with SIGKILL
- `commands.sendStdin(pid, data)` - Send data to process stdin
- `commands.connect(pid)` - Connect to running process

### Command Execution Options (CommandStartOpts)
```
- background?: boolean (default: false)
- cwd?: string (working directory)
- user?: Username (default user from sandbox)
- envs?: Record<string, string> (environment variables)
- onStdout?: (data: string) => void | Promise<void>
- onStderr?: (data: string) => void | Promise<void>
- stdin?: boolean (default: false - keep stdin open)
- timeoutMs?: number (default: 60,000ms)
- requestTimeoutMs?: number (for the request itself)
```

### Command Result
**CommandResult** (from successful completion):
```
- exitCode: number (0 if successful)
- stdout: string
- stderr: string
- error?: string (error message if failed)
```

### Error Handling
**CommandExitError** - Thrown when exitCode !== 0
- Extends CommandResult with all its properties
- Can be caught to access exit code and output

### Process Information
**ProcessInfo** (from list()):
```
- pid: number
- tag?: string (custom identifier)
- cmd: string
- args: string[]
- envs: Record<string, string>
- cwd?: string
```

### gRPC Service Definition (Process)
**Protobuf Operations**:
- `List(ListRequest) → ListResponse` - List all processes
- `Start(StartRequest) → stream StartResponse` - Start process
- `Connect(ConnectRequest) → stream ConnectResponse` - Connect to process
- `SendInput(SendInputRequest) → SendInputResponse` - Send stdin
- `SendSignal(SendSignalRequest) → SendSignalResponse` - Send signal (SIGTERM, SIGKILL)
- `Update(UpdateRequest) → UpdateResponse` - Update PTY size

---

## 5. Filesystem Operations

### Filesystem API Methods
- `files.read(path, [format], opts)` - Read file content
- `files.write(path, data, opts)` - Write file
- `files.list(path, opts)` - List directory
- `files.stat(path, opts)` - Get file metadata
- `files.remove(path, opts)` - Delete file/directory
- `files.makeDir(path, opts)` - Create directory
- `files.move(source, dest, opts)` - Move/rename
- `files.watch(path, opts)` - Watch for changes (async iterator)

### File Operations Options (FilesystemRequestOpts)
```
- user?: Username
- requestTimeoutMs?: number
```

### Read Format Options
- `"text"` (default) - Returns string
- `"bytes"` - Returns bytearray/Uint8Array
- `"stream"` - Returns streaming Iterator/AsyncIterator

### File Information
**EntryInfo** (from list/stat):
```
- path: string
- name: string
- type: FileType ('file' | 'dir')
- size: number (bytes)
- mode: number (permissions bits)
- permissions: string (e.g., 'rwxr-xr-x')
- owner: string
- group: string
- modifiedTime?: Date
- symlinkTarget?: string
```

**WriteInfo** (from write):
```
- path: string
- name: string
- type?: FileType
```

### File Watching
**WatchOpts**:
```
- path: string
- recursive?: boolean
- user?: Username
- requestTimeoutMs?: number
```

**FilesystemEvent**:
```
- name: string
- type: 'create' | 'write' | 'remove' | 'rename' | 'chmod'
```

### gRPC Service Definition (Filesystem)
**Protobuf Operations**:
- `Stat(StatRequest) → StatResponse`
- `ListDir(ListDirRequest) → ListDirResponse`
- `MakeDir(MakeDirRequest) → MakeDirResponse`
- `Move(MoveRequest) → MoveResponse`
- `Remove(RemoveRequest) → RemoveResponse`
- `WatchDir(WatchDirRequest) → stream WatchDirResponse` (streaming watch)
- `CreateWatcher(CreateWatcherRequest) → CreateWatcherResponse` (non-streaming)
- `GetWatcherEvents(GetWatcherEventsRequest) → GetWatcherEventsResponse`
- `RemoveWatcher(RemoveWatcherRequest) → RemoveWatcherResponse`

---

## 6. Sandbox Metrics

### Get Metrics
```typescript
// TypeScript
sandbox.getMetrics(opts?: SandboxMetricsOpts): Promise<SandboxMetrics[]>

// Python
sandbox.get_metrics(opts?: SandboxMetricsOpts) -> List[SandboxMetrics]
```

### SandboxMetrics Data
```
- timestamp: Date
- cpuUsedPct: number (percentage)
- cpuCount: number
- memUsed: number (bytes)
- memTotal: number (bytes)
- diskUsed: number (bytes)
- diskTotal: number (bytes)
```

### Metrics Options
```
- start?: string | Date (defaults to sandbox start)
- end?: string | Date (defaults to now)
- requestTimeoutMs?: number
```

---

## 7. Error Handling & Exception Hierarchy

### TypeScript Error Classes
**Base Class**: `SandboxError extends Error`

**Derived Error Classes**:
1. `TimeoutError` - Timeout (sandbox timeout, request timeout, deadline exceeded)
2. `InvalidArgumentError` - Invalid arguments (400)
3. `NotEnoughSpaceError` - Insufficient disk space (507)
4. `NotFoundError` - Resource not found (404)
5. `AuthenticationError` - Auth failure (401)
6. `TemplateError` - Template compatibility issues
7. `RateLimitError` - Rate limit exceeded (429)
8. `BuildError` - Template build failure
9. `FileUploadError` - File upload failure
10. `CommandExitError` - Command exited with non-zero code

### Python Exception Classes
**Base Class**: `SandboxException`

**Derived Exception Classes**:
1. `TimeoutException`
2. `InvalidArgumentException`
3. `NotEnoughSpaceException`
4. `NotFoundException`
5. `AuthenticationException`
6. `TemplateException`
7. `RateLimitException`
8. `BuildException`
9. `FileUploadException`
10. `CommandExitException`

### HTTP Status Code Mapping
- **400** → InvalidArgumentError
- **401** → AuthenticationError
- **404** → NotFoundError
- **429** → RateLimitError
- **502** → TimeoutError (sandbox timeout)
- **507** → NotEnoughSpaceError

### gRPC Error Code Mapping (Connect RPC)
- **INVALID_ARGUMENT** → InvalidArgumentError
- **UNAUTHENTICATED** → AuthenticationError
- **NOT_FOUND** → NotFoundError
- **UNAVAILABLE** → TimeoutError
- **CANCELED** → TimeoutError
- **DEADLINE_EXCEEDED** → TimeoutError
- **RESOURCE_EXHAUSTED** → RateLimitError

---

## 8. Template Management

### Template Operations (TypeScript)
- `Template.create()` - Create new template from base image
- `Template.build()` - Build template to deploy
- `TemplateBase.toJSON()` - Export as JSON
- `TemplateBase.toDockerfile()` - Export as Dockerfile

### Template Builder Interface
**TemplateBase** implements:
- `TemplateFromImage` - Base image selection
- `TemplateBuilder` - Instructions (RUN, COPY, ENV, etc.)
- `TemplateFinal` - Deploy/build

### Key Template Methods
```typescript
- from(baseImage: string): TemplateBuilder
- run(command: string): TemplateBuilder
- copy(source: string, dest: string): TemplateBuilder
- env(key: string, value: string): TemplateBuilder
- workdir(path: string): TemplateBuilder
- expose(port: number): TemplateBuilder
- entrypoint(cmd: string): TemplateBuilder
- readyCmd(cmd: ReadyCmd): TemplateFinal
- build(): Promise<BuildResult>
- save(path: string): Promise<void>
```

---

## 9. PTY (Pseudo-Terminal) Operations

### PTY Methods
```typescript
sandbox.pty.run(cmd, opts): Promise<CommandResult | CommandHandle>
sandbox.pty.start(cmd, opts): Promise<CommandHandle>
sandbox.pty.list(): Promise<ProcessInfo[]>
sandbox.pty.kill(pid): Promise<boolean>
```

### PTY-Specific Options
```
- pty?: { cols: number; rows: number } (terminal size)
- data?: string | Uint8Array (input data)
```

### PTY Output
- Returns `PtyOutput` (Uint8Array) instead of separate stdout/stderr
- Mixed output stream simulating interactive terminal

---

## 10. Logging & Debugging

### Logger Interface
```typescript
interface Logger {
  log?: (message: string, ...args: any[]) => void
  error?: (message: string, ...args: any[]) => void
  warn?: (message: string, ...args: any[]) => void
  info?: (message: string, ...args: any[]) => void
  debug?: (message: string, ...args: any[]) => void
}
```

### Debug Mode
```
- Environment Variable: E2B_DEBUG=true
- Connects to local envd API server (http://localhost:3000)
- Internal use only
```

---

## 11. Version Compatibility & Feature Flags

### ENVD Version Requirements
- **ENVD_VERSION_RECURSIVE_WATCH** = 0.1.4 (recursive directory watching)
- **ENVD_COMMANDS_STDIN** = 0.3.0 (stdin control for commands)
- **ENVD_DEFAULT_USER** = 0.4.0 (default user support)
- **ENVD_DEBUG_FALLBACK** = 99.99.99 (debug mode version)

### Version Checking
Both SDKs use `compareVersions()` to check template/envd compatibility:
```typescript
compareVersions(envdVersion, requiredVersion) < 0 // version too old
```

---

## 12. URL & File Operations

### Download/Upload URLs
```typescript
// Generate download URL
const url = await sandbox.downloadUrl(path, opts?)

// Generate upload URL
const url = await sandbox.uploadUrl(path?, opts?)
```

### URL Options (SandboxUrlOpts)
```
- useSignatureExpiration?: number (seconds)
- user?: Username
```

### Signature Authentication
- Uses HMAC-SHA256 signatures for secure file URLs
- Expiration time optional but recommended
- Signatures include path, operation (read/write), user, and expiration

---

## 13. MCP (Model Context Protocol) Integration

### MCP Server Configuration
**GitHubMcpServer** format:
```
{
  "github/owner/repo": {
    "run_cmd": "command to run",
    "install_cmd"?: "optional install command",
    "envs"?: { "KEY": "value" }
  }
}
```

### MCP Methods
```typescript
sandbox.getMcpUrl(): string // Returns https://{host}/mcp
sandbox.getMcpToken(): Promise<string | undefined>
```

### MCP Creation
When sandbox created with `mcp` option:
- MCP gateway started automatically
- Token stored at `/etc/mcp-gateway/.token`
- Access via `getMcpToken()` or direct file read

---

## 14. API Client Architecture

### OpenAPI/REST Client (TypeScript)
- Uses `openapi-fetch` for type-safe API calls
- Automatically generated from `openapi.yml`
- Path: `src/api/schema.gen.ts` (auto-generated)
- Base URL: `https://api.{domain}` (default: e2b.app)

### OpenAPI/REST Client (Python)
- Generated from OpenAPI spec
- Uses httpx for HTTP requests
- Models auto-generated in `api/client/models/`
- Type-safe request/response handling

### HTTP Headers
**Default Headers** (both):
- `User-Agent`: `e2b-{lang}-sdk/{version}`
- `X-API-Key`: `{apiKey}` (if using API key auth)
- `Authorization`: `Bearer {accessToken}` (if using token auth)
- Platform info (lang, version, os, system, etc.)

### Request Timeout
- **Default**: 60 seconds
- **Configurable** per connection or per request
- Controls REST API calls, not long-running operations

### Keep-Alive Configuration
- **Ping Interval**: 50 seconds
- **Max Keep-Alive Connections**: 40 (Python)
- **Keep-Alive Expiry**: 300 seconds (Python)

---

## 15. gRPC/Connect RPC Implementation

### Transport Layer
**TypeScript**:
- Uses `@connectrpc/connect` (2.0.0-rc.3)
- Uses `@connectrpc/connect-web` for browser
- Protobuf: `@bufbuild/protobuf` (^2.6.2)

**Python**:
- Uses `e2b_connect` custom library
- Supports HTTP/2 connection pooling
- Compression (gzip) support (disabled in current version)

### RPC Services
**Process Service** (`process.proto`):
- Package: `process`
- Handles command execution, signals, stdin

**Filesystem Service** (`filesystem.proto`):
- Package: `filesystem`
- Handles file operations, directory watching

### Authentication in RPC
- Header: `Authorization: Basic <base64(username:)>`
- For commands and filesystem operations
- Automatically added via `authenticationHeader()` function

---

## 16. Sandbox Listing & Pagination

### List Method
```typescript
// TypeScript
Sandbox.list(opts?: SandboxListOpts): SandboxPaginator

// Python
Sandbox.list(query?, limit?, next_token?, **opts): SandboxPaginator
```

### SandboxListOpts
```
- query?: {
    metadata?: Record<string, string>
    state?: ('running' | 'paused')[]  (default: both)
  }
- limit?: number (default: 100)
- nextToken?: string
```

### SandboxPaginator Interface
```
- hasNext: boolean (readonly)
- nextToken: string | undefined (readonly)
- nextItems(): Promise<SandboxInfo[]>
```

### Query Encoding
- Metadata keys/values URL-encoded separately
- Combined with URLSearchParams
- Supports multiple filters with AND logic

---

## 17. User & Username Handling

### Default Username
```
TypeScript: 'user'
Python: 'user'
```

### Username in Operations
- Optional parameter in most filesystem/command operations
- If not specified, uses default (unless older envd version)
- Affects file permissions, home directory, working directory

### Authentication Header Format
```
Authorization: Basic base64(username:)
```
- Empty password (just username and colon)
- Base64 encoded

---

## 18. Async vs Sync APIs (Python)

### Sync API (`sandbox_sync/`)
- `Sandbox` class
- `Commands` class
- `Filesystem` class
- `Pty` class
- Blocking operations

### Async API (`sandbox_async/`)
- `AsyncSandbox` class
- All operations return `Coroutine` / `Awaitable`
- Full async/await support
- Compatible with async frameworks (asyncio, etc.)

### Shared Base Classes (`sandbox/`)
- `SandboxBase` - Common implementation
- `SandboxApi` - API operations
- Operations use `@classmethod` with `_cls_` prefix for both sync/async

---

## 19. Important Constants & Defaults

### Timeouts
```
REQUEST_TIMEOUT_MS = 60,000 (60 seconds)
DEFAULT_SANDBOX_TIMEOUT_MS = 300,000 (300 seconds / 5 minutes)
DEFAULT_PROCESS_CONNECTION_TIMEOUT = 60,000 (60 seconds)
```

### Storage Limits (Connection Pool)
```
max_keepalive_connections = 40
max_connections = 40
keepalive_expiry = 300 seconds
```

### Limits
```
REQUEST_TIMEOUT: 60 seconds (both)
KEEPALIVE_PING_INTERVAL_SEC: 50 seconds
```

---

## 20. Runtime Detection (TypeScript)

### Supported Runtimes
1. **Node.js** - Full support (>=20)
2. **Bun** - Full support
3. **Deno** - Full support (with --allow flags)
4. **Browser** - Limited (no template building, no glob)
5. **Vercel Edge** - Partial
6. **Cloudflare Workers** - Partial
7. **Unknown** - Fallback

### Runtime-Specific Behavior
- `crypto` operations adapted per runtime
- `glob` unavailable in browser
- File operations vary by environment
- Different module loading strategies

---

## 21. Exported Types & Interfaces

### TypeScript Main Exports
```typescript
export {
  // Main class
  Sandbox,
  
  // API
  ApiClient,
  
  // Errors
  AuthenticationError, InvalidArgumentError, NotEnoughSpaceError,
  NotFoundError, SandboxError, TemplateError, TimeoutError,
  RateLimitError, BuildError, FileUploadError,
  
  // Types
  SandboxInfo, SandboxMetrics, SandboxState, SandboxListOpts,
  SandboxPaginator, CommandResult, CommandHandle, CommandExitError,
  EntryInfo, WriteInfo, FileType, FilesystemEvent, WatchHandle,
  ProcessInfo, PtyOutput,
  
  // Configuration
  ConnectionConfig,
  
  // Utils
  waitForPort, waitForURL, waitForProcess, waitForFile,
  waitForTimeout, getSignature,
  
  // Logging
  LogEntry, LogEntryLevel, defaultBuildLogger,
  
  // Template
  Template, TemplateBase, TemplateClass,
  
  // MCP
  McpServer
}
```

### Python Main Exports
```python
__all__ = [
  # API
  "ApiClient", "client",
  
  # Config
  "ConnectionConfig", "ProxyTypes",
  
  # Exceptions
  "SandboxException", "TimeoutException", "NotFoundException",
  "AuthenticationException", "InvalidArgumentException",
  "NotEnoughSpaceException", "TemplateException", "BuildException",
  "FileUploadException",
  
  # Sandbox API
  "SandboxInfo", "SandboxMetrics", "ProcessInfo", "SandboxQuery",
  "SandboxState",
  
  # Commands
  "CommandResult", "Stderr", "Stdout", "CommandExitException",
  "PtyOutput", "PtySize",
  
  # Filesystem
  "FilesystemEvent", "FilesystemEventType", "EntryInfo", "WriteInfo",
  "FileType",
  
  # Sync Sandbox
  "Sandbox", "SandboxPaginator", "WatchHandle", "CommandHandle",
  
  # Async Sandbox
  "AsyncSandbox", "AsyncSandboxPaginator", "AsyncWatchHandle",
  "AsyncCommandHandle",
  
  # Template
  "Template", "AsyncTemplate", "TemplateBase",
  
  # Helpers
  "ReadyCmd", "wait_for_file", "wait_for_url", "wait_for_port",
  "wait_for_process", "wait_for_timeout",
  "LogEntry", "LogEntryStart", "LogEntryEnd", "LogEntryLevel",
  "default_build_logger",
  
  # MCP
  "McpServer", "GitHubMcpServer", "GitHubMcpServerConfig",
]
```

---

## 22. API Compatibility Checklist

### Critical Interfaces for 100% Compatibility

- [ ] **Authentication**: API Key + Access Token support
- [ ] **Connection Config**: All connection parameters and env variables
- [ ] **Error Hierarchy**: All error types and status codes
- [ ] **Sandbox Lifecycle**: create, connect, list, kill, pause, resume
- [ ] **Command Execution**: run, background, stdin, timeout
- [ ] **Filesystem**: read/write, list, watch, stat, move, delete, mkdir
- [ ] **Metrics**: CPU, memory, disk usage with timestamps
- [ ] **Process Info**: pid, tag, cmd, args, envs, cwd
- [ ] **File Info**: EntryInfo with all metadata fields
- [ ] **Pagination**: hasNext, nextToken, query filters
- [ ] **URL Generation**: download/upload with signatures
- [ ] **gRPC Services**: Process and Filesystem protobuf operations
- [ ] **Version Checking**: Feature flags based on envd version
- [ ] **Timeout Handling**: Request timeout, command timeout, sandbox timeout
- [ ] **Logging**: Logger interface and debug mode
- [ ] **MCP Integration**: Server configuration and token management
- [ ] **Template Building**: All template operations
- [ ] **PTY Support**: Terminal emulation features
- [ ] **Keep-Alive**: Ping intervals and connection pooling
- [ ] **Headers**: User-Agent, auth headers, custom headers

---

## 23. Proto Buffer Specifications

### Key Proto Packages
1. **process.proto** (`process` package)
   - Service: Process
   - Messages: ProcessConfig, ProcessEvent, StartRequest, ConnectRequest, etc.
   - Signals: SIGTERM (15), SIGKILL (9)

2. **filesystem.proto** (`filesystem` package)
   - Service: Filesystem
   - Messages: EntryInfo, FilesystemEvent, WatchDirRequest, etc.
   - EventTypes: CREATE (1), WRITE (2), REMOVE (3), RENAME (4), CHMOD (5)

---

## 24. Implementation Notes for Compatibility

### Critical Code Paths
1. **Sandbox Creation**: Must check envd version and template compatibility
2. **Error Handling**: Must map HTTP and gRPC status codes correctly
3. **Authentication**: Must support both API Key and Bearer token
4. **Timeouts**: Must differentiate between request, command, and sandbox timeouts
5. **File Operations**: Must handle all EntryInfo fields and symlinks
6. **Process Events**: Must handle StartEvent, DataEvent (stdout/stderr/pty), EndEvent
7. **Watch Events**: Must handle all FilesystemEvent types
8. **Pagination**: Must preserve nextToken and hasNext state
9. **Signatures**: Must use HMAC-SHA256 for file URLs with expiration
10. **Version Checking**: Must validate envd version before using features

### Testing Requirements
- All authentication scenarios (API key, token, invalid)
- Error cases for all error types
- Process execution with various options
- Filesystem operations on different file types
- Pagination with multiple pages
- URL signature generation and validation
- Timeout scenarios (request, command, sandbox)
- Background command execution and reconnection
- PTY operations with interactive input
- Watch with single and recursive paths

---

## 25. OpenAPI Specification Details

### Generated Files
- `src/api/schema.gen.ts` (TypeScript)
- `e2b/api/client/` (Python)

### API Endpoints Coverage
- **Sandboxes**: CRUD, connect, pause, resume, timeout, metrics
- **Templates**: CRUD, build, list, get status
- **Health**: Health check endpoints
- **Logs**: Access sandbox logs

### Authentication in OpenAPI
```yaml
securitySchemes:
  ApiKeyAuth:
    type: apiKey
    in: header
    name: X-API-Key
  AccessTokenAuth:
    type: http
    scheme: bearer
```

---

## Summary

The E2B SDK provides a comprehensive, well-structured API for cloud sandbox management with:
- **Dual Language Support**: TypeScript/JavaScript and Python with identical APIs
- **Multi-Runtime Support**: Node.js, Deno, Bun, Browser, Serverless
- **Dual Protocol**: REST (OpenAPI) for management, gRPC (Connect RPC) for operations
- **Robust Error Handling**: Specific error types with proper status code mapping
- **Feature Parity**: Sync and Async variants in Python, full feature equivalence across languages
- **Production Ready**: Version pinning, keep-alive, proper timeouts, logging
- **Well-Documented**: Clear interfaces, type safety, comprehensive options

For 100% API compatibility, ensure all listed interfaces, error types, constants, and gRPC operations are properly implemented across both protocols and all supported runtimes.
