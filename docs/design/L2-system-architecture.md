# L2: 系统架构文档

**文档版本**: v2.0 (E2B Official Stack)
**创建日期**: 2025-11-05
**最后更新**: 2025-11-05
**架构师**: System
**文档状态**: Production Ready
**前置文档**: [L1-产品需求文档](L1-product-requirements.md)
**技术栈基准**: E2B Official Infrastructure (github.com/e2b-dev/infra)

---

## 目录

1. [架构概述](#1-架构概述)
2. [架构原则](#2-架构原则)
3. [总体架构](#3-总体架构)
4. [分层架构](#4-分层架构)
5. [核心组件设计](#5-核心组件设计)
6. [部署架构](#6-部署架构)
7. [技术栈选型](#7-技术栈选型)
8. [关键技术决策](#8-关键技术决策)
9. [扩展性设计](#9-扩展性设计)
10. [安全架构](#10-安全架构)
11. [性能优化策略](#11-性能优化策略)
12. [可观测性架构](#12-可观测性架构)

---

## 1. 架构概述

### 1.1 架构目标

基于 **L1 产品需求** 和 **E2B官方实现**，系统架构需要满足：

| 需求来源 (L1) | 架构目标 | E2B实现方式 |
|--------------|---------|-------------|
| F1: 沙盒生命周期管理 | 高可用的控制平面 | Nomad Server Cluster (3节点) |
| F2: 代码执行引擎 | 低延迟的数据平面 | Firecracker microVM (125ms启动) |
| F3: E2B SDK 兼容 | REST API + gRPC 双协议 | TypeScript API + Go Orchestrator |
| NFR: 性能 < 2s 冷启动 | 极速虚拟化 | Firecracker (vs Docker 10x faster) |
| NFR: 并发 1000+ 沙盒 | 水平扩展架构 | Nomad Client自动扩缩容 |
| NFR: 安全隔离 | 硬件级虚拟化 | Firecracker + KVM (vs gVisor syscall) |

### 1.2 架构风格

- **分布式微服务架构**：控制平面和数据平面解耦
- **事件驱动架构**：异步任务处理（沙盒创建、暂停）
- **无状态设计**：API 服务可水平扩展
- **任务调度编排**：基于 **Nomad** 资源模型（替代Kubernetes）
- **服务发现**：基于 **Consul** 动态服务注册

---

## 2. 架构原则

### 2.1 设计原则

| 原则 | 描述 | 实现方式 |
|------|------|----------|
| **E2B 兼容优先** | API 100% 兼容 E2B | 严格遵循 E2B OpenAPI 规范 |
| **控制数据分离** | 管理和执行解耦 | 控制平面 (REST) + 数据平面 (gRPC) |
| **无状态服务** | 服务实例可随意替换 | 状态存储到 PostgreSQL/Redis |
| **失败快速** | 快速检测和恢复故障 | 健康检查 + 自动重启 |
| **渐进式增强** | 核心功能优先，增强功能可插拔 | 插件化架构 |

### 2.2 CAP 权衡

- **选择 AP (Availability + Partition Tolerance)**
- **理由**：沙盒创建是幂等操作，可接受短暂的不一致性
- **实现**：
  - 控制平面多副本部署（高可用）
  - 最终一致性（沙盒状态同步）
  - 客户端重试机制

---

## 3. 总体架构 (E2B Official Stack)

### 3.1 完整架构图

```
┌──────────────────────────────────────────────────────────────────────────┐
│                            客户端层 (Client Layer)                        │
├──────────────────────────────────────────────────────────────────────────┤
│  E2B TypeScript SDK  │  E2B Python SDK  │  REST API Client  │  E2B CLI   │
│  (100% Compatible - 直接使用E2B官方SDK，无需修改)                          │
└──────────────────────────────────────────────────────────────────────────┘
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                     Cloudflare (DNS + CDN + WAF)                         │
│  - 域名解析  - DDoS防护  - TLS终止  - 全球加速                            │
└──────────────────────────────────────────────────────────────────────────┘
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                      API集群 (TypeScript/Node.js)                         │
├──────────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  API Server (TypeScript - packages/api/)                          │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │  │
│  │  │ REST API     │  │ 认证/授权     │  │ 速率限制                  │ │  │
│  │  │ (Express)    │  │ (API Key/    │  │ (Redis Token Bucket)     │ │  │
│  │  │              │  │  Access Token)│  │                          │ │  │
│  │  └──────────────┘  └──────────────┘  └──────────────────────────┘ │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                           │ gRPC调用                                      │
│                           ▼                                               │
└──────────────────────────────────────────────────────────────────────────┘
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                   Nomad Cluster (HashiCorp Nomad)                         │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  ┌─────────────────────────────────┐   ┌─────────────────────────────┐  │
│  │   Nomad Server Cluster (3节点)  │   │   Consul (服务发现)          │  │
│  │   - Leader选举                  │◄──┤   - 健康检查                 │  │
│  │   - 任务调度                    │   │   - KV存储                   │  │
│  │   - 状态管理                    │   │   - DNS服务                  │  │
│  └─────────────────────────────────┘   └─────────────────────────────┘  │
│                    │                                                       │
│                    │ 调度                                                  │
│                    ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │              Nomad Client Nodes (自动扩缩容)                      │    │
│  ├──────────────────────────────────────────────────────────────────┤    │
│  │                                                                    │    │
│  │  ┌─────────────────────────────────────────────────────────────┐ │    │
│  │  │  Orchestrator Node Pool (packages/orchestrator/)            │ │    │
│  │  │  ┌─────────────────────────────────────────────────────────┐│ │    │
│  │  │  │  Orchestrator Service (Go gRPC Server)                 ││ │    │
│  │  │  │  ┌──────────────────────────────────────────────────┐  ││ │    │
│  │  │  │  │  Firecracker Manager                             │  ││ │    │
│  │  │  │  │  - 启动/停止 microVM                              │  ││ │    │
│  │  │  │  │  - CRIU 快照 (暂停/恢复)                          │  ││ │    │
│  │  │  │  │  - 网络配置 (tap设备)                             │  ││ │    │
│  │  │  │  │  - 存储管理 (块设备)                              │  ││ │    │
│  │  │  │  └──────────────────────────────────────────────────┘  ││ │    │
│  │  │  │  │                                                       ││ │    │
│  │  │  │  ▼ 管理多个Firecracker microVM                          ││ │    │
│  │  │  │  ┌─────────────────────────────────────────────────┐   ││ │    │
│  │  │  │  │  Firecracker microVM 1 (Sandbox)                │   ││ │    │
│  │  │  │  │  ┌────────────────────────────────────────────┐ │   ││ │    │
│  │  │  │  │  │  Guest Kernel (vmlinux-5.10)              │ │   ││ │    │
│  │  │  │  │  │  Rootfs (ext4镜像 - 模板)                  │ │   ││ │    │
│  │  │  │  │  │  ┌──────────────────────────────────────┐ │ │   ││ │    │
│  │  │  │  │  │  │  envd (Go Daemon)                    │ │ │   ││ │    │
│  │  │  │  │  │  │  - Listen :49983 (gRPC)              │ │ │   ││ │    │
│  │  │  │  │  │  │  - ProcessService                    │ │ │   ││ │    │
│  │  │  │  │  │  │  - FilesystemService                 │ │ │   ││ │    │
│  │  │  │  │  │  └──────────────────────────────────────┘ │ │   ││ │    │
│  │  │  │  │  │  ┌──────────────────────────────────────┐ │ │   ││ │    │
│  │  │  │  │  │  │  User Workspace (/workspace)         │ │ │   ││ │    │
│  │  │  │  │  │  │  - Python/Node.js/Go runtime         │ │ │   ││ │    │
│  │  │  │  │  │  │  - 用户代码和依赖                     │ │ │   ││ │    │
│  │  │  │  │  │  └──────────────────────────────────────┘ │ │   ││ │    │
│  │  │  │  │  └────────────────────────────────────────────┘ │   ││ │    │
│  │  │  │  │                                                 │   ││ │    │
│  │  │  │  │  Firecracker microVM 2, 3, ... N (多个沙盒)    │   ││ │    │
│  │  │  │  └─────────────────────────────────────────────────┘   ││ │    │
│  │  │  └─────────────────────────────────────────────────────────┘│ │    │
│  │  └─────────────────────────────────────────────────────────────┘ │    │
│  │                                                                    │    │
│  │  ┌─────────────────────────────────────────────────────────────┐ │    │
│  │  │  Build Node Pool (packages/template-manager/)               │ │    │
│  │  │  - 构建Firecracker rootfs镜像                               │ │    │
│  │  │  - 编译自定义kernel (可选)                                   │ │    │
│  │  │  - Docker镜像 → ext4转换                                     │ │    │
│  │  └─────────────────────────────────────────────────────────────┘ │    │
│  │                                                                    │    │
│  │  ┌─────────────────────────────────────────────────────────────┐ │    │
│  │  │  ClickHouse Node Pool (packages/clickhouse/)                │ │    │
│  │  │  - 事件存储 (sandbox_events)                                │ │    │
│  │  │  - 指标存储 (metrics)                                        │ │    │
│  │  │  - 日志存储 (logs)                                           │ │    │
│  │  └─────────────────────────────────────────────────────────────┘ │    │
│  └──────────────────────────────────────────────────────────────────┘    │
│                                                                            │
└──────────────────────────────────────────────────────────────────────────┘
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         数据存储层 (Data Layer)                           │
├──────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  │
│  │ PostgreSQL   │  │ ClickHouse   │  │ Redis        │  │ GCS Bucket  │  │
│  │ (Supabase)   │  │ Cluster      │  │ Cluster      │  │             │  │
│  │              │  │              │  │              │  │             │  │
│  │ - users      │  │ - events     │  │ - sessions   │  │ - snapshots │  │
│  │ - teams      │  │ - metrics    │  │ - rate_limit │  │ - kernels   │  │
│  │ - api_keys   │  │ - logs       │  │ - cache      │  │ - rootfs    │  │
│  │ - sandboxes  │  │              │  │ - job_queue  │  │ - templates │  │
│  │ - templates  │  │              │  │              │  │             │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                      监控/日志/追踪层 (Observability)                     │
├──────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  │
│  │ Grafana      │  │ Loki         │  │ OTEL         │  │ Posthog     │  │
│  │ Cloud        │  │ (Logs)       │  │ Collector    │  │ (Analytics) │  │
│  │ (Dashboards) │  │              │  │              │  │             │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                  基础设施层 (Infrastructure Layer)                        │
├──────────────────────────────────────────────────────────────────────────┤
│  - Google Cloud Platform (GCP) - 主要云服务商                             │
│  - KVM (Kernel-based Virtual Machine) - Firecracker依赖                  │
│  - Linux Kernel 4.14+ - 宿主机系统                                        │
│  - Terraform - 基础设施即代码                                             │
│  - Packer - 镜像构建                                                      │
└──────────────────────────────────────────────────────────────────────────┘
```

### 3.2 核心技术栈总结

| 层级 | E2B官方技术 | 说明 |
|------|-----------|------|
| **客户端SDK** | E2B SDK (TypeScript/Python v2.6.2) | 100%兼容，直接使用 |
| **API层** | TypeScript (Express/Node.js) | REST API网关 |
| **编排层** | **Nomad** (替代Kubernetes) | 轻量级调度，专为批处理优化 |
| **服务发现** | **Consul** | 动态服务注册和健康检查 |
| **核心服务** | **Go** (packages/orchestrator) | 高性能gRPC服务 |
| **虚拟化** | **Firecracker** microVM (替代gVisor) | 125ms启动，5MB开销 |
| **快照** | **CRIU** | 进程级检查点/恢复 |
| **OLTP数据库** | PostgreSQL (Supabase) | 事务型数据 |
| **OLAP数据库** | **ClickHouse** (替代TimescaleDB) | 分析型数据，10-100x查询速度 |
| **缓存/队列** | Redis | 会话、限流、任务队列 |
| **对象存储** | GCS (Google Cloud Storage) | 快照、内核、rootfs |
| **基础设施** | **Terraform + Packer** | IaC自动化 |
| **监控日志** | Loki + Grafana + OTEL + Posthog | 完整可观测性 |

### 3.3 核心数据流 (基于E2B架构)

#### 3.3.1 沙盒创建流程

```
1. Client SDK (E2B SDK)
   ↓ POST /sandboxes {templateID: "python-3.11"}
2. API Server (TypeScript)
   ↓ 认证 (API Key) + 速率限制 (Redis)
3. Orchestrator (Go gRPC)
   ↓ 调用 CreateSandbox RPC
4. Firecracker Manager
   ├─ 从GCS下载rootfs镜像
   ├─ 配置microVM (CPU, Memory, Network)
   ├─ 创建tap设备 (网络)
   ├─ 挂载块设备 (存储)
   └─ 启动Firecracker microVM (125ms)
5. 等待envd就绪
   ├─ envd在VM内启动 (systemd)
   ├─ Listen on :49983 (gRPC)
   └─ 健康检查通过
6. 存储元数据
   ├─ PostgreSQL: sandbox记录
   └─ ClickHouse: sandbox_created事件
7. 返回给客户端
   └─ {sandboxID, domain, envdAccessToken}

时间线：
- API认证: ~10ms
- Firecracker启动: ~125ms
- envd就绪: ~50ms
- 总计: ~200ms (vs K8s+gVisor ~2000ms, 快10倍！)
```

#### 3.3.2 代码执行流程 (gRPC Streaming)

```
1. Client SDK
   ↓ 调用 sandbox.commands.run('python script.py')
2. SDK → envd (gRPC)
   ↓ Process.Start(cmd="python", args=["script.py"])
3. envd (VM内)
   ├─ 启动进程 (exec)
   ├─ 设置资源限制 (cgroup v2)
   └─ 开启流式输出
4. 实时流式返回
   ↓ stream StartResponse {
       started: {pid: 1234},
       output: {type: STDOUT, data: "..."},
       output: {type: STDERR, data: "..."},
       exited: {exit_code: 0}
     }
5. 记录审计
   └─ ClickHouse: command_executed事件

特点：
- gRPC双向流 (实时输出)
- 无需轮询 (vs REST API)
- 低延迟 (<10ms)
```

#### 3.3.3 沙盒暂停流程 (CRIU Snapshot)

```
1. Client SDK
   ↓ POST /sandboxes/{id}/pause
2. API Server (TypeScript)
   ↓ gRPC调用
3. Orchestrator (Go)
   ↓ 调用 Firecracker CRIU
4. CRIU Checkpoint
   ├─ 暂停所有进程
   ├─ 保存内存状态 (snapshot)
   ├─ 保存网络状态
   └─ 保存文件系统状态
5. 上传快照到GCS
   ├─ 压缩 (zstd)
   ├─ 上传到 gs://bucket/snapshots/{sandbox_id}/
   └─ 保存元数据 (PostgreSQL)
6. 停止Firecracker VM
   └─ 释放资源 (CPU, Memory)
7. 更新状态
   ├─ PostgreSQL: state = 'paused'
   └─ ClickHouse: sandbox_paused事件
8. 返回 204 No Content

恢复流程 (Resume):
1. 从GCS下载快照
2. Firecracker加载快照
3. CRIU恢复所有进程
4. 时间：~500ms (vs 重新创建 ~2s)
```

#### 3.3.4 沙盒删除流程

```
1. Client SDK
   ↓ DELETE /sandboxes/{id}
2. API Server
   ↓ gRPC调用
3. Orchestrator
   ├─ 停止Firecracker VM (SIGTERM)
   ├─ 等待优雅退出 (5s超时)
   ├─ 强制停止 (SIGKILL if needed)
   └─ 清理网络资源 (tap设备)
4. 清理存储
   ├─ 删除rootfs副本 (如果有)
   └─ 删除快照 (如果有)
5. 更新数据库
   ├─ PostgreSQL: 软删除 (deleted_at)
   └─ ClickHouse: sandbox_deleted事件
6. 返回 204 No Content
```

---

## 4. 分层架构 (E2B Official Stack)

### 4.1 分层模型

```
┌────────────────────────────────────────────────┐
│  L1: API Gateway Layer (API 网关层)            │
│  - TypeScript Express REST API                │
│  - OpenAPI Schema (E2B Compatible)            │
│  - Request/Response Validation                │
│  - Authentication & Rate Limiting             │
└────────────────────────────────────────────────┘
                    ▼ HTTP/gRPC
┌────────────────────────────────────────────────┐
│  L2: Orchestration Layer (编排层)              │
│  - Go gRPC Server (packages/orchestrator/)    │
│  - Sandbox Lifecycle Management               │
│  - Firecracker Manager                        │
│  - CRIU Snapshot Manager                      │
│  - Resource Scheduler (via Nomad API)         │
└────────────────────────────────────────────────┘
                    ▼ Nomad Job API
┌────────────────────────────────────────────────┐
│  L3: Scheduling Layer (调度层)                 │
│  - Nomad Server Cluster                       │
│  - Job Scheduling & Placement                 │
│  - Resource Allocation                        │
│  - Health Monitoring (via Consul)             │
└────────────────────────────────────────────────┘
                    ▼ Task Allocation
┌────────────────────────────────────────────────┐
│  L4: Virtualization Layer (虚拟化层)           │
│  - Firecracker microVM                        │
│  - envd Daemon (gRPC Server in Guest)         │
│  - Process Management (ProcessService)        │
│  - Filesystem Management (FilesystemService)  │
└────────────────────────────────────────────────┘
                    ▼
┌────────────────────────────────────────────────┐
│  L5: Data Layer (数据层)                       │
│  - PostgreSQL (OLTP - users, sandboxes)       │
│  - ClickHouse (OLAP - events, metrics, logs)  │
│  - Redis (Cache, Rate Limit, Sessions)        │
│  - GCS (Snapshots, Kernels, Rootfs)           │
└────────────────────────────────────────────────┘
```

### 4.2 层间通信协议

| 层级通信 | 协议 | 说明 |
|---------|------|------|
| **Client SDK ↔ API Gateway** | REST (HTTP/1.1 + HTTP/2) | E2B SDK标准接口 |
| **API Gateway ↔ Orchestrator** | gRPC | 高性能RPC |
| **Orchestrator ↔ Nomad** | HTTP (Nomad API) | 任务调度 |
| **Orchestrator ↔ envd** | gRPC | 直接通信 (通过tap网络) |
| **Client SDK ↔ envd** | gRPC (Connect Protocol) | 数据平面直连 |
| **Services ↔ Consul** | HTTP (Consul API) | 服务发现 |

### 4.3 依赖关系

- **上层依赖下层**：API网关 → 编排层 → 调度层 → 虚拟化层 → 数据层
- **接口隔离**：各层通过gRPC/REST接口通信，便于测试和替换
- **服务发现**：所有服务通过 Consul 动态注册和发现
- **无状态设计**：API Gateway 和 Orchestrator 均可水平扩展

---

## 5. 核心组件设计 (E2B Official Stack)

### 5.1 API 网关层组件

#### 5.1.1 API Server (TypeScript/Express)

**职责**：
- 接收 REST API 请求 (E2B SDK compatible)
- 双重认证：API Key (控制平面) + Access Token (数据平面)
- 请求参数校验和序列化
- 速率限制 (Token Bucket 算法 via Redis)
- 调用 Orchestrator gRPC 服务
- 返回标准化 HTTP 响应

**技术选型**：
- **框架**: Express.js (Node.js 20+)
- **代码位置**: `packages/api/`
- **数据验证**: Zod (TypeScript schema validation)
- **ORM**: Prisma (PostgreSQL)
- **HTTP客户端**: node-fetch / axios

**关键路由**：
```typescript
// packages/api/src/routes/sandboxes.ts
router.post('/sandboxes', async (req, res) => {
  // 1. 验证 API Key (X-API-Key header)
  // 2. 速率限制检查 (Redis)
  // 3. 调用 Orchestrator.CreateSandbox (gRPC)
  // 4. 返回 SandboxResponse {sandboxID, domain, envdAccessToken}
})

router.get('/sandboxes/:id', async (req, res) => {
  // 1. 从 PostgreSQL 查询 sandbox 元数据
  // 2. 可选：从 Orchestrator 查询实时状态
})

router.post('/sandboxes/:id/pause', async (req, res) => {
  // 1. 调用 Orchestrator.PauseSandbox (gRPC)
  // 2. 等待 CRIU snapshot 完成
})

router.delete('/sandboxes/:id', async (req, res) => {
  // 1. 调用 Orchestrator.DeleteSandbox (gRPC)
  // 2. 更新 PostgreSQL (soft delete)
})
```

**认证流程**：
```typescript
// 双重认证机制
interface AuthContext {
  // 控制平面认证 (API → Orchestrator)
  apiKey: string           // X-API-Key header

  // 数据平面认证 (SDK → envd)
  envdAccessToken: string  // JWT token, 包含 sandbox_id
}

// API Key 验证
async function authenticateAPIKey(apiKey: string): Promise<User> {
  const key = await prisma.apiKey.findUnique({
    where: { key: apiKey, revoked: false },
    include: { user: true }
  })
  if (!key || key.expiresAt < new Date()) {
    throw new AuthenticationError()
  }
  return key.user
}

// envd Access Token 生成 (JWT)
function generateEnvdToken(sandboxID: string): string {
  return jwt.sign(
    { sandbox_id: sandboxID },
    process.env.ENVD_JWT_SECRET,
    { expiresIn: '24h', algorithm: 'HS256' }
  )
}
```

**速率限制**：
```typescript
// Token Bucket 算法 (Redis)
async function rateLimitCheck(userID: string, tier: 'hobby' | 'pro' | 'enterprise'): Promise<void> {
  const limits = {
    hobby: { rps: 10, burst: 20 },
    pro: { rps: 100, burst: 200 },
    enterprise: { rps: 1000, burst: 2000 }
  }

  const key = `rate_limit:${userID}`
  const current = await redis.incr(key)
  if (current === 1) {
    await redis.expire(key, 1) // 1秒窗口
  }

  if (current > limits[tier].rps) {
    throw new RateLimitError({ retryAfter: 1 })
  }
}
```

**扩展性**：
- 无状态设计，支持水平扩展
- 通过 Cloudflare Load Balancer 负载均衡
- 目标：单实例处理 5000 req/s

---

#### 5.1.2 gRPC Client (API → Orchestrator)

**职责**：
- 维护与 Orchestrator 的 gRPC 连接池
- 处理 gRPC 错误和重试
- 服务发现 (via Consul)

**技术选型**：
- **库**: @grpc/grpc-js (Node.js native gRPC)
- **负载均衡**: Round-robin (via Consul DNS)

**连接配置**：
```typescript
import * as grpc from '@grpc/grpc-js'
import { OrchestratorClient } from './generated/orchestrator_grpc_pb'

const client = new OrchestratorClient(
  'orchestrator.service.consul:50051', // Consul DNS
  grpc.credentials.createInsecure(),   // 内网通信，无需TLS
  {
    'grpc.keepalive_time_ms': 50000,
    'grpc.keepalive_timeout_ms': 10000,
    'grpc.max_receive_message_length': 100 * 1024 * 1024, // 100MB
  }
)
```

---

### 5.2 编排层组件

#### 5.2.1 Orchestrator (Go gRPC Server)

**职责**：
- 核心编排逻辑（沙盒生命周期管理）
- Firecracker microVM 管理
- CRIU 快照管理
- Nomad 任务调度
- envd 健康检查和连接管理

**技术选型**：
- **语言**: Go 1.21+
- **代码位置**: `packages/orchestrator/`
- **RPC 框架**: gRPC (google.golang.org/grpc)
- **协议**: Protocol Buffers v3

**gRPC 服务定义**：
```protobuf
service Orchestrator {
  // 沙盒管理
  rpc CreateSandbox(CreateSandboxRequest) returns (CreateSandboxResponse);
  rpc GetSandbox(GetSandboxRequest) returns (GetSandboxResponse);
  rpc PauseSandbox(PauseSandboxRequest) returns (PauseSandboxResponse);
  rpc ResumeSandbox(ResumeSandboxRequest) returns (ResumeSandboxResponse);
  rpc DeleteSandbox(DeleteSandboxRequest) returns (DeleteSandboxResponse);

  // 健康检查
  rpc HealthCheck(HealthCheckRequest) returns (HealthCheckResponse);
}

message CreateSandboxRequest {
  string template_id = 1;
  map<string, string> envs = 2;
  map<string, string> metadata = 3;
  ResourceSpec resources = 4;
}

message CreateSandboxResponse {
  string sandbox_id = 1;
  string ip_address = 2;      // Firecracker VM IP
  string envd_endpoint = 3;   // e.g., "10.0.1.5:49983"
  SandboxStatus status = 4;
}
```

**Orchestrator 架构**：
```go
// packages/orchestrator/internal/orchestrator.go
type Orchestrator struct {
    firecrackerMgr *firecracker.Manager
    criuMgr        *criu.Manager
    nomadClient    *nomad.Client
    consulClient   *consul.Client
    gcsClient      *storage.Client
    db             *sql.DB
    clickhouse     *clickhouse.Conn
}

func (o *Orchestrator) CreateSandbox(ctx context.Context, req *pb.CreateSandboxRequest) (*pb.CreateSandboxResponse, error) {
    // 1. 生成 sandbox_id
    sandboxID := uuid.New().String()

    // 2. 从 GCS 下载 rootfs 镜像
    rootfsPath, err := o.gcsClient.DownloadTemplate(req.TemplateId)

    // 3. 启动 Firecracker microVM
    vmConfig := &firecracker.Config{
        VCPU:       2,
        MemSizeMib: 4096,
        RootDrive:  rootfsPath,
        NetworkTap: fmt.Sprintf("tap-%s", sandboxID),
    }
    vm, err := o.firecrackerMgr.StartVM(ctx, sandboxID, vmConfig)

    // 4. 等待 envd 就绪 (健康检查)
    envdEndpoint := fmt.Sprintf("%s:49983", vm.IPAddress)
    err = o.waitForEnvd(ctx, envdEndpoint, 30*time.Second)

    // 5. 存储元数据
    err = o.db.Exec(`INSERT INTO sandboxes (id, template_id, ip_address, status) VALUES (?, ?, ?, ?)`,
        sandboxID, req.TemplateId, vm.IPAddress, "running")

    // 6. 记录事件到 ClickHouse
    err = o.clickhouse.Exec(`INSERT INTO sandbox_events (sandbox_id, event_type, timestamp) VALUES (?, ?, ?)`,
        sandboxID, "created", time.Now())

    return &pb.CreateSandboxResponse{
        SandboxId:    sandboxID,
        IpAddress:    vm.IPAddress,
        EnvdEndpoint: envdEndpoint,
        Status:       pb.SandboxStatus_RUNNING,
    }, nil
}
```

**性能目标**：
- 沙盒创建延迟 < 200ms
- 单实例管理 500+ 并发沙盒
- gRPC 吞吐量 > 5000 req/s

---

#### 5.2.2 Firecracker Manager (Go)

**职责**：
- Firecracker microVM 生命周期管理
- 网络配置（tap 设备创建/销毁）
- 存储配置（块设备挂载）
- 资源限制（CPU/Memory）

**技术选型**：
- **库**: firecracker-go-sdk (github.com/firecracker-microvm/firecracker-go-sdk)
- **Firecracker版本**: v1.5+

**实现**：
```go
// packages/orchestrator/internal/firecracker/manager.go
type Manager struct {
    firecrackerBin string
    kernelPath     string
    tapManager     *TapManager
}

func (m *Manager) StartVM(ctx context.Context, sandboxID string, config *Config) (*VM, error) {
    // 1. 创建 tap 网络设备
    tapDevice, err := m.tapManager.CreateTap(sandboxID)

    // 2. 配置 Firecracker
    fcConfig := firecracker.Config{
        SocketPath:      fmt.Sprintf("/var/run/firecracker-%s.sock", sandboxID),
        KernelImagePath: m.kernelPath,
        KernelArgs:      "console=ttyS0 reboot=k panic=1 pci=off",
        Drives: []firecracker.Drive{{
            DriveID:      "rootfs",
            PathOnHost:   config.RootDrive,
            IsRootDevice: true,
            IsReadOnly:   false,
        }},
        NetworkInterfaces: []firecracker.NetworkInterface{{
            StaticConfiguration: &firecracker.StaticNetworkConfiguration{
                MacAddress:  generateMAC(sandboxID),
                HostDevName: tapDevice.Name,
                IPAddr:      net.ParseIP(tapDevice.GuestIP),
            },
        }},
        MachineCfg: firecracker.MachineConfiguration{
            VcpuCount:  config.VCPU,
            MemSizeMib: config.MemSizeMib,
        },
    }

    // 3. 启动 Firecracker
    machine, err := firecracker.NewMachine(ctx, fcConfig)
    err = machine.Start(ctx)

    // 4. 等待 VM 启动完成
    err = m.waitForBoot(ctx, tapDevice.GuestIP, 10*time.Second)

    return &VM{
        ID:        sandboxID,
        IPAddress: tapDevice.GuestIP,
        Machine:   machine,
    }, nil
}

func (m *Manager) StopVM(ctx context.Context, sandboxID string) error {
    // 1. 发送 SIGTERM 给 Firecracker
    // 2. 等待优雅退出 (5s 超时)
    // 3. 必要时发送 SIGKILL
    // 4. 清理 tap 设备
    // 5. 清理 socket 文件
}
```

---

#### 5.2.3 CRIU Manager (Go)

**职责**：
- 执行 CRIU checkpoint (暂停)
- 执行 CRIU restore (恢复)
- 快照上传/下载 (GCS)
- 快照元数据管理

**技术选型**：
- **CRIU**: v3.17+
- **压缩**: zstd (高压缩比 + 快速)

**实现**：
```go
// packages/orchestrator/internal/criu/manager.go
type Manager struct {
    criuBin    string
    gcsClient  *storage.Client
    bucketName string
}

func (m *Manager) Checkpoint(ctx context.Context, sandboxID string, vmPID int) (*Snapshot, error) {
    // 1. 创建临时目录
    checkpointDir := fmt.Sprintf("/tmp/criu-%s", sandboxID)
    os.MkdirAll(checkpointDir, 0755)

    // 2. 执行 CRIU dump
    cmd := exec.CommandContext(ctx, m.criuBin,
        "dump",
        "--tree", fmt.Sprintf("%d", vmPID),
        "--images-dir", checkpointDir,
        "--shell-job",
        "--tcp-established",
        "--file-locks",
    )
    err := cmd.Run()

    // 3. 压缩快照 (zstd)
    tarPath := fmt.Sprintf("%s.tar.zst", checkpointDir)
    err = compressZstd(checkpointDir, tarPath)

    // 4. 上传到 GCS
    objectName := fmt.Sprintf("snapshots/%s/checkpoint.tar.zst", sandboxID)
    err = m.gcsClient.UploadFile(ctx, m.bucketName, objectName, tarPath)

    // 5. 清理临时文件
    os.RemoveAll(checkpointDir)
    os.Remove(tarPath)

    return &Snapshot{
        SandboxID: sandboxID,
        GCSPath:   objectName,
        Size:      fileSize(tarPath),
    }, nil
}

func (m *Manager) Restore(ctx context.Context, sandboxID string) error {
    // 1. 从 GCS 下载快照
    // 2. 解压快照
    // 3. 执行 CRIU restore
    // 4. 清理临时文件
}
```

---

### 5.3 数据平面组件

#### 5.3.1 envd Daemon (Go - 运行在 Firecracker VM 内)

**职责**：
- 运行在每个沙盒 Firecracker VM 内
- 提供 gRPC 接口（Process + Filesystem 服务）
- 进程管理（启动/停止/信号/输出流）
- 文件系统操作（CRUD/Watch）
- 健康检查

**技术选型**：
- **语言**: Go 1.21+
- **代码位置**: `packages/envd/` (编译后注入到 rootfs 镜像)
- **RPC 框架**: Connect (connectrpc.com/connect)
- **协议**: Protocol Buffers v3

**服务定义** (详见 L4.1 API 规范)：
```protobuf
service Process {
  rpc List(ListRequest) returns (ListResponse);
  rpc Start(StartRequest) returns (stream StartResponse);  // 流式返回输出
  rpc Connect(ConnectRequest) returns (stream ConnectResponse);
  rpc SendInput(SendInputRequest) returns (SendInputResponse);
  rpc SendSignal(SendSignalRequest) returns (SendSignalResponse);
  rpc Update(UpdateRequest) returns (UpdateResponse);
}

service Filesystem {
  rpc Stat(StatRequest) returns (StatResponse);
  rpc ListDir(ListDirRequest) returns (ListDirResponse);
  rpc MakeDir(MakeDirRequest) returns (MakeDirResponse);
  rpc Move(MoveRequest) returns (MoveResponse);
  rpc Remove(RemoveRequest) returns (RemoveResponse);
  rpc WatchDir(WatchDirRequest) returns (stream WatchDirResponse);  // 流式文件变更
  rpc CreateWatcher(CreateWatcherRequest) returns (CreateWatcherResponse);
  rpc GetWatcherEvents(GetWatcherEventsRequest) returns (GetWatcherEventsResponse);
  rpc RemoveWatcher(RemoveWatcherRequest) returns (RemoveWatcherResponse);
}
```

**启动流程**：
```go
// packages/envd/main.go
func main() {
    // 1. 监听 :49983 端口
    lis, err := net.Listen("tcp", ":49983")

    // 2. 创建 gRPC 服务器
    grpcServer := grpc.NewServer(
        grpc.KeepaliveParams(keepalive.ServerParameters{
            Time:    50 * time.Second,
            Timeout: 10 * time.Second,
        }),
    )

    // 3. 注册服务
    pb.RegisterProcessServer(grpcServer, &ProcessService{})
    pb.RegisterFilesystemServer(grpcServer, &FilesystemService{})

    // 4. 启动服务
    log.Println("envd listening on :49983")
    grpcServer.Serve(lis)
}
```

**性能目标**：
- 进程启动延迟 < 50ms
- 输出流延迟 < 10ms (gRPC streaming)
- 内存占用 < 20MB
- 单沙盒支持 100+ 并发进程

---

### 5.4 存储组件

#### 5.4.1 PostgreSQL (OLTP - 元数据存储)

**存储内容**：
- 用户和团队 (users, teams)
- API Keys (api_keys)
- 沙盒元数据 (sandboxes)
- 模板元数据 (templates)

**表结构** (详见 L3.2 数据库设计)：
- `users` - 用户账户
- `teams` - 团队和组织
- `api_keys` - API 认证密钥
- `sandboxes` - 沙盒元数据 (id, status, template_id, ip_address, created_at, etc.)
- `templates` - 模板定义 (id, name, rootfs_url, kernel_url, etc.)

**高可用方案**：
- **托管服务**: Supabase (基于 PostgreSQL 15+)
- 自动备份和故障转移
- 连接池：PgBouncer

---

#### 5.4.2 ClickHouse (OLAP - 分析型数据)

**存储内容**：
- 沙盒事件 (sandbox_events)
- 性能指标 (metrics)
- 操作日志 (logs)

**表结构** (详见 L3.2 数据库设计)：
```sql
CREATE TABLE sandbox_events (
    sandbox_id String,
    event_type Enum('created', 'paused', 'resumed', 'deleted'),
    timestamp DateTime64(3),
    metadata String,  -- JSON
    INDEX idx_sandbox_id sandbox_id TYPE bloom_filter GRANULARITY 1
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (sandbox_id, timestamp);

CREATE TABLE metrics (
    sandbox_id String,
    metric_name String,
    value Float64,
    timestamp DateTime64(3)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (sandbox_id, metric_name, timestamp);
```

**高可用方案**：
- ClickHouse Cluster (3 节点)
- 复制因子：2

---

#### 5.4.3 Redis (缓存和速率限制)

**用途**：
- 速率限制 (Token Bucket 计数器)
- 会话缓存 (API Key → User 映射)
- 分布式锁 (防止重复创建沙盒)

**数据结构**：
```
rate_limit:{user_id}            → String (当前计数)
session:{api_key}               → Hash (用户信息缓存)
lock:sandbox:{id}:create        → String (分布式锁)
```

**高可用方案**：
- Redis Cluster (6 节点：3 主 + 3 从)
- 持久化：RDB + AOF

---

#### 5.4.4 GCS (Google Cloud Storage - 对象存储)

**用途**：
- CRIU 快照存储
- Firecracker kernel 镜像 (vmlinux)
- Firecracker rootfs 镜像 (ext4)
- 模板构建产物

**目录结构**：
```
gs://adnegator-storage/
  snapshots/
    {sandbox_id}/
      checkpoint.tar.zst
  kernels/
    vmlinux-5.10.0
    vmlinux-6.1.0
  rootfs/
    {template_id}/
      rootfs.ext4
  templates/
    python-3.11/
      Dockerfile
      build.sh
```

---

## 6. 部署架构 (Nomad + Terraform + GCP)

### 6.1 完整部署拓扑

```
┌──────────────────────────────────────────────────────────────────────┐
│                      Google Cloud Platform (GCP)                     │
├──────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │  Cloudflare (Edge Layer)                                        │ │
│  │  - DNS: adnegator.com → GCP Load Balancer                       │ │
│  │  - CDN + DDoS Protection                                        │ │
│  │  - TLS Termination                                              │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                            ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │  GCP Load Balancer (Global HTTPS LB)                            │ │
│  │  - Backend: API Server instances                                │ │
│  │  - Health Check: /health                                        │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                            ▼                                          │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  API Server Node Pool (TypeScript/Node.js)                   │   │
│  │  - GCE Instance Group: n1-standard-4 × 3                     │   │
│  │  - Auto-scaling: 3-10 instances                              │   │
│  │  - Nomad Job: "api-server.nomad"                             │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                            ▼ gRPC                                    │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Nomad Server Cluster (Control Plane)                       │   │
│  │  ┌────────────────────────────────────────────────────────┐ │   │
│  │  │  Nomad Server × 3 (n1-standard-2)                      │ │   │
│  │  │  - us-central1-a, us-central1-b, us-central1-c         │ │   │
│  │  │  - Raft consensus (Leader election)                    │ │   │
│  │  │  - Job scheduling & placement                          │ │   │
│  │  └────────────────────────────────────────────────────────┘ │   │
│  │  ┌────────────────────────────────────────────────────────┐ │   │
│  │  │  Consul Server × 3 (n1-standard-2)                     │ │   │
│  │  │  - Service discovery & health checks                   │ │   │
│  │  │  - KV store for config                                 │ │   │
│  │  │  - DNS: *.service.consul                               │ │   │
│  │  └────────────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                            ▼ Task Allocation                         │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Nomad Client Pool (Orchestrator + Firecracker)             │   │
│  │  ┌────────────────────────────────────────────────────────┐ │   │
│  │  │  Orchestrator Nodes (n1-highmem-16)                    │ │   │
│  │  │  - 16 vCPU, 104 GB RAM, 1TB SSD                        │ │   │
│  │  │  - KVM enabled (nested virtualization)                 │ │   │
│  │  │  - Auto-scaling: 5-50 nodes                            │ │   │
│  │  │  - Nomad Job: "orchestrator.nomad"                     │ │   │
│  │  │  - 每节点运行 1 个 Orchestrator 实例                    │ │   │
│  │  │  - 每节点运行 100+ Firecracker microVMs                │ │   │
│  │  └────────────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Data Layer                                                  │   │
│  │  ┌────────────────┐  ┌────────────────┐  ┌───────────────┐ │   │
│  │  │ Supabase       │  │ ClickHouse     │  │ Redis Cluster │ │   │
│  │  │ (PostgreSQL)   │  │ Cluster        │  │ (6 nodes)     │ │   │
│  │  │ - Hosted       │  │ - 3 × n1-highmem│  │ - n1-standard-4│ │   │
│  │  │ - Multi-region │  │   -8 instances  │  │ - 3 master    │ │   │
│  │  └────────────────┘  └────────────────┘  │ - 3 replica   │ │   │
│  │                                            └───────────────┘ │   │
│  │  ┌──────────────────────────────────────────────────────┐   │   │
│  │  │ GCS Buckets                                          │   │   │
│  │  │ - adnegator-snapshots (Multi-region, Standard)       │   │   │
│  │  │ - adnegator-templates (Regional, Nearline)           │   │   │
│  │  │ - adnegator-logs (Regional, Archive)                 │   │   │
│  │  └──────────────────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Observability Stack                                         │   │
│  │  - Loki (logs): 3 × n1-standard-4                            │   │
│  │  - Grafana Cloud (dashboards)                                │   │
│  │  - OTEL Collector: sidecar on each node                     │   │
│  │  - Posthog (analytics): Hosted SaaS                          │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                        │
└──────────────────────────────────────────────────────────────────────┘
```

### 6.2 Nomad Job 定义

#### 6.2.1 API Server Job

```hcl
# nomad/jobs/api-server.nomad
job "api-server" {
  datacenters = ["us-central1"]
  type        = "service"

  group "api" {
    count = 3

    network {
      port "http" {
        static = 8080
      }
    }

    service {
      name = "api-server"
      port = "http"

      check {
        type     = "http"
        path     = "/health"
        interval = "10s"
        timeout  = "2s"
      }
    }

    task "api" {
      driver = "docker"

      config {
        image = "gcr.io/adnegator/api-server:latest"
        ports = ["http"]
      }

      env {
        NODE_ENV          = "production"
        ORCHESTRATOR_ADDR = "orchestrator.service.consul:50051"
        DATABASE_URL      = "postgresql://..."
        REDIS_URL         = "redis://redis.service.consul:6379"
      }

      resources {
        cpu    = 2000  # 2 CPU cores
        memory = 4096  # 4GB RAM
      }
    }
  }
}
```

#### 6.2.2 Orchestrator Job

```hcl
# nomad/jobs/orchestrator.nomad
job "orchestrator" {
  datacenters = ["us-central1"]
  type        = "service"

  group "orchestrator" {
    count = 5  # 自动扩缩容: 5-50

    network {
      port "grpc" {
        static = 50051
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

    task "orchestrator" {
      driver = "exec"  # 不使用Docker，直接运行二进制

      config {
        command = "/usr/local/bin/orchestrator"
        args    = ["--config", "/etc/orchestrator/config.yaml"]
      }

      artifact {
        source      = "gcs::https://storage.googleapis.com/adnegator-bins/orchestrator"
        destination = "/usr/local/bin/orchestrator"
        mode        = "file"
      }

      env {
        FIRECRACKER_BIN      = "/usr/local/bin/firecracker"
        KERNEL_PATH          = "/var/lib/firecracker/vmlinux-5.10"
        CRIU_BIN             = "/usr/local/bin/criu"
        DATABASE_URL         = "postgresql://..."
        CLICKHOUSE_URL       = "clickhouse://clickhouse.service.consul:9000"
        GCS_BUCKET           = "adnegator-snapshots"
      }

      resources {
        cpu    = 8000   # 8 CPU cores (主要用于Firecracker VMs)
        memory = 16384  # 16GB RAM
      }

      # Firecracker 需要 KVM
      constraint {
        attribute = "${attr.cpu.arch}"
        value     = "amd64"
      }

      constraint {
        attribute = "${node.unique.name}"
        operator  = "regexp"
        value     = "^orchestrator-.*"  # 只调度到有KVM的节点
      }
    }
  }
}
```

#### 6.2.3 ClickHouse Job

```hcl
# nomad/jobs/clickhouse.nomad
job "clickhouse" {
  datacenters = ["us-central1"]
  type        = "service"

  group "clickhouse" {
    count = 3  # 3节点集群

    volume "data" {
      type      = "host"
      source    = "clickhouse-data"
      read_only = false
    }

    network {
      port "http" { static = 8123 }
      port "native" { static = 9000 }
      port "interserver" { static = 9009 }
    }

    service {
      name = "clickhouse"
      port = "native"

      check {
        type     = "http"
        port     = "http"
        path     = "/ping"
        interval = "10s"
      }
    }

    task "clickhouse" {
      driver = "docker"

      config {
        image = "clickhouse/clickhouse-server:23.8"
        ports = ["http", "native", "interserver"]

        volumes = [
          "/opt/clickhouse/data:/var/lib/clickhouse"
        ]
      }

      resources {
        cpu    = 4000   # 4 CPU cores
        memory = 16384  # 16GB RAM
      }
    }
  }
}
```

### 6.3 Terraform 基础设施定义

#### 6.3.1 GCE 实例组

```hcl
# terraform/gce.tf
resource "google_compute_instance_template" "orchestrator" {
  name_prefix  = "orchestrator-"
  machine_type = "n1-highmem-16"

  disk {
    source_image = data.google_compute_image.orchestrator.self_link
    auto_delete  = true
    boot         = true
    disk_size_gb = 1000
    disk_type    = "pd-ssd"
  }

  network_interface {
    network = "default"
    access_config {
      # Ephemeral IP
    }
  }

  metadata = {
    enable-nested-virtualization = "true"  # 启用 KVM
    nomad-cluster                = "us-central1"
  }

  metadata_startup_script = file("${path.module}/scripts/orchestrator-init.sh")

  service_account {
    email  = google_service_account.orchestrator.email
    scopes = ["cloud-platform"]
  }

  tags = ["orchestrator", "nomad-client"]
}

resource "google_compute_instance_group_manager" "orchestrator" {
  name               = "orchestrator-ig"
  base_instance_name = "orchestrator"
  zone               = "us-central1-a"

  version {
    instance_template = google_compute_instance_template.orchestrator.id
  }

  target_size = 5

  auto_healing_policies {
    health_check      = google_compute_health_check.orchestrator.id
    initial_delay_sec = 300
  }
}

resource "google_compute_autoscaler" "orchestrator" {
  name   = "orchestrator-autoscaler"
  zone   = "us-central1-a"
  target = google_compute_instance_group_manager.orchestrator.id

  autoscaling_policy {
    min_replicas    = 5
    max_replicas    = 50
    cooldown_period = 60

    cpu_utilization {
      target = 0.7
    }
  }
}
```

#### 6.3.2 Nomad Server Cluster

```hcl
# terraform/nomad.tf
resource "google_compute_instance" "nomad_server" {
  count        = 3
  name         = "nomad-server-${count.index + 1}"
  machine_type = "n1-standard-2"
  zone         = "us-central1-${["a", "b", "c"][count.index]}"

  boot_disk {
    initialize_params {
      image = data.google_compute_image.nomad_server.self_link
      size  = 100
    }
  }

  network_interface {
    network = "default"
    access_config {}
  }

  metadata_startup_script = templatefile("${path.module}/scripts/nomad-server-init.sh", {
    server_index = count.index + 1
    consul_join  = join(",", google_compute_instance.consul_server[*].network_interface[0].network_ip)
  })

  tags = ["nomad-server", "consul-client"]
}
```

### 6.4 Packer 镜像构建

#### 6.4.1 Orchestrator 镜像

```json
# packer/orchestrator.pkr.hcl
source "googlecompute" "orchestrator" {
  project_id   = "adnegator-prod"
  source_image = "ubuntu-2204-lts"
  zone         = "us-central1-a"
  image_name   = "orchestrator-{{timestamp}}"
  image_family = "orchestrator"
  machine_type = "n1-highmem-16"
  disk_size    = 100

  metadata = {
    enable-nested-virtualization = "true"
  }
}

build {
  sources = ["source.googlecompute.orchestrator"]

  # 安装 KVM
  provisioner "shell" {
    inline = [
      "sudo apt-get update",
      "sudo apt-get install -y qemu-kvm libvirt-daemon-system",
      "sudo modprobe kvm_intel"
    ]
  }

  # 安装 Firecracker
  provisioner "shell" {
    inline = [
      "curl -L https://github.com/firecracker-microvm/firecracker/releases/download/v1.5.0/firecracker-v1.5.0-x86_64.tgz | tar -xz",
      "sudo mv firecracker-v1.5.0-x86_64 /usr/local/bin/firecracker",
      "sudo chmod +x /usr/local/bin/firecracker"
    ]
  }

  # 安装 CRIU
  provisioner "shell" {
    inline = [
      "sudo apt-get install -y criu"
    ]
  }

  # 安装 Nomad Client
  provisioner "shell" {
    inline = [
      "curl -L https://releases.hashicorp.com/nomad/1.6.2/nomad_1.6.2_linux_amd64.zip -o nomad.zip",
      "unzip nomad.zip",
      "sudo mv nomad /usr/local/bin/",
      "sudo mkdir -p /etc/nomad.d /opt/nomad"
    ]
  }

  # 安装 Consul Client
  provisioner "shell" {
    inline = [
      "curl -L https://releases.hashicorp.com/consul/1.16.2/consul_1.16.2_linux_amd64.zip -o consul.zip",
      "unzip consul.zip",
      "sudo mv consul /usr/local/bin/"
    ]
  }

  # 下载预编译的 kernel 和 rootfs
  provisioner "shell" {
    inline = [
      "sudo mkdir -p /var/lib/firecracker",
      "gsutil cp gs://adnegator-storage/kernels/vmlinux-5.10 /var/lib/firecracker/",
      "gsutil cp gs://adnegator-storage/rootfs/python-3.11.ext4 /var/lib/firecracker/"
    ]
  }

  # 配置 systemd services
  provisioner "file" {
    source      = "configs/nomad-client.service"
    destination = "/tmp/nomad-client.service"
  }

  provisioner "shell" {
    inline = [
      "sudo mv /tmp/nomad-client.service /etc/systemd/system/",
      "sudo systemctl daemon-reload",
      "sudo systemctl enable nomad-client"
    ]
  }
}
```

### 6.5 节点规划

#### 6.5.1 控制平面节点 (Nomad Server + Consul Server)

| 组件 | 机型 | vCPU | 内存 | 磁盘 | 数量 | 月成本 (GCP) |
|------|------|------|------|------|------|-------------|
| Nomad Server | n1-standard-2 | 2 | 7.5GB | 100GB SSD | 3 | ~$150 |
| Consul Server | n1-standard-2 | 2 | 7.5GB | 100GB SSD | 3 | ~$150 |

#### 6.5.2 应用节点

| 组件 | 机型 | vCPU | 内存 | 磁盘 | 数量 | 月成本 (GCP) |
|------|------|------|------|------|------|-------------|
| API Server | n1-standard-4 | 4 | 15GB | 100GB SSD | 3-10 | ~$300-1000 |
| Orchestrator | n1-highmem-16 | 16 | 104GB | 1TB SSD | 5-50 | ~$2500-25000 |
| ClickHouse | n1-highmem-8 | 8 | 52GB | 2TB SSD | 3 | ~$1500 |
| Redis | n1-standard-4 | 4 | 15GB | 500GB SSD | 6 | ~$600 |

#### 6.5.3 Orchestrator 节点容量

**单节点容量**：
- **CPU**: 16 vCPU
- **内存**: 104GB
- **并发沙盒**: ~100 个 (每个沙盒 2vCPU + 4GB RAM)
- **Firecracker 开销**: 16GB (操作系统 + Orchestrator + Firecracker managers)

**集群容量**：
- **5 节点**: 500 并发沙盒
- **50 节点**: 5000 并发沙盒

---

## 7. 技术栈选型 (100% E2B Official Stack)

### 7.1 完整技术栈

| 层次 | E2B官方技术 | 版本 | 选型理由 |
|------|------------|------|----------|
| **虚拟化** | **Firecracker** | v1.5+ | 125ms启动，5MB开销，硬件级隔离 |
| **任务调度** | **Nomad** | 1.6+ | 轻量级，专为批处理优化 |
| **服务发现** | **Consul** | 1.16+ | 动态服务注册和健康检查 |
| **API网关** | **TypeScript/Express** | Node.js 20+ | E2B官方API层 (packages/api/) |
| **编排器** | **Go** | 1.21+ | E2B官方Orchestrator (packages/orchestrator/) |
| **数据平面** | **Go (envd)** | 1.21+ | VM内gRPC服务 (packages/envd/) |
| **RPC 协议** | **gRPC + Connect** | latest | 流式通信，低延迟 |
| **OLTP数据库** | **PostgreSQL (Supabase)** | 15+ | 事务型数据，托管服务 |
| **OLAP数据库** | **ClickHouse** | 23.8+ | 分析型数据，10-100x查询速度 |
| **缓存/队列** | **Redis** | 7+ | 速率限制，会话，分布式锁 |
| **对象存储** | **GCS** | - | 快照、kernel、rootfs |
| **快照** | **CRIU** | 3.17+ | 进程级checkpoint/restore |
| **IaC** | **Terraform** | 1.5+ | GCP资源管理 |
| **镜像构建** | **Packer** | 1.9+ | GCE镜像自动化 |
| **云平台** | **Google Cloud Platform** | - | E2B官方云服务商 |
| **CDN/WAF** | **Cloudflare** | - | DNS、DDoS、TLS |
| **监控** | **Grafana Cloud** | - | 仪表盘和告警 |
| **日志** | **Loki** | 2.9+ | 日志聚合 |
| **追踪** | **OTEL Collector** | latest | OpenTelemetry |
| **分析** | **Posthog** | - | 用户行为分析 |

### 7.2 技术栈对比 (E2B Official vs 原设计)

| 维度 | 原设计 | E2B Official | 收益 |
|------|-------|--------------|------|
| **虚拟化** | gVisor (syscall) | **Firecracker (KVM)** | 4-8x 启动速度，10x 密度 |
| **编排** | Kubernetes | **Nomad** | 简单部署，专为VM优化 |
| **API语言** | Python (FastAPI) | **TypeScript (Express)** | E2B SDK官方兼容 |
| **核心服务** | Python | **Go** | 5x 吞吐，原生并发 |
| **分析数据库** | TimescaleDB | **ClickHouse** | 10-100x 查询速度 |
| **任务队列** | Celery | **无（同步调用）** | 简化架构 |
| **IaC** | 手动 | **Terraform + Packer** | 自动化部署 |

### 7.3 开发工具

| 工具 | 用途 | 说明 |
|------|------|------|
| **pnpm** | Node.js包管理 | TypeScript项目 (packages/api/) |
| **Go modules** | Go依赖管理 | Go项目 (packages/orchestrator/, packages/envd/) |
| **buf** | Protobuf管理 | gRPC接口定义 |
| **Terraform** | 基础设施定义 | GCP资源管理 |
| **Packer** | 镜像构建 | GCE镜像自动化 |
| **Nomad** | 任务编排 | Job定义和部署 |
| **Docker** | 本地开发 | API服务容器化 |
| **firecracker** | 本地调试 | 沙盒VM测试 |

### 7.4 E2B官方代码库结构

```
E2B/
├── packages/
│   ├── api/                    # TypeScript API网关
│   │   ├── src/routes/
│   │   ├── src/middleware/
│   │   └── package.json
│   ├── orchestrator/           # Go编排器
│   │   ├── internal/
│   │   │   ├── firecracker/
│   │   │   ├── criu/
│   │   │   └── orchestrator.go
│   │   └── go.mod
│   ├── envd/                   # Go VM守护进程
│   │   ├── process/
│   │   ├── filesystem/
│   │   └── go.mod
│   ├── js-sdk/                 # TypeScript SDK (客户端)
│   └── python-sdk/             # Python SDK (客户端)
├── terraform/                   # 基础设施定义
│   ├── gcp/
│   ├── nomad/
│   └── consul/
├── packer/                      # 镜像构建
│   ├── orchestrator.pkr.hcl
│   └── nomad-server.pkr.hcl
├── nomad/                       # Nomad job定义
│   ├── jobs/
│   │   ├── api-server.nomad
│   │   ├── orchestrator.nomad
│   │   └── clickhouse.nomad
└── proto/                       # Protobuf定义
    ├── process.proto
    ├── filesystem.proto
    └── orchestrator.proto
```

---

## 8. 关键技术决策 (E2B Official Stack)

### 8.1 ADR-001: 采用 Firecracker microVM 作为沙盒运行时

**背景**：需要为代码执行沙盒提供强隔离和快速启动

**决策**：完全采用 E2B 官方架构 - **Firecracker microVM** (替代 gVisor)

**理由**：
- ✅ **硬件级隔离**：基于 KVM，隔离强度高于 gVisor 系统调用过滤
- ✅ **极速启动**：125ms 冷启动（vs gVisor 500-1000ms），提升 4-8x
- ✅ **超高密度**：5MB 内存开销，单节点支持 6000+ 沙盒（vs gVisor 600）
- ✅ **CRIU 快照支持**：原生支持进程级 checkpoint/restore
- ✅ **E2B 官方架构**：直接使用 E2B SDK 和文档，无兼容性问题
- ✅ **AWS Firecracker**：经过 AWS Lambda 生产验证，稳定可靠

**权衡**：
- ⚠️ 需要 KVM 支持（GCP 需启用 nested virtualization）
- ⚠️ 部署复杂度略高于容器（需管理 kernel 和 rootfs）

**后果**：
- 需要 GCE 实例启用 `enable-nested-virtualization`
- 需要维护 Firecracker kernel 镜像（vmlinux）
- 需要构建 rootfs 镜像（ext4 格式）

**实现参考**：
- E2B infra: `github.com/e2b-dev/infra`
- Firecracker SDK: `github.com/firecracker-microvm/firecracker-go-sdk`

---

### 8.2 ADR-002: 采用 Nomad 替代 Kubernetes 作为编排层

**背景**：需要轻量级任务调度器管理 Firecracker VM

**决策**：采用 **HashiCorp Nomad**（替代 Kubernetes）

**理由**：
- ✅ **专为批处理优化**：比 K8s 更适合短生命周期任务
- ✅ **轻量级**：单二进制部署，无需复杂配置
- ✅ **Firecracker 友好**：`exec` driver 直接运行 Firecracker
- ✅ **原生 Consul 集成**：服务发现和健康检查开箱即用
- ✅ **E2B 官方架构**：完全遵循 E2B infra 设计
- ✅ **资源利用率高**：调度延迟 < 100ms（vs K8s 1-2s）

**权衡**：
- ⚠️ 生态小于 Kubernetes（但满足需求）
- ⚠️ 团队需学习 Nomad（但比 K8s 简单）

**后果**：
- 使用 Nomad Job HCL 定义任务
- 通过 Consul 实现服务发现
- Terraform 管理 Nomad 集群

---

### 8.3 ADR-003: 采用 Go 作为核心服务语言 (Orchestrator + envd)

**背景**：编排器和沙盒守护进程需要高性能和低延迟

**决策**：核心服务采用 **Go**（替代 Python）

**组件**：
1. **Orchestrator** (packages/orchestrator/): Go gRPC 服务器
2. **envd** (packages/envd/): VM 内 Go 守护进程

**理由**：
- ✅ **高性能**：5x 吞吐量提升（500 QPS vs Python 100 QPS）
- ✅ **原生并发**：goroutines 天然支持高并发场景
- ✅ **低延迟**：gRPC 原生支持，延迟 < 10ms
- ✅ **静态编译**：单二进制部署，无运行时依赖
- ✅ **低内存占用**：envd < 20MB（vs Python > 50MB）
- ✅ **E2B 官方语言**：直接复用 E2B 代码和最佳实践

**后果**：
- 维护 protobuf 定义（proto/）
- Go 和 TypeScript 双语言栈
- 需要 Go 1.21+ 开发环境

---

### 8.4 ADR-004: API 网关采用 TypeScript/Node.js (E2B 官方)

**背景**：需要 REST API 完全兼容 E2B SDK

**决策**：API 网关采用 **TypeScript + Express** (packages/api/)（替代 Python FastAPI）

**理由**：
- ✅ **E2B 官方 API 层**：100% 兼容 E2B SDK（TypeScript/Python）
- ✅ **生态丰富**：npm 生态支持完善
- ✅ **类型安全**：TypeScript 提供编译时检查
- ✅ **异步 I/O**：Node.js 天然适合 I/O 密集场景
- ✅ **E2B 源码可直接复用**：packages/api/ 可直接参考

**权衡**：
- ⚠️ 单线程（但 I/O 密集型，影响小）
- ⚠️ 性能略低于 Go（但API层非瓶颈）

**后果**：
- 使用 pnpm 管理 Node.js 依赖
- Prisma ORM 连接 PostgreSQL
- Zod 进行 schema 验证

---

### 8.5 ADR-005: 采用 ClickHouse 替代 TimescaleDB 作为分析数据库

**背景**：需要高性能时序/事件数据存储

**决策**：采用 **ClickHouse**（替代 TimescaleDB）

**理由**：
- ✅ **查询速度**：10-100x 快于 PostgreSQL/TimescaleDB
- ✅ **压缩比**：80-90% 压缩率（1TB 数据仅需 100GB）
- ✅ **列式存储**：完美适配分析查询（聚合、统计）
- ✅ **水平扩展**：集群架构，轻松扩展到 PB 级
- ✅ **E2B 官方架构**：E2B infra 使用 ClickHouse

**使用场景**：
1. 沙盒事件 (sandbox_events): created, paused, resumed, deleted
2. 性能指标 (metrics): CPU, memory, network
3. 操作日志 (logs): API calls, command executions

**权衡**：
- ⚠️ 最终一致性（非 ACID，但满足分析场景）
- ⚠️ 不适合事务型操作（OLTP 仍用 PostgreSQL）

**后果**：
- 维护 ClickHouse 集群（3 节点）
- 双数据库架构：PostgreSQL (OLTP) + ClickHouse (OLAP)
- 数据需从 PostgreSQL 异步同步到 ClickHouse

---

### 8.6 ADR-006: 采用 Terraform + Packer 实现 IaC

**背景**：需要自动化基础设施管理和镜像构建

**决策**：采用 **Terraform + Packer**（E2B 官方 IaC 工具链）

**Terraform 用途**：
- GCP 资源管理（GCE, VPC, Load Balancer, GCS）
- Nomad Server/Client 集群部署
- Consul 集群部署
- ClickHouse/Redis 部署

**Packer 用途**：
- 构建 Orchestrator GCE 镜像（预装 Firecracker, CRIU, Nomad Client）
- 构建 Nomad Server 镜像
- 构建 Firecracker rootfs 镜像（Python, Node.js, Go 模板）

**理由**：
- ✅ **声明式配置**：基础设施即代码
- ✅ **版本控制**：Git 管理 Terraform 配置
- ✅ **自动化部署**：CI/CD 集成
- ✅ **E2B 官方工具链**：infra 仓库使用 Terraform + Packer

**后果**：
- terraform/ 目录管理所有 GCP 资源
- packer/ 目录管理所有镜像构建
- 需要 GCP Service Account 和权限配置

---

### 8.7 ADR-007: 取消异步任务队列 (Celery → 同步调用)

**背景**：原设计使用 Celery 处理异步任务（沙盒创建）

**决策**：**取消 Celery**，改为 API → Orchestrator 同步 gRPC 调用

**理由**：
- ✅ **架构简化**：减少 Celery Worker 和 Redis Queue 组件
- ✅ **E2B 官方架构**：无异步队列，直接 gRPC 调用
- ✅ **延迟更低**：Firecracker 启动仅需 125ms，无需异步
- ✅ **错误处理简单**：同步调用立即返回结果

**权衡**：
- ⚠️ API 请求需等待沙盒创建完成（但仅 200ms，可接受）

**后果**：
- 移除 Celery 和消息队列
- API 直接调用 Orchestrator gRPC
- Redis 仅用于速率限制和缓存

---

### 8.8 技术决策总结

| 决策点 | 原设计 | E2B Official | ADR |
|--------|--------|--------------|-----|
| 虚拟化 | gVisor | **Firecracker** | ADR-001 |
| 编排 | Kubernetes | **Nomad** | ADR-002 |
| 核心服务语言 | Python | **Go** | ADR-003 |
| API 语言 | Python FastAPI | **TypeScript Express** | ADR-004 |
| 分析数据库 | TimescaleDB | **ClickHouse** | ADR-005 |
| IaC | 手动 | **Terraform + Packer** | ADR-006 |
| 任务队列 | Celery | **无（同步）** | ADR-007 |

---

## 9. 扩展性设计 (Nomad + Firecracker)

### 9.1 水平扩展能力

| 组件 | 扩展方式 | 扩展单位 | 瓶颈 |
|------|----------|----------|------|
| **API Server** | Nomad count 增加 | 3 → 10 实例 | Orchestrator gRPC 连接数 |
| **Orchestrator** | GCE autoscaling | 5 → 50 节点 | GCP 配额，每节点 100 沙盒 |
| **Firecracker VMs** | 节点自动扩容 | 每节点 100 VMs | 节点 CPU/内存资源 |
| **PostgreSQL** | Supabase 自动扩容 | 托管服务 | 写入 TPS (~10K writes/s) |
| **ClickHouse** | 水平分片 | 3 → N 节点 | 存储容量 |
| **Redis** | Redis Cluster 扩展 | 6 → 12 节点 | 内存容量 |

### 9.2 容量规划

#### 9.2.1 单集群容量（GCP us-central1）

| 资源 | 初始规模 | 最大规模 | 容量 |
|------|---------|---------|------|
| **API Server** | 3 实例 | 10 实例 | 15K req/s (每实例 5K req/s) |
| **Orchestrator 节点** | 5 节点 | 50 节点 | 5000 并发沙盒 (每节点 100 沙盒) |
| **Firecracker VM** | 500 VMs | 5000 VMs | 每个 2vCPU + 4GB RAM |
| **PostgreSQL** | Supabase Standard | Supabase Pro | 10K writes/s, 100K reads/s |
| **ClickHouse** | 3 节点 | 10 节点 | 100TB 数据 (压缩后) |
| **Redis** | 6 节点 (3主3从) | 12 节点 | 96GB 内存 |
| **GCS** | 无限 | 无限 | PB 级快照存储 |

#### 9.2.2 性能基准测试

| 指标 | 目标值 | 测试方法 |
|------|--------|----------|
| **沙盒创建延迟** | < 200ms (P50), < 500ms (P99) | k6 负载测试 |
| **API 吞吐量** | > 5000 req/s (单实例) | wrk2 压测 |
| **gRPC 延迟** | < 10ms (Orchestrator) | grpcurl benchmark |
| **envd 启动时间** | < 50ms | Firecracker 内部 metrics |
| **CRIU 快照速度** | < 2s per GB | CRIU dump 耗时统计 |

### 9.3 自动扩缩容策略

#### 9.3.1 Orchestrator 节点自动扩容（GCE Autoscaler）

```hcl
# terraform/autoscaler.tf
resource "google_compute_autoscaler" "orchestrator" {
  autoscaling_policy {
    min_replicas    = 5
    max_replicas    = 50
    cooldown_period = 60  # 1分钟冷却期

    cpu_utilization {
      target = 0.7  # CPU 达到 70% 时扩容
    }

    metric {
      name   = "custom.googleapis.com/firecracker_vm_count"
      target = 80   # 每节点 VM 数量达到 80 时扩容
      type   = "GAUGE"
    }
  }
}
```

**触发条件**：
- CPU 使用率 > 70%（3 分钟平均）
- 单节点 VM 数量 > 80
- 扩容速率：每分钟最多增加 10 节点
- 缩容条件：CPU < 30% 且 VM 数量 < 50（持续 10 分钟）

#### 9.3.2 API Server 扩容（Nomad count）

```hcl
# nomad/jobs/api-server.nomad
group "api" {
  count = 3  # 基础副本数

  # Nomad 自动扩容（需配置 Nomad Autoscaler）
  scaling {
    min     = 3
    max     = 10
    enabled = true

    policy {
      # CPU 利用率策略
      check "cpu_usage" {
        source = "prometheus"
        query  = "avg(rate(cpu_usage{job='api-server'}[5m]))"

        strategy "target-value" {
          target = 70
        }
      }

      # 请求延迟策略
      check "request_latency" {
        source = "prometheus"
        query  = "histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))"

        strategy "threshold" {
          upper_bound = 0.5  # P99 > 500ms 时扩容
        }
      }
    }
  }
}
```

### 9.4 性能优化点

| 优化项 | 方案 | 预期收益 | 优先级 |
|--------|------|----------|--------|
| **沙盒冷启动** | rootfs 镜像预下载到本地 | 减少 80% 下载时间（500ms → 100ms） | P0 |
| **Firecracker 启动** | kernel 镜像预加载到内存 | 减少 20ms 启动时间 | P1 |
| **网络配置** | tap 设备池化（预创建 10 个） | 减少 50ms 网络配置时间 | P1 |
| **数据库查询** | Redis 缓存沙盒元数据 | 减少 90% 数据库查询 | P0 |
| **ClickHouse 查询** | 时间分区 + 索引优化 | 10-100x 查询速度提升 | P1 |
| **gRPC 连接** | 连接池 + keepalive | 减少连接开销 | P0 |
| **API 响应** | 沙盒状态缓存（10s TTL） | 减少 80% Orchestrator 调用 | P1 |

### 9.5 扩展路径规划

#### 阶段 1: 单地域单集群 (0-6个月)

- **目标容量**: 1000 并发沙盒
- **架构**: us-central1 单集群
- **组件**: 5 Orchestrator 节点 + 3 API 实例
- **成本**: ~$5K/月

#### 阶段 2: 单地域多可用区 (6-12个月)

- **目标容量**: 3000 并发沙盒
- **架构**: us-central1 跨 3 个可用区（a, b, c）
- **高可用**: Nomad Server 跨 AZ，Orchestrator 跨 AZ
- **成本**: ~$12K/月

#### 阶段 3: 多地域部署 (12-18个月)

- **目标容量**: 10000 并发沙盒
- **架构**:
  - US: us-central1 (5000 沙盒)
  - EU: europe-west1 (3000 沙盒)
  - ASIA: asia-east1 (2000 沙盒)
- **数据**: PostgreSQL 多地域复制，ClickHouse 分布式表
- **路由**: Cloudflare Geo-routing
- **成本**: ~$35K/月

#### 阶段 4: 全球边缘部署 (18-24个月)

- **目标容量**: 50000 并发沙盒
- **架构**: 10+ 地域，边缘计算节点
- **优化**: CDN 缓存 rootfs，边缘 API 节点
- **成本**: ~$150K/月

---

## 10. 安全架构 (Firecracker + KVM 隔离)

### 10.1 安全层次

```
┌────────────────────────────────────────────────┐
│  L1: 网络安全                                   │
│  - TLS 终止 (Cloudflare)                       │
│  - DDoS 防护 (Cloudflare WAF)                  │
│  - VPC 隔离 (GCP)                              │
│  - Firewall Rules (仅允许 80/443 入站)         │
└────────────────────────────────────────────────┘
                    ▼
┌────────────────────────────────────────────────┐
│  L2: 应用安全                                   │
│  - 双重认证 (API Key + envd Access Token)      │
│  - 速率限制 (Redis Token Bucket)               │
│  - 输入校验 (Zod schema validation)            │
│  - CORS 配置                                   │
└────────────────────────────────────────────────┘
                    ▼
┌────────────────────────────────────────────────┐
│  L3: 虚拟化安全 (Firecracker + KVM)            │
│  - 硬件级隔离 (KVM)                            │
│  - 最小化 VMM (50KB 代码，无 BIOS/UEFI)         │
│  - 独立网络命名空间 (tap 设备)                  │
│  - Seccomp-BPF 系统调用过滤 (57 个允许)        │
│  - Jailer 沙盒 (chroot + cgroups)              │
└────────────────────────────────────────────────┘
                    ▼
┌────────────────────────────────────────────────┐
│  L4: VM 内安全 (Guest Kernel)                  │
│  - 非特权用户运行 (user, not root)             │
│  - AppArmor profile                            │
│  - 文件系统只读挂载 (除 /workspace)            │
│  - cgroup v2 资源限制                          │
└────────────────────────────────────────────────┘
                    ▼
┌────────────────────────────────────────────────┐
│  L5: 数据安全                                   │
│  - 数据库加密 (Supabase at-rest)               │
│  - GCS 加密 (Google-managed keys)              │
│  - Secret 管理 (GCP Secret Manager)            │
│  - 审计日志 (ClickHouse + Loki)                │
└────────────────────────────────────────────────┘
```

### 10.2 Firecracker 安全模型

#### 10.2.1 Firecracker Jailer

**Jailer** 是 Firecracker 的安全沙盒，提供额外隔离层：

```bash
# Jailer 启动 Firecracker
jailer \
  --id {sandbox_id} \
  --exec-file /usr/local/bin/firecracker \
  --uid 123 --gid 100 \
  --chroot-base-dir /srv/jailer \
  --netns /var/run/netns/{sandbox_id} \
  -- \
  --api-sock firecracker.sock
```

**隔离措施**：
1. **chroot**: 限制文件系统访问到 `/srv/jailer/{sandbox_id}/`
2. **Network namespace**: 独立网络栈
3. **cgroup**: 限制 CPU/内存资源
4. **Seccomp-BPF**: 仅允许 57 个系统调用（vs Linux 300+）
5. **非特权用户**: uid/gid 非 root

#### 10.2.2 Seccomp 系统调用白名单

Firecracker 仅允许 57 个系统调用（最小攻击面）：

```json
{
  "allowed_syscalls": [
    "read", "write", "open", "close", "stat", "fstat", "lseek", "mmap",
    "mprotect", "munmap", "brk", "rt_sigaction", "rt_sigprocmask",
    "rt_sigreturn", "ioctl", "pread64", "pwrite64", "readv", "writev",
    "access", "pipe", "select", "sched_yield", "mremap", "msync",
    "mincore", "madvise", "dup", "dup2", "pause", "nanosleep", "getpid",
    "socket", "connect", "accept", "sendto", "recvfrom", "sendmsg",
    "recvmsg", "shutdown", "bind", "listen", "getsockname", "getpeername",
    "socketpair", "setsockopt", "getsockopt", "clone", "fork", "vfork",
    "execve", "exit", "wait4", "kill", "uname", "fcntl", "flock",
    "fsync", "fdatasync", "truncate", "ftruncate", "getcwd"
  ]
}
```

**攻击面对比**：
- gVisor: ~200 个系统调用
- Docker (无限制): ~300 个系统调用
- Firecracker: **57 个系统调用** (最小)

### 10.3 认证授权流程

#### 10.3.1 控制平面认证 (API Key)

```typescript
// API Server 认证中间件
async function authenticateAPIKey(req: Request): Promise<User> {
  const apiKey = req.headers['x-api-key']

  // 1. Redis 缓存查询 (快速路径)
  let user = await redis.hgetall(`session:${apiKey}`)
  if (user) return user

  // 2. PostgreSQL 查询 (慢速路径)
  user = await prisma.apiKey.findUnique({
    where: { key: apiKey, revoked: false },
    include: { user: true }
  })

  if (!user || user.expiresAt < new Date()) {
    throw new AuthenticationError('Invalid or expired API key')
  }

  // 3. 缓存到 Redis (5 分钟 TTL)
  await redis.hset(`session:${apiKey}`, user)
  await redis.expire(`session:${apiKey}`, 300)

  // 4. 记录审计日志到 ClickHouse
  await clickhouse.insert('audit_logs', {
    user_id: user.id,
    action: 'api_key_auth',
    timestamp: Date.now()
  })

  return user
}
```

#### 10.3.2 数据平面认证 (envd Access Token)

```go
// envd JWT 验证
func (s *Server) authenticate(ctx context.Context) error {
    md, ok := metadata.FromIncomingContext(ctx)
    if !ok {
        return status.Error(codes.Unauthenticated, "missing metadata")
    }

    tokens := md.Get("authorization")
    if len(tokens) == 0 {
        return status.Error(codes.Unauthenticated, "missing token")
    }

    // 解析 JWT
    token, err := jwt.Parse(tokens[0], func(t *jwt.Token) (interface{}, error) {
        return []byte(os.Getenv("ENVD_JWT_SECRET")), nil
    })

    if err != nil || !token.Valid {
        return status.Error(codes.Unauthenticated, "invalid token")
    }

    // 验证 sandbox_id 匹配
    claims := token.Claims.(jwt.MapClaims)
    if claims["sandbox_id"] != s.sandboxID {
        return status.Error(codes.PermissionDenied, "sandbox_id mismatch")
    }

    return nil
}
```

### 10.4 资源隔离

| 资源类型 | 隔离方式 | 实现 |
|----------|----------|------|
| **CPU** | Firecracker vCPU 限制 + cgroup v2 | `cpu.max` = "2000000 100000" (2 核) |
| **内存** | Firecracker 内存限制 + cgroup v2 | `memory.max` = "4294967296" (4GB) |
| **磁盘** | Firecracker 块设备大小限制 | `--root-device-size=10G` |
| **网络** | 独立 Network Namespace + tap 设备 | 每个 VM 独立 IP (10.0.x.x) |
| **进程** | VM 内 PID namespace | VM 内进程无法看到宿主机进程 |
| **文件系统** | Firecracker rootfs (ext4 镜像) | VM 内完全隔离的文件系统 |
| **系统调用** | Seccomp-BPF 白名单 (57 个) | Firecracker VMM 进程系统调用限制 |

### 10.5 网络安全

#### 10.5.1 网络隔离架构

```
Internet
   ↓ HTTPS (443)
Cloudflare (WAF + DDoS)
   ↓ HTTPS
GCP Load Balancer
   ↓ HTTP (8080)
API Server (VPC 内网)
   ↓ gRPC (50051)
Orchestrator (VPC 内网)
   ↓ gRPC (49983) via tap 设备
Firecracker VM (独立 network namespace)
   ↓ 出站网络 (可选禁止)
Internet (受限)
```

#### 10.5.2 Firewall Rules (GCP VPC)

```hcl
# terraform/firewall.tf
resource "google_compute_firewall" "allow_https" {
  name    = "allow-https-ingress"
  network = google_compute_network.vpc.name

  allow {
    protocol = "tcp"
    ports    = ["443"]
  }

  source_ranges = ["0.0.0.0/0"]  # Cloudflare 代理
  target_tags   = ["api-server"]
}

resource "google_compute_firewall" "deny_all_egress_from_sandboxes" {
  name      = "deny-sandbox-egress"
  network   = google_compute_network.vpc.name
  direction = "EGRESS"
  priority  = 1000

  deny {
    protocol = "all"
  }

  target_tags = ["firecracker-vm"]  # 沙盒 VM 无法访问外网
}
```

### 10.6 安全审计

#### 10.6.1 审计日志（ClickHouse）

```sql
CREATE TABLE audit_logs (
    timestamp DateTime64(3),
    user_id String,
    sandbox_id String,
    action Enum('api_key_auth', 'sandbox_create', 'sandbox_delete', 'command_exec'),
    ip_address String,
    user_agent String,
    metadata String,  -- JSON
    INDEX idx_user_id user_id TYPE bloom_filter GRANULARITY 1,
    INDEX idx_sandbox_id sandbox_id TYPE bloom_filter GRANULARITY 1
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, user_id);
```

#### 10.6.2 异常检测规则

| 规则 | 触发条件 | 响应 |
|------|---------|------|
| **频繁沙盒创建** | 单用户 > 10 sandboxes/min | 速率限制 + 告警 |
| **异常 IP** | API Key 从新 IP 调用 | 告警 + 日志 |
| **长时间运行** | 沙盒运行 > 24h | 自动删除 + 计费 |
| **高资源使用** | CPU > 90% 持续 10min | 限流 + 告警 |

---

## 11. 性能优化策略 (Firecracker 优化)

### 11.1 Firecracker 冷启动优化

**目标**：< 200ms (从 API 调用到 envd 可用) - **E2B 官方水平**

**优化点**：
1. **rootfs 镜像本地化** (节省 500ms → 20ms)
   - Packer 构建镜像时预下载所有 rootfs 到 `/var/lib/firecracker/`
   - 无需从 GCS 下载，直接使用本地镜像
   - Copy-on-write: 每个 VM 创建 overlay 副本

2. **kernel 镜像预加载** (节省 50ms → 5ms)
   - 系统启动时加载 kernel 到内存 (tmpfs)
   - 所有 VM 共享同一个 kernel 镜像
   - 路径: `/dev/shm/vmlinux-5.10`

3. **网络设备池化** (节省 50ms → 5ms)
   - 预创建 10 个 tap 设备池
   - 沙盒创建时直接分配，无需创建
   - 删除时回收到池中

4. **并行操作** (节省 100ms)
   - 数据库写入和 Firecracker 启动并行
   - VM 启动和 envd 健康检查并行

**优化后流程**：
```
API 请求 (0ms)
  ├─ 参数验证 (10ms)
  ├─ 数据库写入 (30ms, 并行)
  └─ Orchestrator gRPC 调用 (150ms, 并行)
      ├─ 从池中获取 tap 设备 (5ms)
      ├─ 加载 rootfs (本地 copy-on-write, 20ms)
      ├─ 启动 Firecracker VM (125ms)
      └─ 等待 envd 就绪 (30ms)
  ├─ 返回响应 (200ms)
```

**E2B 官方基准**：
- **P50**: 125ms
- **P95**: 200ms
- **P99**: 350ms

### 11.2 数据库优化

#### 11.2.1 PostgreSQL 索引设计

```sql
-- sandboxes 表
CREATE INDEX idx_sandboxes_status ON sandboxes(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_sandboxes_user_id ON sandboxes(user_id, created_at DESC);
CREATE INDEX idx_sandboxes_template_id ON sandboxes(template_id) WHERE status = 'running';
CREATE INDEX idx_sandboxes_ip_address ON sandboxes(ip_address) WHERE status = 'running';

-- api_keys 表
CREATE UNIQUE INDEX idx_api_keys_key ON api_keys(key) WHERE revoked = FALSE;
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
```

#### 11.2.2 Prisma 连接池配置 (TypeScript)

```typescript
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")

  // Supabase 配置
  directUrl       = env("DATABASE_DIRECT_URL")
  pool_timeout    = 30
  connection_limit = 20  // 每个 API 实例 20 连接
}
```

#### 11.2.3 ClickHouse 查询优化

```sql
-- 按时间分区 (月度)
PARTITION BY toYYYYMM(timestamp)

-- 排序键优化 (按查询频率)
ORDER BY (sandbox_id, timestamp)

-- Bloom Filter 索引 (加速 WHERE 查询)
INDEX idx_sandbox_id sandbox_id TYPE bloom_filter GRANULARITY 1

-- 示例查询（10-100x 快于 PostgreSQL）
SELECT
    sandbox_id,
    count(*) as event_count,
    avg(duration_ms) as avg_duration
FROM sandbox_events
WHERE timestamp >= now() - INTERVAL 1 DAY
  AND event_type = 'created'
GROUP BY sandbox_id
ORDER BY event_count DESC
LIMIT 100
-- 执行时间: ~50ms (vs PostgreSQL ~5s)
```

### 11.3 缓存策略 (Redis)

| 数据类型 | Key 格式 | TTL | 失效策略 |
|----------|----------|-----|----------|
| **沙盒元数据** | `sandbox:{id}` | 10s | 状态变更时删除 (Orchestrator 主动删除) |
| **用户会话** | `session:{api_key}` | 5m | API Key 撤销时删除 |
| **模板信息** | `template:{id}` | 1h | 模板更新时删除 |
| **速率限制计数** | `rate_limit:{user_id}` | 1s | 过期自动删除 |

**实现（TypeScript）**：
```typescript
// 沙盒元数据缓存
async function getSandbox(sandboxID: string): Promise<Sandbox> {
  // 1. 尝试 Redis 缓存
  const cached = await redis.hgetall(`sandbox:${sandboxID}`)
  if (cached) {
    return JSON.parse(cached)
  }

  // 2. 从 PostgreSQL 查询
  const sandbox = await prisma.sandbox.findUnique({
    where: { id: sandboxID }
  })

  // 3. 写入 Redis (10s TTL)
  await redis.hset(`sandbox:${sandboxID}`, JSON.stringify(sandbox))
  await redis.expire(`sandbox:${sandboxID}`, 10)

  return sandbox
}
```

### 11.4 gRPC 连接优化

#### 11.4.1 连接池 (API → Orchestrator)

```typescript
// packages/api/src/grpc-client.ts
import * as grpc from '@grpc/grpc-js'

const channelOptions = {
  // Keepalive 配置
  'grpc.keepalive_time_ms': 50000,              // 50s ping
  'grpc.keepalive_timeout_ms': 10000,           // 10s timeout
  'grpc.keepalive_permit_without_calls': 1,

  // 连接池配置
  'grpc.max_send_message_length': 100 * 1024 * 1024,    // 100MB
  'grpc.max_receive_message_length': 100 * 1024 * 1024, // 100MB

  // 负载均衡 (Consul DNS round-robin)
  'grpc.lb_policy_name': 'round_robin',
}

const client = new OrchestratorClient(
  'orchestrator.service.consul:50051',
  grpc.credentials.createInsecure(),
  channelOptions
)
```

### 11.5 Firecracker VM 密度优化

**目标**: 单节点 100+ 并发沙盒

| 优化项 | 方案 | 收益 |
|--------|------|------|
| **内存超卖** | 2:1 超卖比（200GB → 400GB 可用） | 2x 密度 |
| **CPU 超卖** | 不超卖（避免性能抖动） | 稳定性 |
| **共享 kernel** | 所有 VM 共享 vmlinux-5.10 | 减少 50MB × N |
| **rootfs CoW** | Copy-on-write overlay | 减少 80% 磁盘占用 |
| **快速回收** | 删除后立即清理资源 | 避免资源泄漏 |

**单节点容量计算** (n1-highmem-16: 16 vCPU, 104GB RAM)：
```
可用资源:
- CPU: 16 vCPU (不超卖)
- 内存: 104GB - 16GB (OS + Orchestrator) = 88GB

每个沙盒:
- CPU: 2 vCPU
- 内存: 4GB × 0.5 (超卖) = 2GB 实际

理论容量:
- CPU 限制: 16 / 2 = 8 沙盒
- 内存限制: 88 / 2 = 44 沙盒

实际容量 (保守): 100 沙盒
- CPU 按峰值 20% 计算: 16 / (2 × 0.2) = 40 沙盒
- 内存按实际使用 50% 计算: 88 / (4 × 0.5) = 44 沙盒
- 综合评估: 100 沙盒 (E2B 官方数据)
```

---

## 12. 可观测性架构 (OTEL + Loki + Grafana + Posthog)

### 12.1 监控指标 (Prometheus-compatible)

#### 12.1.1 API Server 指标 (TypeScript)

```typescript
// packages/api/src/metrics.ts
import { register, Counter, Histogram, Gauge } from 'prom-client'

// HTTP 请求指标
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path', 'status'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5]
})

export const httpRequestTotal = new Counter({
  name: 'http_request_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'path', 'status']
})

// 认证指标
export const apiKeyValidationDuration = new Histogram({
  name: 'api_key_validation_duration_seconds',
  help: 'API key validation duration',
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1]
})

// 沙盒操作指标
export const sandboxOperationDuration = new Histogram({
  name: 'sandbox_operation_duration_seconds',
  help: 'Sandbox operation duration',
  labelNames: ['operation'],  // create, pause, resume, delete
  buckets: [0.1, 0.2, 0.5, 1, 2, 5]
})
```

#### 12.1.2 Orchestrator 指标 (Go)

```go
// packages/orchestrator/internal/metrics/metrics.go
package metrics

import "github.com/prometheus/client_golang/prometheus"

var (
    // Firecracker 启动时间
    FirecrackerStartDuration = prometheus.NewHistogram(prometheus.HistogramOpts{
        Name:    "firecracker_start_duration_seconds",
        Help:    "Firecracker VM start duration",
        Buckets: []float64{0.05, 0.1, 0.15, 0.2, 0.3, 0.5, 1},
    })

    // 活跃沙盒数量
    ActiveSandboxes = prometheus.NewGauge(prometheus.GaugeOpts{
        Name: "active_sandboxes_total",
        Help: "Number of active sandboxes",
    })

    // 节点容量
    NodeCapacity = prometheus.NewGaugeVec(prometheus.GaugeOpts{
        Name: "node_capacity",
        Help: "Node capacity (CPU, memory)",
    }, []string{"resource"})  // cpu, memory

    // VM 密度
    VMsPerNode = prometheus.NewGauge(prometheus.GaugeOpts{
        Name: "vms_per_node",
        Help: "Number of VMs running on this node",
    })
)
```

#### 12.1.3 业务指标

```prometheus
# 用户行为
user_api_calls_total{user_id, endpoint, tier}
user_sandbox_created_total{user_id, template_id}
user_rate_limit_exceeded_total{user_id}

# 沙盒生命周期
sandbox_creation_duration_seconds{template_id}
sandbox_deletion_duration_seconds
sandbox_pause_duration_seconds
sandbox_resume_duration_seconds

# 资源使用（从 ClickHouse 查询）
sandbox_cpu_usage_percent{sandbox_id, p50|p95|p99}
sandbox_memory_usage_bytes{sandbox_id, p50|p95|p99}
sandbox_network_bytes_total{sandbox_id, direction}

# 系统健康
firecracker_crash_total
envd_connection_failure_total
orchestrator_oom_total
```

### 12.2 日志架构 (Loki)

```
┌────────────────────────────────────────────────┐
│  应用日志 (Structured JSON)                    │
│  ┌──────────────────────────────────────────┐ │
│  │  API Server (pino logger)                │ │
│  │  {"level":"info","msg":"Sandbox created",│ │
│  │   "sandboxID":"abc123","duration":125}   │ │
│  └──────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────┐ │
│  │  Orchestrator (zerolog)                  │ │
│  │  {"level":"info","msg":"Firecracker VM   │ │
│  │   started","vmID":"xyz789","pid":12345}  │ │
│  └──────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────┐ │
│  │  envd (zerolog)                          │ │
│  │  {"level":"debug","msg":"Process started│ │
│  │   ","pid":789,"cmd":"python main.py"}   │ │
│  └──────────────────────────────────────────┘ │
└────────────────────────────────────────────────┘
                    ▼
┌────────────────────────────────────────────────┐
│  OTEL Collector (Sidecar on each node)        │
│  - 采集 stdout/stderr 日志                    │
│  - 添加 labels: {job, instance, sandbox_id}   │
│  - 批量发送到 Loki                             │
└────────────────────────────────────────────────┘
                    ▼
┌────────────────────────────────────────────────┐
│  Loki (3-node cluster)                         │
│  - 时间索引 (不索引日志内容)                   │
│  - 按 label 分片存储                           │
│  - LogQL 查询语言                              │
└────────────────────────────────────────────────┘
                    ▼
┌────────────────────────────────────────────────┐
│  Grafana Cloud (Visualization)                 │
│  - 日志查询和展示                              │
│  - 告警规则 (error rate > 5%)                 │
│  - 仪表盘 (Sandbox 创建趋势, 错误分析)         │
└────────────────────────────────────────────────┘
```

**LogQL 查询示例**：
```logql
# 查询最近 1 小时的沙盒创建日志
{job="api-server"} |= "Sandbox created" | json | duration > 500ms

# 查询 Firecracker 启动失败日志
{job="orchestrator"} |~ "Firecracker.*failed" | json | line_format "{{.msg}} - {{.error}}"

# 统计每个用户的 API 调用次数
sum by (user_id) (count_over_time({job="api-server"}[1h]))
```

### 12.3 分布式追踪 (OpenTelemetry)

#### 12.3.1 追踪流程

```
HTTP Request → API Server → Orchestrator (gRPC) → Firecracker → envd
      ↓              ↓              ↓                  ↓           ↓
   Trace ID       Span 1         Span 2             Span 3      Span 4
   abc123        api.create    orchestrator.start  firecracker envd.ready
                  (150ms)         (gRPC 10ms)        (125ms)    (30ms)
```

#### 12.3.2 OTEL Collector 配置

```yaml
# otel-collector-config.yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:
    timeout: 10s
    send_batch_size: 1024

exporters:
  otlp:
    endpoint: grafana-cloud-otlp.example.com:443
    headers:
      authorization: "Bearer ${GRAFANA_CLOUD_TOKEN}"

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlp]
```

#### 12.3.3 TypeScript 追踪示例 (API Server)

```typescript
import { trace, context } from '@opentelemetry/api'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc'

const tracer = trace.getTracer('api-server')

async function createSandbox(req: Request): Promise<Response> {
  const span = tracer.startSpan('api.createSandbox')

  try {
    // 认证
    const authSpan = tracer.startSpan('api.authenticate', { parent: span })
    const user = await authenticateAPIKey(req.headers['x-api-key'])
    authSpan.end()

    // 调用 Orchestrator (自动传播 trace context)
    const orchestratorSpan = tracer.startSpan('api.callOrchestrator', { parent: span })
    const sandbox = await orchestratorClient.CreateSandbox({
      template_id: req.body.templateID
    })
    orchestratorSpan.setAttribute('sandbox_id', sandbox.sandboxID)
    orchestratorSpan.end()

    span.setAttribute('user_id', user.id)
    span.setAttribute('sandbox_id', sandbox.sandboxID)
    span.setStatus({ code: SpanStatusCode.OK })

    return { sandboxID: sandbox.sandboxID }
  } catch (error) {
    span.recordException(error)
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message })
    throw error
  } finally {
    span.end()
  }
}
```

### 12.4 用户行为分析 (Posthog)

**集成 Posthog** (产品分析和 feature flags):

```typescript
// packages/api/src/analytics.ts
import { PostHog } from 'posthog-node'

const posthog = new PostHog(process.env.POSTHOG_API_KEY)

// 记录沙盒创建事件
posthog.capture({
  distinctId: user.id,
  event: 'sandbox_created',
  properties: {
    sandbox_id: sandboxID,
    template_id: templateID,
    duration_ms: duration,
    tier: user.tier,  // hobby, pro, enterprise
  }
})

// Feature flag 示例
const enableFirecrackerV2 = await posthog.isFeatureEnabled(
  'firecracker-v2',
  user.id
)
```

### 12.5 告警规则 (Grafana Alerting)

| 告警名称 | 条件 | 级别 | 通知渠道 |
|---------|------|------|----------|
| **高错误率** | API 5xx > 5% (5分钟) | Critical | PagerDuty + Slack |
| **沙盒创建慢** | P95 > 1s (10分钟) | Warning | Slack |
| **Firecracker 崩溃** | crash > 5/min | Critical | PagerDuty |
| **节点资源不足** | CPU > 85% 或 Memory > 90% | Warning | Slack |
| **PostgreSQL 延迟高** | Query P99 > 500ms | Warning | Slack |
| **ClickHouse 插入失败** | insert_error > 10/min | Warning | Slack |

**Prometheus 告警规则示例**：
```yaml
groups:
  - name: sandbox_alerts
    rules:
      - alert: HighErrorRate
        expr: |
          (sum(rate(http_request_total{status=~"5.."}[5m]))
          /
          sum(rate(http_request_total[5m]))) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "API error rate > 5%"
          description: "{{ $value | humanizePercentage }} errors in last 5 minutes"

      - alert: SlowSandboxCreation
        expr: |
          histogram_quantile(0.95,
            rate(sandbox_creation_duration_seconds_bucket[10m])
          ) > 1
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Sandbox creation P95 > 1s"
```

---

## 附录

### A. 架构决策记录 (ADR) 目录

| ADR | 标题 | 状态 | 日期 |
|-----|------|------|------|
| ADR-001 | 采用 Firecracker microVM 作为沙盒运行时 | Accepted | 2025-11-05 |
| ADR-002 | 采用 Nomad 替代 Kubernetes 作为编排层 | Accepted | 2025-11-05 |
| ADR-003 | 采用 Go 作为核心服务语言 | Accepted | 2025-11-05 |
| ADR-004 | API 网关采用 TypeScript/Node.js | Accepted | 2025-11-05 |
| ADR-005 | 采用 ClickHouse 替代 TimescaleDB | Accepted | 2025-11-05 |
| ADR-006 | 采用 Terraform + Packer 实现 IaC | Accepted | 2025-11-05 |
| ADR-007 | 取消异步任务队列（同步调用） | Accepted | 2025-11-05 |

### B. 架构风险评估 (E2B Official Stack)

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| **KVM 兼容性问题** | High | Low | GCP 支持 nested virtualization，已验证 |
| **Firecracker 稳定性** | High | Low | AWS Lambda 生产验证，成熟稳定 |
| **Nomad 生态小** | Medium | Medium | HashiCorp 官方支持，足够满足需求 |
| **ClickHouse 最终一致性** | Medium | Low | OLTP 用 PostgreSQL，OLAP 用 ClickHouse |
| **Go + TypeScript 双语言栈** | Medium | Medium | E2B 官方架构，有最佳实践参考 |
| **GCP 单云厂商依赖** | Medium | Low | 初期可接受，后期可多云部署 |
| **内存超卖风险** | Medium | Medium | 监控内存使用，自动扩容节点 |

### C. 技术债务

| 债务项 | 优先级 | 计划时间 | 估计工作量 |
|--------|--------|----------|-----------|
| 完善单元测试覆盖率 (目标 80%) | P1 | Month 2 | 2 周 |
| 实现 E2E 集成测试（Firecracker + envd） | P0 | Month 2 | 1 周 |
| 性能压测和优化 (k6 + 100 并发沙盒) | P0 | Month 3 | 1 周 |
| 安全审计 (Firecracker Jailer + Seccomp) | P0 | Month 4 | 2 周 |
| 多地域部署方案 (GCP multi-region) | P2 | Month 6 | 3 周 |
| CRIU 快照功能验证 | P1 | Month 3 | 1 周 |
| ClickHouse 集群高可用测试 | P1 | Month 4 | 1 周 |

### D. 参考资料

| 资源 | URL | 说明 |
|------|-----|------|
| **E2B 官方代码库** | github.com/e2b-dev/E2B | TypeScript SDK, Python SDK, API, Orchestrator |
| **E2B 官方基础设施** | github.com/e2b-dev/infra | Terraform, Nomad jobs, 部署脚本 |
| **Firecracker 文档** | firecracker-microvm.github.io | 官方文档和最佳实践 |
| **Firecracker Go SDK** | github.com/firecracker-microvm/firecracker-go-sdk | Go SDK 和示例代码 |
| **Nomad 文档** | nomadproject.io/docs | Job 定义, 调度算法, 运维指南 |
| **ClickHouse 文档** | clickhouse.com/docs | SQL 参考, 表引擎, 性能优化 |
| **CRIU 文档** | criu.org/Main_Page | Checkpoint/Restore 使用指南 |
| **OTEL 文档** | opentelemetry.io/docs | 追踪、指标、日志集成 |

---

**下一步**: 基于本架构文档创建 [L3: 三大设计文档](L3.1-sequence-diagram-design.md)
- L3.1: 时序图设计 (基于 Firecracker + Nomad 流程)
- L3.2: 数据库设计 (PostgreSQL + ClickHouse 双数据库)
- L3.3: 业务规则设计 (速率限制, 资源配额, 计费规则)

**重要提示**: 本文档完全基于 E2B 官方技术栈（Firecracker + Nomad + Go + ClickHouse），所有设计决策均参考 E2B 开源代码库（github.com/e2b-dev/E2B 和 github.com/e2b-dev/infra），确保 100% API/SDK 兼容性，可直接使用 E2B 官方 SDK 和文档。
