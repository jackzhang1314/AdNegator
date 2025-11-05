# L0 Supplement: MCP Gateway 设计文档

**文档版本**: v1.0
**创建日期**: 2025-11-05
**状态**: Draft
**补充说明**: 本文档补充 L1-L5 设计文档中缺失的 MCP (Model Context Protocol) Gateway 功能

---

## 目录

1. [MCP Gateway 概述](#1-mcp-gateway-概述)
2. [MCP 服务器目录](#2-mcp-服务器目录)
3. [数据库设计](#3-数据库设计)
4. [API 设计](#4-api-设计)
5. [架构设计](#5-架构设计)
6. [安全模型](#6-安全模型)
7. [与 L1-L5 的集成](#7-与-l1-l5-的集成)

---

## 1. MCP Gateway 概述

### 1.1 什么是 MCP (Model Context Protocol)

**MCP (Model Context Protocol)** 是一个开源标准，用于连接 AI 系统与外部应用程序。

**核心价值**:
- 🔌 **统一接口**: 标准化 AI 与工具的连接方式
- 🛡️ **安全隔离**: 工具在沙箱中独立运行
- 📦 **即插即用**: 200+ 预验证工具开箱即用
- 🌐 **生态系统**: Docker 官方支持的工具目录

### 1.2 Docker-E2B 合作伙伴关系

**E2B 与 Docker 的战略合作** (2024年11月宣布):

**关键特性**:
- ✅ **原生 MCP 支持**: 在沙箱创建时配置 MCP 工具
- ✅ **200+ 验证工具**: Docker Hub 官方 MCP 目录
- ✅ **容器化架构**: 每个 MCP 工具作为 Docker 容器运行
- ✅ **AI 客户端集成**: 支持 Claude Desktop、VSCode、其他 MCP 兼容客户端

**架构图**:
```
┌─────────────────────────────────────────────────────────────┐
│                    AI Client (Claude/GPT)                    │
│                 (MCP Client via HTTP/SSE)                    │
└──────────────────────────┬──────────────────────────────────┘
                           │ MCP Protocol
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                      E2B Sandbox                             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              MCP Gateway (localhost:8000)              │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐           │ │
│  │  │Browserbase│  │   Exa    │  │  Notion  │  ...      │ │
│  │  │Container  │  │Container │  │Container │           │ │
│  │  └──────────┘  └──────────┘  └──────────┘           │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐ │
│  │           User Application (Python/Node.js)            │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 1.3 使用示例

**TypeScript SDK**:
```typescript
import { Sandbox } from 'e2b'

// 创建带 MCP 工具的沙箱
const sandbox = await Sandbox.create({
  template: 'base',
  mcp: {
    browserbase: {
      apiKey: 'sk_...',
      geminiApiKey: 'AIza...',
      projectId: 'proj_...'
    },
    exa: {
      apiKey: 'exa_...'
    },
    notion: {
      internalIntegrationToken: 'secret_...'
    }
  }
})

// 获取 MCP Gateway URL
const mcpUrl = await sandbox.getMcpUrl()
// 返回: { url: 'https://sandbox-abc123.e2b.dev/mcp', token: 'Bearer tok_...' }

// AI 客户端现在可以连接到这个 URL 使用工具
```

**Python SDK**:
```python
from e2b import Sandbox

# 创建带 MCP 工具的沙箱
sandbox = await Sandbox.create(
    template='base',
    mcp={
        'browserbase': {
            'apiKey': 'sk_...',
            'geminiApiKey': 'AIza...',
            'projectId': 'proj_...'
        },
        'exa': {'apiKey': 'exa_...'},
        'github': {'personalAccessToken': 'ghp_...'}
    }
)

# 获取 MCP Gateway URL
mcp_info = await sandbox.get_mcp_url()
# 返回: {'url': 'https://...', 'token': 'Bearer ...'}
```

---

## 2. MCP 服务器目录

### 2.1 服务器分类

E2B 支持 **200+ MCP 工具**，按类别组织：

#### Web 自动化 (7 个工具)
- **browserbase**: Browserbase + Stagehand AI 驱动的浏览器自动化
- **playwright**: Playwright 浏览器自动化
- **puppeteer**: Puppeteer Chrome 控制
- **selenium**: Selenium WebDriver
- **apify**: Apify 网页抓取平台
- **crawl4ai**: AI 驱动的智能爬虫
- **firecrawl**: Firecrawl 网页抓取 API

#### 搜索引擎 (9 个工具)
- **exa**: Exa 网页搜索和爬取
- **brave**: Brave Search API
- **duckduckgo**: DuckDuckGo 搜索
- **google**: Google Custom Search
- **kagi**: Kagi Search API
- **perplexity**: Perplexity AI 搜索
- **serper**: Serper.dev 搜索 API
- **tavily**: Tavily AI 搜索
- **searxng**: SearXNG 元搜索引擎

#### 数据库 (15 个工具)
- **postgresql**: PostgreSQL 数据库
- **mongodb**: MongoDB 数据库
- **redis**: Redis 键值存储
- **mysql**: MySQL 数据库
- **sqlite**: SQLite 数据库
- **neo4j**: Neo4j 图数据库
- **elasticsearch**: Elasticsearch 搜索引擎
- **clickhouse**: ClickHouse 列式数据库
- **supabase**: Supabase 数据库平台
- **neon**: Neon Serverless Postgres
- **turso**: Turso SQLite Edge
- **planetscale**: PlanetScale MySQL
- **cockroachdb**: CockroachDB 分布式数据库
- **dynamodb**: AWS DynamoDB
- **cosmosdb**: Azure Cosmos DB

#### 云平台 (12 个工具)
- **aws**: AWS 云服务
- **azure**: Azure 云服务
- **gcp**: Google Cloud Platform
- **kubernetes**: Kubernetes 集群管理
- **docker**: Docker Hub
- **terraform**: Terraform IaC
- **cloudflare**: Cloudflare 服务
- **vercel**: Vercel 部署平台
- **netlify**: Netlify 部署平台
- **railway**: Railway 部署平台
- **fly**: Fly.io 部署平台
- **render**: Render 部署平台

#### 开发工具 (18 个工具)
- **github**: GitHub 代码托管
- **gitlab**: GitLab 代码托管
- **bitbucket**: Bitbucket 代码托管
- **jetbrains**: JetBrains IDE 集成
- **vscode**: VSCode 编辑器
- **postman**: Postman API 测试
- **sentry**: Sentry 错误追踪
- **datadog**: Datadog 监控
- **newrelic**: New Relic 监控
- **grafana**: Grafana 可视化
- **prometheus**: Prometheus 监控
- **jenkins**: Jenkins CI/CD
- **circleci**: CircleCI CI/CD
- **travis**: Travis CI
- **githubactions**: GitHub Actions
- **linear**: Linear 项目管理
- **jira**: Jira 项目管理
- **asana**: Asana 项目管理

#### 业务工具 (25 个工具)
- **stripe**: Stripe 支付处理
- **notion**: Notion 工作区
- **slack**: Slack 团队协作
- **discord**: Discord 社区
- **gmail**: Gmail 邮件
- **outlook**: Outlook 邮件
- **calendly**: Calendly 日程安排
- **zoom**: Zoom 视频会议
- **hubspot**: HubSpot CRM
- **salesforce**: Salesforce CRM
- **zendesk**: Zendesk 客服
- **intercom**: Intercom 客户消息
- **twilio**: Twilio 通信 API
- **sendgrid**: SendGrid 邮件服务
- **mailchimp**: Mailchimp 邮件营销
- **shopify**: Shopify 电商平台
- **woocommerce**: WooCommerce 插件
- **airtable**: Airtable 数据库
- **zapier**: Zapier 自动化
- **ifttt**: IFTTT 自动化
- **make**: Make (Integromat) 自动化
- **n8n**: n8n 工作流自动化
- **typeform**: Typeform 表单
- **googlesheets**: Google Sheets
- **microsoftexcel**: Microsoft Excel

#### AI/ML 工具 (15 个工具)
- **openai**: OpenAI API
- **anthropic**: Anthropic Claude API
- **cohere**: Cohere API
- **pinecone**: Pinecone 向量数据库
- **chroma**: ChromaDB 向量数据库
- **weaviate**: Weaviate 向量数据库
- **qdrant**: Qdrant 向量数据库
- **milvus**: Milvus 向量数据库
- **huggingface**: Hugging Face 模型
- **replicate**: Replicate ML 平台
- **gradio**: Gradio ML 界面
- **langchain**: LangChain 框架
- **llamaindex**: LlamaIndex 框架
- **needle**: Needle AI 搜索
- **metaphor**: Metaphor 搜索

#### 其他工具 (100+ 更多)
- 文件存储: dropbox, googledrive, onedrive, box, s3
- 社交媒体: twitter, linkedin, facebook, instagram, reddit
- 媒体: youtube, spotify, soundcloud, vimeo
- 金融: plaid, yodlee, coinbase, binance
- 地图: googlemaps, mapbox, here
- 天气: openweathermap, weatherapi
- 翻译: googletranslate, deepl
- OCR: tesseract, googleocr, azureocr
- ... 等等

### 2.2 MCP 服务器配置结构

每个 MCP 服务器都有特定的凭证要求。以下是核心服务器的配置：

```typescript
// TypeScript 类型定义 (来自官方 SDK)
export interface McpServer {
  // Web 自动化
  browserbase?: {
    apiKey: string              // Browserbase API 密钥
    geminiApiKey: string        // Gemini API 密钥 (AI 自动化)
    projectId: string           // Browserbase 项目 ID
  }

  playwright?: {
    executablePath?: string     // 可选：自定义浏览器路径
  }

  puppeteer?: {
    executablePath?: string     // 可选：自定义 Chrome 路径
  }

  // 搜索引擎
  exa?: {
    apiKey: string              // Exa API 密钥
  }

  brave?: {
    apiKey: string              // Brave Search API 密钥
  }

  tavily?: {
    apiKey: string              // Tavily API 密钥
  }

  // 数据库
  postgresql?: {
    url: string                 // PostgreSQL 连接 URL
  }

  mongodb?: {
    url: string                 // MongoDB 连接 URL
  }

  redis?: {
    url: string                 // Redis 连接 URL
  }

  // 云平台
  aws?: {
    accessKeyId: string         // AWS Access Key ID
    secretAccessKey: string     // AWS Secret Access Key
    region?: string             // AWS 区域
  }

  kubernetes?: {
    configPath: string          // kubeconfig 文件路径
  }

  // 开发工具
  github?: {
    personalAccessToken: string // GitHub PAT
  }

  gitlab?: {
    privateToken: string        // GitLab Private Token
  }

  sentry?: {
    authToken: string           // Sentry Auth Token
    organization: string        // Sentry 组织名
  }

  // 业务工具
  stripe?: {
    secretKey: string           // Stripe Secret Key
  }

  notion?: {
    internalIntegrationToken: string  // Notion Integration Token
  }

  slack?: {
    botToken: string            // Slack Bot Token
  }

  gmail?: {
    clientId: string            // OAuth Client ID
    clientSecret: string        // OAuth Client Secret
    refreshToken: string        // OAuth Refresh Token
  }

  // AI/ML
  openai?: {
    apiKey: string              // OpenAI API Key
  }

  pinecone?: {
    apiKey: string              // Pinecone API Key
    environment: string         // Pinecone 环境
  }

  // ... 190+ 更多服务器
}
```

**Python 等价定义** (来自官方 SDK):
```python
from typing import TypedDict, NotRequired

class Browserbase(TypedDict):
    apiKey: str
    geminiApiKey: str
    projectId: str

class Exa(TypedDict):
    apiKey: str

class Github(TypedDict):
    personalAccessToken: str

class Postgresql(TypedDict):
    url: str

# ... 200+ 服务器定义

class McpServer(TypedDict):
    browserbase: NotRequired[Browserbase]
    exa: NotRequired[Exa]
    github: NotRequired[Github]
    postgresql: NotRequired[Postgresql]
    # ... 所有其他服务器
```

---

## 3. 数据库设计

### 3.1 新增表结构

#### 3.1.1 `mcp_servers` 表 - MCP 服务器目录

```sql
CREATE TABLE mcp_servers (
    -- 主键
    server_id VARCHAR(100) PRIMARY KEY,              -- 服务器标识符 (如 'browserbase', 'exa')

    -- 基本信息
    display_name VARCHAR(200) NOT NULL,               -- 显示名称
    category VARCHAR(50) NOT NULL,                    -- 类别 (web_automation, search, database, etc.)
    description TEXT NOT NULL,                        -- 服务器描述

    -- 配置模式
    credential_schema JSONB NOT NULL,                 -- 凭证字段的 JSON Schema
    -- 示例: {
    --   "type": "object",
    --   "properties": {
    --     "apiKey": {"type": "string", "required": true},
    --     "projectId": {"type": "string", "required": true}
    --   }
    -- }

    -- Docker 配置
    docker_image VARCHAR(500) NOT NULL,               -- Docker 镜像名称
    docker_tag VARCHAR(100) DEFAULT 'latest',         -- Docker 镜像标签

    -- 元数据
    official_url VARCHAR(500),                        -- 官方网站
    documentation_url VARCHAR(500),                   -- 文档链接
    mcp_version VARCHAR(50) DEFAULT '1.0',            -- MCP 协议版本

    -- 状态
    is_active BOOLEAN DEFAULT true,                   -- 是否激活
    is_verified BOOLEAN DEFAULT false,                -- 是否经过 Docker 验证

    -- 审计
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX idx_mcp_servers_category ON mcp_servers(category);
CREATE INDEX idx_mcp_servers_active ON mcp_servers(is_active);
```

#### 3.1.2 `sandbox_mcp_configs` 表 - 沙箱 MCP 配置

```sql
CREATE TABLE sandbox_mcp_configs (
    -- 主键
    config_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- 关联
    sandbox_id UUID NOT NULL REFERENCES sandboxes(sandbox_id) ON DELETE CASCADE,
    server_id VARCHAR(100) NOT NULL REFERENCES mcp_servers(server_id),

    -- 凭证 (加密存储)
    credentials_encrypted BYTEA NOT NULL,              -- 加密的凭证 JSON
    encryption_key_version INT DEFAULT 1,              -- 加密密钥版本

    -- MCP Gateway 信息
    gateway_url VARCHAR(500),                          -- MCP Gateway URL
    gateway_token VARCHAR(500),                        -- MCP Gateway 访问令牌
    gateway_token_expires_at TIMESTAMP,                -- 令牌过期时间

    -- Docker 容器信息
    container_id VARCHAR(100),                         -- Docker 容器 ID
    container_status VARCHAR(50),                      -- 容器状态 (running, stopped, error)
    container_started_at TIMESTAMP,                    -- 容器启动时间

    -- 审计
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- 唯一约束
    UNIQUE(sandbox_id, server_id)
);

-- 索引
CREATE INDEX idx_sandbox_mcp_configs_sandbox ON sandbox_mcp_configs(sandbox_id);
CREATE INDEX idx_sandbox_mcp_configs_server ON sandbox_mcp_configs(server_id);
CREATE INDEX idx_sandbox_mcp_configs_status ON sandbox_mcp_configs(container_status);
```

#### 3.1.3 `mcp_gateway_sessions` 表 - MCP Gateway 会话

```sql
CREATE TABLE mcp_gateway_sessions (
    -- 主键
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- 关联
    sandbox_id UUID NOT NULL REFERENCES sandboxes(sandbox_id) ON DELETE CASCADE,

    -- Gateway 信息
    gateway_url VARCHAR(500) NOT NULL,                 -- Gateway 公开 URL
    gateway_internal_url VARCHAR(500),                 -- Gateway 内部 URL (localhost)
    access_token VARCHAR(500) NOT NULL,                -- Bearer token
    token_expires_at TIMESTAMP NOT NULL,               -- Token 过期时间

    -- 会话状态
    status VARCHAR(50) DEFAULT 'active',               -- active, expired, revoked
    last_accessed_at TIMESTAMP,                        -- 最后访问时间

    -- 统计
    request_count INT DEFAULT 0,                       -- 请求总数
    error_count INT DEFAULT 0,                         -- 错误总数

    -- 审计
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX idx_mcp_sessions_sandbox ON mcp_gateway_sessions(sandbox_id);
CREATE INDEX idx_mcp_sessions_token ON mcp_gateway_sessions(access_token);
CREATE INDEX idx_mcp_sessions_status ON mcp_gateway_sessions(status);
CREATE INDEX idx_mcp_sessions_expires ON mcp_gateway_sessions(token_expires_at);
```

### 3.2 与现有表的关系

#### 3.2.1 `sandboxes` 表扩展

需要在 `sandboxes` 表中添加 MCP 相关字段：

```sql
ALTER TABLE sandboxes ADD COLUMN IF NOT EXISTS mcp_enabled BOOLEAN DEFAULT false;
ALTER TABLE sandboxes ADD COLUMN IF NOT EXISTS mcp_gateway_port INT DEFAULT 8000;
```

#### 3.2.2 ER 关系图

```
┌──────────────┐         ┌────────────────────┐
│  sandboxes   │1      n│sandbox_mcp_configs │
│              ├────────→│                    │
│ sandbox_id   │         │ sandbox_id (FK)    │
│ mcp_enabled  │         │ server_id (FK)     │
│              │         │ credentials_enc    │
└──────────────┘         └─────────┬──────────┘
                                   │n
                                   │
                                   │1
                         ┌─────────┴──────────┐
                         │   mcp_servers      │
                         │                    │
                         │ server_id (PK)     │
                         │ credential_schema  │
                         │ docker_image       │
                         └────────────────────┘

┌──────────────┐         ┌────────────────────┐
│  sandboxes   │1      1│mcp_gateway_sessions│
│              ├────────→│                    │
│ sandbox_id   │         │ sandbox_id (FK)    │
│              │         │ gateway_url        │
│              │         │ access_token       │
└──────────────┘         └────────────────────┘
```

---

## 4. API 设计

### 4.1 扩展现有 API

#### 4.1.1 创建沙箱 (扩展)

**端点**: `POST /v1/sandboxes`

**请求体** (新增 `mcp` 字段):
```json
{
  "template_id": "base",
  "allow_internet_access": true,
  "auto_pause": false,
  "timeout": 300,
  "env_vars": {
    "DEBUG": "true"
  },
  "mcp": {
    "browserbase": {
      "apiKey": "sk_...",
      "geminiApiKey": "AIza...",
      "projectId": "proj_..."
    },
    "exa": {
      "apiKey": "exa_..."
    },
    "github": {
      "personalAccessToken": "ghp_..."
    }
  }
}
```

**响应体** (新增 `mcp` 字段):
```json
{
  "sandbox_id": "sb_123abc",
  "status": "running",
  "mcp_enabled": true,
  "mcp_servers": ["browserbase", "exa", "github"],
  "created_at": "2025-11-05T10:00:00Z"
}
```

### 4.2 新增 MCP 专用 API

#### 4.2.1 获取 MCP Gateway URL

**端点**: `GET /v1/sandboxes/{sandbox_id}/mcp-url`

**响应体**:
```json
{
  "url": "https://sandbox-sb123abc.e2b.dev/mcp",
  "token": "Bearer tok_7a8b9c0d1e2f3g4h",
  "expires_at": "2025-11-05T15:00:00Z",
  "servers": ["browserbase", "exa", "github"]
}
```

**错误响应**:
```json
{
  "error": "MCP_NOT_ENABLED",
  "message": "This sandbox does not have MCP enabled",
  "sandbox_id": "sb_123abc"
}
```

#### 4.2.2 获取 MCP 服务器目录

**端点**: `GET /v1/mcp/servers`

**查询参数**:
- `category` (可选): 按类别过滤 (web_automation, search, database, etc.)
- `search` (可选): 搜索服务器名称或描述

**响应体**:
```json
{
  "servers": [
    {
      "server_id": "browserbase",
      "display_name": "Browserbase",
      "category": "web_automation",
      "description": "AI-powered browser automation with Stagehand",
      "credential_schema": {
        "type": "object",
        "properties": {
          "apiKey": {"type": "string", "required": true},
          "geminiApiKey": {"type": "string", "required": true},
          "projectId": {"type": "string", "required": true}
        }
      },
      "documentation_url": "https://browserbase.com/docs",
      "is_verified": true
    },
    {
      "server_id": "exa",
      "display_name": "Exa",
      "category": "search",
      "description": "Web search and crawling API",
      "credential_schema": {
        "type": "object",
        "properties": {
          "apiKey": {"type": "string", "required": true}
        }
      },
      "documentation_url": "https://exa.ai/docs",
      "is_verified": true
    }
  ],
  "total": 200,
  "categories": {
    "web_automation": 7,
    "search": 9,
    "database": 15,
    "cloud": 12,
    "development": 18,
    "business": 25,
    "ai_ml": 15,
    "other": 99
  }
}
```

#### 4.2.3 获取单个 MCP 服务器详情

**端点**: `GET /v1/mcp/servers/{server_id}`

**响应体**:
```json
{
  "server_id": "browserbase",
  "display_name": "Browserbase",
  "category": "web_automation",
  "description": "AI-powered browser automation with Stagehand",
  "credential_schema": {
    "type": "object",
    "properties": {
      "apiKey": {
        "type": "string",
        "required": true,
        "description": "Browserbase API key"
      },
      "geminiApiKey": {
        "type": "string",
        "required": true,
        "description": "Google Gemini API key for AI automation"
      },
      "projectId": {
        "type": "string",
        "required": true,
        "description": "Browserbase project ID"
      }
    }
  },
  "docker_image": "docker.io/browserbase/mcp-server",
  "docker_tag": "latest",
  "official_url": "https://browserbase.com",
  "documentation_url": "https://browserbase.com/docs/mcp",
  "mcp_version": "1.0",
  "is_verified": true
}
```

#### 4.2.4 添加 MCP 服务器到沙箱

**端点**: `POST /v1/sandboxes/{sandbox_id}/mcp/servers`

**请求体**:
```json
{
  "server_id": "notion",
  "credentials": {
    "internalIntegrationToken": "secret_..."
  }
}
```

**响应体**:
```json
{
  "config_id": "cfg_abc123",
  "server_id": "notion",
  "container_status": "running",
  "container_id": "docker_xyz789",
  "added_at": "2025-11-05T11:00:00Z"
}
```

#### 4.2.5 移除 MCP 服务器

**端点**: `DELETE /v1/sandboxes/{sandbox_id}/mcp/servers/{server_id}`

**响应体**:
```json
{
  "success": true,
  "server_id": "notion",
  "removed_at": "2025-11-05T12:00:00Z"
}
```

#### 4.2.6 列出沙箱的 MCP 配置

**端点**: `GET /v1/sandboxes/{sandbox_id}/mcp/servers`

**响应体**:
```json
{
  "sandbox_id": "sb_123abc",
  "servers": [
    {
      "server_id": "browserbase",
      "display_name": "Browserbase",
      "container_status": "running",
      "container_started_at": "2025-11-05T10:00:05Z"
    },
    {
      "server_id": "exa",
      "display_name": "Exa",
      "container_status": "running",
      "container_started_at": "2025-11-05T10:00:06Z"
    }
  ],
  "gateway_url": "https://sandbox-sb123abc.e2b.dev/mcp"
}
```

---

## 5. 架构设计

### 5.1 MCP Gateway 部署架构

**方案 1: Sidecar 容器** (推荐)

```
┌─────────────────────────────────────────────────────────┐
│                    E2B Sandbox Pod                       │
│                                                           │
│  ┌──────────────────────┐    ┌──────────────────────┐  │
│  │  Main Container      │    │  MCP Gateway         │  │
│  │  (User Application)  │    │  Sidecar Container   │  │
│  │                      │    │                       │  │
│  │  Port 8080 (app)     │    │  Port 8000 (gateway) │  │
│  └──────────────────────┘    └──────────┬───────────┘  │
│                                          │               │
│                                          │               │
│  ┌───────────────────────────────────────┼──────────┐  │
│  │        Shared Network Namespace       │          │  │
│  │  localhost:8000 accessible from both  │          │  │
│  └───────────────────────────────────────┼──────────┘  │
│                                          │               │
│  ┌──────────────┐  ┌──────────────┐    │               │
│  │ Browserbase  │  │     Exa      │    │               │
│  │  Container   │  │  Container   │◄───┘               │
│  │              │  │              │                     │
│  │ Port 9001    │  │ Port 9002    │                     │
│  └──────────────┘  └──────────────┘                     │
└─────────────────────────────────────────────────────────┘
```

**MCP Gateway 职责**:
1. **容器管理**: 启动/停止 MCP 工具 Docker 容器
2. **协议路由**: 将 MCP 协议请求路由到对应容器
3. **认证**: 验证访问令牌
4. **日志**: 记录所有 MCP 交互
5. **健康检查**: 监控工具容器状态

### 5.2 组件设计

#### 5.2.1 MCP Gateway Service (Go)

```go
// pkg/mcp-gateway/gateway.go
package mcpgateway

import (
    "context"
    "github.com/docker/docker/client"
)

type Gateway struct {
    dockerClient  *client.Client
    sandboxID     string
    configs       map[string]*MCPServerConfig
    containers    map[string]*ContainerInfo
    router        *MCPRouter
    authProvider  *AuthProvider
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

// 启动 Gateway
func (g *Gateway) Start(ctx context.Context) error {
    // 1. 为每个 MCP 服务器启动 Docker 容器
    for serverID, config := range g.configs {
        container, err := g.startMCPContainer(ctx, config)
        if err != nil {
            return fmt.Errorf("failed to start %s: %w", serverID, err)
        }
        g.containers[serverID] = container
    }

    // 2. 启动 HTTP 服务器监听 MCP 请求
    return g.router.Listen(":8000")
}

// 启动 MCP 工具容器
func (g *Gateway) startMCPContainer(ctx context.Context, config *MCPServerConfig) (*ContainerInfo, error) {
    // 配置环境变量 (凭证)
    envVars := []string{}
    for key, value := range config.Credentials {
        envVars = append(envVars, fmt.Sprintf("%s=%v", key, value))
    }

    // 创建容器
    resp, err := g.dockerClient.ContainerCreate(ctx, &container.Config{
        Image: fmt.Sprintf("%s:%s", config.Image, config.Tag),
        Env:   envVars,
    }, &container.HostConfig{
        NetworkMode: "container:" + g.sandboxID, // 共享网络命名空间
    }, nil, nil, "")

    if err != nil {
        return nil, err
    }

    // 启动容器
    if err := g.dockerClient.ContainerStart(ctx, resp.ID, container.StartOptions{}); err != nil {
        return nil, err
    }

    return &ContainerInfo{
        ContainerID: resp.ID,
        ServerID:    config.ServerID,
        Port:        config.Port,
        Status:      "running",
        StartedAt:   time.Now(),
    }, nil
}

// 处理 MCP 请求
func (g *Gateway) HandleMCPRequest(w http.ResponseWriter, r *http.Request) {
    // 1. 验证访问令牌
    token := r.Header.Get("Authorization")
    if !g.authProvider.Validate(token) {
        http.Error(w, "Unauthorized", http.StatusUnauthorized)
        return
    }

    // 2. 解析 MCP 请求
    var mcpReq MCPRequest
    if err := json.NewDecoder(r.Body).Decode(&mcpReq); err != nil {
        http.Error(w, "Invalid request", http.StatusBadRequest)
        return
    }

    // 3. 路由到对应的 MCP 工具容器
    serverID := mcpReq.Server // 例如 "browserbase"
    container, ok := g.containers[serverID]
    if !ok {
        http.Error(w, "Server not found", http.StatusNotFound)
        return
    }

    // 4. 转发请求到容器
    targetURL := fmt.Sprintf("http://localhost:%d%s", container.Port, r.URL.Path)
    proxyReq, err := http.NewRequest(r.Method, targetURL, r.Body)
    if err != nil {
        http.Error(w, "Proxy error", http.StatusInternalServerError)
        return
    }

    // 复制头部
    proxyReq.Header = r.Header

    // 发送请求
    resp, err := http.DefaultClient.Do(proxyReq)
    if err != nil {
        http.Error(w, "Tool error", http.StatusBadGateway)
        return
    }
    defer resp.Body.Close()

    // 5. 返回响应
    for key, values := range resp.Header {
        for _, value := range values {
            w.Header().Add(key, value)
        }
    }
    w.WriteHeader(resp.StatusCode)
    io.Copy(w, resp.Body)
}
```

#### 5.2.2 MCP Service (控制平面 - Python FastAPI)

```python
# app/services/mcp_service.py
from typing import Dict, Any, List
from sqlalchemy.orm import Session
from app.models.mcp import MCPServer, SandboxMCPConfig, MCPGatewaySession
from app.core.encryption import encrypt_credentials, decrypt_credentials
from app.core.kubernetes import KubernetesClient
import secrets
import hashlib
from datetime import datetime, timedelta

class MCPService:
    def __init__(self, db: Session, k8s_client: KubernetesClient):
        self.db = db
        self.k8s = k8s_client

    async def enable_mcp_for_sandbox(
        self,
        sandbox_id: str,
        mcp_configs: Dict[str, Dict[str, Any]]
    ) -> MCPGatewaySession:
        """为沙箱启用 MCP Gateway"""

        # 1. 验证所有 MCP 服务器存在
        server_ids = list(mcp_configs.keys())
        servers = self.db.query(MCPServer).filter(
            MCPServer.server_id.in_(server_ids),
            MCPServer.is_active == True
        ).all()

        if len(servers) != len(server_ids):
            raise ValueError("Some MCP servers not found")

        # 2. 验证凭证格式
        for server in servers:
            config = mcp_configs[server.server_id]
            if not self._validate_credentials(server.credential_schema, config):
                raise ValueError(f"Invalid credentials for {server.server_id}")

        # 3. 加密凭证并存储配置
        for server in servers:
            credentials = mcp_configs[server.server_id]
            encrypted = encrypt_credentials(credentials)

            mcp_config = SandboxMCPConfig(
                sandbox_id=sandbox_id,
                server_id=server.server_id,
                credentials_encrypted=encrypted,
                container_status='pending'
            )
            self.db.add(mcp_config)

        # 4. 生成 MCP Gateway 访问令牌
        token = self._generate_gateway_token(sandbox_id)
        expires_at = datetime.utcnow() + timedelta(hours=24)

        # 5. 创建 Gateway 会话
        session = MCPGatewaySession(
            sandbox_id=sandbox_id,
            gateway_url=f"https://sandbox-{sandbox_id}.e2b.dev/mcp",
            gateway_internal_url="http://localhost:8000/mcp",
            access_token=token,
            token_expires_at=expires_at,
            status='active'
        )
        self.db.add(session)

        # 6. 注入 MCP Gateway sidecar 容器到沙箱 Pod
        await self._inject_gateway_sidecar(sandbox_id, mcp_configs)

        self.db.commit()
        return session

    def _validate_credentials(self, schema: Dict, credentials: Dict) -> bool:
        """验证凭证是否符合 schema"""
        required_fields = [
            field for field, props in schema.get('properties', {}).items()
            if props.get('required', False)
        ]
        return all(field in credentials for field in required_fields)

    def _generate_gateway_token(self, sandbox_id: str) -> str:
        """生成 Gateway 访问令牌"""
        random_bytes = secrets.token_bytes(32)
        token_data = f"{sandbox_id}:{random_bytes.hex()}"
        return f"Bearer tok_{hashlib.sha256(token_data.encode()).hexdigest()[:32]}"

    async def _inject_gateway_sidecar(
        self,
        sandbox_id: str,
        mcp_configs: Dict[str, Dict[str, Any]]
    ):
        """注入 MCP Gateway sidecar 容器"""

        # 构建 sidecar 容器定义
        sidecar_container = {
            'name': 'mcp-gateway',
            'image': 'e2b/mcp-gateway:latest',
            'ports': [{'containerPort': 8000}],
            'env': [
                {'name': 'SANDBOX_ID', 'value': sandbox_id},
                {'name': 'MCP_CONFIGS', 'value': json.dumps(mcp_configs)}
            ],
            'resources': {
                'limits': {'memory': '512Mi', 'cpu': '500m'},
                'requests': {'memory': '256Mi', 'cpu': '250m'}
            }
        }

        # 将 sidecar 添加到沙箱 Pod
        await self.k8s.add_sidecar_to_pod(
            namespace='sandboxes',
            pod_name=f'sandbox-{sandbox_id}',
            container=sidecar_container
        )

    async def get_mcp_url(self, sandbox_id: str) -> Dict[str, Any]:
        """获取沙箱的 MCP Gateway URL"""
        session = self.db.query(MCPGatewaySession).filter(
            MCPGatewaySession.sandbox_id == sandbox_id,
            MCPGatewaySession.status == 'active'
        ).first()

        if not session:
            raise ValueError("MCP not enabled for this sandbox")

        # 检查 token 是否过期
        if session.token_expires_at < datetime.utcnow():
            session.status = 'expired'
            self.db.commit()
            raise ValueError("MCP token expired")

        # 获取已配置的服务器列表
        configs = self.db.query(SandboxMCPConfig).filter(
            SandboxMCPConfig.sandbox_id == sandbox_id
        ).all()

        return {
            'url': session.gateway_url,
            'token': session.access_token,
            'expires_at': session.token_expires_at.isoformat(),
            'servers': [config.server_id for config in configs]
        }
```

### 5.3 MCP 工具容器生命周期

```
┌─────────────────────────────────────────────────────────────┐
│                   MCP Tool Lifecycle                         │
└─────────────────────────────────────────────────────────────┘

1. Sandbox Creation with MCP
   └─→ Control Plane validates MCP configs
       └─→ Encrypts and stores credentials in DB

2. Gateway Sidecar Injection
   └─→ K8s adds MCP Gateway sidecar to sandbox Pod
       └─→ Gateway starts and reads configs from env

3. Tool Container Launch
   └─→ For each MCP server in config:
       ├─→ Gateway pulls Docker image
       ├─→ Creates container with credentials as env vars
       ├─→ Shares network namespace with sandbox
       └─→ Updates container_status = 'running'

4. MCP Request Handling
   └─→ AI client sends request to gateway_url
       ├─→ Gateway validates token
       ├─→ Routes request to tool container
       └─→ Returns response to AI client

5. Tool Container Shutdown
   └─→ When sandbox terminates:
       ├─→ Gateway stops all tool containers
       ├─→ Removes containers
       └─→ Updates container_status = 'stopped'

6. Cleanup
   └─→ Gateway session expires
       └─→ Credentials remain encrypted in DB (for audit)
```

---

## 6. 安全模型

### 6.1 凭证加密

**加密方案**: AES-256-GCM

```python
# app/core/encryption.py
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.backends import default_backend
import os
import base64
import json

# 从环境变量或 KMS 获取主密钥
MASTER_KEY = os.environ.get('MCP_ENCRYPTION_KEY')  # 32 bytes

def encrypt_credentials(credentials: dict) -> bytes:
    """加密 MCP 凭证"""
    aesgcm = AESGCM(base64.b64decode(MASTER_KEY))
    nonce = os.urandom(12)  # 96-bit nonce

    plaintext = json.dumps(credentials).encode('utf-8')
    ciphertext = aesgcm.encrypt(nonce, plaintext, None)

    # 返回 nonce + ciphertext
    return nonce + ciphertext

def decrypt_credentials(encrypted: bytes) -> dict:
    """解密 MCP 凭证"""
    aesgcm = AESGCM(base64.b64decode(MASTER_KEY))

    nonce = encrypted[:12]
    ciphertext = encrypted[12:]

    plaintext = aesgcm.decrypt(nonce, ciphertext, None)
    return json.loads(plaintext.decode('utf-8'))
```

**密钥管理**:
- 主密钥存储在 Kubernetes Secret 中
- 支持密钥轮换 (通过 `encryption_key_version`)
- 每个环境使用不同的密钥

### 6.2 Gateway 令牌认证

**令牌格式**: `Bearer tok_<32-char-hex>`

**生成流程**:
```python
import secrets
import hashlib

def generate_gateway_token(sandbox_id: str) -> str:
    # 1. 生成随机字节
    random_bytes = secrets.token_bytes(32)

    # 2. 结合 sandbox_id
    token_data = f"{sandbox_id}:{random_bytes.hex()}"

    # 3. Hash
    token_hash = hashlib.sha256(token_data.encode()).hexdigest()[:32]

    return f"Bearer tok_{token_hash}"
```

**验证流程**:
```python
async def validate_gateway_token(token: str, sandbox_id: str) -> bool:
    # 1. 查询数据库
    session = db.query(MCPGatewaySession).filter(
        MCPGatewaySession.sandbox_id == sandbox_id,
        MCPGatewaySession.access_token == token
    ).first()

    if not session:
        return False

    # 2. 检查状态
    if session.status != 'active':
        return False

    # 3. 检查过期时间
    if session.token_expires_at < datetime.utcnow():
        session.status = 'expired'
        db.commit()
        return False

    # 4. 更新最后访问时间
    session.last_accessed_at = datetime.utcnow()
    db.commit()

    return True
```

### 6.3 网络隔离

**默认策略**: 每个 MCP 工具容器与沙箱共享网络命名空间，但彼此隔离。

**Kubernetes NetworkPolicy**:
```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: mcp-gateway-policy
  namespace: sandboxes
spec:
  podSelector:
    matchLabels:
      app: sandbox
      mcp-enabled: "true"
  policyTypes:
  - Ingress
  - Egress
  ingress:
  # 允许外部访问 MCP Gateway (port 8000)
  - from:
    - namespaceSelector:
        matchLabels:
          name: public
    ports:
    - protocol: TCP
      port: 8000
  egress:
  # MCP 工具可以访问外部 API
  - to:
    - namespaceSelector: {}
    ports:
    - protocol: TCP
      port: 443  # HTTPS
```

### 6.4 审计日志

所有 MCP 交互记录到审计日志：

```python
# app/models/audit.py
class MCPAuditLog(Base):
    __tablename__ = 'mcp_audit_logs'

    log_id = Column(UUID, primary_key=True, default=uuid.uuid4)
    sandbox_id = Column(UUID, nullable=False)
    server_id = Column(String(100), nullable=False)

    # 请求信息
    method = Column(String(20))              # MCP 方法 (tools/list, tools/call, etc.)
    tool_name = Column(String(200))          # 工具名称
    request_body = Column(JSONB)             # 请求体 (敏感信息脱敏)

    # 响应信息
    status_code = Column(Integer)
    response_body = Column(JSONB)            # 响应体 (敏感信息脱敏)

    # 元数据
    duration_ms = Column(Integer)            # 请求耗时
    error_message = Column(Text)             # 错误信息

    created_at = Column(DateTime, default=datetime.utcnow)
```

---

## 7. 与 L1-L5 的集成

### 7.1 需要更新的文档

#### 7.1.1 L1-product-requirements.md

**新增功能**: F7 - MCP Gateway

```markdown
### F7: MCP (Model Context Protocol) Gateway

**优先级**: P0

**功能描述**:
支持在沙箱中集成 200+ 预验证的 MCP 工具，使 AI 代理能够访问外部应用程序（Browserbase、Stripe、GitHub、Notion 等）。

**用户故事**:
- 作为开发者，我希望能在沙箱创建时配置 MCP 工具，以便 AI 代理可以使用这些工具
- 作为开发者，我希望能获取 MCP Gateway URL，以便将其连接到 AI 客户端（Claude Desktop、VSCode 等）
- 作为开发者，我希望能查看可用的 MCP 工具目录，以便选择合适的工具
- 作为开发者,我希望能动态添加/移除 MCP 工具，以便在运行时调整工具集

**需求**:
- R7.1: 支持 200+ MCP 工具的配置和管理
- R7.2: 提供 MCP Gateway URL 和访问令牌
- R7.3: 凭证加密存储（AES-256-GCM）
- R7.4: 每个工具作为独立 Docker 容器运行
- R7.5: 支持工具的动态添加和移除
- R7.6: 审计所有 MCP 交互
- R7.7: Token 自动过期（默认 24 小时）

**非功能性需求**:
- NFR7.1: MCP 请求延迟 < 500ms (p95)
- NFR7.2: 支持 1000+ 并发 MCP 会话
- NFR7.3: 凭证加密/解密延迟 < 10ms
- NFR7.4: 工具容器启动时间 < 5s
```

#### 7.1.2 L2-system-architecture.md

**新增组件**: MCP Gateway Service

```markdown
### 3.6 MCP Gateway Service (数据平面)

**技术栈**: Go + Docker SDK

**职责**:
1. 管理 MCP 工具 Docker 容器生命周期
2. 路由 MCP 协议请求到对应工具容器
3. 验证 Gateway 访问令牌
4. 记录 MCP 交互审计日志

**部署方式**: Sidecar 容器（与沙箱 Pod 共享网络命名空间）

**通信协议**:
- 外部: HTTPS (MCP over HTTP/SSE)
- 内部: HTTP localhost (与工具容器通信)

**架构图**:
见 L0-supplement-mcp-gateway.md 第 5.1 节
```

#### 7.1.3 L3.2-database-design.md

**新增表**:
- `mcp_servers` (MCP 服务器目录)
- `sandbox_mcp_configs` (沙箱 MCP 配置)
- `mcp_gateway_sessions` (MCP Gateway 会话)
- `mcp_audit_logs` (MCP 审计日志)

详细设计见本文档第 3 节。

#### 7.1.4 L4.1-api-specification.md

**扩展端点**:
- `POST /v1/sandboxes` - 添加 `mcp` 参数
- `GET /v1/sandboxes/{sandbox_id}/mcp-url` - 获取 MCP Gateway URL
- `GET /v1/mcp/servers` - 获取 MCP 服务器目录
- `GET /v1/mcp/servers/{server_id}` - 获取单个服务器详情
- `POST /v1/sandboxes/{sandbox_id}/mcp/servers` - 添加 MCP 工具
- `DELETE /v1/sandboxes/{sandbox_id}/mcp/servers/{server_id}` - 移除 MCP 工具
- `GET /v1/sandboxes/{sandbox_id}/mcp/servers` - 列出沙箱的 MCP 配置

详细设计见本文档第 4 节。

#### 7.1.5 L5-module-design.md

**新增模块**: `mcp-gateway-service`

```markdown
### 5.7 mcp-gateway-service

**语言**: Go
**框架**: net/http, Docker SDK
**部署**: Kubernetes Sidecar

**目录结构**:
```
mcp-gateway-service/
├── cmd/
│   └── gateway/
│       └── main.go                 # 入口
├── pkg/
│   ├── gateway/
│   │   ├── gateway.go              # Gateway 核心逻辑
│   │   ├── router.go               # MCP 请求路由
│   │   └── auth.go                 # 令牌验证
│   ├── docker/
│   │   ├── client.go               # Docker 客户端封装
│   │   └── container.go            # 容器生命周期管理
│   └── mcp/
│       ├── protocol.go             # MCP 协议定义
│       └── proxy.go                # 请求代理
├── Dockerfile
└── go.mod
```

**关键接口**:
- `Gateway.Start()` - 启动 Gateway 和工具容器
- `Gateway.HandleMCPRequest()` - 处理 MCP 请求
- `Gateway.AddServer()` - 动态添加 MCP 工具
- `Gateway.RemoveServer()` - 动态移除 MCP 工具
```

### 7.2 SDK 集成

#### TypeScript SDK

```typescript
// 在 packages/js-sdk/src/sandbox/sandbox.ts 中
export class Sandbox {
  // ... 现有方法

  /**
   * Get MCP Gateway URL for this sandbox
   * @returns MCP Gateway URL and access token
   */
  async getMcpUrl(): Promise<{
    url: string
    token: string
    expiresAt: string
    servers: string[]
  }> {
    const response = await this.api.get(`/sandboxes/${this.id}/mcp-url`)
    return response.data
  }

  /**
   * Add MCP server to sandbox
   * @param serverId - MCP server ID (e.g., 'notion')
   * @param credentials - Server credentials
   */
  async addMcpServer(
    serverId: string,
    credentials: Record<string, any>
  ): Promise<void> {
    await this.api.post(`/sandboxes/${this.id}/mcp/servers`, {
      server_id: serverId,
      credentials
    })
  }

  /**
   * Remove MCP server from sandbox
   * @param serverId - MCP server ID
   */
  async removeMcpServer(serverId: string): Promise<void> {
    await this.api.delete(`/sandboxes/${this.id}/mcp/servers/${serverId}`)
  }

  /**
   * List MCP servers in sandbox
   */
  async listMcpServers(): Promise<Array<{
    serverId: string
    displayName: string
    containerStatus: string
    containerStartedAt: string
  }>> {
    const response = await this.api.get(`/sandboxes/${this.id}/mcp/servers`)
    return response.data.servers
  }
}

// 获取 MCP 服务器目录
export async function listMcpServers(options?: {
  category?: string
  search?: string
}): Promise<MCPServer[]> {
  const params = new URLSearchParams(options as any)
  const response = await api.get(`/mcp/servers?${params}`)
  return response.data.servers
}
```

#### Python SDK

```python
# packages/python-sdk/e2b/sandbox/sandbox.py
class Sandbox:
    # ... 现有方法

    async def get_mcp_url(self) -> dict:
        """获取 MCP Gateway URL"""
        response = await self._api.get(f'/sandboxes/{self.id}/mcp-url')
        return response.json()

    async def add_mcp_server(
        self,
        server_id: str,
        credentials: dict
    ) -> None:
        """添加 MCP 工具"""
        await self._api.post(
            f'/sandboxes/{self.id}/mcp/servers',
            json={'server_id': server_id, 'credentials': credentials}
        )

    async def remove_mcp_server(self, server_id: str) -> None:
        """移除 MCP 工具"""
        await self._api.delete(f'/sandboxes/{self.id}/mcp/servers/{server_id}')

    async def list_mcp_servers(self) -> list[dict]:
        """列出沙箱中的 MCP 工具"""
        response = await self._api.get(f'/sandboxes/{self.id}/mcp/servers')
        return response.json()['servers']

# 获取 MCP 服务器目录
async def list_mcp_servers(
    category: str | None = None,
    search: str | None = None
) -> list[dict]:
    params = {}
    if category:
        params['category'] = category
    if search:
        params['search'] = search

    response = await api.get('/mcp/servers', params=params)
    return response.json()['servers']
```

---

## 8. 实现优先级

### Phase 1: 核心 MCP Gateway (1 周)

**P0 - 必须有**:
- ✅ 数据库表创建 (mcp_servers, sandbox_mcp_configs, mcp_gateway_sessions)
- ✅ MCP Gateway Service (Go) - 基础版本
  - 容器生命周期管理
  - 请求路由
  - 令牌验证
- ✅ 控制平面 API
  - POST /v1/sandboxes (扩展)
  - GET /v1/sandboxes/{id}/mcp-url
- ✅ 凭证加密/解密
- ✅ K8s sidecar 注入

### Phase 2: MCP 服务器目录 (3 天)

**P1 - 应该有**:
- ✅ MCP 服务器目录数据导入 (200+ 服务器)
- ✅ GET /v1/mcp/servers API
- ✅ GET /v1/mcp/servers/{id} API
- ✅ SDK 方法 (listMcpServers)

### Phase 3: 动态管理 (3 天)

**P1 - 应该有**:
- ✅ POST /v1/sandboxes/{id}/mcp/servers (动态添加)
- ✅ DELETE /v1/sandboxes/{id}/mcp/servers/{server_id} (动态移除)
- ✅ Gateway 热重载机制
- ✅ SDK 方法 (addMcpServer, removeMcpServer)

### Phase 4: 监控和审计 (2 天)

**P2 - 可以有**:
- ✅ MCP 审计日志
- ✅ Prometheus 指标
- ✅ Grafana 仪表盘

---

## 9. 测试策略

### 9.1 单元测试

```go
// pkg/gateway/gateway_test.go
func TestGateway_StartMCPContainer(t *testing.T) {
    gateway := &Gateway{
        dockerClient: mockDockerClient(),
        sandboxID: "test-sandbox",
    }

    config := &MCPServerConfig{
        ServerID: "browserbase",
        Image: "browserbase/mcp-server",
        Tag: "latest",
        Credentials: map[string]interface{}{
            "apiKey": "test-key",
        },
    }

    container, err := gateway.startMCPContainer(context.Background(), config)
    assert.NoError(t, err)
    assert.Equal(t, "browserbase", container.ServerID)
    assert.Equal(t, "running", container.Status)
}
```

### 9.2 集成测试

```python
# tests/integration/test_mcp.py
import pytest
from e2b import Sandbox

@pytest.mark.asyncio
async def test_mcp_gateway_e2e():
    # 1. 创建带 MCP 的沙箱
    sandbox = await Sandbox.create(
        template='base',
        mcp={
            'exa': {'apiKey': 'test-key'}
        }
    )

    # 2. 获取 MCP URL
    mcp_info = await sandbox.get_mcp_url()
    assert 'url' in mcp_info
    assert 'token' in mcp_info
    assert 'exa' in mcp_info['servers']

    # 3. 验证 MCP 请求
    response = requests.get(
        f"{mcp_info['url']}/tools/list",
        headers={'Authorization': mcp_info['token']}
    )
    assert response.status_code == 200

    # 4. 动态添加工具
    await sandbox.add_mcp_server('notion', {
        'internalIntegrationToken': 'secret_test'
    })

    # 5. 验证工具已添加
    servers = await sandbox.list_mcp_servers()
    assert len(servers) == 2

    # 6. 清理
    await sandbox.kill()
```

### 9.3 负载测试

```python
# tests/load/test_mcp_load.py
import asyncio
from locust import User, task, between

class MCPUser(User):
    wait_time = between(1, 3)

    @task
    def list_tools(self):
        """模拟 AI 客户端列出工具"""
        self.client.get(
            f"{self.mcp_url}/tools/list",
            headers={'Authorization': self.token}
        )

    @task(3)
    def call_tool(self):
        """模拟 AI 客户端调用工具"""
        self.client.post(
            f"{self.mcp_url}/tools/call",
            json={
                'server': 'exa',
                'tool': 'search',
                'arguments': {'query': 'test'}
            },
            headers={'Authorization': self.token}
        )

# 目标: 1000 并发用户, p95 延迟 < 500ms
```

---

## 10. 文档和示例

### 10.1 用户文档

需要在官方文档中添加:

1. **MCP Gateway 快速开始**
2. **MCP 服务器目录**
3. **配置 MCP 工具**
4. **连接 AI 客户端 (Claude Desktop, VSCode)**
5. **安全最佳实践**
6. **故障排查**

### 10.2 示例代码

```typescript
// examples/mcp-browserbase.ts
import { Sandbox } from 'e2b'

async function main() {
  // 1. 创建带 Browserbase 的沙箱
  const sandbox = await Sandbox.create({
    template: 'base',
    mcp: {
      browserbase: {
        apiKey: process.env.BROWSERBASE_API_KEY!,
        geminiApiKey: process.env.GEMINI_API_KEY!,
        projectId: process.env.BROWSERBASE_PROJECT_ID!
      }
    }
  })

  // 2. 获取 MCP URL
  const mcpInfo = await sandbox.getMcpUrl()
  console.log('Connect your AI client to:', mcpInfo.url)
  console.log('Use token:', mcpInfo.token)

  // 3. 保持沙箱运行
  await new Promise(resolve => setTimeout(resolve, 3600000)) // 1 hour

  await sandbox.kill()
}

main()
```

---

## 11. 风险和缓解

### 11.1 安全风险

**风险**: MCP 工具可能访问敏感外部 API

**缓解**:
- ✅ 凭证加密存储
- ✅ 网络策略限制出站流量
- ✅ 审计所有 MCP 交互
- ✅ 短期 token (24 小时过期)

### 11.2 性能风险

**风险**: 每个沙箱启动多个 Docker 容器可能影响性能

**缓解**:
- ✅ 容器资源限制 (CPU/内存)
- ✅ 延迟启动 (只在首次 MCP 请求时启动容器)
- ✅ 容器复用 (同一工具在多个沙箱中共享)

### 11.3 可靠性风险

**风险**: MCP 工具容器崩溃导致服务不可用

**缓解**:
- ✅ 容器健康检查
- ✅ 自动重启策略
- ✅ 优雅降级 (单个工具失败不影响其他工具)

---

## 附录 A: MCP 协议简介

MCP (Model Context Protocol) 是一个标准化协议，定义了 AI 系统与外部工具的通信方式。

**核心端点**:
- `GET /tools/list` - 列出可用工具
- `POST /tools/call` - 调用工具
- `GET /resources/list` - 列出资源
- `GET /resources/read` - 读取资源
- `POST /prompts/list` - 列出提示词
- `GET /prompts/get` - 获取提示词

**请求示例**:
```json
POST /tools/call
{
  "name": "exa_search",
  "arguments": {
    "query": "AI sandbox solutions",
    "num_results": 10
  }
}
```

**响应示例**:
```json
{
  "content": [
    {
      "type": "text",
      "text": "Found 10 results for 'AI sandbox solutions':\n1. E2B - Secure code execution sandbox..."
    }
  ]
}
```

---

## 附录 B: 参考资料

1. **E2B 官方代码库**: https://github.com/e2b-dev/e2b
   - MCP Python SDK: `packages/python-sdk/e2b/sandbox/mcp.py`
   - MCP TypeScript SDK: `packages/js-sdk/src/sandbox/mcp.d.ts`

2. **Docker-E2B 合作博客**: https://e2b.dev/blog/docker-e2b-partner-to-introduce-mcp-support-in-e2b-sandbox

3. **Docker Hub MCP 目录**: https://hub.docker.com/mcp

4. **MCP 规范**: https://spec.modelcontextprotocol.io

5. **Claude Desktop MCP 集成**: https://docs.anthropic.com/claude/docs/mcp

---

**文档结束**
