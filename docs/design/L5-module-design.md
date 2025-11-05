# L5: 模块设计

**文档版本**: v2.0 (E2B Official)
**创建日期**: 2025-11-05
**更新日期**: 2025-11-05
**文档状态**: E2B Official Aligned
**前置文档**: L1-L4 全部文档

**⚠️ 重大变更**: 本文档已完全重写以对齐 E2B 官方架构 (`/tmp/infra/`)

---

## 目录

1. [模块架构概述](#1-模块架构概述)
2. [Control Plane 模块](#2-control-plane-模块)
3. [Data Plane 模块](#3-data-plane-模块)
4. [SDK 模块](#4-sdk-模块)
5. [模块依赖关系](#5-模块依赖关系)
6. [接口设计](#6-接口设计)
7. [部署结构](#7-部署结构)

---

## 1. 模块架构概述

### 1.1 分层架构

```
┌────────────────────────────────────────────────────────────┐
│                    Presentation Layer                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  REST API    │  │  gRPC API    │  │  CLI         │     │
│  │  (Gin)       │  │  (envd)      │  │  (Cobra)     │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└────────────────────────────────────────────────────────────┘
                            ▼
┌────────────────────────────────────────────────────────────┐
│                   Application Layer                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  API Server  │  │ Orchestrator │  │  envd        │     │
│  │  (Go/Gin)    │  │  (Go gRPC)   │  │  (Go gRPC)   │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└────────────────────────────────────────────────────────────┘
                            ▼
┌────────────────────────────────────────────────────────────┐
│                 Infrastructure Layer                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  PostgreSQL  │  │  Firecracker │  │  ClickHouse  │     │
│  │  (Supabase)  │  │  (microVM)   │  │  (Analytics) │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└────────────────────────────────────────────────────────────┘
```

**源码参考**: `/tmp/infra/packages/` 目录结构

### 1.2 模块清单 (E2B Official)

| 模块 | 语言 | 职责 | 部署形式 | 源码路径 |
|------|------|------|----------|----------|
| **api** | **Go 1.21+** | REST API 服务 | Nomad Service | packages/api/ |
| **orchestrator** | **Go 1.21+** | Firecracker VM 管理 | Nomad System Job | packages/orchestrator/ |
| **envd** | **Go 1.21+** | 沙盒内守护进程 | Firecracker VM 内 | packages/envd/ |
| **template-builder** | **Go 1.21+** | 模板构建服务 | Nomad Batch Job | packages/template/ |
| **sdk-js** | TypeScript | 客户端 SDK | npm 包 | packages/js-sdk/ |
| **sdk-python** | Python | 客户端 SDK | PyPI 包 | packages/python-sdk/ |

**关键差异**:
- ❌ **无 celery-worker** (E2B 不使用异步任务队列)
- ❌ **无 common Python 库** (Go 微服务架构)
- ✅ **新增 orchestrator** (核心组件，管理 Firecracker)
- ✅ **部署方式**: Nomad (不是 Kubernetes)

---

## 2. Control Plane 模块

### 2.1 api 模块 (Go/Gin)

**技术栈**: Go 1.21+ / Gin Framework / OpenAPI (oapi-codegen)

**源码参考**: `/tmp/infra/packages/api/`

**目录结构**:
```
packages/api/
├── cmd/
│   └── start/
│       └── main.go                 # 入口文件
├── internal/
│   ├── api/
│   │   ├── api.gen.go              # oapi-codegen 自动生成
│   │   ├── store.go                # APIStore 核心逻辑
│   │   └── middleware.go           # 认证/限流中间件
│   ├── handlers/
│   │   ├── sandboxes.go            # 沙盒管理 API
│   │   ├── templates.go            # 模板管理 API
│   │   └── health.go               # 健康检查 API
│   ├── db/
│   │   ├── queries.sql.go          # sqlc 自动生成
│   │   └── models.go
│   ├── services/
│   │   ├── sandbox_service.go
│   │   ├── team_service.go
│   │   └── analytics_service.go    # ClickHouse 分析
│   └── config/
│       └── config.go               # 配置管理
├── api/                            # OpenAPI 规范
│   └── openapi.yml
├── Dockerfile
├── go.mod
└── README.md
```

**核心实现** (基于 E2B 官方):

```go
// internal/api/store.go
package api

import (
    "context"
    "fmt"
    "net/http"

    "github.com/gin-gonic/gin"
    "github.com/e2b-dev/infra/packages/api/internal/db"
    pb "github.com/e2b-dev/infra/packages/orchestrator-api"
)

type APIStore struct {
    db           *db.Queries
    orchestrator pb.OrchestratorServiceClient  // gRPC 客户端
    clickhouse   *ClickHouseClient
}

// PostSandboxes 创建沙盒 (对应 L3.1-SEQ-001)
func (s *APIStore) PostSandboxes(
    c *gin.Context,
    params PostSandboxesParams,
) {
    ctx := c.Request.Context()

    // 1. 认证 - 从中间件获取 team
    team := c.Value(auth.TeamContextKey).(*db.Team)

    // 2. 解析请求
    var req PostSandboxesJSONRequestBody
    if err := c.BindJSON(&req); err != nil {
        c.JSON(400, gin.H{"error": "invalid request"})
        return
    }

    // 3. 检查配额 (BR-021)
    if err := s.checkQuota(ctx, team.ID); err != nil {
        c.JSON(429, gin.H{"error": "quota exceeded"})
        return
    }

    // 4. 生成 sandbox_id 和 token
    sandboxID := generateSandboxID()
    envdToken := generateJWT(sandboxID, team.ID)

    // 5. 调用 Orchestrator gRPC (直接调用，无异步队列)
    orchResp, err := s.orchestrator.CreateSandbox(ctx, &pb.CreateSandboxRequest{
        SandboxId:         sandboxID,
        TeamId:            team.ID,
        TemplateId:        req.TemplateId,
        TimeoutSeconds:    req.TimeoutSeconds,
        Vcpu:              team.Tier.Vcpu,
        RamMb:             team.Tier.RamMb,
        KernelVersion:     req.KernelVersion,
        FirecrackerVersion: req.FirecrackerVersion,
    })
    if err != nil {
        c.JSON(500, gin.H{"error": "failed to create sandbox"})
        return
    }

    // 6. 写入 PostgreSQL
    sandbox, err := s.db.InsertSandbox(ctx, db.InsertSandboxParams{
        SandboxID:       sandboxID,
        TeamID:          team.ID,
        TemplateID:      req.TemplateId,
        ClientID:        orchResp.ClientId,
        EnvdAccessToken: envdToken,
        Status:          "running",
    })

    // 7. 写入 ClickHouse 事件
    s.clickhouse.InsertEvent(ctx, SandboxEvent{
        Timestamp:      time.Now(),
        SandboxID:      sandboxID,
        SandboxTeamID:  team.ID,
        EventCategory:  "lifecycle",
        EventLabel:     "sandbox_created",
    })

    // 8. 返回响应
    c.JSON(201, Sandbox{
        SandboxId:       sandboxID,
        ClientId:        orchResp.ClientId,
        EnvdAccessToken: envdToken,
        Status:          "running",
    })
}

// DeleteSandboxesSandboxId 删除沙盒 (对应 L3.1-SEQ-004)
func (s *APIStore) DeleteSandboxesSandboxId(
    c *gin.Context,
    sandboxId string,
) {
    ctx := c.Request.Context()
    team := c.Value(auth.TeamContextKey).(*db.Team)

    // 1. 验证沙盒所有权
    sandbox, err := s.db.GetSandbox(ctx, sandboxId)
    if err != nil || sandbox.TeamID != team.ID {
        c.JSON(404, gin.H{"error": "sandbox not found"})
        return
    }

    // 2. 调用 Orchestrator gRPC 删除
    _, err = s.orchestrator.DeleteSandbox(ctx, &pb.DeleteSandboxRequest{
        SandboxId: sandboxId,
    })
    if err != nil {
        c.JSON(500, gin.H{"error": "failed to delete sandbox"})
        return
    }

    // 3. 更新数据库状态
    s.db.UpdateSandboxStatus(ctx, db.UpdateSandboxStatusParams{
        SandboxID: sandboxId,
        Status:    "terminated",
        EndedAt:   sql.NullTime{Time: time.Now(), Valid: true},
    })

    // 4. 写入 ClickHouse 事件
    s.clickhouse.InsertEvent(ctx, SandboxEvent{
        Timestamp:     time.Now(),
        SandboxID:     sandboxId,
        SandboxTeamID: team.ID,
        EventCategory: "lifecycle",
        EventLabel:    "sandbox_deleted",
    })

    c.JSON(204, nil)
}
```

**中间件实现**:

```go
// internal/api/middleware.go
package api

import (
    "strings"

    "github.com/gin-gonic/gin"
    "github.com/e2b-dev/infra/packages/api/internal/db"
)

// AuthMiddleware 认证中间件
func (s *APIStore) AuthMiddleware() gin.HandlerFunc {
    return func(c *gin.Context) {
        // 1. 提取 API Key (Bearer token)
        authHeader := c.GetHeader("Authorization")
        if authHeader == "" {
            c.AbortWithStatusJSON(401, gin.H{"error": "missing authorization"})
            return
        }

        apiKey := strings.TrimPrefix(authHeader, "Bearer ")

        // 2. 查询 team_api_keys 表 (L3.2 数据库设计)
        team, err := s.db.GetTeamByAPIKey(c.Request.Context(), apiKey)
        if err != nil {
            c.AbortWithStatusJSON(401, gin.H{"error": "invalid api key"})
            return
        }

        // 3. 检查 team 是否被封禁 (BR-012)
        if team.IsBlocked {
            c.AbortWithStatusJSON(403, gin.H{"error": "team is blocked"})
            return
        }

        // 4. 注入 team 到上下文
        c.Set(auth.TeamContextKey, team)
        c.Next()
    }
}

// RateLimitMiddleware 限流中间件 (Redis Token Bucket)
func (s *APIStore) RateLimitMiddleware() gin.HandlerFunc {
    return func(c *gin.Context) {
        team := c.Value(auth.TeamContextKey).(*db.Team)

        // BR-030: 基于 tier 的限流
        limit := team.Tier.RateLimit  // requests/minute

        allowed, err := s.redis.AllowRequest(
            c.Request.Context(),
            fmt.Sprintf("rate_limit:%s", team.ID),
            limit,
            60, // 1 minute window
        )

        if !allowed {
            c.AbortWithStatusJSON(429, gin.H{
                "error": "rate limit exceeded",
                "retry_after": 60,
            })
            return
        }

        c.Next()
    }
}
```

**main.go 入口**:

```go
// cmd/start/main.go
package main

import (
    "context"
    "fmt"
    "net/http"

    "github.com/gin-gonic/gin"
    "github.com/e2b-dev/infra/packages/api/internal/api"
    "github.com/e2b-dev/infra/packages/api/internal/db"
    pb "github.com/e2b-dev/infra/packages/orchestrator-api"
    "google.golang.org/grpc"
)

const serviceName = "orchestration-api"

func main() {
    ctx := context.Background()

    // 1. 加载配置
    cfg := loadConfig()

    // 2. 连接数据库
    pgConn, err := db.Connect(cfg.PostgresURL)
    if err != nil {
        log.Fatal(err)
    }
    queries := db.New(pgConn)

    // 3. 连接 Orchestrator gRPC
    orchConn, err := grpc.Dial(
        cfg.OrchestratorURL,
        grpc.WithInsecure(),
    )
    if err != nil {
        log.Fatal(err)
    }
    orchClient := pb.NewOrchestratorServiceClient(orchConn)

    // 4. 连接 ClickHouse
    clickhouse := NewClickHouseClient(cfg.ClickHouseURL)

    // 5. 创建 APIStore
    store := &api.APIStore{
        db:           queries,
        orchestrator: orchClient,
        clickhouse:   clickhouse,
    }

    // 6. 创建 Gin 服务器
    r := gin.New()
    r.Use(gin.Recovery())

    // 7. 注册路由 (oapi-codegen 自动生成)
    api.RegisterHandlersWithOptions(r, store, api.GinServerOptions{
        BaseURL: "/v1",
        Middlewares: []api.MiddlewareFunc{
            store.AuthMiddleware(),
            store.RateLimitMiddleware(),
        },
    })

    // 8. 启动服务器
    srv := &http.Server{
        Addr:    "0.0.0.0:80",
        Handler: r,
    }

    log.Printf("API server listening on %s", srv.Addr)
    if err := srv.ListenAndServe(); err != nil {
        log.Fatal(err)
    }
}
```

**源码参考**: `/tmp/infra/packages/api/main.go`

---

### 2.2 orchestrator 模块 (Go gRPC)

**技术栈**: Go 1.21+ / gRPC / Firecracker SDK

**源码参考**: `/tmp/infra/packages/orchestrator/`

**目录结构**:
```
packages/orchestrator/
├── cmd/
│   └── start/
│       └── main.go                 # gRPC 服务器入口
├── internal/
│   ├── sandbox/
│   │   ├── sandbox.go              # Sandbox 核心逻辑
│   │   ├── manager.go              # Sandbox 生命周期管理
│   │   └── network.go              # 网络配置
│   ├── firecracker/
│   │   ├── vm.go                   # Firecracker VM 管理
│   │   ├── config.go               # VM 配置
│   │   └── snapshot.go             # 快照管理
│   ├── storage/
│   │   ├── template_store.go       # 模板存储
│   │   └── overlay.go              # Overlay 文件系统
│   ├── grpc/
│   │   ├── server.go               # gRPC 服务实现
│   │   └── interceptors.go         # 拦截器
│   └── config/
│       └── config.go
├── api/
│   └── orchestrator.proto          # Protobuf 定义
├── Dockerfile
├── go.mod
└── README.md
```

**核心实现** (基于 E2B 官方):

```go
// internal/sandbox/sandbox.go
package sandbox

import (
    "context"
    "fmt"
    "os"
    "path/filepath"

    fc "github.com/firecracker-microvm/firecracker-go-sdk"
    "github.com/e2b-dev/infra/packages/orchestrator/internal/storage"
)

// Sandbox 表示一个 Firecracker 沙盒
type Sandbox struct {
    ID               string
    TeamID           string
    TemplateID       string
    ClientID         string

    // Firecracker 资源
    Process          *fc.Machine          // Firecracker 进程
    VMMCtx           context.Context
    VMMCancel        context.CancelFunc

    // 资源配置
    Vcpu             int64
    RamMB            int64
    DiskSizeMB       int64

    // 网络配置
    IP               string
    MAC              string
    TapDevice        string

    // 存储
    Files            *storage.SandboxFiles
    RootfsPath       string
    KernelPath       string

    // 状态
    Status           string
    CreatedAt        time.Time
}

// Config 沙盒配置
type Config struct {
    SandboxID            string
    TeamID               string
    TemplateID           string
    Vcpu                 int64
    RamMB                int64
    KernelVersion        string
    FirecrackerVersion   string
    TimeoutSeconds       int
    AllowInternetAccess  bool
}

// Manager 沙盒管理器
type Manager struct {
    sandboxes      map[string]*Sandbox
    mu             sync.RWMutex
    templateStore  *storage.TemplateStore
}

// CreateSandbox 创建沙盒 (对应 L3.1-SEQ-001)
func (m *Manager) CreateSandbox(ctx context.Context, cfg *Config) (*Sandbox, error) {
    // 1. 生成客户端 ID (连接 envd 用)
    clientID := generateClientID()

    // 2. 准备文件系统
    files, err := m.templateStore.PrepareOverlay(cfg.TemplateID, cfg.SandboxID)
    if err != nil {
        return nil, fmt.Errorf("failed to prepare overlay: %w", err)
    }

    // 3. 分配网络资源
    ip, mac, tapDevice := m.allocateNetwork()

    // 4. 创建 Sandbox 对象
    sandbox := &Sandbox{
        ID:         cfg.SandboxID,
        TeamID:     cfg.TeamID,
        TemplateID: cfg.TemplateID,
        ClientID:   clientID,
        Vcpu:       cfg.Vcpu,
        RamMB:      cfg.RamMB,
        IP:         ip,
        MAC:        mac,
        TapDevice:  tapDevice,
        Files:      files,
        Status:     "starting",
        CreatedAt:  time.Now(),
    }

    // 5. 构建 Firecracker 配置
    fcConfig := &fc.Config{
        SocketPath:      filepath.Join("/tmp", cfg.SandboxID, "firecracker.sock"),
        KernelImagePath: files.KernelPath,
        KernelArgs:      "console=ttyS0 reboot=k panic=1 pci=off",
        Drives: []fc.Drive{{
            DriveID:      "rootfs",
            PathOnHost:   files.RootfsPath,
            IsRootDevice: true,
            IsReadOnly:   false,
        }},
        NetworkInterfaces: []fc.NetworkInterface{{
            StaticConfiguration: &fc.StaticNetworkConfiguration{
                MacAddress:  mac,
                HostDevName: tapDevice,
                IPConfiguration: &fc.IPConfiguration{
                    IPAddr: fc.IPAddr{IP: net.ParseIP(ip)},
                },
            },
        }},
        MachineCfg: fc.MachineCfg{
            VcpuCount:  cfg.Vcpu,
            MemSizeMib: cfg.RamMB,
            HtEnabled:  false,
        },
    }

    // 6. 启动 Firecracker VM
    vmmCtx, vmmCancel := context.WithCancel(ctx)
    sandbox.VMMCtx = vmmCtx
    sandbox.VMMCancel = vmmCancel

    machine, err := fc.NewMachine(vmmCtx, fcConfig)
    if err != nil {
        vmmCancel()
        return nil, fmt.Errorf("failed to create machine: %w", err)
    }
    sandbox.Process = machine

    if err := machine.Start(vmmCtx); err != nil {
        vmmCancel()
        return nil, fmt.Errorf("failed to start machine: %w", err)
    }

    // 7. 等待 envd 就绪 (健康检查)
    if err := m.waitForEnvd(sandbox, 60*time.Second); err != nil {
        sandbox.VMMCancel()
        return nil, fmt.Errorf("envd not ready: %w", err)
    }

    // 8. 更新状态
    sandbox.Status = "running"

    // 9. 注册沙盒
    m.mu.Lock()
    m.sandboxes[cfg.SandboxID] = sandbox
    m.mu.Unlock()

    // 10. 启动超时清理 goroutine (BR-070)
    if cfg.TimeoutSeconds > 0 {
        go m.scheduleTimeout(sandbox, time.Duration(cfg.TimeoutSeconds)*time.Second)
    }

    return sandbox, nil
}

// DeleteSandbox 删除沙盒 (对应 L3.1-SEQ-004)
func (m *Manager) DeleteSandbox(ctx context.Context, sandboxID string) error {
    m.mu.Lock()
    sandbox, exists := m.sandboxes[sandboxID]
    if !exists {
        m.mu.Unlock()
        return fmt.Errorf("sandbox not found: %s", sandboxID)
    }
    delete(m.sandboxes, sandboxID)
    m.mu.Unlock()

    // 1. 停止 Firecracker VM
    if err := sandbox.Process.StopVMM(); err != nil {
        log.Printf("Failed to stop VMM: %v", err)
    }
    sandbox.VMMCancel()

    // 2. 释放网络资源
    m.releaseNetwork(sandbox.IP, sandbox.MAC, sandbox.TapDevice)

    // 3. 清理文件系统
    if err := sandbox.Files.Cleanup(); err != nil {
        log.Printf("Failed to cleanup files: %v", err)
    }

    return nil
}

// waitForEnvd 等待 envd 就绪
func (m *Manager) waitForEnvd(sandbox *Sandbox, timeout time.Duration) error {
    ctx, cancel := context.WithTimeout(context.Background(), timeout)
    defer cancel()

    ticker := time.NewTicker(500 * time.Millisecond)
    defer ticker.Stop()

    for {
        select {
        case <-ctx.Done():
            return fmt.Errorf("timeout waiting for envd")
        case <-ticker.C:
            // 尝试连接 envd gRPC (端口 49983)
            conn, err := grpc.DialContext(
                ctx,
                fmt.Sprintf("%s:49983", sandbox.IP),
                grpc.WithInsecure(),
                grpc.WithBlock(),
                grpc.WithTimeout(1*time.Second),
            )
            if err != nil {
                continue
            }
            conn.Close()
            return nil
        }
    }
}
```

**gRPC 服务实现**:

```go
// internal/grpc/server.go
package grpc

import (
    "context"

    pb "github.com/e2b-dev/infra/packages/orchestrator-api"
    "github.com/e2b-dev/infra/packages/orchestrator/internal/sandbox"
)

type Server struct {
    pb.UnimplementedOrchestratorServiceServer
    manager *sandbox.Manager
}

// CreateSandbox gRPC 方法
func (s *Server) CreateSandbox(
    ctx context.Context,
    req *pb.CreateSandboxRequest,
) (*pb.CreateSandboxResponse, error) {
    sandbox, err := s.manager.CreateSandbox(ctx, &sandbox.Config{
        SandboxID:           req.SandboxId,
        TeamID:              req.TeamId,
        TemplateID:          req.TemplateId,
        Vcpu:                req.Vcpu,
        RamMB:               req.RamMb,
        KernelVersion:       req.KernelVersion,
        FirecrackerVersion:  req.FirecrackerVersion,
        TimeoutSeconds:      int(req.TimeoutSeconds),
        AllowInternetAccess: req.AllowInternetAccess,
    })
    if err != nil {
        return nil, err
    }

    return &pb.CreateSandboxResponse{
        SandboxId: sandbox.ID,
        ClientId:  sandbox.ClientID,
        EnvdUrl:   fmt.Sprintf("http://%s:49983", sandbox.IP),
    }, nil
}

// DeleteSandbox gRPC 方法
func (s *Server) DeleteSandbox(
    ctx context.Context,
    req *pb.DeleteSandboxRequest,
) (*pb.DeleteSandboxResponse, error) {
    if err := s.manager.DeleteSandbox(ctx, req.SandboxId); err != nil {
        return nil, err
    }

    return &pb.DeleteSandboxResponse{}, nil
}
```

**源码参考**: `/tmp/infra/packages/orchestrator/internal/sandbox/sandbox.go`

---

## 3. Data Plane 模块

### 3.1 envd 模块 (Go gRPC Daemon)

**技术栈**: Go 1.21+ / Connect RPC / Chi Router

**源码参考**: `/tmp/infra/packages/envd/`

**目录结构**:
```
packages/envd/
├── main.go                         # 入口文件
├── internal/
│   ├── api/
│   │   ├── api.gen.go              # oapi-codegen 生成
│   │   └── server.go               # HTTP 服务器
│   ├── services/
│   │   ├── process/
│   │   │   ├── process.go          # 进程管理服务
│   │   │   ├── stream.go           # 输出流处理
│   │   │   └── manager.go          # 进程生命周期
│   │   └── filesystem/
│   │       ├── filesystem.go       # 文件系统服务
│   │       ├── read.go             # 读文件
│   │       ├── write.go            # 写文件
│   │       └── watch.go            # 文件监听
│   ├── execcontext/
│   │   └── defaults.go             # 执行上下文
│   ├── permissions/
│   │   └── auth.go                 # 认证
│   └── port/
│       ├── scanner.go              # 端口扫描
│       └── forwarder.go            # 端口转发
├── api/
│   └── openapi.yml                 # OpenAPI 规范
├── Dockerfile
├── go.mod
└── README.md
```

**核心实现** (基于 E2B 官方):

```go
// main.go
package main

import (
    "context"
    "fmt"
    "log"
    "net/http"
    "time"

    "connectrpc.com/authn"
    connectcors "connectrpc.com/cors"
    "github.com/go-chi/chi/v5"
    "github.com/rs/cors"

    "github.com/e2b-dev/infra/packages/envd/internal/api"
    "github.com/e2b-dev/infra/packages/envd/internal/execcontext"
    "github.com/e2b-dev/infra/packages/envd/internal/permissions"
    filesystemRpc "github.com/e2b-dev/infra/packages/envd/internal/services/filesystem"
    processRpc "github.com/e2b-dev/infra/packages/envd/internal/services/process"
)

const (
    defaultPort = 49983
    idleTimeout = 640 * time.Second
)

func main() {
    ctx, cancel := context.WithCancel(context.Background())
    defer cancel()

    // 1. 初始化默认执行上下文
    defaults := &execcontext.Defaults{
        User:    "user",
        EnvVars: map[string]string{
            "E2B_SANDBOX": "true",
        },
    }

    // 2. 创建 Chi 路由器
    m := chi.NewRouter()

    // 3. 注册 Filesystem 服务
    filesystemRpc.Handle(m, defaults)

    // 4. 注册 Process 服务
    processService := processRpc.Handle(m, defaults)

    // 5. 注册 API 路由 (OpenAPI)
    service := api.New(defaults)
    handler := api.HandlerFromMux(service, m)

    // 6. 添加认证中间件
    middleware := authn.NewMiddleware(permissions.AuthenticateUsername)

    // 7. 添加 CORS
    corsHandler := cors.New(cors.Options{
        AllowedOrigins: []string{"*"},
        AllowedMethods: []string{"GET", "POST", "PUT", "DELETE"},
        AllowedHeaders: []string{"*"},
    })

    // 8. 启动 HTTP 服务器
    s := &http.Server{
        Handler:      corsHandler.Handler(service.WithAuthorization(middleware.Wrap(handler))),
        Addr:         fmt.Sprintf("0.0.0.0:%d", defaultPort),
        ReadTimeout:  0,  // 无超时限制
        WriteTimeout: 0,
        IdleTimeout:  idleTimeout,
    }

    log.Printf("envd listening on %s", s.Addr)
    if err := s.ListenAndServe(); err != nil {
        log.Fatalf("error starting server: %v", err)
    }
}
```

**Process 服务实现**:

```go
// internal/services/process/process.go
package process

import (
    "context"
    "fmt"
    "os/exec"
    "sync"

    "connectrpc.com/connect"
    pb "github.com/e2b-dev/infra/packages/envd/internal/services/spec/process"
)

type Service struct {
    processes map[string]*Process
    mu        sync.RWMutex
    defaults  *execcontext.Defaults
}

type Process struct {
    ID       string
    Tag      string
    Cmd      *exec.Cmd
    Status   string
    ExitCode int
    StartedAt time.Time
}

// Start 启动进程 (对应 L3.1-SEQ-002)
func (s *Service) Start(
    ctx context.Context,
    req *connect.Request[pb.StartRequest],
) (*connect.Response[pb.StartResponse], error) {
    // 1. BR-040: 检查并发进程数限制
    s.mu.RLock()
    count := len(s.processes)
    s.mu.RUnlock()

    if count >= MaxConcurrentProcesses {
        return nil, connect.NewError(
            connect.CodeResourceExhausted,
            fmt.Errorf("BR-040: max concurrent processes exceeded (%d)", count),
        )
    }

    // 2. 生成进程 ID
    processID := generateProcessID()

    // 3. 构建命令
    cmd := exec.CommandContext(ctx, req.Msg.Process.Cmd, req.Msg.Process.Args...)

    // 4. 设置工作目录
    if req.Msg.Process.Cwd != nil {
        cmd.Dir = *req.Msg.Process.Cwd
    } else {
        cmd.Dir = "/home/user"
    }

    // 5. 设置环境变量 (合并默认环境变量)
    envVars := s.defaults.EnvVars
    for k, v := range req.Msg.Process.Envs {
        envVars[k] = v
    }
    cmd.Env = convertEnvMap(envVars)

    // 6. 创建输出管道
    stdoutPipe, _ := cmd.StdoutPipe()
    stderrPipe, _ := cmd.StderrPipe()

    // 7. 启动进程
    if err := cmd.Start(); err != nil {
        return nil, connect.NewError(connect.CodeInternal, err)
    }

    // 8. 保存进程信息
    process := &Process{
        ID:        processID,
        Tag:       getTag(req.Msg.Tag),
        Cmd:       cmd,
        Status:    "running",
        StartedAt: time.Now(),
    }

    s.mu.Lock()
    s.processes[processID] = process
    s.mu.Unlock()

    // 9. 异步等待进程结束
    go func() {
        err := cmd.Wait()
        process.Status = "finished"
        if err != nil {
            process.ExitCode = cmd.ProcessState.ExitCode()
        }
    }()

    return connect.NewResponse(&pb.StartResponse{
        ProcessId: processID,
        Status:    "running",
    }), nil
}

// SubscribeOutput 订阅进程输出流 (对应 L3.1-SEQ-002)
func (s *Service) SubscribeOutput(
    ctx context.Context,
    req *connect.Request[pb.SubscribeOutputRequest],
    stream *connect.ServerStream[pb.SubscribeOutputResponse],
) error {
    s.mu.RLock()
    process, exists := s.processes[req.Msg.ProcessId]
    s.mu.RUnlock()

    if !exists {
        return connect.NewError(connect.CodeNotFound, fmt.Errorf("process not found"))
    }

    // 实时流式传输 stdout 和 stderr
    errChan := make(chan error, 2)

    go streamOutput(process.Cmd.Stdout, stream, "stdout", errChan)
    go streamOutput(process.Cmd.Stderr, stream, "stderr", errChan)

    // 等待进程结束
    err := <-errChan

    // 发送退出码
    stream.Send(&pb.SubscribeOutputResponse{
        Type:     "exit",
        ExitCode: int32(process.ExitCode),
    })

    return err
}

// streamOutput 流式传输输出
func streamOutput(
    reader io.Reader,
    stream *connect.ServerStream[pb.SubscribeOutputResponse],
    outputType string,
    errChan chan error,
) {
    scanner := bufio.NewScanner(reader)
    for scanner.Scan() {
        line := scanner.Text()

        if err := stream.Send(&pb.SubscribeOutputResponse{
            Type: outputType,
            Line: line,
        }); err != nil {
            errChan <- err
            return
        }
    }

    errChan <- scanner.Err()
}
```

**Filesystem 服务实现**:

```go
// internal/services/filesystem/filesystem.go
package filesystem

import (
    "context"
    "fmt"
    "os"
    "path/filepath"

    "connectrpc.com/connect"
    pb "github.com/e2b-dev/infra/packages/envd/internal/services/spec/filesystem"
)

type Service struct {
    defaults *execcontext.Defaults
}

// ReadFile 读取文件
func (s *Service) ReadFile(
    ctx context.Context,
    req *connect.Request[pb.ReadFileRequest],
) (*connect.Response[pb.ReadFileResponse], error) {
    // BR-050: 路径验证（防止路径遍历攻击）
    if !isValidPath(req.Msg.Path) {
        return nil, connect.NewError(
            connect.CodeInvalidArgument,
            fmt.Errorf("invalid path: %s", req.Msg.Path),
        )
    }

    // 读取文件内容
    content, err := os.ReadFile(req.Msg.Path)
    if err != nil {
        return nil, connect.NewError(connect.CodeNotFound, err)
    }

    return connect.NewResponse(&pb.ReadFileResponse{
        Content: content,
    }), nil
}

// WriteFile 写入文件
func (s *Service) WriteFile(
    ctx context.Context,
    req *connect.Request[pb.WriteFileRequest],
) (*connect.Response[pb.WriteFileResponse], error) {
    // BR-050: 路径验证
    if !isValidPath(req.Msg.Path) {
        return nil, connect.NewError(
            connect.CodeInvalidArgument,
            fmt.Errorf("invalid path: %s", req.Msg.Path),
        )
    }

    // 确保目录存在
    dir := filepath.Dir(req.Msg.Path)
    if err := os.MkdirAll(dir, 0755); err != nil {
        return nil, connect.NewError(connect.CodeInternal, err)
    }

    // 写入文件
    if err := os.WriteFile(req.Msg.Path, req.Msg.Content, 0644); err != nil {
        return nil, connect.NewError(connect.CodeInternal, err)
    }

    return connect.NewResponse(&pb.WriteFileResponse{}), nil
}

// ListFiles 列出目录
func (s *Service) ListFiles(
    ctx context.Context,
    req *connect.Request[pb.ListFilesRequest],
) (*connect.Response[pb.ListFilesResponse], error) {
    entries, err := os.ReadDir(req.Msg.Path)
    if err != nil {
        return nil, connect.NewError(connect.CodeNotFound, err)
    }

    var files []*pb.FileInfo
    for _, entry := range entries {
        info, _ := entry.Info()
        files = append(files, &pb.FileInfo{
            Name:  entry.Name(),
            IsDir: entry.IsDir(),
            Size:  info.Size(),
        })
    }

    return connect.NewResponse(&pb.ListFilesResponse{
        Files: files,
    }), nil
}
```

**源码参考**: `/tmp/infra/packages/envd/main.go` (lines 1-224)

---

## 4. SDK 模块

### 4.1 JavaScript SDK

**技术栈**: TypeScript / fetch API

**源码参考**: `/tmp/infra/packages/js-sdk/`

**核心实现**:

```typescript
// src/sandbox.ts
export class Sandbox {
  private sandboxId: string
  private envdUrl: string
  private envdToken: string

  constructor(config: SandboxConfig) {
    this.sandboxId = config.sandboxId
    this.envdUrl = config.envdUrl
    this.envdToken = config.envdToken
  }

  // 执行命令 (对应 L3.1-SEQ-002)
  async commands.run(cmd: string, opts?: RunOptions): Promise<ProcessOutput> {
    // 1. 调用 envd Start API
    const startResp = await fetch(`${this.envdUrl}/process/start`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.envdToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cmd: '/bin/bash',
        args: ['-c', cmd],
        cwd: opts?.cwd || '/home/user',
        envs: opts?.env || {},
      }),
    })
    const { processId } = await startResp.json()

    // 2. 订阅输出流
    const outputResp = await fetch(`${this.envdUrl}/process/subscribe`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.envdToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ processId }),
    })

    // 3. 流式读取输出
    const reader = outputResp.body.getReader()
    const decoder = new TextDecoder()
    let stdout = ''
    let stderr = ''
    let exitCode = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value)
      const lines = chunk.split('\n')

      for (const line of lines) {
        if (!line) continue
        const event = JSON.parse(line)

        if (event.type === 'stdout') {
          stdout += event.line + '\n'
        } else if (event.type === 'stderr') {
          stderr += event.line + '\n'
        } else if (event.type === 'exit') {
          exitCode = event.exitCode
        }
      }
    }

    return { stdout, stderr, exitCode }
  }

  // 读取文件
  async filesystem.read(path: string): Promise<string> {
    const resp = await fetch(`${this.envdUrl}/filesystem/read`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.envdToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path }),
    })
    const { content } = await resp.json()
    return atob(content)  // Base64 decode
  }

  // 写入文件
  async filesystem.write(path: string, content: string): Promise<void> {
    await fetch(`${this.envdUrl}/filesystem/write`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.envdToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path,
        content: btoa(content),  // Base64 encode
      }),
    })
  }
}

// 客户端入口
export class E2BClient {
  private apiKey: string
  private apiUrl: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
    this.apiUrl = 'https://api.e2b.dev/v1'
  }

  // 创建沙盒 (对应 L3.1-SEQ-001)
  async sandboxes.create(opts?: CreateSandboxOptions): Promise<Sandbox> {
    const resp = await fetch(`${this.apiUrl}/sandboxes`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        template_id: opts?.templateId || 'base',
        timeout_seconds: opts?.timeoutSeconds || 3600,
      }),
    })

    const data = await resp.json()
    return new Sandbox({
      sandboxId: data.sandbox_id,
      envdUrl: data.envd_url,
      envdToken: data.envd_access_token,
    })
  }

  // 删除沙盒 (对应 L3.1-SEQ-004)
  async sandboxes.delete(sandboxId: string): Promise<void> {
    await fetch(`${this.apiUrl}/sandboxes/${sandboxId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    })
  }
}
```

---

## 5. 模块依赖关系

### 5.1 依赖图 (E2B Official)

```mermaid
graph TD
    A[api] -->|gRPC| B[orchestrator]
    A -->|SQL| C[PostgreSQL]
    A -->|SQL| D[ClickHouse]
    A -->|Cache| E[Redis]

    B -->|Firecracker SDK| F[Firecracker]
    B -->|Storage| G[Template Store]

    F -->|VM| H[envd]

    I[sdk-js] -->|HTTP| A
    I -->|HTTP| H
    J[sdk-python] -->|HTTP| A
    J -->|HTTP| H

    K[Nomad] -->|Deploy| A
    K -->|Deploy| B

    style A fill:#4CAF50
    style B fill:#2196F3
    style H fill:#FF9800
```

### 5.2 依赖说明 (E2B Official)

| 模块 | 依赖 | 通信方式 | 说明 |
|------|------|----------|------|
| **api** | orchestrator | gRPC | 创建/删除沙盒 |
| **api** | PostgreSQL | database/sql | 持久化数据 |
| **api** | ClickHouse | clickhouse-go | 分析数据 |
| **api** | Redis | go-redis | 限流/缓存 |
| **orchestrator** | Firecracker | Go SDK | VM 管理 |
| **orchestrator** | Template Store | File System | 模板存储 |
| **envd** | (独立运行) | HTTP/gRPC | 沙盒内守护进程 |
| **sdk-js** | api + envd | HTTP | 客户端 SDK |
| **sdk-python** | api + envd | HTTP | 客户端 SDK |

**关键差异**:
- ❌ **无 Celery/Redis 队列** (直接 gRPC 同步调用)
- ❌ **无 K8s 依赖** (Nomad 部署)
- ✅ **orchestrator ↔ Firecracker** (核心交互)

---

## 6. 接口设计

### 6.1 gRPC 接口 (orchestrator.proto)

```protobuf
syntax = "proto3";

package orchestrator;

service OrchestratorService {
  // 创建沙盒
  rpc CreateSandbox(CreateSandboxRequest) returns (CreateSandboxResponse);

  // 删除沙盒
  rpc DeleteSandbox(DeleteSandboxRequest) returns (DeleteSandboxResponse);

  // 获取沙盒状态
  rpc GetSandboxStatus(GetSandboxStatusRequest) returns (GetSandboxStatusResponse);
}

message CreateSandboxRequest {
  string sandbox_id = 1;
  string team_id = 2;
  string template_id = 3;
  int64 vcpu = 4;
  int64 ram_mb = 5;
  string kernel_version = 6;
  string firecracker_version = 7;
  int32 timeout_seconds = 8;
  bool allow_internet_access = 9;
}

message CreateSandboxResponse {
  string sandbox_id = 1;
  string client_id = 2;
  string envd_url = 3;  // http://10.0.0.5:49983
}

message DeleteSandboxRequest {
  string sandbox_id = 1;
}

message DeleteSandboxResponse {}
```

### 6.2 Repository 接口 (Go)

```go
// internal/db/repository.go
package db

import (
    "context"
    "time"
)

// SandboxRepository 沙盒数据访问接口
type SandboxRepository interface {
    // 创建沙盒记录
    InsertSandbox(ctx context.Context, params InsertSandboxParams) (Sandbox, error)

    // 根据 sandbox_id 查询
    GetSandbox(ctx context.Context, sandboxID string) (Sandbox, error)

    // 更新状态
    UpdateSandboxStatus(ctx context.Context, params UpdateSandboxStatusParams) error

    // 查询超时沙盒 (BR-070)
    ListTimeoutSandboxes(ctx context.Context, cutoff time.Time) ([]Sandbox, error)

    // 软删除沙盒
    DeleteSandbox(ctx context.Context, sandboxID string) error
}

// TeamRepository team 数据访问接口
type TeamRepository interface {
    // 根据 API Key 查询 team
    GetTeamByAPIKey(ctx context.Context, apiKey string) (Team, error)

    // 查询 team 配额
    GetTeamQuota(ctx context.Context, teamID string) (Quota, error)
}
```

---

## 7. 部署结构

### 7.1 Nomad 部署 (E2B Official)

**源码参考**: `/tmp/infra/iac/provider-gcp/nomad/jobs/`

**api.hcl**:

```hcl
# iac/provider-gcp/nomad/jobs/api.hcl
job "api" {
  datacenters = ["us-west1-a"]
  type        = "service"

  group "api-service" {
    count = 3

    network {
      port "http" {
        static = 80
      }
    }

    task "start" {
      driver = "docker"

      config {
        image = "gcr.io/e2b-prod/api:${version}"
        ports = ["http"]
        args = ["--port", "80"]
      }

      env {
        ORCHESTRATOR_URL = "orchestrator.service.consul:4000"
        POSTGRES_CONNECTION_STRING = "${postgres_url}"
        CLICKHOUSE_CONNECTION_STRING = "${clickhouse_url}"
        REDIS_URL = "${redis_url}"
      }

      resources {
        cpu    = 2000  # 2 CPU cores
        memory = 4096  # 4 GB RAM
      }
    }

    service {
      name = "api"
      port = "http"

      check {
        type     = "http"
        path     = "/health"
        interval = "10s"
        timeout  = "2s"
      }
    }
  }
}
```

**orchestrator.hcl**:

```hcl
# iac/provider-gcp/nomad/jobs/orchestrator.hcl
job "orchestrator" {
  datacenters = ["us-west1-a"]
  type        = "system"  # 每个节点运行一个实例

  group "orchestrator-service" {
    network {
      port "grpc" {
        static = 4000
      }
    }

    task "start" {
      driver = "raw_exec"  # 直接执行二进制（需要访问 /dev/kvm）

      config {
        command = "/usr/local/bin/orchestrator"
        args = [
          "--port", "4000",
          "--template-store", "/opt/e2b/templates",
        ]
      }

      env {
        FIRECRACKER_BIN = "/usr/local/bin/firecracker"
        KERNEL_PATH = "/opt/e2b/kernels/vmlinux-5.10"
      }

      resources {
        cpu    = 4000   # 4 CPU cores
        memory = 8192   # 8 GB RAM
      }
    }

    service {
      name = "orchestrator"
      port = "grpc"

      check {
        type     = "grpc"
        interval = "10s"
        timeout  = "2s"
      }
    }
  }
}
```

### 7.2 Docker Compose (开发环境)

```yaml
version: '3.8'

services:
  api:
    build: ./packages/api
    ports:
      - "8080:80"
    environment:
      ORCHESTRATOR_URL: orchestrator:4000
      POSTGRES_CONNECTION_STRING: postgresql://postgres:password@postgres:5432/e2b
      CLICKHOUSE_CONNECTION_STRING: clickhouse://clickhouse:9000/e2b
      REDIS_URL: redis://redis:6379/0
    depends_on:
      - postgres
      - clickhouse
      - redis
      - orchestrator

  orchestrator:
    build: ./packages/orchestrator
    ports:
      - "4000:4000"
    privileged: true  # 需要访问 /dev/kvm
    volumes:
      - /var/run/firecracker:/var/run/firecracker
      - ./templates:/opt/e2b/templates
    environment:
      FIRECRACKER_BIN: /usr/local/bin/firecracker
      KERNEL_PATH: /opt/e2b/kernels/vmlinux-5.10

  postgres:
    image: supabase/postgres:15.1.0.117
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
      POSTGRES_DB: e2b
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  clickhouse:
    image: clickhouse/clickhouse-server:23.8
    ports:
      - "9000:9000"
      - "8123:8123"
    volumes:
      - clickhouse_data:/var/lib/clickhouse

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  clickhouse_data:
  redis_data:
```

---

## 附录

### A. 模块版本管理

| 模块 | 当前版本 | E2B Official | 发布计划 |
|------|----------|--------------|----------|
| api | v0.1.0 | ✅ v0.4.2 | 2025-12 |
| orchestrator | v0.1.0 | ✅ v0.4.2 | 2025-12 |
| envd | v0.1.0 | ✅ v0.4.2 | 2025-12 |
| sdk-js | v0.1.0 | ✅ v1.0.0 | 2026-01 |
| sdk-python | v0.1.0 | ✅ v1.0.0 | 2026-01 |

**源码参考**: `/tmp/infra/packages/envd/main.go:46` (Version = "0.4.2")

### B. 开发指南

**本地开发**:

```bash
# 1. 安装依赖
cd packages/api && go mod download
cd packages/orchestrator && go mod download
cd packages/envd && go mod download

# 2. 启动所有服务 (Docker Compose)
docker-compose up -d

# 3. 运行数据库迁移
cd packages/db && goose up
cd packages/clickhouse && goose up

# 4. 启动 API 服务 (开发模式)
cd packages/api && go run cmd/start/main.go

# 5. 启动 Orchestrator (需要 /dev/kvm)
cd packages/orchestrator && sudo go run cmd/start/main.go

# 6. 运行测试
go test ./...
```

### C. 与 v1.0 的关键差异

| Feature | v1.0 (Wrong) | v2.0 E2B (Correct) |
|---------|--------------|---------------------|
| API 语言 | ❌ Python/FastAPI | ✅ Go/Gin |
| Orchestrator | ❌ 不存在 | ✅ Go gRPC (核心) |
| Celery Worker | ❌ 存在 | ✅ 不存在 |
| Common 库 | ❌ Python 共享库 | ✅ 不存在 |
| 部署方式 | ❌ Kubernetes | ✅ Nomad |
| 虚拟化 | ❌ gVisor | ✅ Firecracker |
| 通信方式 | ❌ Celery 异步队列 | ✅ gRPC 同步调用 |

---

**文档完成**: L5 模块设计已完全对齐 E2B 官方架构
