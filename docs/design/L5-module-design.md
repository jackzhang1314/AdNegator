# L5: 模块设计

**文档版本**: v1.0
**创建日期**: 2025-11-05
**文档状态**: Draft
**前置文档**: L1-L4 全部文档

---

## 目录

1. [模块架构概述](#1-模块架构概述)
2. [Control Plane 模块](#2-control-plane-模块)
3. [Data Plane 模块](#3-data-plane-模块)
4. [Common 模块](#4-common-模块)
5. [模块依赖关系](#5-模块依赖关系)
6. [接口设计](#6-接口设计)
7. [部署结构](#7-部署结构)

---

## 1. 模块架构概述

### 1.1 分层架构

```
┌────────────────────────────────────────────────────────┐
│                    Presentation Layer                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │  REST API    │  │  gRPC API    │  │  CLI         │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
└────────────────────────────────────────────────────────┘
                            ▼
┌────────────────────────────────────────────────────────┐
│                   Application Layer                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │  Sandbox Svc │  │  Template Svc│  │  Auth Svc    │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
└────────────────────────────────────────────────────────┘
                            ▼
┌────────────────────────────────────────────────────────┐
│                    Domain Layer                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │  Entities    │  │  Value Objs  │  │  Domain Evts │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
└────────────────────────────────────────────────────────┘
                            ▼
┌────────────────────────────────────────────────────────┐
│                 Infrastructure Layer                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │  DB Repo     │  │  K8s Client  │  │  S3 Client   │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
└────────────────────────────────────────────────────────┘
```

### 1.2 模块清单

| 模块 | 语言 | 职责 | 部署形式 |
|------|------|------|----------|
| **api-server** | Python | REST API 服务 | K8s Deployment |
| **celery-worker** | Python | 异步任务处理 | K8s Deployment |
| **envd** | Go | 沙盒内守护进程 | Container (每个沙盒) |
| **sdk-typescript** | TypeScript | 客户端 SDK | npm 包 |
| **sdk-python** | Python | 客户端 SDK | PyPI 包 |
| **common** | Python | 共享工具库 | Python 包 |
| **proto** | Protobuf | RPC 协议定义 | Git Submodule |

---

## 2. Control Plane 模块

### 2.1 api-server 模块

**技术栈**: Python 3.11+ / FastAPI / SQLAlchemy

**目录结构**:
```
api-server/
├── app/
│   ├── __init__.py
│   ├── main.py                 # FastAPI 应用入口
│   ├── api/                    # API 路由
│   │   ├── __init__.py
│   │   ├── v1/
│   │   │   ├── __init__.py
│   │   │   ├── sandboxes.py    # 沙盒管理 API
│   │   │   ├── templates.py    # 模板管理 API
│   │   │   └── auth.py         # 认证 API
│   ├── services/               # 业务逻辑层
│   │   ├── __init__.py
│   │   ├── sandbox_service.py
│   │   ├── template_service.py
│   │   └── auth_service.py
│   ├── models/                 # 数据库模型
│   │   ├── __init__.py
│   │   ├── user.py
│   │   ├── sandbox.py
│   │   ├── template.py
│   │   └── api_key.py
│   ├── schemas/                # Pydantic 数据模型
│   │   ├── __init__.py
│   │   ├── sandbox.py
│   │   └── template.py
│   ├── repositories/           # 数据访问层
│   │   ├── __init__.py
│   │   ├── sandbox_repo.py
│   │   └── template_repo.py
│   ├── dependencies.py         # FastAPI 依赖注入
│   ├── exceptions.py           # 自定义异常
│   ├── config.py               # 配置管理
│   └── utils/
│       ├── __init__.py
│       ├── jwt.py
│       └── validators.py
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── alembic/                    # 数据库迁移
│   └── versions/
├── Dockerfile
├── pyproject.toml
└── README.md
```

**核心接口**:

```python
# app/services/sandbox_service.py
class SandboxService:
    def __init__(self, sandbox_repo: SandboxRepository, k8s_client: K8sClient):
        self.sandbox_repo = sandbox_repo
        self.k8s_client = k8s_client

    async def create_sandbox(
        self,
        user_id: UUID,
        template_id: str,
        timeout: int,
        metadata: dict
    ) -> Sandbox:
        """创建沙盒（对应 L3.1-SEQ-001）"""
        # BR-021: 检查配额
        await self._check_quota(user_id)

        # 生成 sandbox_id 和 token
        sandbox_id = generate_sandbox_id()
        envd_token = generate_jwt(sandbox_id)

        # 创建数据库记录
        sandbox = await self.sandbox_repo.create(
            sandbox_id=sandbox_id,
            user_id=user_id,
            template_id=template_id,
            status='creating',
            envd_access_token=envd_token,
            timeout_seconds=timeout,
            metadata=metadata
        )

        # 发送异步任务
        await create_sandbox_task.delay(sandbox_id, template_id)

        return sandbox

    async def pause_sandbox(self, sandbox_id: str) -> None:
        """暂停沙盒（对应 L3.1-SEQ-003）"""
        sandbox = await self.sandbox_repo.get_by_sandbox_id(sandbox_id)

        # BR-060: 状态检查
        if sandbox.status != 'running':
            raise BusinessRuleViolation(
                code='invalid_state',
                message=f'Cannot pause sandbox in {sandbox.status} state'
            )

        # 更新状态
        await self.sandbox_repo.update_status(sandbox_id, 'pausing')

        # 发送异步任务
        await pause_sandbox_task.delay(sandbox_id)

    # ... 其他方法
```

---

### 2.2 celery-worker 模块

**技术栈**: Python 3.11+ / Celery / Redis

**目录结构**:
```
celery-worker/
├── app/
│   ├── __init__.py
│   ├── celery_app.py           # Celery 应用配置
│   ├── tasks/
│   │   ├── __init__.py
│   │   ├── sandbox_tasks.py    # 沙盒相关任务
│   │   ├── cleanup_tasks.py    # 清理任务
│   │   └── monitoring_tasks.py # 监控任务
│   ├── workers/
│   │   ├── __init__.py
│   │   ├── k8s_worker.py       # K8s 操作
│   │   └── criu_worker.py      # CRIU 操作
│   └── config.py
├── tests/
├── Dockerfile
└── README.md
```

**核心任务**:

```python
# app/tasks/sandbox_tasks.py
from celery import shared_task

@shared_task(bind=True, max_retries=3)
async def create_sandbox_task(self, sandbox_id: str, template_id: str):
    """创建沙盒任务（对应 L3.1-SEQ-001）"""
    try:
        # 1. 查询模板信息
        template = await template_repo.get(template_id)

        # 2. 创建 K8s Pod
        pod_spec = build_pod_spec(sandbox_id, template)
        await k8s_client.create_pod(pod_spec)

        # 3. 等待 Pod 就绪
        await wait_for_pod_ready(sandbox_id, timeout=60)

        # 4. 健康检查 envd
        await health_check_envd(sandbox_id)

        # 5. 更新状态
        await sandbox_repo.update_status(sandbox_id, 'running')

    except Exception as e:
        logger.error(f"Failed to create sandbox {sandbox_id}: {e}")
        await sandbox_repo.update_status(sandbox_id, 'failed')
        raise self.retry(exc=e, countdown=2 ** self.request.retries)

@shared_task
async def pause_sandbox_task(sandbox_id: str):
    """暂停沙盒任务（对应 L3.1-SEQ-003）"""
    try:
        # 1. 执行 CRIU checkpoint
        checkpoint_path = await criu_checkpoint(sandbox_id)

        # 2. 上传到 S3
        checkpoint_url = await s3_client.upload(checkpoint_path)

        # 3. 删除 Pod
        await k8s_client.delete_pod(sandbox_id)

        # 4. 更新状态
        await sandbox_repo.update_status(sandbox_id, 'paused')
        await sandbox_repo.update_checkpoint_url(sandbox_id, checkpoint_url)

    except Exception as e:
        logger.error(f"Failed to pause sandbox {sandbox_id}: {e}")
        await sandbox_repo.update_status(sandbox_id, 'failed')
        raise

@shared_task
async def cleanup_timeout_sandboxes():
    """清理超时沙盒（对应 BR-070）"""
    timeout_sandboxes = await sandbox_repo.find_timeout_sandboxes()

    for sandbox in timeout_sandboxes:
        logger.info(f"Cleaning up timeout sandbox {sandbox.sandbox_id}")
        await delete_sandbox(sandbox.sandbox_id)
```

---

## 3. Data Plane 模块

### 3.1 envd 模块

**技术栈**: Go 1.21+ / Connect RPC

**目录结构**:
```
envd/
├── cmd/
│   └── envd/
│       └── main.go             # 入口文件
├── internal/
│   ├── server/
│   │   ├── commands.go         # CommandsService 实现
│   │   ├── filesystem.go       # FilesystemService 实现
│   │   └── health.go           # HealthService 实现
│   ├── process/
│   │   ├── manager.go          # 进程管理器
│   │   └── stream.go           # 输出流处理
│   ├── auth/
│   │   └── jwt.go              # JWT 验证
│   └── config/
│       └── config.go
├── pkg/
│   └── proto/                  # 生成的 protobuf 代码
│       ├── commands/
│       └── filesystem/
├── Dockerfile
├── go.mod
└── README.md
```

**核心实现**:

```go
// internal/server/commands.go
package server

import (
    "context"
    "os/exec"

    "connectrpc.com/connect"
    pb "github.com/gvisor-e2b/envd/pkg/proto/commands/v1"
)

type CommandsServer struct {
    processes map[string]*Process
    mu        sync.Mutex
}

func (s *CommandsServer) Start(
    ctx context.Context,
    req *connect.Request[pb.StartRequest],
) (*connect.Response[pb.StartResponse], error) {
    // BR-040: 检查并发进程数
    if len(s.processes) >= MaxConcurrentProcesses {
        return nil, connect.NewError(
            connect.CodeResourceExhausted,
            errors.New("BR-040: max concurrent processes exceeded"),
        )
    }

    // 生成进程 ID
    processID := uuid.New().String()

    // 创建进程
    cmd := exec.CommandContext(ctx, req.Msg.Cmd, req.Msg.Args...)
    cmd.Dir = req.Msg.WorkingDir
    cmd.Env = convertEnv(req.Msg.Env)

    // 设置资源限制
    setResourceLimits(cmd, req.Msg.Resources)

    // 启动进程
    if err := cmd.Start(); err != nil {
        return nil, connect.NewError(connect.CodeInternal, err)
    }

    // 保存进程信息
    s.mu.Lock()
    s.processes[processID] = &Process{
        ID:  processID,
        Cmd: cmd,
    }
    s.mu.Unlock()

    return connect.NewResponse(&pb.StartResponse{
        ProcessId: processID,
        Status:    "running",
    }), nil
}

func (s *CommandsServer) Stream(
    ctx context.Context,
    req *connect.Request[pb.StreamRequest],
    stream *connect.ServerStream[pb.StreamResponse],
) error {
    proc := s.processes[req.Msg.ProcessId]
    if proc == nil {
        return connect.NewError(connect.CodeNotFound, errors.New("process not found"))
    }

    // 实时流式传输输出（对应 L3.1-SEQ-002）
    go streamOutput(proc.Stdout, stream, "stdout")
    go streamOutput(proc.Stderr, stream, "stderr")

    // 等待进程结束
    err := proc.Cmd.Wait()
    exitCode := proc.Cmd.ProcessState.ExitCode()

    stream.Send(&pb.StreamResponse{
        Type:     "exit",
        ExitCode: int32(exitCode),
    })

    return nil
}
```

---

### 3.2 mcp-gateway-service 模块

**技术栈**: Go 1.21+ / Docker SDK / net/http

**部署形式**: Sidecar 容器（与沙箱 Pod 共享网络命名空间）

**目录结构**:
```
mcp-gateway-service/
├── cmd/
│   └── gateway/
│       └── main.go             # 入口文件
├── internal/
│   ├── gateway/
│   │   ├── gateway.go          # Gateway 核心逻辑
│   │   ├── router.go           # HTTP 路由和请求处理
│   │   ├── auth.go             # Token 认证
│   │   └── proxy.go            # 请求代理到工具容器
│   ├── docker/
│   │   ├── client.go           # Docker 客户端封装
│   │   ├── container.go        # 容器生命周期管理
│   │   └── health.go           # 容器健康检查
│   ├── mcp/
│   │   ├── protocol.go         # MCP 协议定义
│   │   ├── server.go           # MCP Server 配置
│   │   └── types.go            # MCP 类型定义
│   └── config/
│       └── config.go           # 配置管理
├── pkg/
│   └── models/
│       └── mcp_server.go       # MCP Server 数据模型
├── Dockerfile
├── go.mod
└── README.md
```

**核心实现**:

```go
// internal/gateway/gateway.go
package gateway

import (
    "context"
    "fmt"
    "net/http"
    "sync"
    "time"

    "github.com/docker/docker/api/types/container"
    "github.com/docker/docker/client"
)

// Gateway 管理 MCP 工具容器和请求路由
type Gateway struct {
    dockerClient  *client.Client
    sandboxID     string
    configs       map[string]*MCPServerConfig
    containers    map[string]*ContainerInfo
    router        *http.ServeMux
    authProvider  *AuthProvider
    mu            sync.RWMutex
}

type MCPServerConfig struct {
    ServerID    string
    Image       string
    Tag         string
    Credentials map[string]interface{}
    Port        int
}

type ContainerInfo struct {
    ContainerID string
    ServerID    string
    Port        int
    Status      string
    StartedAt   time.Time
}

// NewGateway 创建 Gateway 实例
func NewGateway(sandboxID string, configs map[string]*MCPServerConfig) (*Gateway, error) {
    dockerClient, err := client.NewClientWithOpts(client.FromEnv)
    if err != nil {
        return nil, fmt.Errorf("failed to create docker client: %w", err)
    }

    g := &Gateway{
        dockerClient: dockerClient,
        sandboxID:    sandboxID,
        configs:      configs,
        containers:   make(map[string]*ContainerInfo),
        router:       http.NewServeMux(),
        authProvider: NewAuthProvider(),
    }

    // 注册路由
    g.router.HandleFunc("/mcp/", g.HandleMCPRequest)
    g.router.HandleFunc("/health", g.HandleHealth)
    g.router.HandleFunc("/ready", g.HandleReady)

    return g, nil
}

// Start 启动 Gateway 和所有 MCP 工具容器
func (g *Gateway) Start(ctx context.Context) error {
    // 1. 启动所有 MCP 工具容器
    for serverID, config := range g.configs {
        containerInfo, err := g.startMCPContainer(ctx, config)
        if err != nil {
            return fmt.Errorf("failed to start %s: %w", serverID, err)
        }

        g.mu.Lock()
        g.containers[serverID] = containerInfo
        g.mu.Unlock()

        log.Printf("Started MCP server: %s (container: %s)", serverID, containerInfo.ContainerID)
    }

    // 2. 启动健康检查
    go g.healthCheckLoop(ctx)

    // 3. 启动 HTTP 服务器
    log.Printf("MCP Gateway listening on :8000")
    return http.ListenAndServe(":8000", g.router)
}

// startMCPContainer 启动单个 MCP 工具容器
func (g *Gateway) startMCPContainer(ctx context.Context, config *MCPServerConfig) (*ContainerInfo, error) {
    // 1. 配置环境变量（凭证）
    envVars := []string{}
    for key, value := range config.Credentials {
        envVars = append(envVars, fmt.Sprintf("%s=%v", key, value))
    }

    // 2. 创建容器配置
    containerConfig := &container.Config{
        Image: fmt.Sprintf("%s:%s", config.Image, config.Tag),
        Env:   envVars,
    }

    hostConfig := &container.HostConfig{
        // 共享沙箱的网络命名空间
        NetworkMode: container.NetworkMode(fmt.Sprintf("container:%s", g.sandboxID)),
        // 资源限制
        Resources: container.Resources{
            Memory:   512 * 1024 * 1024, // 512MB
            NanoCPUs: 500000000,          // 0.5 CPU
        },
    }

    // 3. 创建容器
    resp, err := g.dockerClient.ContainerCreate(
        ctx,
        containerConfig,
        hostConfig,
        nil,
        nil,
        fmt.Sprintf("mcp-%s-%s", g.sandboxID, config.ServerID),
    )
    if err != nil {
        return nil, fmt.Errorf("failed to create container: %w", err)
    }

    // 4. 启动容器
    if err := g.dockerClient.ContainerStart(ctx, resp.ID, container.StartOptions{}); err != nil {
        return nil, fmt.Errorf("failed to start container: %w", err)
    }

    return &ContainerInfo{
        ContainerID: resp.ID,
        ServerID:    config.ServerID,
        Port:        config.Port,
        Status:      "running",
        StartedAt:   time.Now(),
    }, nil
}

// HandleMCPRequest 处理 MCP 协议请求
func (g *Gateway) HandleMCPRequest(w http.ResponseWriter, r *http.Request) {
    // 1. 验证访问令牌
    token := r.Header.Get("Authorization")
    if !g.authProvider.Validate(token, g.sandboxID) {
        http.Error(w, "Unauthorized", http.StatusUnauthorized)
        return
    }

    // 2. 解析 MCP 请求
    var mcpReq struct {
        Server string                 `json:"server"`
        Method string                 `json:"method"`
        Params map[string]interface{} `json:"params"`
    }

    if err := json.NewDecoder(r.Body).Decode(&mcpReq); err != nil {
        http.Error(w, "Invalid request", http.StatusBadRequest)
        return
    }

    // 3. 获取目标容器
    g.mu.RLock()
    container, ok := g.containers[mcpReq.Server]
    g.mu.RUnlock()

    if !ok {
        http.Error(w, "MCP server not found", http.StatusNotFound)
        return
    }

    // 4. 代理请求到工具容器
    targetURL := fmt.Sprintf("http://localhost:%d%s", container.Port, r.URL.Path)
    proxyReq, err := http.NewRequest(r.Method, targetURL, r.Body)
    if err != nil {
        http.Error(w, "Proxy error", http.StatusInternalServerError)
        return
    }

    // 复制请求头
    for key, values := range r.Header {
        for _, value := range values {
            proxyReq.Header.Add(key, value)
        }
    }

    // 5. 发送请求
    client := &http.Client{Timeout: 30 * time.Second}
    resp, err := client.Do(proxyReq)
    if err != nil {
        http.Error(w, "Tool error", http.StatusBadGateway)
        return
    }
    defer resp.Body.Close()

    // 6. 返回响应
    for key, values := range resp.Header {
        for _, value := range values {
            w.Header().Add(key, value)
        }
    }
    w.WriteHeader(resp.StatusCode)
    io.Copy(w, resp.Body)

    // 7. 记录审计日志
    g.logAudit(r, resp, mcpReq.Server, mcpReq.Method)
}

// healthCheckLoop 定期检查工具容器状态
func (g *Gateway) healthCheckLoop(ctx context.Context) {
    ticker := time.NewTicker(10 * time.Second)
    defer ticker.Stop()

    for {
        select {
        case <-ticker.C:
            g.checkAllContainers(ctx)
        case <-ctx.Done():
            return
        }
    }
}

func (g *Gateway) checkAllContainers(ctx context.Context) {
    g.mu.RLock()
    containers := make([]*ContainerInfo, 0, len(g.containers))
    for _, c := range g.containers {
        containers = append(containers, c)
    }
    g.mu.RUnlock()

    for _, containerInfo := range containers {
        inspect, err := g.dockerClient.ContainerInspect(ctx, containerInfo.ContainerID)
        if err != nil || !inspect.State.Running {
            log.Printf("Container %s (%s) is unhealthy, restarting...",
                containerInfo.ServerID, containerInfo.ContainerID)

            // 尝试重启容器
            if err := g.restartContainer(ctx, containerInfo); err != nil {
                log.Printf("Failed to restart container %s: %v",
                    containerInfo.ServerID, err)
            }
        }
    }
}

func (g *Gateway) restartContainer(ctx context.Context, info *ContainerInfo) error {
    // 停止旧容器
    timeout := 10
    if err := g.dockerClient.ContainerStop(ctx, info.ContainerID, container.StopOptions{
        Timeout: &timeout,
    }); err != nil {
        log.Printf("Warning: failed to stop container: %v", err)
    }

    // 启动新容器
    config := g.configs[info.ServerID]
    newContainer, err := g.startMCPContainer(ctx, config)
    if err != nil {
        return err
    }

    // 更新容器信息
    g.mu.Lock()
    g.containers[info.ServerID] = newContainer
    g.mu.Unlock()

    return nil
}

// HandleHealth 健康检查端点
func (g *Gateway) HandleHealth(w http.ResponseWriter, r *http.Request) {
    w.WriteHeader(http.StatusOK)
    json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// HandleReady 就绪检查端点
func (g *Gateway) HandleReady(w http.ResponseWriter, r *http.Request) {
    // 检查所有容器是否就绪
    g.mu.RLock()
    allReady := true
    for _, container := range g.containers {
        if container.Status != "running" {
            allReady = false
            break
        }
    }
    g.mu.RUnlock()

    if allReady {
        w.WriteHeader(http.StatusOK)
        json.NewEncoder(w).Encode(map[string]bool{"ready": true})
    } else {
        w.WriteHeader(http.StatusServiceUnavailable)
        json.NewEncoder(w).Encode(map[string]bool{"ready": false})
    }
}

// Shutdown 优雅关闭
func (g *Gateway) Shutdown(ctx context.Context) error {
    // 停止所有工具容器
    g.mu.RLock()
    containers := make([]*ContainerInfo, 0, len(g.containers))
    for _, c := range g.containers {
        containers = append(containers, c)
    }
    g.mu.RUnlock()

    for _, container := range containers {
        timeout := 10
        if err := g.dockerClient.ContainerStop(ctx, container.ContainerID, container.StopOptions{
            Timeout: &timeout,
        }); err != nil {
            log.Printf("Warning: failed to stop container %s: %v",
                container.ServerID, err)
        }
    }

    return nil
}
```

```go
// internal/gateway/auth.go
package gateway

import (
    "database/sql"
    "time"

    _ "github.com/lib/pq"
)

type AuthProvider struct {
    db *sql.DB
}

func NewAuthProvider() *AuthProvider {
    // 连接到控制平面数据库
    db, err := sql.Open("postgres", os.Getenv("DATABASE_URL"))
    if err != nil {
        log.Fatalf("Failed to connect to database: %v", err)
    }

    return &AuthProvider{db: db}
}

// Validate 验证 Bearer token
func (a *AuthProvider) Validate(token string, sandboxID string) bool {
    if token == "" {
        return false
    }

    // 查询 mcp_gateway_sessions 表
    var session struct {
        Status    string
        ExpiresAt time.Time
    }

    err := a.db.QueryRow(
        `SELECT status, token_expires_at
         FROM mcp_gateway_sessions
         WHERE access_token = $1 AND sandbox_id = $2`,
        token, sandboxID,
    ).Scan(&session.Status, &session.ExpiresAt)

    if err != nil {
        return false
    }

    // 检查状态和过期时间
    return session.Status == "active" && time.Now().Before(session.ExpiresAt)
}
```

**关键特性**:

1. **容器生命周期管理**
   - 启动时批量创建所有 MCP 工具容器
   - 共享沙箱的网络命名空间（localhost 通信）
   - 自动健康检查和重启

2. **请求路由**
   - 解析 MCP 协议请求
   - 根据 `server` 字段路由到对应容器
   - 透明代理请求和响应

3. **认证与安全**
   - Bearer token 认证（查询控制平面数据库）
   - Token 过期检查
   - 容器资源限制（CPU/内存）

4. **可观测性**
   - 健康检查端点 (`/health`)
   - 就绪检查端点 (`/ready`)
   - 审计日志记录

**性能指标**:
- Gateway 启动时间: < 1s
- 工具容器启动时间: < 5s
- MCP 请求延迟 (p95): < 500ms
- 内存占用: < 50MB (Gateway) + 512MB (每个工具容器)

**对应 L2 设计**: 5.4 MCP Gateway Service
**对应 L1 需求**: F7.3 (MCP Gateway), F7.4 (动态工具管理)

---

## 4. Common 模块

### 4.1 共享库

**技术栈**: Python

**目录结构**:
```
common/
├── gvisor_e2b_common/
│   ├── __init__.py
│   ├── exceptions.py           # 通用异常
│   ├── validators.py           # 数据验证器
│   ├── constants.py            # 常量定义
│   ├── utils/
│   │   ├── __init__.py
│   │   ├── id_generator.py     # ID 生成器
│   │   ├── jwt.py              # JWT 工具
│   │   └── time.py             # 时间工具
│   └── models/
│       ├── __init__.py
│       └── enums.py            # 枚举定义
├── tests/
├── pyproject.toml
└── README.md
```

**核心工具**:

```python
# gvisor_e2b_common/utils/id_generator.py
import secrets

def generate_sandbox_id() -> str:
    """生成沙盒 ID（对应 BR-020）"""
    return f"sbx_{secrets.token_hex(8)}"

def generate_api_key() -> str:
    """生成 API Key（对应 BR-010）"""
    return f"sk_{secrets.token_hex(20)}"

# gvisor_e2b_common/models/enums.py
from enum import Enum

class SandboxStatus(str, Enum):
    """沙盒状态（对应 L4.2 状态图）"""
    CREATING = "creating"
    RUNNING = "running"
    PAUSING = "pausing"
    PAUSED = "paused"
    RESUMING = "resuming"
    TERMINATING = "terminating"
    FAILED = "failed"

class ProcessStatus(str, Enum):
    """进程状态"""
    STARTING = "starting"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    KILLED = "killed"
```

---

## 5. 模块依赖关系

### 5.1 依赖图

```mermaid
graph TD
    A[api-server] --> B[celery-worker]
    A --> C[common]
    B --> C[common]
    B --> D[k8s-client]
    B --> E[s3-client]

    F[envd] --> G[proto]

    H[sdk-typescript] --> A
    H --> F
    I[sdk-python] --> A
    I --> F

    A --> J[PostgreSQL]
    A --> K[Redis]
    B --> K[Redis]
```

### 5.2 依赖说明

| 模块 | 依赖 | 说明 |
|------|------|------|
| api-server | common, PostgreSQL, Redis | 核心 API 服务 |
| celery-worker | common, k8s-client, s3-client, Redis | 异步任务处理 |
| envd | proto | 独立沙盒守护进程 |
| sdk-typescript | api-server (HTTP), envd (gRPC) | 客户端 SDK |
| sdk-python | api-server (HTTP), envd (gRPC) | 客户端 SDK |

---

## 6. 接口设计

### 6.1 内部接口

#### 6.1.1 SandboxRepository 接口

```python
from abc import ABC, abstractmethod
from typing import List, Optional
from uuid import UUID

class SandboxRepository(ABC):
    """沙盒数据访问接口"""

    @abstractmethod
    async def create(self, **kwargs) -> Sandbox:
        """创建沙盒记录"""
        pass

    @abstractmethod
    async def get_by_sandbox_id(self, sandbox_id: str) -> Optional[Sandbox]:
        """根据 sandbox_id 查询"""
        pass

    @abstractmethod
    async def update_status(self, sandbox_id: str, status: SandboxStatus) -> None:
        """更新状态"""
        pass

    @abstractmethod
    async def find_timeout_sandboxes(self) -> List[Sandbox]:
        """查询超时沙盒（对应 BR-070）"""
        pass

    @abstractmethod
    async def delete(self, sandbox_id: str) -> None:
        """删除沙盒（软删除）"""
        pass
```

#### 6.1.2 K8sClient 接口

```python
class K8sClient(ABC):
    """Kubernetes 客户端接口"""

    @abstractmethod
    async def create_pod(self, pod_spec: dict) -> str:
        """创建 Pod"""
        pass

    @abstractmethod
    async def delete_pod(self, sandbox_id: str) -> None:
        """删除 Pod"""
        pass

    @abstractmethod
    async def get_pod_status(self, sandbox_id: str) -> str:
        """获取 Pod 状态"""
        pass
```

---

## 7. 部署结构

### 7.1 Kubernetes 部署

```yaml
# api-server Deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-server
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api-server
  template:
    metadata:
      labels:
        app: api-server
    spec:
      containers:
        - name: api-server
          image: gvisor-e2b/api-server:latest
          ports:
            - containerPort: 8000
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: db-secret
                  key: url
          resources:
            requests:
              cpu: 2
              memory: 4Gi
            limits:
              cpu: 4
              memory: 8Gi

---
# celery-worker Deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: celery-worker
spec:
  replicas: 5
  selector:
    matchLabels:
      app: celery-worker
  template:
    metadata:
      labels:
        app: celery-worker
    spec:
      containers:
        - name: celery-worker
          image: gvisor-e2b/celery-worker:latest
          env:
            - name: CELERY_BROKER_URL
              value: redis://redis:6379/0
          resources:
            requests:
              cpu: 4
              memory: 8Gi
```

### 7.2 Docker Compose (开发环境)

```yaml
version: '3.8'

services:
  api-server:
    build: ./api-server
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgresql://postgres:password@postgres:5432/gvisor_e2b
      REDIS_URL: redis://redis:6379/0
    depends_on:
      - postgres
      - redis

  celery-worker:
    build: ./celery-worker
    environment:
      DATABASE_URL: postgresql://postgres:password@postgres:5432/gvisor_e2b
      CELERY_BROKER_URL: redis://redis:6379/0
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:15
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
      POSTGRES_DB: gvisor_e2b
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

---

## 附录

### A. 模块版本管理

| 模块 | 当前版本 | 发布计划 |
|------|----------|----------|
| api-server | v0.1.0 | 2025-12 |
| celery-worker | v0.1.0 | 2025-12 |
| envd | v0.1.0 | 2025-12 |
| sdk-typescript | v0.1.0 | 2026-01 |
| sdk-python | v0.1.0 | 2026-01 |
| common | v0.1.0 | 2025-12 |

### B. 开发指南

**本地开发**:
```bash
# 启动所有服务
docker-compose up -d

# 运行迁移
alembic upgrade head

# 运行测试
pytest

# 启动 API 服务
uvicorn app.main:app --reload
```

---

**文档完成**: 所有 L1-L5 设计文档已创建完成
