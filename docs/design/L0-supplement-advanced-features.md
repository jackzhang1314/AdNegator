# L0 Supplement: Advanced Features 设计文档

**文档版本**: v1.0
**创建日期**: 2025-11-05
**状态**: Draft
**补充说明**: 本文档补充 L1-L5 设计文档中缺失的 P1 高级功能

---

## 目录

1. [Streaming Commands](#1-streaming-commands)
2. [Background Commands](#2-background-commands)
3. [Filesystem Watch](#3-filesystem-watch)
4. [Internet Access Control & Public URL](#4-internet-access-control--public-url)

---

## 1. Streaming Commands

### 1.1 功能概述

**官方文档**: https://e2b.dev/docs/commands/streaming

**功能描述**:
- 实时流式输出 stdout/stderr
- 适合长时间运行的命令
- 提供回调函数接口
- 支持实时监控命令执行

**核心价值**:
- ⚡ **实时反馈**: 立即看到命令输出
- 🎯 **交互性**: 支持实时日志查看
- 🐛 **调试能力**: 实时追踪程序行为

### 1.2 API 设计

#### SDK API

**TypeScript**:
```typescript
const proc = await sandbox.commands.run('long-running-cmd', {
  onStdout: (data: Uint8Array) => {
    console.log('stdout:', data.toString());
  },
  onStderr: (data: Uint8Array) => {
    console.error('stderr:', data.toString());
  },
  onExit: (exitCode: number) => {
    console.log('Exit code:', exitCode);
  }
});

// 可选：等待完成
await proc.wait();
```

**Python**:
```python
proc = sandbox.commands.run(
    'long-running-cmd',
    on_stdout=lambda data: print(f'stdout: {data.decode()}'),
    on_stderr=lambda data: print(f'stderr: {data.decode()}', file=sys.stderr),
    on_exit=lambda code: print(f'Exit: {code}')
)

# 可选：等待完成
proc.wait()
```

### 1.3 gRPC 协议设计

**Protobuf 定义**:
```protobuf
syntax = "proto3";

package commands.v1;

service CommandsService {
  // 流式命令执行
  rpc RunStream(RunStreamRequest) returns (stream StreamResponse);
}

message RunStreamRequest {
  string cmd = 1;
  repeated string args = 2;
  string working_dir = 3;
  map<string, string> env = 4;
  int32 timeout = 5;
}

message StreamResponse {
  oneof event {
    ProcessStarted started = 1;
    ProcessOutput output = 2;
    ProcessExited exited = 3;
  }
}

message ProcessStarted {
  string process_id = 1;
}

message ProcessOutput {
  enum Stream {
    STDOUT = 0;
    STDERR = 1;
  }
  Stream stream = 1;
  bytes data = 2;
}

message ProcessExited {
  int32 exit_code = 1;
  string error = 2;
}
```

### 1.4 envd 实现 (Go)

```go
// commands_server.go
func (s *CommandsServer) RunStream(
    req *pb.RunStreamRequest,
    stream pb.CommandsService_RunStreamServer,
) error {
    // 1. 创建命令
    cmd := exec.Command(req.Cmd, req.Args...)
    cmd.Dir = req.WorkingDir
    cmd.Env = mapToEnv(req.Env)

    // 2. 获取 stdout/stderr 管道
    stdout, err := cmd.StdoutPipe()
    if err != nil {
        return err
    }
    stderr, err := cmd.StderrPipe()
    if err != nil {
        return err
    }

    // 3. 启动命令
    if err := cmd.Start(); err != nil {
        return err
    }

    processID := generateProcessID()

    // 4. 发送启动事件
    stream.Send(&pb.StreamResponse{
        Event: &pb.StreamResponse_Started{
            Started: &pb.ProcessStarted{
                ProcessId: processID,
            },
        },
    })

    // 5. 流式读取 stdout
    go func() {
        scanner := bufio.NewScanner(stdout)
        for scanner.Scan() {
            stream.Send(&pb.StreamResponse{
                Event: &pb.StreamResponse_Output{
                    Output: &pb.ProcessOutput{
                        Stream: pb.ProcessOutput_STDOUT,
                        Data:   scanner.Bytes(),
                    },
                },
            })
        }
    }()

    // 6. 流式读取 stderr
    go func() {
        scanner := bufio.NewScanner(stderr)
        for scanner.Scan() {
            stream.Send(&pb.StreamResponse{
                Event: &pb.StreamResponse_Output{
                    Output: &pb.ProcessOutput{
                        Stream: pb.ProcessOutput_STDERR,
                        Data:   scanner.Bytes(),
                    },
                },
            })
        }
    }()

    // 7. 等待命令完成
    err = cmd.Wait()
    exitCode := 0
    if err != nil {
        if exitErr, ok := err.(*exec.ExitError); ok {
            exitCode = exitErr.ExitCode()
        }
    }

    // 8. 发送退出事件
    stream.Send(&pb.StreamResponse{
        Event: &pb.StreamResponse_Exited{
            Exited: &pb.ProcessExited{
                ExitCode: int32(exitCode),
            },
        },
    })

    return nil
}
```

---

## 2. Background Commands

### 2.1 功能概述

**官方文档**: https://e2b.dev/docs/commands/background

**功能描述**:
- 后台运行命令（daemon 进程）
- 不阻塞主线程
- 可随时查询状态和输出
- 支持进程管理（查询、终止）

**核心价值**:
- 🔄 **并发执行**: 多任务同时运行
- 📊 **状态追踪**: 随时查询进程状态
- 🎛️ **进程控制**: 灵活管理后台任务

### 2.2 API 设计

#### SDK API

**TypeScript**:
```typescript
// 启动后台进程
const proc = await sandbox.commands.run('npm start', {
  background: true
});

// 稍后检查状态
const isRunning = await proc.isRunning();
console.log('Process running:', isRunning);

// 获取输出
const output = await proc.getOutput();
console.log('stdout:', output.stdout);
console.log('stderr:', output.stderr);

// 终止进程
await proc.kill();
```

**Python**:
```python
# 启动后台进程
proc = sandbox.commands.run('npm start', background=True)

# 稍后检查状态
is_running = proc.is_running()
print(f'Process running: {is_running}')

# 获取输出
output = proc.get_output()
print(f'stdout: {output.stdout}')
print(f'stderr: {output.stderr}')

# 终止进程
proc.kill()
```

### 2.3 gRPC 协议设计

**Protobuf 定义**:
```protobuf
service CommandsService {
  // 后台命令执行
  rpc RunBackground(RunBackgroundRequest) returns (RunBackgroundResponse);

  // 查询进程状态
  rpc GetProcessStatus(GetProcessStatusRequest) returns (GetProcessStatusResponse);

  // 获取进程输出
  rpc GetProcessOutput(GetProcessOutputRequest) returns (GetProcessOutputResponse);

  // 终止进程
  rpc KillProcess(KillProcessRequest) returns (KillProcessResponse);
}

message RunBackgroundRequest {
  string cmd = 1;
  repeated string args = 2;
  string working_dir = 3;
  map<string, string> env = 4;
}

message RunBackgroundResponse {
  string process_id = 1;
}

message GetProcessStatusRequest {
  string process_id = 1;
}

message GetProcessStatusResponse {
  enum Status {
    RUNNING = 0;
    COMPLETED = 1;
    FAILED = 2;
  }
  Status status = 1;
  int32 exit_code = 2;
  int64 pid = 3;
}

message GetProcessOutputRequest {
  string process_id = 1;
}

message GetProcessOutputResponse {
  string stdout = 1;
  string stderr = 2;
}

message KillProcessRequest {
  string process_id = 1;
}

message KillProcessResponse {
  bool success = 1;
}
```

### 2.4 数据库设计

**扩展 processes 表**:
```sql
ALTER TABLE processes ADD COLUMN IF NOT EXISTS is_background BOOLEAN DEFAULT false;
ALTER TABLE processes ADD COLUMN IF NOT EXISTS pid BIGINT;
ALTER TABLE processes ADD COLUMN IF NOT EXISTS stdout_buffer TEXT;
ALTER TABLE processes ADD COLUMN IF NOT EXISTS stderr_buffer TEXT;

-- 索引
CREATE INDEX idx_processes_background ON processes(sandbox_id, is_background)
    WHERE is_background = true;
```

### 2.5 envd 实现 (Go)

```go
// background_processes.go
type BackgroundProcess struct {
    ProcessID string
    Cmd       *exec.Cmd
    PID       int
    StdoutBuf *bytes.Buffer
    StderrBuf *bytes.Buffer
    Status    string
    ExitCode  int
    mutex     sync.Mutex
}

var backgroundProcesses = make(map[string]*BackgroundProcess)

func (s *CommandsServer) RunBackground(
    ctx context.Context,
    req *pb.RunBackgroundRequest,
) (*pb.RunBackgroundResponse, error) {
    // 1. 创建命令
    cmd := exec.Command(req.Cmd, req.Args...)
    cmd.Dir = req.WorkingDir
    cmd.Env = mapToEnv(req.Env)

    // 2. 创建输出缓冲区
    stdoutBuf := new(bytes.Buffer)
    stderrBuf := new(bytes.Buffer)
    cmd.Stdout = stdoutBuf
    cmd.Stderr = stderrBuf

    // 3. 启动命令
    if err := cmd.Start(); err != nil {
        return nil, err
    }

    processID := generateProcessID()
    bgProc := &BackgroundProcess{
        ProcessID: processID,
        Cmd:       cmd,
        PID:       cmd.Process.Pid,
        StdoutBuf: stdoutBuf,
        StderrBuf: stderrBuf,
        Status:    "running",
    }

    backgroundProcesses[processID] = bgProc

    // 4. 异步等待完成
    go func() {
        err := cmd.Wait()
        bgProc.mutex.Lock()
        defer bgProc.mutex.Unlock()

        if err != nil {
            if exitErr, ok := err.(*exec.ExitError); ok {
                bgProc.ExitCode = exitErr.ExitCode()
                bgProc.Status = "failed"
            }
        } else {
            bgProc.ExitCode = 0
            bgProc.Status = "completed"
        }
    }()

    return &pb.RunBackgroundResponse{
        ProcessId: processID,
    }, nil
}

func (s *CommandsServer) GetProcessStatus(
    ctx context.Context,
    req *pb.GetProcessStatusRequest,
) (*pb.GetProcessStatusResponse, error) {
    bgProc, ok := backgroundProcesses[req.ProcessId]
    if !ok {
        return nil, status.Errorf(codes.NotFound, "Process not found")
    }

    bgProc.mutex.Lock()
    defer bgProc.mutex.Unlock()

    statusMap := map[string]pb.GetProcessStatusResponse_Status{
        "running":   pb.GetProcessStatusResponse_RUNNING,
        "completed": pb.GetProcessStatusResponse_COMPLETED,
        "failed":    pb.GetProcessStatusResponse_FAILED,
    }

    return &pb.GetProcessStatusResponse{
        Status:   statusMap[bgProc.Status],
        ExitCode: int32(bgProc.ExitCode),
        Pid:      int64(bgProc.PID),
    }, nil
}

func (s *CommandsServer) GetProcessOutput(
    ctx context.Context,
    req *pb.GetProcessOutputRequest,
) (*pb.GetProcessOutputResponse, error) {
    bgProc, ok := backgroundProcesses[req.ProcessId]
    if !ok {
        return nil, status.Errorf(codes.NotFound, "Process not found")
    }

    bgProc.mutex.Lock()
    defer bgProc.mutex.Unlock()

    return &pb.GetProcessOutputResponse{
        Stdout: bgProc.StdoutBuf.String(),
        Stderr: bgProc.StderrBuf.String(),
    }, nil
}

func (s *CommandsServer) KillProcess(
    ctx context.Context,
    req *pb.KillProcessRequest,
) (*pb.KillProcessResponse, error) {
    bgProc, ok := backgroundProcesses[req.ProcessId]
    if !ok {
        return nil, status.Errorf(codes.NotFound, "Process not found")
    }

    err := bgProc.Cmd.Process.Kill()
    if err != nil {
        return &pb.KillProcessResponse{Success: false}, nil
    }

    delete(backgroundProcesses, req.ProcessId)
    return &pb.KillProcessResponse{Success: true}, nil
}
```

### 2.6 业务规则

**BR-145: 后台进程数量限制**

**规则类型**: 软规则
**描述**: 单个沙盒最多同时运行 5 个后台进程

**配置**:
```python
MAX_BACKGROUND_PROCESSES = 5
```

**实现**:
```go
func (s *CommandsServer) RunBackground(
    ctx context.Context,
    req *pb.RunBackgroundRequest,
) (*pb.RunBackgroundResponse, error) {
    // 统计当前后台进程数
    runningCount := 0
    for _, proc := range backgroundProcesses {
        if proc.Status == "running" {
            runningCount++
        }
    }

    if runningCount >= MaxBackgroundProcesses {
        return nil, status.Errorf(
            codes.ResourceExhausted,
            "BR-145: Maximum %d background processes",
            MaxBackgroundProcesses,
        )
    }

    // ... 启动进程
}
```

---

## 3. Filesystem Watch

### 3.1 功能概述

**官方文档**: https://e2b.dev/docs/filesystem/watch

**功能描述**:
- 监听目录文件变化
- 支持递归监听子目录
- 异步事件通知
- 多种事件类型（创建、修改、删除等）

**核心价值**:
- 📁 **文件监控**: 实时追踪文件变化
- 🔄 **自动化**: 触发自动化工作流
- 🐛 **调试**: 监控程序文件操作

### 3.2 API 设计

#### SDK API

**TypeScript**:
```typescript
// 监听目录
const watcher = sandbox.files.watchDir('/app', (event) => {
  console.log('Event:', event.type, event.path);
  // Event: CREATE /app/new_file.txt
}, { recursive: true });

// 停止监听
watcher.stop();
```

**Python**:
```python
# 监听目录
handle = sandbox.files.watch_dir('/app', recursive=True)

# 获取新事件
events = handle.get_new_events()
for event in events:
    print(f'Event: {event.type} {event.path}')

# 停止监听
handle.stop()
```

### 3.3 事件类型

```python
class FilesystemEventType(Enum):
    CREATE = "CREATE"   # 文件创建
    WRITE = "WRITE"     # 文件写入
    REMOVE = "REMOVE"   # 文件删除
    RENAME = "RENAME"   # 文件重命名
    CHMOD = "CHMOD"     # 权限变更
```

**事件结构**:
```json
{
  "type": "CREATE",
  "path": "/app/new_file.txt",
  "timestamp": "2025-11-05T12:34:56.789Z"
}
```

### 3.4 gRPC 协议设计

**Protobuf 定义**:
```protobuf
service FilesystemService {
  // 监听目录
  rpc WatchDir(WatchDirRequest) returns (stream FilesystemEvent);

  // 停止监听
  rpc StopWatch(StopWatchRequest) returns (StopWatchResponse);
}

message WatchDirRequest {
  string path = 1;
  bool recursive = 2;
}

message FilesystemEvent {
  enum Type {
    CREATE = 0;
    WRITE = 1;
    REMOVE = 2;
    RENAME = 3;
    CHMOD = 4;
  }
  Type type = 1;
  string path = 2;
  int64 timestamp = 3;
}

message StopWatchRequest {
  string watch_id = 1;
}

message StopWatchResponse {
  bool success = 1;
}
```

### 3.5 envd 实现 (Go)

```go
// filesystem_watcher.go
import (
    "github.com/fsnotify/fsnotify"
)

type FsWatcher struct {
    WatchID string
    Watcher *fsnotify.Watcher
    Stream  pb.FilesystemService_WatchDirServer
}

var fsWatchers = make(map[string]*FsWatcher)

func (s *FilesystemServer) WatchDir(
    req *pb.WatchDirRequest,
    stream pb.FilesystemService_WatchDirServer,
) error {
    // 1. 创建 fsnotify watcher
    watcher, err := fsnotify.NewWatcher()
    if err != nil {
        return err
    }
    defer watcher.Close()

    watchID := generateWatchID()
    fsWatchers[watchID] = &FsWatcher{
        WatchID: watchID,
        Watcher: watcher,
        Stream:  stream,
    }

    // 2. 添加监听路径
    err = watcher.Add(req.Path)
    if err != nil {
        return err
    }

    // 3. 递归监听子目录
    if req.Recursive {
        err = filepath.Walk(req.Path, func(path string, info os.FileInfo, err error) error {
            if err != nil {
                return err
            }
            if info.IsDir() {
                return watcher.Add(path)
            }
            return nil
        })
        if err != nil {
            return err
        }
    }

    // 4. 事件循环
    for {
        select {
        case event, ok := <-watcher.Events:
            if !ok {
                return nil
            }

            // 转换事件类型
            var eventType pb.FilesystemEvent_Type
            switch {
            case event.Op&fsnotify.Create == fsnotify.Create:
                eventType = pb.FilesystemEvent_CREATE

                // 如果是目录且递归监听，添加到 watcher
                if req.Recursive {
                    if info, err := os.Stat(event.Name); err == nil && info.IsDir() {
                        watcher.Add(event.Name)
                    }
                }

            case event.Op&fsnotify.Write == fsnotify.Write:
                eventType = pb.FilesystemEvent_WRITE

            case event.Op&fsnotify.Remove == fsnotify.Remove:
                eventType = pb.FilesystemEvent_REMOVE

            case event.Op&fsnotify.Rename == fsnotify.Rename:
                eventType = pb.FilesystemEvent_RENAME

            case event.Op&fsnotify.Chmod == fsnotify.Chmod:
                eventType = pb.FilesystemEvent_CHMOD

            default:
                continue
            }

            // 发送事件
            stream.Send(&pb.FilesystemEvent{
                Type:      eventType,
                Path:      event.Name,
                Timestamp: time.Now().Unix(),
            })

        case err, ok := <-watcher.Errors:
            if !ok {
                return nil
            }
            log.Printf("Watcher error: %v", err)
        }
    }
}
```

### 3.6 业务规则

**BR-140: Watcher 数量限制**

**规则类型**: 软规则
**描述**: 单个沙盒最多同时运行 10 个文件监听器

**配置**:
```go
const MaxWatchersPerSandbox = 10
```

**重要注意事项** (来自 E2B 官方文档):
- ⚠️ 事件异步传递，可能延迟
- ⚠️ 快速创建新文件夹时，除 CREATE 外的事件可能丢失
- ⚠️ 不要立即关闭 watcher，等待事件传递

---

## 4. Internet Access Control & Public URL

### 4.1 功能概述

**官方文档**: https://e2b.dev/docs/sandbox/internet-access

**功能描述**:
- 控制沙盒的互联网访问权限
- 为沙盒服务提供公网 URL
- 支持动态端口映射
- 安全的外部访问

**核心价值**:
- 🌐 **公网访问**: 沙盒服务可公网访问
- 🔒 **安全控制**: 灵活控制互联网权限
- 🔗 **集成能力**: 支持 Webhook 回调等场景

### 4.2 Internet Access Control

**默认行为**:
- 默认启用互联网访问
- 可通过 `allowInternetAccess` 参数禁用

**API 扩展**:
```typescript
const sandbox = await Sandbox.create({
  template: 'python-3.11',
  allowInternetAccess: false  // 禁用互联网访问
});
```

**数据库字段**:
```sql
ALTER TABLE sandboxes ADD COLUMN IF NOT EXISTS allow_internet_access BOOLEAN DEFAULT true;
```

**Kubernetes NetworkPolicy 实现**:

```yaml
# 禁用互联网访问
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: sandbox-no-internet-{{sandbox_id}}
  namespace: sandboxes
spec:
  podSelector:
    matchLabels:
      sandbox_id: "{{sandbox_id}}"
  policyTypes:
    - Egress
  egress:
    # 仅允许访问 Kubernetes DNS
    - to:
      - namespaceSelector:
          matchLabels:
            name: kube-system
      ports:
      - protocol: UDP
        port: 53

    # 仅允许访问集群内部服务
    - to:
      - podSelector: {}
```

```yaml
# 启用互联网访问
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: sandbox-with-internet-{{sandbox_id}}
  namespace: sandboxes
spec:
  podSelector:
    matchLabels:
      sandbox_id: "{{sandbox_id}}"
  policyTypes:
    - Egress
  egress:
    # 允许所有出站流量
    - to:
      - namespaceSelector: {}
    - to:
      - podSelector: {}
    - ports:
      - protocol: TCP
      - protocol: UDP
```

### 4.3 Public URL

**功能描述**:
- 每个沙盒自动获得公网 URL: `https://[port]-[sandbox_id].e2b.app`
- 支持多端口映射
- 自动 HTTPS (TLS 终止)

**SDK API**:
```typescript
// 创建沙盒
const sandbox = await Sandbox.create({
  template: 'node-18'
});

// 在沙盒中启动 HTTP 服务（端口 3000）
await sandbox.commands.run('node server.js');

// 获取公网 URL
const publicUrl = sandbox.getHost(3000);
console.log(publicUrl);
// 输出: https://3000-sbx-abc123.e2b.app
```

**Python SDK**:
```python
# 创建沙盒
sandbox = Sandbox.create(template='node-18')

# 在沙盒中启动 HTTP 服务
sandbox.commands.run('node server.js')

# 获取公网 URL
public_url = sandbox.get_host(3000)
print(public_url)
# 输出: https://3000-sbx-abc123.e2b.app
```

### 4.4 API 设计

**新增端点**: `GET /v1/sandboxes/{sandboxID}/host`

**请求参数**:
- `port` (integer, required): 沙盒内部端口

**响应** (200 OK):
```json
{
  "sandboxID": "sbx_abc123",
  "port": 3000,
  "publicUrl": "https://3000-sbx-abc123.e2b.app"
}
```

### 4.5 架构设计

**方案 1: Kubernetes Ingress**

```yaml
apiVersion: networking.k8s.io/v1
kind:Ingress
metadata:
  name: sandbox-{{sandbox_id}}-port-{{port}}
  namespace: sandboxes
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  tls:
  - hosts:
    - "{{port}}-sbx-{{sandbox_id}}.e2b.app"
    secretName: sandbox-{{sandbox_id}}-tls
  rules:
  - host: "{{port}}-sbx-{{sandbox_id}}.e2b.app"
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: sandbox-{{sandbox_id}}
            port:
              number: {{port}}
```

**方案 2: Service Mesh (Istio)**

```yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: sandbox-{{sandbox_id}}-{{port}}
  namespace: sandboxes
spec:
  hosts:
  - "{{port}}-sbx-{{sandbox_id}}.e2b.app"
  gateways:
  - public-gateway
  http:
  - route:
    - destination:
        host: sandbox-{{sandbox_id}}.sandboxes.svc.cluster.local
        port:
          number: {{port}}
```

**域名管理**:
- 使用通配符 DNS: `*.e2b.app -> Ingress Controller IP`
- 动态创建 Ingress 规则
- 自动申请 TLS 证书 (Let's Encrypt)

### 4.6 数据库设计

```sql
CREATE TABLE sandbox_public_urls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sandbox_id UUID NOT NULL REFERENCES sandboxes(id) ON DELETE CASCADE,
    internal_port INTEGER NOT NULL,
    public_url TEXT NOT NULL,
    ingress_created BOOLEAN DEFAULT false,
    tls_ready BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(sandbox_id, internal_port)
);

CREATE INDEX idx_sandbox_public_urls_sandbox ON sandbox_public_urls(sandbox_id);
```

### 4.7 业务规则

**BR-160: 每个沙盒最多 10 个公网 URL**

**规则类型**: 软规则

**配置**:
```python
MAX_PUBLIC_URLS_PER_SANDBOX = 10
```

**BR-161: 允许的端口范围**

**规则类型**: 强制规则

**配置**:
```python
ALLOWED_PORT_RANGE = (1024, 65535)  # 非特权端口
```

---

## 附录

### A. E2B 兼容性对照表

| 功能 | E2B | 本设计 | 兼容性 |
|------|-----|--------|--------|
| **Streaming Commands** |  |  |  |
| 实时 stdout/stderr | ✅ | ✅ | 100% |
| 回调函数 API | ✅ | ✅ | 100% |
| **Background Commands** |  |  |  |
| 后台进程执行 | ✅ | ✅ | 100% |
| 状态查询 | ✅ | ✅ | 100% |
| 输出获取 | ✅ | ✅ | 100% |
| **Filesystem Watch** |  |  |  |
| 目录监听 | ✅ | ✅ | 100% |
| 递归监听 | ✅ | ✅ | 100% |
| 5 种事件类型 | ✅ | ✅ | 100% |
| **Internet Access** |  |  |  |
| 默认启用 | ✅ | ✅ | 100% |
| allowInternetAccess | ✅ | ✅ | 100% |
| Public URL | ✅ | ✅ | 100% |
| getHost(port) API | ✅ | ✅ | 100% |

### B. 性能指标

| 功能 | 指标 | 目标值 |
|------|------|--------|
| Streaming Commands | 输出延迟 | < 100ms |
| Background Commands | 状态查询延迟 | < 50ms |
| Filesystem Watch | 事件通知延迟 | < 500ms |
| Public URL | Ingress 创建时间 | < 5s |
| Public URL | TLS 证书签发 | < 30s |

### C. SDK 使用示例

#### 综合示例 (TypeScript)

```typescript
import { Sandbox } from '@gvisor-e2b/sdk';

// 1. 创建沙盒（启用互联网）
const sandbox = await Sandbox.create({
  template: 'node-18',
  allowInternetAccess: true
});

// 2. 启动 HTTP 服务（后台）
const server = await sandbox.commands.run('node server.js', {
  background: true
});

// 3. 流式查看日志
const logs = await sandbox.commands.run('tail -f /var/log/app.log', {
  onStdout: (data) => console.log(data.toString()),
  onStderr: (data) => console.error(data.toString())
});

// 4. 监听文件变化
const watcher = sandbox.files.watchDir('/app/uploads', (event) => {
  console.log(`File ${event.type}: ${event.path}`);
}, { recursive: true });

// 5. 获取公网 URL
const publicUrl = sandbox.getHost(3000);
console.log(`Server available at: ${publicUrl}`);

// 6. 检查服务器状态
const isRunning = await server.isRunning();
console.log(`Server running: ${isRunning}`);

// 7. 清理
watcher.stop();
await server.kill();
await sandbox.kill();
```

---

**文档完成** ✅
