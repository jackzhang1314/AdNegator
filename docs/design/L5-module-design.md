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
