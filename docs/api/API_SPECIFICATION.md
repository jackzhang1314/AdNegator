# AdNegator Pro - API 规范文档

## 📋 API 概览

AdNegator Pro API 采用 RESTful 设计风格，提供完整的广告屏蔽和内容优化服务接口。

### 基础信息
- **Base URL**: `https://api.adnegator.pro/v1`
- **协议**: HTTPS
- **认证**: JWT Bearer Token
- **数据格式**: JSON
- **字符编码**: UTF-8

### 版本控制
- **当前版本**: v1
- **版本策略**: URL路径版本控制
- **向后兼容**: 保证向后兼容性

## 🔐 认证授权

### JWT Token 结构
```json
{
  "header": {
    "alg": "HS256",
    "typ": "JWT"
  },
  "payload": {
    "userId": "uuid",
    "email": "user@example.com",
    "role": "user",
    "permissions": ["user:read", "stats:read"],
    "iat": 1640995200,
    "exp": 1641081600
  }
}
```

### 认证流程
```http
# 1. 用户登录
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}

# 2. 获取Token
HTTP/1.1 200 OK
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 3600
  }
}

# 3. 使用Token访问API
GET /user/profile
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## 📊 标准响应格式

### 成功响应
```json
{
  "success": true,
  "data": {
    // 响应数据
  },
  "meta": {
    "timestamp": "2024-01-01T00:00:00Z",
    "requestId": "req_123456789",
    "version": "v1"
  }
}
```

### 错误响应
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "请求参数验证失败",
    "details": [
      {
        "field": "email",
        "message": "邮箱格式不正确"
      }
    ]
  },
  "meta": {
    "timestamp": "2024-01-01T00:00:00Z",
    "requestId": "req_123456789",
    "version": "v1"
  }
}
```

### 分页响应
```json
{
  "success": true,
  "data": {
    "items": [...],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 100,
      "totalPages": 5,
      "hasNext": true,
      "hasPrev": false
    }
  }
}
```

## 🔑 核心API端点

### 1. 认证相关 `/auth`

#### 用户注册
```http
POST /auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123",
  "confirmPassword": "password123",
  "acceptTerms": true
}
```

#### 用户登录
```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123",
  "rememberMe": false
}
```

#### 刷新Token
```http
POST /auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### 用户登出
```http
POST /auth/logout
Authorization: Bearer {token}
```

### 2. 用户管理 `/users`

#### 获取用户信息
```http
GET /users/profile
Authorization: Bearer {token}

# 响应
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "createdAt": "2024-01-01T00:00:00Z",
    "settings": {
      "theme": "dark",
      "language": "zh-CN",
      "notifications": true
    }
  }
}
```

#### 更新用户信息
```http
PUT /users/profile
Authorization: Bearer {token}
Content-Type: application/json

{
  "settings": {
    "theme": "light",
    "language": "en-US",
    "notifications": false
  }
}
```

#### 修改密码
```http
PUT /users/password
Authorization: Bearer {token}
Content-Type: application/json

{
  "currentPassword": "oldpassword",
  "newPassword": "newpassword",
  "confirmPassword": "newpassword"
}
```

### 3. 广告规则 `/rules`

#### 获取规则列表
```http
GET /rules?domain=example.com&page=1&limit=20
Authorization: Bearer {token}

# 响应
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "domain": "example.com",
        "selector": ".ad-banner",
        "ruleType": "css_selector",
        "confidence": 0.95,
        "createdAt": "2024-01-01T00:00:00Z",
        "updatedAt": "2024-01-01T00:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 50,
      "totalPages": 3
    }
  }
}
```

#### 创建规则
```http
POST /rules
Authorization: Bearer {token}
Content-Type: application/json

{
  "domain": "example.com",
  "selector": ".new-ad-class",
  "ruleType": "css_selector",
  "description": "新发现的广告元素"
}
```

#### 更新规则
```http
PUT /rules/{ruleId}
Authorization: Bearer {token}
Content-Type: application/json

{
  "selector": ".updated-ad-class",
  "confidence": 0.98
}
```

#### 删除规则
```http
DELETE /rules/{ruleId}
Authorization: Bearer {token}
```

### 4. AI分析 `/ai`

#### 内容分析
```http
POST /ai/analyze
Authorization: Bearer {token}
Content-Type: application/json

{
  "url": "https://example.com/page",
  "content": {
    "html": "<div class='content'>...</div>",
    "text": "页面文本内容",
    "images": [
      {
        "src": "https://example.com/image.jpg",
        "alt": "图片描述"
      }
    ]
  },
  "options": {
    "includeImages": true,
    "deepAnalysis": false
  }
}

# 响应
{
  "success": true,
  "data": {
    "analysisId": "uuid",
    "results": {
      "adElements": [
        {
          "selector": ".ad-banner",
          "confidence": 0.95,
          "type": "display_ad",
          "reason": "包含广告相关关键词和样式"
        }
      ],
      "contentQuality": {
        "score": 0.85,
        "issues": ["过多的弹窗", "页面加载缓慢"]
      },
      "suggestions": [
        {
          "type": "remove_element",
          "selector": ".popup-ad",
          "priority": "high"
        }
      ]
    },
    "processingTime": 1.2,
    "tokensUsed": 1500
  }
}
```

#### 图像分析
```http
POST /ai/analyze-image
Authorization: Bearer {token}
Content-Type: multipart/form-data

image: [binary data]
url: "https://example.com/image.jpg"
```

### 5. 统计数据 `/stats`

#### 用户统计
```http
GET /stats/user?period=7d&timezone=Asia/Shanghai
Authorization: Bearer {token}

# 响应
{
  "success": true,
  "data": {
    "summary": {
      "adsBlocked": 1250,
      "timeSaved": 3600,
      "dataSaved": 52428800,
      "sitesVisited": 45
    },
    "daily": [
      {
        "date": "2024-01-01",
        "adsBlocked": 180,
        "timeSaved": 540,
        "dataSaved": 7340032
      }
    ],
    "topDomains": [
      {
        "domain": "example.com",
        "adsBlocked": 320,
        "percentage": 25.6
      }
    ]
  }
}
```

#### 全局统计
```http
GET /stats/global
Authorization: Bearer {token}

# 响应
{
  "success": true,
  "data": {
    "totalUsers": 10000,
    "totalAdsBlocked": 50000000,
    "totalTimeSaved": 180000000,
    "totalDataSaved": 1073741824000
  }
}
```

### 6. 扩展管理 `/extension`

#### 获取扩展配置
```http
GET /extension/config
Authorization: Bearer {token}

# 响应
{
  "success": true,
  "data": {
    "version": "1.0.0",
    "updateUrl": "https://api.adnegator.pro/extension/updates",
    "rules": {
      "lastUpdated": "2024-01-01T00:00:00Z",
      "version": "1.2.3",
      "downloadUrl": "https://api.adnegator.pro/rules/download"
    },
    "features": {
      "aiAnalysis": true,
      "imageBlocking": true,
      "customRules": true
    }
  }
}
```

#### 上报扩展数据
```http
POST /extension/report
Authorization: Bearer {token}
Content-Type: application/json

{
  "type": "ad_blocked",
  "data": {
    "url": "https://example.com",
    "selector": ".ad-banner",
    "timestamp": "2024-01-01T00:00:00Z"
  }
}
```

## 📝 错误代码

### 通用错误码
| 代码 | HTTP状态 | 描述 |
|------|----------|------|
| `SUCCESS` | 200 | 请求成功 |
| `VALIDATION_ERROR` | 400 | 请求参数验证失败 |
| `UNAUTHORIZED` | 401 | 未授权访问 |
| `FORBIDDEN` | 403 | 权限不足 |
| `NOT_FOUND` | 404 | 资源不存在 |
| `CONFLICT` | 409 | 资源冲突 |
| `RATE_LIMITED` | 429 | 请求频率超限 |
| `INTERNAL_ERROR` | 500 | 服务器内部错误 |

### 业务错误码
| 代码 | HTTP状态 | 描述 |
|------|----------|------|
| `USER_NOT_FOUND` | 404 | 用户不存在 |
| `INVALID_CREDENTIALS` | 401 | 用户名或密码错误 |
| `EMAIL_ALREADY_EXISTS` | 409 | 邮箱已存在 |
| `RULE_NOT_FOUND` | 404 | 规则不存在 |
| `AI_ANALYSIS_FAILED` | 500 | AI分析失败 |
| `QUOTA_EXCEEDED` | 429 | 配额已用完 |

## 🔄 API版本控制

### 版本策略
- **URL版本控制**: `/v1/`, `/v2/`
- **向后兼容**: 保证至少2个版本的兼容性
- **废弃通知**: 提前3个月通知API废弃

### 版本升级
```http
# 新版本API
GET /v2/users/profile
Authorization: Bearer {token}

# 响应头包含版本信息
API-Version: v2
Deprecated-Version: v1
Sunset-Date: 2024-12-31T23:59:59Z
```

## 📊 速率限制

### 限制策略
- **用户级别**: 1000 请求/小时
- **IP级别**: 5000 请求/小时
- **API密钥**: 10000 请求/小时

### 限制响应头
```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1640995200
Retry-After: 3600
```

## 🔍 API测试

### 测试环境
- **开发环境**: `https://dev-api.adnegator.pro/v1`
- **测试环境**: `https://test-api.adnegator.pro/v1`
- **生产环境**: `https://api.adnegator.pro/v1`

### Postman集合
提供完整的Postman测试集合，包含所有API端点的示例请求。

### 自动化测试
- **单元测试**: Jest + Supertest
- **集成测试**: Newman + Postman
- **性能测试**: Artillery.js

这个API规范为AdNegator Pro提供了完整、标准化的接口定义，确保前后端开发的一致性和可维护性。
