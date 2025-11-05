# L0 Supplement: Metrics API 设计文档

**文档版本**: v1.0
**创建日期**: 2025-11-05
**状态**: Draft
**补充说明**: 本文档补充 L1-L5 设计文档中缺失的 Metrics API 功能细节

---

## 目录

1. [功能概述](#1-功能概述)
2. [Metrics 数据结构](#2-metrics-数据结构)
3. [数据库设计](#3-数据库设计)
4. [API 规范](#4-api-规范)
5. [Metrics 采集架构](#5-metrics-采集架构)
6. [业务规则](#6-业务规则)
7. [与 L1-L5 的集成](#7-与-l1-l5-的集成)

---

## 1. 功能概述

### 1.1 Metrics API

**官方文档**: https://e2b.dev/docs/sandbox/metrics

**功能描述**:
- 每 5 秒采集一次沙盒性能指标
- 提供 CPU、内存、磁盘使用情况
- 通过 SDK 或 REST API 访问
- 支持实时和历史查询

**核心价值**:
- 📊 **资源监控**: 实时了解沙盒资源使用
- 🚨 **告警能力**: 资源超限及时通知
- 📈 **容量规划**: 分析历史数据优化配置
- 💰 **成本优化**: 识别资源浪费

### 1.2 E2B 官方行为

**重要特性**:
- 创建沙盒后可能需要 1+ 秒才有第一个数据点
- 空数组表示尚未采集到数据
- 数据每 5 秒更新一次
- 仅保留最近 1 小时的数据（API 端）

---

## 2. Metrics 数据结构

### 2.1 标准 Metrics 对象

**E2B 兼容数据结构**:
```json
{
  "timestamp": "2025-11-05T12:34:56.789Z",
  "cpuUsage": 45.2,           // CPU 使用率百分比 (0-100)
  "cpuCoreCount": 4,          // CPU 核心数
  "memoryUsed": 1073741824,   // 已使用内存（字节）
  "memoryTotal": 2147483648,  // 总内存（字节）
  "diskUsed": 5368709120,     // 已使用磁盘（字节）
  "diskTotal": 10737418240    // 总磁盘（字节）
}
```

**字段说明**:

| 字段 | 类型 | 单位 | 说明 |
|------|------|------|------|
| `timestamp` | string | ISO 8601 | 采集时间 |
| `cpuUsage` | float | % | CPU 使用率（0-100） |
| `cpuCoreCount` | integer | 核 | CPU 核心数 |
| `memoryUsed` | integer | 字节 | 已使用内存 |
| `memoryTotal` | integer | 字节 | 总内存 |
| `diskUsed` | integer | 字节 | 已使用磁盘 |
| `diskTotal` | integer | 字节 | 总磁盘 |

**派生指标计算**:
```python
# 内存使用率
memory_usage_percent = (memory_used / memory_total) * 100

# 磁盘使用率
disk_usage_percent = (disk_used / disk_total) * 100

# 可用内存
memory_available = memory_total - memory_used

# 可用磁盘
disk_available = disk_total - disk_used
```

### 2.2 扩展 Metrics (可选)

除了 E2B 标准字段，我们可以扩展更多指标：

**网络 Metrics**:
```json
{
  "networkRxBytes": 1048576,     // 接收字节数
  "networkTxBytes": 524288,      // 发送字节数
  "networkRxPackets": 1000,      // 接收包数
  "networkTxPackets": 500        // 发送包数
}
```

**进程 Metrics**:
```json
{
  "processCount": 5,             // 运行进程数
  "threadCount": 20              // 线程总数
}
```

**IO Metrics**:
```json
{
  "diskReadBytes": 10485760,     // 磁盘读取字节数
  "diskWriteBytes": 5242880      // 磁盘写入字节数
}
```

---

## 3. 数据库设计

### 3.1 sandbox_metrics 表 - 时序数据

```sql
CREATE TABLE sandbox_metrics (
    -- 主键
    id UUID DEFAULT gen_random_uuid(),

    -- 关联
    sandbox_id UUID NOT NULL REFERENCES sandboxes(id) ON DELETE CASCADE,

    -- 时间戳（分区键）
    collected_at TIMESTAMP WITH TIME ZONE NOT NULL,

    -- CPU Metrics
    cpu_usage_percent NUMERIC(5,2) NOT NULL,  -- 0.00-100.00
    cpu_core_count INTEGER NOT NULL,

    -- Memory Metrics
    memory_used_bytes BIGINT NOT NULL,
    memory_total_bytes BIGINT NOT NULL,

    -- Disk Metrics
    disk_used_bytes BIGINT NOT NULL,
    disk_total_bytes BIGINT NOT NULL,

    -- 扩展 Metrics (可选)
    network_rx_bytes BIGINT DEFAULT 0,
    network_tx_bytes BIGINT DEFAULT 0,
    process_count INTEGER DEFAULT 0,

    -- 主键（组合）
    PRIMARY KEY (sandbox_id, collected_at)

) PARTITION BY RANGE (collected_at);

-- 创建分区（按小时，保留 24 小时）
CREATE TABLE sandbox_metrics_2025_11_05_00 PARTITION OF sandbox_metrics
    FOR VALUES FROM ('2025-11-05 00:00:00+00') TO ('2025-11-05 01:00:00+00');

CREATE TABLE sandbox_metrics_2025_11_05_01 PARTITION OF sandbox_metrics
    FOR VALUES FROM ('2025-11-05 01:00:00+00') TO ('2025-11-05 02:00:00+00');

-- ... (每小时一个分区)

-- 索引
CREATE INDEX idx_sandbox_metrics_sandbox_time
    ON sandbox_metrics(sandbox_id, collected_at DESC);

CREATE INDEX idx_sandbox_metrics_time
    ON sandbox_metrics(collected_at DESC);

-- 自动清理旧分区（超过 24 小时）
CREATE OR REPLACE FUNCTION cleanup_old_metrics_partitions()
RETURNS VOID AS $$
DECLARE
    cutoff_time TIMESTAMP := NOW() - INTERVAL '24 hours';
BEGIN
    -- 删除超过 24 小时的分区
    EXECUTE (
        SELECT string_agg(
            'DROP TABLE IF EXISTS ' || tablename || ';',
            ' '
        )
        FROM pg_tables
        WHERE tablename LIKE 'sandbox_metrics_%'
          AND tablename < 'sandbox_metrics_' ||
              TO_CHAR(cutoff_time, 'YYYY_MM_DD_HH')
    );
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE sandbox_metrics IS '沙盒性能指标表（按小时分区，保留24小时）';
```

### 3.2 数据保留策略

**短期存储** (PostgreSQL):
- 保留时间：24 小时
- 采集频率：5 秒
- 数据量估算：
  - 单条记录：约 100 字节
  - 每个沙盒每天：17,280 条记录（86400 / 5）
  - 100 个活跃沙盒：1.73M 条记录/天 ≈ 173 MB/天

**长期存储** (时序数据库，可选):
- 推荐：InfluxDB / Prometheus / TimescaleDB
- 保留时间：90 天
- 降采样：1 分钟粒度（减少存储）

### 3.3 长期存储表设计 (TimescaleDB)

如果需要长期保留，可以使用 TimescaleDB：

```sql
-- 启用 TimescaleDB 扩展
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- 创建 hypertable
CREATE TABLE sandbox_metrics_long_term (
    sandbox_id UUID NOT NULL,
    collected_at TIMESTAMP WITH TIME ZONE NOT NULL,

    -- 聚合指标（1 分钟粒度）
    cpu_usage_avg NUMERIC(5,2),
    cpu_usage_max NUMERIC(5,2),
    memory_used_avg BIGINT,
    memory_used_max BIGINT,
    disk_used_avg BIGINT,
    disk_used_max BIGINT,

    PRIMARY KEY (sandbox_id, collected_at)
);

-- 转换为 hypertable（时间分片）
SELECT create_hypertable('sandbox_metrics_long_term', 'collected_at');

-- 自动压缩（保留 7 天后压缩）
ALTER TABLE sandbox_metrics_long_term
SET (timescaledb.compress, timescaledb.compress_segmentby = 'sandbox_id');

SELECT add_compression_policy('sandbox_metrics_long_term', INTERVAL '7 days');

-- 自动保留策略（90 天）
SELECT add_retention_policy('sandbox_metrics_long_term', INTERVAL '90 days');
```

---

## 4. API 规范

### 4.1 获取沙盒 Metrics

**Endpoint**: `GET /v1/sandboxes/{sandboxID}/metrics`

**描述**: 获取沙盒的性能指标历史

**路径参数**:
- `sandboxID` (string, required): 沙盒 ID

**查询参数**:
- `from` (string, optional): 起始时间（ISO 8601），默认 1 小时前
- `to` (string, optional): 结束时间（ISO 8601），默认当前时间
- `limit` (integer, optional): 最大返回数量，默认 720（1 小时 @ 5s）

**请求示例**:
```bash
# 获取最近 10 分钟的 metrics
curl -X GET 'https://api.gvisor-e2b.com/v1/sandboxes/sbx_xyz789/metrics?from=2025-11-05T12:00:00Z&to=2025-11-05T12:10:00Z' \
  -H 'X-API-Key: sk_abc123...'
```

**响应** (200 OK):
```json
{
  "sandboxID": "sbx_xyz789",
  "metrics": [
    {
      "timestamp": "2025-11-05T12:10:00.000Z",
      "cpuUsage": 45.2,
      "cpuCoreCount": 4,
      "memoryUsed": 1073741824,
      "memoryTotal": 2147483648,
      "diskUsed": 5368709120,
      "diskTotal": 10737418240
    },
    {
      "timestamp": "2025-11-05T12:09:55.000Z",
      "cpuUsage": 42.8,
      "cpuCoreCount": 4,
      "memoryUsed": 1048576000,
      "memoryTotal": 2147483648,
      "diskUsed": 5368709120,
      "diskTotal": 10737418240
    },
    // ... 更多数据点（最多 120 个，10 分钟 @ 5s）
  ],
  "summary": {
    "cpu": {
      "avg": 43.5,
      "min": 38.2,
      "max": 52.1
    },
    "memory": {
      "avgUsedBytes": 1060158976,
      "maxUsedBytes": 1100000000,
      "avgUsagePercent": 49.3
    },
    "disk": {
      "avgUsedBytes": 5368709120,
      "maxUsedBytes": 5400000000,
      "avgUsagePercent": 50.0
    }
  }
}
```

**错误码**:
- `404` - 沙盒不存在 (sandbox_not_found)
- `400` - 时间范围无效 (invalid_time_range)

### 4.2 获取最新 Metrics

**Endpoint**: `GET /v1/sandboxes/{sandboxID}/metrics/latest`

**描述**: 获取沙盒的最新性能指标（单个数据点）

**请求示例**:
```bash
curl -X GET 'https://api.gvisor-e2b.com/v1/sandboxes/sbx_xyz789/metrics/latest' \
  -H 'X-API-Key: sk_abc123...'
```

**响应** (200 OK):
```json
{
  "sandboxID": "sbx_xyz789",
  "metric": {
    "timestamp": "2025-11-05T12:34:56.789Z",
    "cpuUsage": 45.2,
    "cpuCoreCount": 4,
    "memoryUsed": 1073741824,
    "memoryTotal": 2147483648,
    "diskUsed": 5368709120,
    "diskTotal": 10737418240
  }
}
```

**特殊情况**:
- 如果沙盒刚创建，可能返回空：
  ```json
  {
    "sandboxID": "sbx_xyz789",
    "metric": null,
    "message": "Metrics not yet available"
  }
  ```

### 4.3 实时 Metrics 流（WebSocket，可选）

**Endpoint**: `WS /v1/sandboxes/{sandboxID}/metrics/stream`

**描述**: 通过 WebSocket 实时推送 Metrics（每 5 秒）

**连接示例** (JavaScript):
```javascript
const ws = new WebSocket(
  'wss://api.gvisor-e2b.com/v1/sandboxes/sbx_xyz789/metrics/stream',
  {
    headers: {
      'X-API-Key': 'sk_abc123...'
    }
  }
);

ws.on('message', (data) => {
  const metric = JSON.parse(data);
  console.log('CPU Usage:', metric.cpuUsage);
  console.log('Memory:', metric.memoryUsed / metric.memoryTotal);
});
```

**推送消息格式**:
```json
{
  "timestamp": "2025-11-05T12:34:56.789Z",
  "cpuUsage": 45.2,
  "cpuCoreCount": 4,
  "memoryUsed": 1073741824,
  "memoryTotal": 2147483648,
  "diskUsed": 5368709120,
  "diskTotal": 10737418240
}
```

---

## 5. Metrics 采集架构

### 5.1 架构图

```
┌────────────────────────────────────────────────────────────┐
│                    Kubernetes Cluster                      │
│                                                            │
│  ┌─────────────────────────────────────────────────────┐  │
│  │              Sandbox Pod (gVisor)                   │  │
│  │  ┌──────────────┐       ┌──────────────┐           │  │
│  │  │ User App     │       │ Metrics      │           │  │
│  │  │              │       │ Exporter     │           │  │
│  │  └──────────────┘       │ (sidecar)    │           │  │
│  │                         └──────┬───────┘           │  │
│  └────────────────────────────────┼─────────────────────┘  │
│                                   │ cAdvisor API          │
│                                   ↓                         │
│                    ┌──────────────────────┐                │
│                    │ Metrics Collector    │                │
│                    │ (Celery Beat)        │                │
│                    └──────────┬───────────┘                │
└────────────────────────────────┼──────────────────────────┘
                                 │
                                 ↓
                    ┌────────────────────────┐
                    │ PostgreSQL             │
                    │ (sandbox_metrics)      │
                    │ - 24h retention        │
                    │ - 5s granularity       │
                    └────────────────────────┘
                                 │
                                 ↓ (Continuous Aggregate)
                    ┌────────────────────────┐
                    │ TimescaleDB            │
                    │ (sandbox_metrics_long) │
                    │ - 90d retention        │
                    │ - 1min granularity     │
                    └────────────────────────┘
```

### 5.2 Metrics 采集服务

**采集方式选项**:

#### 选项 1: Kubernetes Metrics API + cAdvisor

**优势**:
- 原生支持
- 无需额外 agent
- 性能开销小

**实现** (Python/Celery Beat):
```python
# metrics_collector.py
from celery import Celery
from kubernetes import client, config
import psutil

app = Celery('metrics_collector')

@app.task
async def collect_sandbox_metrics():
    """
    每 5 秒采集所有活跃沙盒的 Metrics
    """
    # 1. 加载 K8s 配置
    config.load_incluster_config()
    v1 = client.CoreV1Api()
    custom_api = client.CustomObjectsApi()

    # 2. 查询所有活跃沙盒
    active_sandboxes = await db.query(Sandbox).filter(
        Sandbox.status == 'running'
    ).all()

    # 3. 采集每个沙盒的 Metrics
    for sandbox in active_sandboxes:
        try:
            # 获取 Pod Metrics（通过 Metrics API）
            pod_name = f"sandbox-{sandbox.sandbox_id}"
            namespace = "sandboxes"

            # 查询 Pod Metrics
            metrics = custom_api.get_namespaced_custom_object(
                group="metrics.k8s.io",
                version="v1beta1",
                namespace=namespace,
                plural="pods",
                name=pod_name
            )

            # 解析 Metrics
            container_metrics = metrics["containers"][0]["usage"]
            cpu_usage = parse_cpu(container_metrics["cpu"])  # "250m" -> 0.25
            memory_used = parse_memory(container_metrics["memory"])  # "1Gi" -> bytes

            # 获取资源配额（从 sandbox 配置）
            cpu_total = sandbox.resources.get("cpu", 2)
            memory_total = parse_memory(sandbox.resources.get("memory", "4Gi"))

            # 获取磁盘使用情况（通过 exec 进入容器）
            disk_stats = await get_disk_usage(pod_name, namespace)

            # 计算 CPU 使用率
            cpu_usage_percent = (cpu_usage / cpu_total) * 100

            # 4. 保存到数据库
            metric = SandboxMetric(
                sandbox_id=sandbox.id,
                collected_at=datetime.utcnow(),
                cpu_usage_percent=cpu_usage_percent,
                cpu_core_count=int(cpu_total),
                memory_used_bytes=memory_used,
                memory_total_bytes=memory_total,
                disk_used_bytes=disk_stats["used"],
                disk_total_bytes=disk_stats["total"]
            )
            await db.save(metric)

        except Exception as e:
            logger.error(f"Failed to collect metrics for {sandbox.sandbox_id}: {e}")


async def get_disk_usage(pod_name: str, namespace: str) -> dict:
    """
    通过 kubectl exec 获取磁盘使用情况
    """
    v1 = client.CoreV1Api()

    # 执行 df 命令
    exec_command = ['/bin/sh', '-c', 'df -B1 /workspace | tail -1']
    resp = await v1.connect_get_namespaced_pod_exec(
        name=pod_name,
        namespace=namespace,
        command=exec_command,
        stderr=True,
        stdin=False,
        stdout=True,
        tty=False
    )

    # 解析输出: /dev/sda1  10737418240  5368709120  5368709120  50% /workspace
    parts = resp.strip().split()
    return {
        "total": int(parts[1]),
        "used": int(parts[2]),
        "available": int(parts[3])
    }


def parse_cpu(cpu_str: str) -> float:
    """
    解析 Kubernetes CPU 字符串

    Examples:
        "250m" -> 0.25
        "1" -> 1.0
        "2000m" -> 2.0
    """
    if cpu_str.endswith('m'):
        return float(cpu_str[:-1]) / 1000
    else:
        return float(cpu_str)


def parse_memory(memory_str: str) -> int:
    """
    解析 Kubernetes Memory 字符串为字节数

    Examples:
        "1Gi" -> 1073741824
        "512Mi" -> 536870912
        "1024Ki" -> 1048576
    """
    units = {
        'Ki': 1024,
        'Mi': 1024 ** 2,
        'Gi': 1024 ** 3,
        'Ti': 1024 ** 4
    }

    for unit, multiplier in units.items():
        if memory_str.endswith(unit):
            return int(float(memory_str[:-len(unit)]) * multiplier)

    # 无单位，假设为字节
    return int(memory_str)


# Celery Beat 调度配置
app.conf.beat_schedule = {
    'collect-metrics-every-5-seconds': {
        'task': 'metrics_collector.collect_sandbox_metrics',
        'schedule': 5.0,  # 每 5 秒
    },
}
```

#### 选项 2: Prometheus + Node Exporter

**优势**:
- 成熟的监控方案
- 丰富的 Metrics
- 强大的查询能力（PromQL）

**集成方式**:
1. 在每个 Sandbox Pod 中运行 Node Exporter (sidecar)
2. Prometheus 定期 scrape
3. API Server 通过 Prometheus HTTP API 查询数据

### 5.3 Metrics 聚合任务

**连续聚合** (Continuous Aggregates):
将 5 秒粒度数据聚合为 1 分钟粒度，存储到长期表：

```sql
-- TimescaleDB Continuous Aggregate
CREATE MATERIALIZED VIEW sandbox_metrics_1min
WITH (timescaledb.continuous) AS
SELECT
    sandbox_id,
    time_bucket('1 minute', collected_at) AS bucket,
    AVG(cpu_usage_percent) AS cpu_usage_avg,
    MAX(cpu_usage_percent) AS cpu_usage_max,
    AVG(memory_used_bytes) AS memory_used_avg,
    MAX(memory_used_bytes) AS memory_used_max,
    AVG(disk_used_bytes) AS disk_used_avg,
    MAX(disk_used_bytes) AS disk_used_max
FROM sandbox_metrics
GROUP BY sandbox_id, bucket;

-- 自动刷新策略（每 30 秒）
SELECT add_continuous_aggregate_policy('sandbox_metrics_1min',
    start_offset => INTERVAL '2 minutes',
    end_offset => INTERVAL '1 minute',
    schedule_interval => INTERVAL '30 seconds');
```

---

## 6. 业务规则

### BR-140: Metrics 采集频率

**规则类型**: 强制规则
**描述**: Metrics 每 5 秒采集一次

**配置**:
```python
METRICS_COLLECTION_INTERVAL_SECONDS = 5
```

### BR-141: Metrics 短期保留

**规则类型**: 强制规则
**描述**: 短期 Metrics（5 秒粒度）保留 24 小时

**配置**:
```python
METRICS_SHORT_RETENTION_HOURS = 24
```

**实现** (自动清理):
```python
@celery.beat_schedule(crontab(minute='0'))  # 每小时
async def cleanup_old_metrics():
    cutoff_time = datetime.utcnow() - timedelta(hours=METRICS_SHORT_RETENTION_HOURS)

    # 删除旧分区
    await db.execute("""
        SELECT cleanup_old_metrics_partitions()
    """)
```

### BR-142: Metrics 长期保留

**规则类型**: 策略规则
**描述**: 长期 Metrics（1 分钟粒度）保留 90 天

**配置**:
```python
METRICS_LONG_RETENTION_DAYS = 90
```

### BR-143: Metrics 查询时间范围限制

**规则类型**: 软规则
**描述**: API 单次查询时间范围最大 24 小时

**配置**:
```python
MAX_METRICS_QUERY_RANGE_HOURS = 24
```

**实现**:
```python
def validate_time_range(from_time: datetime, to_time: datetime):
    time_diff = to_time - from_time

    if time_diff > timedelta(hours=MAX_METRICS_QUERY_RANGE_HOURS):
        raise BusinessRuleViolation(
            code="BR-143",
            message=f"Time range must be <= {MAX_METRICS_QUERY_RANGE_HOURS} hours"
        )
```

### BR-144: Metrics 采集失败容错

**规则类型**: 强制规则
**描述**: Metrics 采集失败不影响沙盒运行

**实现**:
- 采集任务异常捕获
- 记录错误日志
- 不阻塞沙盒生命周期

---

## 7. 与 L1-L5 的集成

### 7.1 L1 产品需求 - 功能详化

**现有功能**: L1-F6 监控和告警

**细化为**:
- **F6.1 Metrics 采集**: 每 5 秒采集沙盒资源使用情况
- **F6.2 Metrics API**: 提供 REST API 查询历史数据
- **F6.3 实时 Metrics**: WebSocket 实时推送（可选）
- **F6.4 资源告警**: CPU/内存超限告警（可选）

### 7.2 L2 系统架构 - 新增组件

**新增组件**:
- **Metrics Collector** (Celery Beat): 每 5 秒采集 Metrics
- **Metrics Aggregator** (TimescaleDB): 数据聚合和长期存储
- **Prometheus** (可选): 更强大的监控方案

### 7.3 L3.2 数据库设计 - 新增表

已在 3. 数据库设计 中详细说明：
- `sandbox_metrics`: 短期时序数据（24 小时）
- `sandbox_metrics_long_term`: 长期聚合数据（90 天，可选）

### 7.4 L4.1 API 规范 - 新增端点

已在 4. API 规范 中详细说明：
- `GET /v1/sandboxes/{id}/metrics`: 查询历史 Metrics
- `GET /v1/sandboxes/{id}/metrics/latest`: 查询最新 Metrics
- `WS /v1/sandboxes/{id}/metrics/stream`: 实时 Metrics 流（可选）

### 7.5 L5 模块设计 - 新增模块

**新增模块**: `metrics-collector`

**技术栈**: Python / Celery Beat / Kubernetes API

**文件结构**:
```
metrics-collector/
├── __init__.py
├── collector.py        # 采集逻辑
├── aggregator.py       # 聚合逻辑
├── exporters/          # 导出器
│   ├── prometheus.py
│   └── influxdb.py
└── models.py           # 数据模型
```

---

## 附录

### A. E2B 兼容性对照表

| 功能 | E2B API | 本设计 | 兼容性 |
|------|---------|--------|--------|
| Metrics 数据结构 | 7 字段标准格式 | ✅ | 100% |
| 采集频率 | 5 秒 | ✅ | 100% |
| SDK API | `sandbox.getMetrics()` | ✅ | 100% |
| CLI 命令 | `e2b sandbox metrics` | ✅ | 100% |
| 冷启动延迟 | 1+ 秒首个数据点 | ✅ | 100% |
| 空数组返回 | 未采集时返回 `[]` | ✅ | 100% |

### B. 性能指标

| 指标 | 目标值 | 说明 |
|------|--------|------|
| 采集延迟 | < 1s | Metrics 采集完成时间 |
| API 查询延迟 | < 200ms | 查询 1 小时数据 |
| 存储开销 | 100 字节/条 | 单条 Metric 记录大小 |
| 数据库增长 | 173 MB/天 | 100 个活跃沙盒 |
| 长期存储 | 1.5 GB/月 | 降采样后（1 分钟粒度） |

### C. SDK 使用示例

#### TypeScript SDK

```typescript
import { Sandbox } from '@gvisor-e2b/sdk';

// 创建沙盒
const sandbox = await Sandbox.create({
  template: 'python-3.11'
});

// 等待 Metrics 可用（约 1-2 秒）
await new Promise(resolve => setTimeout(resolve, 2000));

// 查询 Metrics
const metrics = await sandbox.getMetrics();
console.log('CPU Usage:', metrics[0].cpuUsage);
console.log('Memory:', metrics[0].memoryUsed / metrics[0].memoryTotal);

// 或使用静态方法
const allMetrics = await Sandbox.getMetrics('sbx_xyz789');
```

#### Python SDK

```python
from gvisor_e2b import Sandbox
import time

# 创建沙盒
sandbox = Sandbox.create(template='python-3.11')

# 等待 Metrics 可用
time.sleep(2)

# 查询 Metrics
metrics = sandbox.get_metrics()
print(f"CPU Usage: {metrics[0]['cpuUsage']}%")
print(f"Memory: {metrics[0]['memoryUsed'] / metrics[0]['memoryTotal'] * 100}%")

# 或使用静态方法
all_metrics = Sandbox.get_metrics('sbx_xyz789')
```

### D. Prometheus 集成示例

**Prometheus 配置** (`prometheus.yml`):
```yaml
scrape_configs:
  - job_name: 'sandbox-metrics'
    scrape_interval: 5s
    kubernetes_sd_configs:
      - role: pod
        namespaces:
          names:
            - sandboxes
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_label_app]
        regex: sandbox
        action: keep
      - source_labels: [__meta_kubernetes_pod_label_sandbox_id]
        target_label: sandbox_id
```

**查询 API** (Python):
```python
import httpx

async def query_prometheus_metrics(sandbox_id: str) -> List[dict]:
    """
    通过 Prometheus HTTP API 查询 Metrics
    """
    prometheus_url = "http://prometheus:9090"
    query = f'container_cpu_usage_seconds_total{{sandbox_id="{sandbox_id}"}}'

    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{prometheus_url}/api/v1/query",
            params={"query": query}
        )
        data = response.json()

    # 转换为 E2B 格式
    metrics = []
    for result in data["data"]["result"]:
        metrics.append({
            "timestamp": result["value"][0],
            "cpuUsage": float(result["value"][1]) * 100,
            # ... 其他字段
        })

    return metrics
```

---

**文档完成** ✅
