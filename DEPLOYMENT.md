# AdNegator Pro - Vercel 部署指南

## 🚀 快速部署到 Vercel

### 前置条件
- GitHub 账户
- Vercel 账户（可以用GitHub登录）
- Kimi API密钥（从 https://platform.moonshot.cn 获取）

### 第一步：推送代码到GitHub

1. **创建GitHub仓库**
```bash
# 如果还没有初始化git
git init
git add .
git commit -m "Initial commit: AdNegator Pro"

# 添加远程仓库（替换为你的仓库地址）
git remote add origin https://github.com/你的用户名/AdNegator.git
git branch -M main
git push -u origin main
```

### 第二步：连接Vercel

1. 访问 [vercel.com](https://vercel.com)
2. 用GitHub账户登录
3. 点击 "New Project"
4. 选择你的 AdNegator 仓库
5. 点击 "Import"

### 第三步：配置环境变量

在Vercel项目设置中添加以下环境变量：

#### 必需的环境变量：
```
KIMI_API_KEY=你的Kimi API密钥
KIMI_API_BASE=https://api.moonshot.cn/v1
KIMI_MODEL=moonshot-v1-8k
NODE_ENV=production
NEXT_PUBLIC_APP_NAME=AdNegator Pro
```

#### 可选的环境变量：
```
MAX_FILE_SIZE=52428800
ALLOWED_FILE_TYPES=.csv,.xlsx,.xls
DEFAULT_ANALYSIS_BATCH_SIZE=100
MAX_CONCURRENT_ANALYSES=3
CACHE_TTL=3600
```

### 第四步：部署

1. 配置完环境变量后，Vercel会自动开始部署
2. 等待部署完成（通常需要2-5分钟）
3. 部署成功后，你会得到一个 `.vercel.app` 域名

### 第五步：测试部署

1. 访问你的Vercel域名
2. 测试文件上传功能
3. 测试AI分析功能
4. 确认所有功能正常工作

## 🔧 部署配置说明

### vercel.json 配置
项目包含了 `vercel.json` 配置文件，包含：
- API路由超时设置（60秒）
- CORS头配置
- 路由重写规则

### 环境变量说明
- `KIMI_API_KEY`: Kimi AI的API密钥，用于智能分析
- `NODE_ENV`: 设置为 production
- `NEXT_PUBLIC_APP_NAME`: 应用名称，会显示在界面上

## 🚨 注意事项

1. **API密钥安全**: 确保不要将API密钥提交到GitHub
2. **域名配置**: 部署后记得更新 `NEXT_PUBLIC_APP_URL` 为实际域名
3. **文件大小限制**: Vercel有50MB的文件上传限制
4. **函数超时**: API函数最长运行60秒

## 🔄 更新部署

每次推送到main分支，Vercel会自动重新部署：

```bash
git add .
git commit -m "Update: 描述你的更改"
git push origin main
```

## 🌐 自定义域名（可选）

1. 在Vercel项目设置中点击 "Domains"
2. 添加你的自定义域名
3. 按照提示配置DNS记录
4. 等待SSL证书自动配置

## 📊 监控和日志

- 在Vercel控制台可以查看：
  - 部署日志
  - 函数日志
  - 性能监控
  - 错误追踪

## 🆘 常见问题

### 部署失败
- 检查环境变量是否正确配置
- 查看构建日志中的错误信息
- 确认所有依赖都在package.json中

### API调用失败
- 检查KIMI_API_KEY是否正确
- 确认API密钥有足够的配额
- 查看函数日志中的错误信息

### 文件上传问题
- 确认文件大小不超过50MB
- 检查文件格式是否支持
- 查看浏览器控制台的错误信息
