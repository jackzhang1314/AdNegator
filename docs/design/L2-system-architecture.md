# L2: 系统架构文档

**文档版本**: v1.0
**创建日期**: 2025-11-05
**架构师**: System
**文档状态**: Draft
**前置文档**: [L1-产品需求文档](L1-product-requirements.md)

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

基于 **L1 产品需求**，系统架构需要满足：

| 需求来源 (L1) | 架构目标 |
|--------------|---------|
| F1: 沙盒生命周期管理 | 高可用的控制平面 |
| F2: 代码执行引擎 | 低延迟的数据平面 |
| F3: E2B SDK 兼容 | REST API + gRPC 双协议 |
| NFR: 性能 < 2s 冷启动 | 容器预热 + 快速编排 |
| NFR: 并发 1000+ 沙盒 | 水平扩展架构 |
| NFR: 安全隔离 | gVisor 运行时集成 |

### 1.2 架构风格

- **分布式微服务架构**：控制平面和数据平面解耦
- **事件驱动架构**：异步任务处理（沙盒创建、暂停）
- **无状态设计**：API 服务可水平扩展
- **声明式编排**：基于 Kubernetes 资源模型

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

## 3. 总体架构

### 3.1 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                         客户端层                                  │
├─────────────────────────────────────────────────────────────────┤
│  TypeScript SDK  │  Python SDK  │  REST API Client  │  CLI      │
└─────────────────────────────────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                        API 网关 (Nginx/Envoy)                    │
│  - 认证 (API Key)  - 限流  - 负载均衡  - TLS 终止                │
└─────────────────────────────────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      控制平面 (Control Plane)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────┐    ┌──────────────────┐                   │
│  │  API Server      │    │  Scheduler       │                   │
│  │  (FastAPI)       │───▶│  (Celery)        │                   │
│  │                  │    │                  │                   │
│  │ - Sandbox CRUD   │    │ - 沙盒创建任务    │                   │
│  │ - Template CRUD  │    │ - 暂停/恢复任务   │                   │
│  │ - 认证授权        │    │ - 清理任务        │                   │
│  └──────────────────┘    └──────────────────┘                   │
│           │                       │                              │
│           ▼                       ▼                              │
│  ┌──────────────────────────────────────────┐                   │
│  │         数据存储层                        │                   │
│  ├──────────────────────────────────────────┤                   │
│  │  PostgreSQL      Redis         S3/MinIO  │                   │
│  │  (元数据)        (会话/队列)    (检查点)   │                   │
│  └──────────────────────────────────────────┘                   │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                   容器编排层 (Kubernetes)                         │
├─────────────────────────────────────────────────────────────────┤
│  - RuntimeClass: gVisor                                          │
│  - NetworkPolicy: 网络隔离                                        │
│  - ResourceQuota: 资源限制                                        │
└─────────────────────────────────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      数据平面 (Data Plane)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Sandbox Pod (gVisor Runtime)                           │   │
│  │  ┌───────────────────────────────────────────────────┐  │   │
│  │  │  envd (Go Daemon)                                 │  │   │
│  │  │  - Listen on :49983                               │  │   │
│  │  │  - Connect RPC API                                │  │   │
│  │  │    ├─ FilesystemService (上传/下载文件)           │  │   │
│  │  │    ├─ CommandsService (执行进程)                  │  │   │
│  │  │    └─ HealthService (健康检查)                    │  │   │
│  │  └───────────────────────────────────────────────────┘  │   │
│  │  ┌───────────────────────────────────────────────────┐  │   │
│  │  │  User Workspace                                   │  │   │
│  │  │  - /workspace (用户代码)                          │  │   │
│  │  │  - Language Runtime (Python/Node.js/etc)         │  │   │
│  │  └───────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                   │
│  (多个 Sandbox Pods 并行运行)                                    │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      基础设施层                                   │
├─────────────────────────────────────────────────────────────────┤
│  - gVisor (runsc)          - Container Runtime                  │
│  - Linux Kernel 4.14+      - CPU/Memory/Disk Resources          │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 数据流

#### 3.2.1 沙盒创建流程

```
Client SDK → API Server → Scheduler → K8s API → kubelet → runsc → Pod 启动
     ↓                         ↓
   返回 sandboxID          存储元数据 (PostgreSQL)
                                ↓
                          轮询 Pod 状态 → envd 就绪
```

#### 3.2.2 代码执行流程

```
Client SDK → envd (gRPC) → 启动进程 → 实时流式输出 → Client SDK
                              ↓
                          设置 cgroup 限制
                              ↓
                          记录审计日志
```

#### 3.2.3 沙盒暂停流程

```
Client SDK → API Server → Scheduler → CRIU checkpoint → 上传快照到 S3
     ↓                         ↓
   返回 204 No Content     更新状态为 "paused"
                                ↓
                          删除 K8s Pod (释放资源)
```

---

## 4. 分层架构

### 4.1 分层模型

```
┌────────────────────────────────────────────────┐
│  L1: Presentation Layer (表示层)                │
│  - REST API Endpoints                          │
│  - OpenAPI Schema                              │
│  - Request/Response Serialization             │
└────────────────────────────────────────────────┘
                    ▼
┌────────────────────────────────────────────────┐
│  L2: Application Layer (应用层)                │
│  - Business Logic                              │
│  - Sandbox Lifecycle Management               │
│  - Template Management                        │
│  - Authentication & Authorization             │
└────────────────────────────────────────────────┘
                    ▼
┌────────────────────────────────────────────────┐
│  L3: Domain Layer (领域层)                     │
│  - Sandbox Entity                              │
│  - Template Entity                             │
│  - User Entity                                │
│  - Domain Events                              │
└────────────────────────────────────────────────┘
                    ▼
┌────────────────────────────────────────────────┐
│  L4: Infrastructure Layer (基础设施层)          │
│  - PostgreSQL Repository                       │
│  - Kubernetes Client                          │
│  - S3 Client                                  │
│  - Redis Cache                                │
└────────────────────────────────────────────────┘
```

### 4.2 依赖关系

- **上层依赖下层**：表示层 → 应用层 → 领域层 → 基础设施层
- **接口隔离**：各层通过接口通信，便于测试和替换
- **依赖注入**：使用 FastAPI 的依赖注入系统

---

## 5. 核心组件设计

### 5.1 控制平面组件

#### 5.1.1 API Server (FastAPI)

**职责**：
- 接收 REST API 请求
- 验证 API Key
- 参数校验和序列化
- 调用应用层服务
- 返回 HTTP 响应

**技术选型**：
- **框架**: FastAPI (Python 3.11+)
- **ASGI 服务器**: Uvicorn
- **ORM**: SQLAlchemy 2.0 (async)
- **数据验证**: Pydantic v2

**关键接口**：
```python
class SandboxController:
    async def create_sandbox(req: CreateSandboxRequest) -> SandboxResponse
    async def get_sandbox(sandbox_id: str) -> SandboxResponse
    async def list_sandboxes(filters: SandboxFilters) -> List[SandboxResponse]
    async def pause_sandbox(sandbox_id: str) -> None
    async def connect_sandbox(sandbox_id: str) -> ConnectResponse
    async def delete_sandbox(sandbox_id: str) -> None
```

**扩展性**：
- 无状态设计，支持水平扩展
- 通过 Nginx/Envoy 负载均衡
- 目标：单实例处理 1000 req/s

---

#### 5.1.2 Scheduler (Celery)

**职责**：
- 异步处理耗时任务
- 沙盒创建（调用 K8s API）
- 沙盒暂停（CRIU checkpoint）
- 沙盒清理（删除 Pod 和文件）
- 定时任务（超时清理）

**技术选型**：
- **框架**: Celery
- **消息队列**: Redis (broker)
- **结果存储**: Redis (backend)

**任务定义**：
```python
@celery.task
async def create_sandbox_task(sandbox_id: str, template_id: str, config: dict):
    # 1. 生成 K8s Pod YAML
    # 2. 创建 Pod
    # 3. 等待 envd 就绪
    # 4. 更新数据库状态
    pass

@celery.task
async def pause_sandbox_task(sandbox_id: str):
    # 1. 执行 CRIU checkpoint
    # 2. 上传快照到 S3
    # 3. 删除 Pod
    # 4. 更新数据库状态
    pass
```

**扩展性**：
- 多 worker 并行处理
- 优先级队列（紧急任务优先）

---

#### 5.1.3 Kubernetes Controller

**职责**：
- 与 Kubernetes API 交互
- 创建/删除 Pod
- 配置 RuntimeClass (gVisor)
- 设置 NetworkPolicy
- 资源配额管理

**技术选型**：
- **客户端**: kubernetes-client (Python)
- **配置**: Kubeconfig / ServiceAccount

**关键操作**：
```python
class KubernetesController:
    async def create_pod(
        sandbox_id: str,
        image: str,
        resources: ResourceSpec,
        envd_token: str
    ) -> Pod:
        """创建沙盒 Pod"""
        pass

    async def delete_pod(sandbox_id: str) -> None:
        """删除沙盒 Pod"""
        pass

    async def get_pod_status(sandbox_id: str) -> PodStatus:
        """获取 Pod 状态"""
        pass
```

---

### 5.2 数据平面组件

#### 5.2.1 envd Daemon (Go)

**职责**：
- 运行在每个沙盒 Pod 内
- 提供 Connect RPC 接口
- 进程管理（启动/停止/输出流）
- 文件系统操作（上传/下载）
- 健康检查

**技术选型**：
- **语言**: Go 1.21+
- **RPC 框架**: Connect (gRPC over HTTP/2)
- **协议**: Protocol Buffers v3

**服务定义**：
```protobuf
service CommandsService {
  rpc Start(StartRequest) returns (StartResponse);
  rpc Stream(StreamRequest) returns (stream StreamResponse);
  rpc Kill(KillRequest) returns (KillResponse);
}

service FilesystemService {
  rpc Upload(stream UploadRequest) returns (UploadResponse);
  rpc Download(DownloadRequest) returns (stream DownloadResponse);
  rpc List(ListRequest) returns (ListResponse);
}
```

**性能目标**：
- 进程启动延迟 < 50ms
- 输出流延迟 < 100ms
- 内存占用 < 20MB

---

### 5.3 存储组件

#### 5.3.1 PostgreSQL (元数据存储)

**存储内容**：
- 沙盒记录（id, status, template_id, created_at, etc.）
- 模板记录
- 用户记录
- API Key 记录

**表结构** (详见 L3.2 数据库设计)：
- `sandboxes`
- `templates`
- `users`
- `api_keys`
- `audit_logs`

**高可用方案**：
- 主从复制（1 主 + 2 从）
- 自动故障转移（Patroni）

---

#### 5.3.2 Redis (缓存和队列)

**用途**：
- Celery 消息队列
- Celery 结果存储
- API 响应缓存（沙盒状态）
- 分布式锁（防止重复创建）

**数据结构**：
```
cache:sandbox:{id}        → Hash (缓存沙盒信息)
queue:create_sandbox      → List (Celery 队列)
lock:sandbox:{id}:create  → String (分布式锁)
```

**高可用方案**：
- Redis Sentinel (3 节点)
- 持久化：RDB + AOF

---

#### 5.3.3 S3/MinIO (对象存储)

**用途**：
- CRIU 检查点文件存储
- 模板镜像存储（可选）
- 审计日志归档

**目录结构**：
```
s3://bucket/
  checkpoints/
    {sandbox_id}/
      checkpoint.tar.gz
  templates/
    {template_id}/
      image.tar
  audit-logs/
    2025/11/05/
      api-server.log
```

---

## 6. 部署架构

### 6.1 Kubernetes 部署拓扑

```
┌─────────────────────────────────────────────────────────┐
│  Kubernetes Cluster (3 Master + N Worker Nodes)        │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Namespace: gvisor-e2b-control                          │
│  ┌────────────────────────────────────────────────┐    │
│  │  Deployment: api-server (3 replicas)           │    │
│  │  Service: api-server (ClusterIP)               │    │
│  │  Ingress: api-server (TLS)                     │    │
│  └────────────────────────────────────────────────┘    │
│  ┌────────────────────────────────────────────────┐    │
│  │  Deployment: celery-worker (5 replicas)        │    │
│  └────────────────────────────────────────────────┘    │
│  ┌────────────────────────────────────────────────┐    │
│  │  StatefulSet: postgresql (1 master + 2 slaves) │    │
│  │  Service: postgresql (Headless)                │    │
│  └────────────────────────────────────────────────┘    │
│  ┌────────────────────────────────────────────────┐    │
│  │  StatefulSet: redis-sentinel (3 replicas)      │    │
│  │  Service: redis (ClusterIP)                    │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  Namespace: gvisor-e2b-sandboxes                        │
│  ┌────────────────────────────────────────────────┐    │
│  │  Pod: sandbox-{id} (动态创建)                   │    │
│  │    RuntimeClass: gvisor                        │    │
│  │    Labels: app=sandbox, sandbox-id={id}       │    │
│  │    Resources: 2 CPU, 4Gi Memory                │    │
│  │    NetworkPolicy: Isolated                     │    │
│  └────────────────────────────────────────────────┘    │
│  (每个沙盒一个独立 Pod)                                 │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 6.2 节点规划

#### 6.2.1 控制平面节点

| 组件 | CPU | 内存 | 磁盘 | 数量 |
|------|-----|------|------|------|
| api-server | 2 | 4Gi | 20Gi | 3 |
| celery-worker | 4 | 8Gi | 20Gi | 5 |
| postgresql | 8 | 32Gi | 500Gi SSD | 3 |
| redis | 2 | 8Gi | 50Gi SSD | 3 |

#### 6.2.2 沙盒节点

| 规格 | CPU | 内存 | 磁盘 | 容量（每节点） |
|------|-----|------|------|----------------|
| **标准** | 32 | 128Gi | 1Ti SSD | 100 沙盒 |
| **高配** | 64 | 256Gi | 2Ti SSD | 200 沙盒 |

**节点标签**：
```yaml
nodeSelector:
  workload: sandboxes
  gvisor: enabled
```

---

## 7. 技术栈选型

### 7.1 完整技术栈

| 层次 | 技术 | 版本 | 选型理由 |
|------|------|------|----------|
| **容器运行时** | gVisor (runsc) | latest | 系统调用隔离 |
| **容器编排** | Kubernetes | 1.28+ | 成熟的编排平台 |
| **控制平面** | FastAPI | 0.104+ | 高性能异步框架 |
| **任务队列** | Celery | 5.3+ | 成熟的分布式任务队列 |
| **数据平面** | Go | 1.21+ | 高性能 RPC |
| **RPC 协议** | Connect | latest | gRPC over HTTP/2 |
| **数据库** | PostgreSQL | 15+ | 强一致性 |
| **缓存** | Redis | 7+ | 高性能内存存储 |
| **对象存储** | MinIO | latest | S3 兼容 |
| **负载均衡** | Nginx | 1.24+ | 高性能反向代理 |
| **监控** | Prometheus | 2.45+ | 时序数据库 |
| **日志** | Loki | 2.9+ | 日志聚合 |
| **追踪** | Jaeger | 1.50+ | 分布式追踪 |

### 7.2 开发工具

| 工具 | 用途 |
|------|------|
| **Poetry** | Python 依赖管理 |
| **Docker Compose** | 本地开发环境 |
| **Helm** | Kubernetes 应用打包 |
| **Skaffold** | 开发流程自动化 |
| **Tilt** | 实时开发反馈 |

---

## 8. 关键技术决策

### 8.1 ADR-001: 使用 gVisor 替代 Firecracker

**背景**：E2B 使用 Firecracker 提供虚拟机级别隔离

**决策**：采用 gVisor (runsc) 作为容器运行时

**理由**：
- ✅ 更低的资源开销（10-20MB vs 50-100MB）
- ✅ 更快的启动速度（50-100ms vs 150-300ms）
- ✅ 原生 Kubernetes 支持（无需定制）
- ✅ 更简单的部署（无需 KVM 支持）
- ⚠️ 隔离强度稍弱（系统调用 vs VM），但满足需求

**后果**：
- 需要 Linux Kernel 4.14+
- 某些系统调用可能不支持（需测试）

---

### 8.2 ADR-002: 控制平面使用 FastAPI (Python)

**背景**：需要快速开发 REST API

**决策**：使用 FastAPI + Python 3.11+

**理由**：
- ✅ 快速开发和迭代
- ✅ 自动生成 OpenAPI 文档
- ✅ 强类型支持（Pydantic）
- ✅ 异步 I/O 性能
- ✅ 丰富的生态系统
- ⚠️ 性能略低于 Go/Rust

**后果**：
- 需要优化 Python 性能（使用 Uvicorn + uvloop）
- 需要严格的类型检查（mypy）

---

### 8.3 ADR-003: 数据平面使用 Go + Connect RPC

**背景**：envd 需要高性能、低延迟

**决策**：使用 Go 1.21+ 和 Connect RPC

**理由**：
- ✅ 高性能（低延迟 RPC）
- ✅ 低内存占用（20MB 以内）
- ✅ 静态编译（易于分发）
- ✅ 成熟的 gRPC 生态
- ✅ Connect 简化了 gRPC 使用

**后果**：
- 需要维护 Protocol Buffers 定义
- Go 和 Python 代码需要分别维护

---

### 8.4 ADR-004: 使用 CRIU 实现暂停/恢复

**背景**：E2B 使用 Firecracker 快照

**决策**：使用 CRIU (Checkpoint/Restore In Userspace)

**理由**：
- ✅ Linux 标准工具，成熟稳定
- ✅ 支持容器快照
- ✅ 性能可接受（2-4s per GB）
- ⚠️ 某些程序状态无法序列化（需测试）

**后果**：
- 需要内核支持 CRIU（大部分现代 Linux 支持）
- 需要处理 CRIU 失败情况

---

### 8.5 ADR-005: 异步任务使用 Celery

**背景**：沙盒创建是耗时操作

**决策**：使用 Celery + Redis

**理由**：
- ✅ Python 生态最成熟的任务队列
- ✅ 支持优先级队列
- ✅ 支持定时任务
- ✅ 丰富的监控工具（Flower）

**后果**：
- 需要运维 Redis
- 需要监控队列积压

---

## 9. 扩展性设计

### 9.1 水平扩展能力

| 组件 | 扩展方式 | 瓶颈 |
|------|----------|------|
| **API Server** | 增加 Pod 副本数 | 数据库连接池 |
| **Celery Worker** | 增加 Pod 副本数 | Redis 吞吐 |
| **Sandbox Pods** | 增加 K8s 节点 | 节点资源 |
| **PostgreSQL** | 读写分离 | 写入 TPS |
| **Redis** | Redis Cluster | 内存容量 |

### 9.2 容量规划

**单集群容量**：
- **API Server**: 3 副本，每个 1000 req/s = **3000 req/s**
- **Celery Worker**: 5 副本，每个 50 任务/min = **250 任务/min**
- **Sandbox Pods**: 10 节点 × 100 沙盒 = **1000 并发沙盒**

**扩展路径**：
- **短期** (0-6个月): 单集群
- **中期** (6-12个月): 多集群（按地域）
- **长期** (12个月+): 多地域 + 联邦集群

### 9.3 性能优化点

| 优化项 | 方案 | 预期收益 |
|--------|------|----------|
| **沙盒冷启动** | 镜像预拉取 + 模板预热 | 减少 50% 启动时间 |
| **数据库查询** | 索引优化 + 查询缓存 | 减少 80% 查询时间 |
| **API 响应** | Redis 缓存 | 减少 90% 数据库压力 |
| **文件传输** | 并行分片上传 | 提升 3x 吞吐 |

---

## 10. 安全架构

### 10.1 安全层次

```
┌────────────────────────────────────────────────┐
│  L1: 网络安全                                   │
│  - TLS 加密 (Ingress)                          │
│  - NetworkPolicy (沙盒隔离)                    │
│  - DDoS 防护 (Cloudflare)                      │
└────────────────────────────────────────────────┘
                    ▼
┌────────────────────────────────────────────────┐
│  L2: 应用安全                                   │
│  - API Key 认证                                │
│  - envd Token 授权                             │
│  - 限流 (Rate Limiting)                        │
│  - 输入校验 (Pydantic)                         │
└────────────────────────────────────────────────┘
                    ▼
┌────────────────────────────────────────────────┐
│  L3: 容器安全                                   │
│  - gVisor 系统调用隔离                         │
│  - Seccomp 配置                                │
│  - AppArmor 配置                               │
│  - 非 root 用户运行                            │
└────────────────────────────────────────────────┘
                    ▼
┌────────────────────────────────────────────────┐
│  L4: 数据安全                                   │
│  - 数据库加密 (at rest)                        │
│  - S3 加密 (at rest)                           │
│  - 敏感字段加密 (环境变量)                      │
│  - 审计日志                                    │
└────────────────────────────────────────────────┘
```

### 10.2 认证授权流程

#### 10.2.1 控制平面认证

```
Client → API Server
   │
   ├─ Header: X-API-Key: {api_key}
   │
   └─ 验证流程:
       1. 从数据库查询 API Key
       2. 检查是否过期
       3. 检查权限范围
       4. 记录审计日志
```

#### 10.2.2 数据平面认证

```
Client SDK → envd
   │
   ├─ Header: Authorization: Bearer {envd_access_token}
   │
   └─ 验证流程:
       1. 验证 JWT 签名
       2. 检查 sandbox_id 匹配
       3. 检查 token 未过期
```

### 10.3 资源隔离

| 资源类型 | 隔离方式 |
|----------|----------|
| **CPU** | Kubernetes ResourceQuota + cgroup |
| **内存** | Kubernetes ResourceQuota + cgroup |
| **磁盘** | Kubernetes EmptyDir + size limit |
| **网络** | NetworkPolicy (默认 deny all) |
| **进程** | gVisor PID namespace |
| **文件系统** | gVisor Mount namespace |

---

## 11. 性能优化策略

### 11.1 冷启动优化

**目标**：< 2s (从 API 调用到 envd 可用)

**优化点**：
1. **镜像预拉取** (节省 500ms)
   - 在节点上预拉取常用模板镜像
   - 使用 DaemonSet 定时更新

2. **资源预分配** (节省 200ms)
   - 预创建部分沙盒 Pod（池化）
   - 动态调整池大小

3. **并行操作** (节省 300ms)
   - 数据库写入和 K8s Pod 创建并行
   - envd 启动和健康检查并行

**优化后流程**：
```
API 请求 (0ms)
  ├─ 参数验证 (10ms)
  ├─ 数据库写入 (50ms, 并行)
  └─ K8s Pod 创建 (1000ms, 并行)
      ├─ 调度 (100ms)
      ├─ 镜像拉取 (0ms, 已预拉取)
      ├─ 容器启动 (800ms)
      └─ envd 就绪 (100ms)
  ├─ 返回响应 (1200ms)
```

### 11.2 数据库优化

**索引设计**：
```sql
CREATE INDEX idx_sandboxes_status ON sandboxes(status);
CREATE INDEX idx_sandboxes_user_id ON sandboxes(user_id);
CREATE INDEX idx_sandboxes_created_at ON sandboxes(created_at DESC);
```

**连接池配置**：
```python
engine = create_async_engine(
    DATABASE_URL,
    pool_size=50,          # 每个实例 50 连接
    max_overflow=100,      # 最大溢出 100
    pool_pre_ping=True,    # 连接健康检查
)
```

**查询优化**：
- 使用 `SELECT DISTINCT ON` 避免子查询
- 分页查询使用 cursor (keyset pagination)
- 批量插入使用 `INSERT ... ON CONFLICT`

### 11.3 缓存策略

| 数据类型 | 缓存时间 | 失效策略 |
|----------|----------|----------|
| **沙盒状态** | 10s | 状态变更时删除 |
| **模板信息** | 1h | 模板更新时删除 |
| **用户信息** | 5m | 用户更新时删除 |
| **API Key** | 30m | API Key 更新时删除 |

---

## 12. 可观测性架构

### 12.1 监控指标

#### 12.1.1 系统指标

```prometheus
# API Server
http_request_duration_seconds{method="POST", path="/sandboxes"}
http_request_total{method="POST", path="/sandboxes", status="201"}
api_key_validation_duration_seconds

# Celery
celery_task_duration_seconds{task="create_sandbox"}
celery_task_total{task="create_sandbox", status="success"}
celery_queue_length{queue="create_sandbox"}

# Sandbox
sandbox_creation_duration_seconds
sandbox_pause_duration_seconds
sandbox_active_total
sandbox_total{status="running|paused|terminated"}
```

#### 12.1.2 业务指标

```prometheus
# 用户行为
user_api_calls_total{user_id, endpoint}
user_sandbox_count{user_id}

# 资源使用
sandbox_cpu_usage_percent{sandbox_id}
sandbox_memory_usage_bytes{sandbox_id}
```

### 12.2 日志架构

```
┌────────────────────────────────────────────────┐
│  应用日志                                       │
│  - API Server (JSON logs)                     │
│  - Celery Worker (JSON logs)                  │
│  - envd (structured logs)                     │
└────────────────────────────────────────────────┘
                    ▼
┌────────────────────────────────────────────────┐
│  Promtail (Log Collector)                      │
│  - 采集容器日志                                │
│  - 添加 K8s metadata                           │
└────────────────────────────────────────────────┘
                    ▼
┌────────────────────────────────────────────────┐
│  Loki (Log Aggregation)                        │
│  - 索引和存储                                  │
│  - 支持 LogQL 查询                             │
└────────────────────────────────────────────────┘
                    ▼
┌────────────────────────────────────────────────┐
│  Grafana (Visualization)                       │
│  - 日志查询和展示                              │
│  - 告警规则                                    │
└────────────────────────────────────────────────┘
```

### 12.3 分布式追踪

**追踪流程**：
```
HTTP Request → API Server → Celery Task → K8s API → envd
      ↓              ↓             ↓            ↓        ↓
   Trace ID      Span 1        Span 2       Span 3   Span 4
```

**Trace Context 传播**：
- HTTP: `traceparent` header (W3C Trace Context)
- gRPC: `grpc-trace-bin` metadata

---

## 附录

### A. 架构决策记录 (ADR) 目录

| ADR | 标题 | 状态 |
|-----|------|------|
| ADR-001 | 使用 gVisor 替代 Firecracker | Accepted |
| ADR-002 | 控制平面使用 FastAPI | Accepted |
| ADR-003 | 数据平面使用 Go + Connect RPC | Accepted |
| ADR-004 | 使用 CRIU 实现暂停/恢复 | Accepted |
| ADR-005 | 异步任务使用 Celery | Accepted |

### B. 架构风险评估

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| CRIU 兼容性问题 | High | Medium | 提供降级方案（不支持暂停） |
| gVisor 性能不足 | Medium | Low | 性能测试，必要时切换 kata-containers |
| K8s 调度延迟 | Medium | Medium | 资源预分配，优化调度策略 |
| PostgreSQL 写入瓶颈 | High | Low | 读写分离，分库分表 |

### C. 技术债务

| 债务项 | 优先级 | 计划时间 |
|--------|--------|----------|
| 完善单元测试覆盖率 (目标 80%) | P1 | Month 2 |
| 实现集成测试 (E2E) | P1 | Month 3 |
| 性能压测和优化 | P0 | Month 4 |
| 安全审计 | P0 | Month 5 |

---

**下一步**: 基于本架构文档创建 [L3: 三大设计文档](L3.1-sequence-diagram-design.md)
- L3.1: 时序图设计
- L3.2: 数据库设计
- L3.3: 业务规则设计
