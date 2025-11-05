# L0 Supplement: Rate Limits 设计文档

**文档版本**: v1.0
**创建日期**: 2025-11-05
**状态**: Draft
**补充说明**: 本文档补充 L1-L5 设计文档中缺失的 API Rate Limiting 功能

---

## 目录

1. [功能概述](#1-功能概述)
2. [Rate Limit 规则](#2-rate-limit-规则)
3. [技术实现](#3-技术实现)
4. [API 规范](#4-api-规范)
5. [业务规则](#5-业务规则)
6. [与 L1-L5 的集成](#6-与-l1-l5-的集成)

---

## 1. 功能概述

### 1.1 Rate Limits

**官方文档**: https://e2b.dev/docs/sandbox/rate-limits

**功能描述**:
- API 请求速率限制，防止滥用
- 支持多维度限流（用户、IP、API Key）
- 支持不同计费套餐的不同限额
- 返回标准 HTTP 429 错误

**核心价值**:
- 🛡️ **防护滥用**: 防止恶意用户攻击
- ⚖️ **公平使用**: 确保资源公平分配
- 💰 **商业模式**: 支持分级计费
- 🚀 **服务质量**: 保护系统稳定性

### 1.2 E2B 官方速率限制规则

**E2B 的速率限制表**:

| 操作类型 | Hobby | Pro | Enterprise |
|---------|-------|-----|------------|
| **Sandbox Lifecycle API** | 20,000/30s | 20,000/30s | Custom |
| **Sandbox Operations** | 40,000/60s per IP | 40,000/60s per IP | Custom |
| **并发沙盒数** | 20 | 100 (可扩展到1100) | 1100+ |
| **沙盒创建速率** | 1/s | 5/s | 5+/s |

**Sandbox Lifecycle API**:
- 包括：创建、列出、获取、删除、暂停、连接等沙盒管理操作
- 限制：30 秒窗口内最多 20,000 次请求

**Sandbox Operations**:
- 包括：所有通过 envd 的操作（命令执行、文件操作等）
- 限制：60 秒窗口内每 IP 最多 40,000 次请求

**错误响应**:
- HTTP 状态码：`429 Too Many Requests`
- JavaScript SDK: `RateLimitError`
- Python SDK: `RateLimitException`

---

## 2. Rate Limit 规则

### 2.1 Control Plane API 速率限制

**按用户限流**:

| API 端点类别 | Hobby | Pro | Enterprise |
|-------------|-------|-----|------------|
| **Sandbox 管理** | 20,000/30s | 20,000/30s | 50,000/30s |
| **Template 管理** | 1,000/30s | 5,000/30s | 10,000/30s |
| **Events 查询** | 10,000/30s | 50,000/30s | 100,000/30s |
| **Webhooks 管理** | 100/30s | 500/30s | 1,000/30s |
| **Metrics 查询** | 5,000/30s | 20,000/30s | 50,000/30s |

**按 IP 限流** (全局):

| 操作类型 | 限制 | 说明 |
|---------|------|------|
| **所有 API** | 10,000/min | 防止单个 IP 攻击 |
| **登录 API** | 10/min | 防止暴力破解 |
| **注册 API** | 5/hour | 防止批量注册 |

### 2.2 Data Plane API 速率限制

**envd gRPC 操作** (按沙盒):

| 操作类型 | 限制 | 说明 |
|---------|------|------|
| **命令执行** | 100/min | 防止进程爆炸 |
| **文件上传** | 50/min | 防止磁盘攻击 |
| **文件下载** | 100/min | 防止流量滥用 |
| **文件监听** | 10/min | 防止 watcher 过多 |

### 2.3 并发限制

**活跃沙盒数限制**:

| 套餐 | 限制 | 说明 |
|------|------|------|
| **Hobby** | 20 | 同时运行的沙盒数 |
| **Pro** | 100 | 可联系支持扩展到 1100 |
| **Enterprise** | 1100+ | 定制化配额 |

**沙盒创建速率**:

| 套餐 | 限制 | 说明 |
|------|------|------|
| **Hobby** | 1/s | 每秒最多创建 1 个 |
| **Pro** | 5/s | 每秒最多创建 5 个 |
| **Enterprise** | 5+/s | 定制化速率 |

---

## 3. 技术实现

### 3.1 分布式限流算法

**选择**: Token Bucket (令牌桶算法)

**优势**:
- 允许短时突发流量
- 精确控制平均速率
- 分布式友好（基于 Redis）

**实现** (基于 Redis):

```python
import redis
import time

class TokenBucketRateLimiter:
    """
    Token Bucket 限流器（基于 Redis）
    """

    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client

    async def is_allowed(
        self,
        key: str,
        max_tokens: int,
        refill_rate: float,
        cost: int = 1
    ) -> tuple[bool, dict]:
        """
        检查是否允许请求

        Args:
            key: 限流键（如 "rate_limit:user:123:sandbox_create")
            max_tokens: 桶容量（最大令牌数）
            refill_rate: 填充速率（令牌/秒）
            cost: 请求消耗的令牌数（默认 1）

        Returns:
            (是否允许, 限流信息字典)
        """
        now = time.time()
        bucket_key = f"rate_limit:{key}"

        # Lua 脚本（原子操作）
        lua_script = """
        local bucket_key = KEYS[1]
        local max_tokens = tonumber(ARGV[1])
        local refill_rate = tonumber(ARGV[2])
        local cost = tonumber(ARGV[3])
        local now = tonumber(ARGV[4])

        -- 获取当前桶状态
        local bucket = redis.call('HMGET', bucket_key, 'tokens', 'last_refill')
        local tokens = tonumber(bucket[1]) or max_tokens
        local last_refill = tonumber(bucket[2]) or now

        -- 计算新增令牌
        local elapsed = now - last_refill
        local new_tokens = math.min(max_tokens, tokens + elapsed * refill_rate)

        -- 尝试消耗令牌
        if new_tokens >= cost then
            new_tokens = new_tokens - cost
            redis.call('HMSET', bucket_key, 'tokens', new_tokens, 'last_refill', now)
            redis.call('EXPIRE', bucket_key, 3600)  -- 1 小时过期
            return {1, new_tokens, max_tokens}  -- 允许
        else
            return {0, new_tokens, max_tokens}  -- 拒绝
        end
        """

        result = await self.redis.eval(
            lua_script,
            1,  # 1 个 key
            bucket_key,
            max_tokens,
            refill_rate,
            cost,
            now
        )

        allowed = bool(result[0])
        remaining_tokens = int(result[1])
        total_tokens = int(result[2])

        # 计算重试时间
        if not allowed:
            tokens_needed = cost - remaining_tokens
            retry_after_seconds = int(tokens_needed / refill_rate) + 1
        else:
            retry_after_seconds = 0

        info = {
            "allowed": allowed,
            "remaining": remaining_tokens,
            "limit": total_tokens,
            "retry_after": retry_after_seconds
        }

        return allowed, info
```

### 3.2 FastAPI 中间件实现

```python
from fastapi import Request, Response, status
from fastapi.responses import JSONResponse

class RateLimitMiddleware:
    """
    API 速率限制中间件
    """

    def __init__(self, app, limiter: TokenBucketRateLimiter):
        self.app = app
        self.limiter = limiter

    async def __call__(self, request: Request, call_next):
        # 1. 识别用户
        user = request.state.user  # 从认证中间件获取
        if not user:
            return await call_next(request)

        # 2. 获取用户套餐
        plan = user.metadata.get("plan", "hobby")
        rate_limits = RATE_LIMITS[plan]

        # 3. 确定 API 端点类别
        path = request.url.path
        method = request.method

        if path.startswith("/v1/sandboxes") and method == "POST":
            category = "sandbox_create"
            max_requests = rate_limits["sandbox_create"]["max"]
            window_seconds = rate_limits["sandbox_create"]["window"]
        elif path.startswith("/v1/sandboxes"):
            category = "sandbox_api"
            max_requests = rate_limits["sandbox_api"]["max"]
            window_seconds = rate_limits["sandbox_api"]["window"]
        else:
            # 其他 API
            return await call_next(request)

        # 4. 检查速率限制
        refill_rate = max_requests / window_seconds
        key = f"user:{user.id}:{category}"

        allowed, info = await self.limiter.is_allowed(
            key=key,
            max_tokens=max_requests,
            refill_rate=refill_rate,
            cost=1
        )

        # 5. 设置响应头
        response = await call_next(request) if allowed else None

        if response:
            response.headers["X-RateLimit-Limit"] = str(info["limit"])
            response.headers["X-RateLimit-Remaining"] = str(info["remaining"])
            response.headers["X-RateLimit-Reset"] = str(
                int(time.time()) + window_seconds
            )
            return response
        else:
            # 6. 返回 429 错误
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={
                    "error": {
                        "code": "rate_limit_exceeded",
                        "message": f"Rate limit exceeded: {max_requests} requests per {window_seconds}s",
                        "details": {
                            "limit": info["limit"],
                            "remaining": info["remaining"],
                            "retry_after": info["retry_after"]
                        }
                    }
                },
                headers={
                    "X-RateLimit-Limit": str(info["limit"]),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(int(time.time()) + window_seconds),
                    "Retry-After": str(info["retry_after"])
                }
            )


# 速率限制配置
RATE_LIMITS = {
    "hobby": {
        "sandbox_create": {"max": 1, "window": 1},  # 1/s
        "sandbox_api": {"max": 20000, "window": 30},  # 20k/30s
        "template_api": {"max": 1000, "window": 30},
        "events_api": {"max": 10000, "window": 30},
        "webhooks_api": {"max": 100, "window": 30},
        "metrics_api": {"max": 5000, "window": 30}
    },
    "pro": {
        "sandbox_create": {"max": 5, "window": 1},  # 5/s
        "sandbox_api": {"max": 20000, "window": 30},
        "template_api": {"max": 5000, "window": 30},
        "events_api": {"max": 50000, "window": 30},
        "webhooks_api": {"max": 500, "window": 30},
        "metrics_api": {"max": 20000, "window": 30}
    },
    "enterprise": {
        "sandbox_create": {"max": 10, "window": 1},  # 10/s
        "sandbox_api": {"max": 50000, "window": 30},
        "template_api": {"max": 10000, "window": 30},
        "events_api": {"max": 100000, "window": 30},
        "webhooks_api": {"max": 1000, "window": 30},
        "metrics_api": {"max": 50000, "window": 30}
    }
}
```

### 3.3 IP 限流实现

```python
async def ip_rate_limit_middleware(request: Request, call_next):
    """
    IP 维度速率限制（全局防护）
    """
    ip_address = request.client.host

    # 特殊路径处理
    path = request.url.path

    if path == "/v1/auth/login":
        # 登录 API：10/min
        key = f"ip:{ip_address}:login"
        max_requests = 10
        window_seconds = 60
    elif path == "/v1/auth/register":
        # 注册 API：5/hour
        key = f"ip:{ip_address}:register"
        max_requests = 5
        window_seconds = 3600
    else:
        # 其他 API：10,000/min
        key = f"ip:{ip_address}:global"
        max_requests = 10000
        window_seconds = 60

    refill_rate = max_requests / window_seconds
    allowed, info = await rate_limiter.is_allowed(
        key=key,
        max_tokens=max_requests,
        refill_rate=refill_rate
    )

    if not allowed:
        return JSONResponse(
            status_code=429,
            content={
                "error": {
                    "code": "ip_rate_limit_exceeded",
                    "message": f"Too many requests from IP {ip_address}",
                    "details": {
                        "retry_after": info["retry_after"]
                    }
                }
            },
            headers={"Retry-After": str(info["retry_after"])}
        )

    return await call_next(request)
```

### 3.4 并发沙盒数限制

```python
async def check_concurrent_sandbox_limit(user_id: UUID):
    """
    检查并发沙盒数限制（BR-021）
    """
    user = await db.get(User, user_id)
    plan = user.metadata.get("plan", "hobby")

    max_concurrent = {
        "hobby": 20,
        "pro": 100,
        "enterprise": 1100
    }[plan]

    # 统计活跃沙盒
    active_count = await db.query(Sandbox).filter(
        Sandbox.user_id == user_id,
        Sandbox.status.in_(["running", "paused"]),
        Sandbox.deleted_at.is_(None)
    ).count()

    if active_count >= max_concurrent:
        raise RateLimitException(
            code="concurrent_sandbox_limit_exceeded",
            message=f"Maximum {max_concurrent} concurrent sandboxes for {plan} plan",
            limit=max_concurrent,
            current=active_count
        )
```

---

## 4. API 规范

### 4.1 Rate Limit 响应头

**成功请求**:
```
HTTP/1.1 200 OK
X-RateLimit-Limit: 20000
X-RateLimit-Remaining: 19543
X-RateLimit-Reset: 1699200926
```

**超限响应**:
```
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 20000
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1699200926
Retry-After: 15

{
  "error": {
    "code": "rate_limit_exceeded",
    "message": "Rate limit exceeded: 20000 requests per 30 seconds",
    "details": {
      "limit": 20000,
      "remaining": 0,
      "retry_after": 15
    }
  }
}
```

**响应头说明**:
- `X-RateLimit-Limit`: 时间窗口内的最大请求数
- `X-RateLimit-Remaining`: 剩余可用请求数
- `X-RateLimit-Reset`: 限制重置的 Unix 时间戳
- `Retry-After`: 建议等待的秒数（仅 429 响应）

### 4.2 查询速率限制状态 (可选)

**Endpoint**: `GET /v1/rate-limits`

**描述**: 查询当前用户的速率限制状态

**响应** (200 OK):
```json
{
  "plan": "pro",
  "limits": {
    "sandbox_create": {
      "limit": 5,
      "window": 1,
      "unit": "per second",
      "remaining": 4,
      "reset_at": "2025-11-05T12:35:01.000Z"
    },
    "sandbox_api": {
      "limit": 20000,
      "window": 30,
      "unit": "per 30 seconds",
      "remaining": 18532,
      "reset_at": "2025-11-05T12:35:30.000Z"
    },
    "concurrent_sandboxes": {
      "limit": 100,
      "current": 15,
      "available": 85
    }
  }
}
```

---

## 5. 业务规则

### BR-090: API 速率限制（已存在，补充细节）

**规则类型**: 强制规则
**描述**: API 请求速率限制，防止滥用

**分级限制**:
```python
RATE_LIMITS = {
    "hobby": {
        "sandbox_create": "1/s",
        "sandbox_api": "20000/30s",
        "template_api": "1000/30s",
        "events_api": "10000/30s"
    },
    "pro": {
        "sandbox_create": "5/s",
        "sandbox_api": "20000/30s",
        "template_api": "5000/30s",
        "events_api": "50000/30s"
    },
    "enterprise": {
        # 定制化
    }
}
```

### BR-150: IP 全局限流

**规则类型**: 强制规则
**描述**: 每个 IP 地址全局限流

**配置**:
```python
IP_RATE_LIMITS = {
    "global": "10000/min",      # 所有 API
    "login": "10/min",          # 登录 API
    "register": "5/hour"        # 注册 API
}
```

### BR-151: 并发沙盒数限制

**规则类型**: 强制规则
**描述**: 每个用户的并发沙盒数限制

**配置**:
```python
MAX_CONCURRENT_SANDBOXES = {
    "hobby": 20,
    "pro": 100,
    "enterprise": 1100
}
```

### BR-152: 沙盒创建速率限制

**规则类型**: 强制规则
**描述**: 每个用户的沙盒创建速率限制

**配置**:
```python
SANDBOX_CREATE_RATE_LIMIT = {
    "hobby": "1/s",
    "pro": "5/s",
    "enterprise": "10/s"
}
```

### BR-153: Rate Limit 宽限期

**规则类型**: 软规则
**描述**: 新用户首 24 小时享受更高限额（可选）

**配置**:
```python
GRACE_PERIOD_HOURS = 24
GRACE_PERIOD_MULTIPLIER = 2  # 2 倍限额
```

**实现**:
```python
async def get_rate_limit_for_user(user: User) -> dict:
    plan = user.metadata.get("plan", "hobby")
    limits = RATE_LIMITS[plan]

    # 检查是否在宽限期
    account_age = datetime.utcnow() - user.created_at
    if account_age < timedelta(hours=GRACE_PERIOD_HOURS):
        # 提高限额
        limits = {
            k: {
                "max": v["max"] * GRACE_PERIOD_MULTIPLIER,
                "window": v["window"]
            }
            for k, v in limits.items()
        }

    return limits
```

---

## 6. 与 L1-L5 的集成

### 6.1 L1 产品需求 - 新增非功能需求

**NFR 6.6: API 速率限制**

**描述**:
- 所有 API 实施速率限制
- 支持多级套餐（Hobby, Pro, Enterprise）
- 返回标准 HTTP 429 错误和重试头

**优先级**: P0

### 6.2 L2 系统架构 - 新增组件

**新增组件**:
- **Rate Limiter Middleware**: FastAPI 中间件
- **Redis Cluster**: 分布式限流状态存储
- **Rate Limit Monitor**: 监控和告警（可选）

### 6.3 L3.3 业务规则 - 新增规则

已在 5. 业务规则 中详细说明：
- BR-090: API 速率限制（补充细节）
- BR-150: IP 全局限流
- BR-151: 并发沙盒数限制
- BR-152: 沙盒创建速率限制
- BR-153: Rate Limit 宽限期

### 6.4 L4.1 API 规范 - 新增响应头

已在 4. API 规范 中详细说明：
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`
- `Retry-After`

### 6.5 L4.4 错误矩阵 - 新增错误码

| 错误代码 | HTTP 码 | 描述 |
|----------|---------|------|
| `rate_limit_exceeded` | 429 | API 速率限制超限 |
| `ip_rate_limit_exceeded` | 429 | IP 速率限制超限 |
| `concurrent_sandbox_limit_exceeded` | 403 | 并发沙盒数超限 |
| `sandbox_create_rate_exceeded` | 429 | 沙盒创建速率超限 |

---

## 附录

### A. E2B 兼容性对照表

| 功能 | E2B | 本设计 | 兼容性 |
|------|-----|--------|--------|
| Sandbox Lifecycle API | 20k/30s | ✅ | 100% |
| Sandbox Operations | 40k/60s per IP | ✅ | 100% |
| 并发沙盒数 (Hobby) | 20 | ✅ | 100% |
| 并发沙盒数 (Pro) | 100 | ✅ | 100% |
| 沙盒创建速率 (Hobby) | 1/s | ✅ | 100% |
| 沙盒创建速率 (Pro) | 5/s | ✅ | 100% |
| HTTP 429 响应 | ✅ | ✅ | 100% |
| RateLimitError | ✅ | ✅ | 100% |

### B. 性能指标

| 指标 | 目标值 | 说明 |
|------|--------|------|
| 限流检查延迟 | < 5ms | Redis 查询时间 |
| Redis 内存开销 | 1KB/用户 | Token Bucket 状态 |
| 误限率 | < 0.1% | 分布式一致性 |
| 恢复时间 | 精确 | 令牌桶精确填充 |

### C. SDK 错误处理示例

#### TypeScript SDK

```typescript
import { Sandbox, RateLimitError } from '@gvisor-e2b/sdk';

try {
  const sandbox = await Sandbox.create({
    template: 'python-3.11'
  });
} catch (error) {
  if (error instanceof RateLimitError) {
    console.error('Rate limit exceeded!');
    console.error('Retry after:', error.retryAfter, 'seconds');
    console.error('Limit:', error.limit);
    console.error('Remaining:', error.remaining);

    // 等待后重试
    await new Promise(resolve => setTimeout(resolve, error.retryAfter * 1000));
    // ... 重试
  } else {
    throw error;
  }
}
```

#### Python SDK

```python
from gvisor_e2b import Sandbox, RateLimitException
import time

try:
    sandbox = Sandbox.create(template='python-3.11')
except RateLimitException as e:
    print(f"Rate limit exceeded!")
    print(f"Retry after: {e.retry_after} seconds")
    print(f"Limit: {e.limit}")
    print(f"Remaining: {e.remaining}")

    # 等待后重试
    time.sleep(e.retry_after)
    # ... 重试
```

### D. 监控和告警

**Prometheus Metrics**:
```python
from prometheus_client import Counter, Histogram

# 速率限制计数器
rate_limit_exceeded_total = Counter(
    'rate_limit_exceeded_total',
    'Total rate limit exceeded count',
    ['user_id', 'plan', 'category']
)

# 令牌桶状态
rate_limit_tokens_remaining = Histogram(
    'rate_limit_tokens_remaining',
    'Remaining tokens in rate limit bucket',
    ['user_id', 'category']
)
```

**告警规则** (Prometheus AlertManager):
```yaml
groups:
  - name: rate_limit_alerts
    rules:
      - alert: HighRateLimitUsage
        expr: rate_limit_tokens_remaining < 100
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "User {{ $labels.user_id }} is close to rate limit"

      - alert: FrequentRateLimitExceeded
        expr: rate(rate_limit_exceeded_total[5m]) > 10
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "User {{ $labels.user_id }} frequently exceeding rate limits"
```

### E. 动态调整限额（可选）

**管理员 API** (内部使用):
```python
@app.post("/admin/rate-limits/{user_id}/adjust")
async def adjust_user_rate_limit(
    user_id: UUID,
    category: str,
    new_limit: int,
    admin: User = Depends(require_admin)
):
    """
    动态调整用户速率限制（临时）
    """
    # 更新 Redis 中的限额
    key = f"rate_limit_override:user:{user_id}:{category}"
    await redis.set(key, new_limit, ex=3600)  # 1 小时有效

    return {
        "user_id": user_id,
        "category": category,
        "new_limit": new_limit,
        "expires_in": 3600
    }
```

---

**文档完成** ✅
