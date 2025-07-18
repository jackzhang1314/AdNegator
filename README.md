# AdNegator Pro - 谷歌广告智能否词工具

## 🎯 项目概述

AdNegator Pro 是一个基于 GPT-4o 的谷歌搜索广告智能否词分析系统，专为Google Ads广告主优化投放成本而设计。系统通过GPT-4o语义分析能力，智能判断Google Ads搜索字词报告中的搜索字词是否应设为否定关键词，实现广告投放成本优化。

## ✨ 核心特性

### 🧠 GPT-4o智能分析引擎
- **语义相关性分析**：深度理解搜索词与业务的匹配度
- **商业价值评估**：评估购买意图强度和客户质量
- **数据表现分析**：基于成本效率和转化表现的智能判断
- **多维度评分**：综合语义、商业价值、数据表现的智能评分

### 🎯 精准否词建议
- **智能推荐**：基于置信度的分级推荐系统
- **匹配方式优化**：精确、词组、广泛匹配的智能选择
- **层级应用**：账户、广告系列、广告组级别的精准应用
- **批量处理**：高效处理大量搜索词数据

### � 网站信息管理
- **自动爬虫**：自动抓取网站标题、描述、产品信息
- **业务信息补充**：行业类型、目标市场等关键信息录入
- **上下文优化**：为GPT-4o分析提供精准的业务上下文
- **多网站管理**：支持管理多个网站的否词分析

### 📊 数据处理与导出
- **多格式支持**：CSV/Excel格式的搜索词报告导入
- **数据清洗**：去重、格式标准化、异常值处理
- **导出优化**：Google Ads直接导入格式、详细分析报告
- **历史管理**：完整的上传和导出历史记录

## 🏗️ 技术架构

### 前端技术栈
- **框架**：Next.js 14 + TypeScript
- **UI组件**：Shadcn/ui + Tailwind CSS
- **状态管理**：React Context + Zustand
- **表单处理**：React Hook Form + Zod
- **数据可视化**：Recharts + Chart.js

### 后端技术栈
- **BaaS平台**：Supabase (PostgreSQL + Edge Functions)
- **认证系统**：Supabase Auth
- **AI集成**：OpenAI GPT-4o API
- **文件处理**：Papa Parse (CSV) + SheetJS (Excel)
- **网页爬虫**：Puppeteer + Cheerio

### 核心业务流程
```
用户管理 → 网站信息录入 → 搜索词数据上传 → GPT-4o智能分析 → 否词建议管理 → 结果导出
```

## 🚀 快速开始

### 环境要求
- Node.js >= 18.0.0
- OpenAI API Key (GPT-4o访问权限)
- Supabase 项目

### 安装步骤

```bash
# 克隆项目
git clone https://github.com/your-org/adnegator-pro.git
cd adnegator-pro

# 安装依赖
npm install

# 环境配置
cp .env.example .env.local
# 编辑 .env.local 文件，配置Supabase和OpenAI API密钥

# 数据库初始化
npm run db:setup

# 启动开发服务器
npm run dev
```

### 核心使用流程
1. **注册登录** → 创建账户
2. **添加网站** → 录入业务信息（系统自动爬取网站信息）
3. **上传数据** → 导入Google Ads搜索词报告
4. **AI分析** → GPT-4o自动分析搜索词
5. **审核建议** → 人工审核AI否词建议
6. **导出应用** → 导出否词列表到Google Ads

## 📁 项目结构

```
adnegator-pro/
├── app/                  # Next.js 14 App Router
│   ├── (auth)/          # 认证相关页面
│   ├── dashboard/       # 仪表板页面
│   ├── websites/        # 网站管理页面
│   ├── analysis/        # 分析结果页面
│   └── export/          # 导出中心页面
├── components/          # React组件
│   ├── ui/             # Shadcn/ui基础组件
│   ├── forms/          # 表单组件
│   ├── charts/         # 图表组件
│   └── layout/         # 布局组件
├── lib/                # 工具库和配置
│   ├── supabase/       # Supabase客户端
│   ├── openai/         # OpenAI集成
│   ├── parsers/        # 文件解析器
│   └── utils/          # 工具函数
├── types/              # TypeScript类型定义
├── docs/               # 项目文档
└── supabase/           # Supabase配置和迁移
```

## 🔧 核心功能模块

### 1. 用户认证与网站管理
- **Supabase Auth**：用户注册登录系统
- **网站信息爬取**：自动抓取网站标题、描述、产品信息
- **业务信息补充**：行业类型、目标市场等关键信息
- **多网站管理**：支持管理多个网站的否词分析

### 2. 搜索词数据处理
- **文件上传**：支持CSV/Excel格式的Google Ads搜索词报告
- **数据验证**：检查必需字段（搜索字词、关键词、广告系列等）
- **数据清洗**：去重、格式标准化、异常值处理
- **批量入库**：高效存储大量搜索词数据

### 3. GPT-4o智能分析引擎 (核心模块)
- **语义相关性分析** (40%权重)：搜索词与业务的匹配度
- **商业价值评估** (35%权重)：购买意图强度和客户质量
- **数据表现分析** (25%权重)：成本效率和转化表现
- **智能推荐**：基于置信度的分级推荐系统

### 4. 否词建议管理
- **分级推荐**：置信度≥90%强烈推荐，70-89%推荐执行
- **匹配方式选择**：精确、词组、广泛匹配的智能选择
- **层级应用**：账户、广告系列、广告组级别的精准应用
- **批量操作**：批量选择和状态管理

### 5. 数据导出功能
- **Google Ads格式**：可直接导入Google Ads的否词列表
- **Excel详细报告**：包含完整分析过程和数据
- **自定义导出**：按置信度筛选、按层级分类

## 📈 GPT-4o分析逻辑

### 分析维度与权重
```javascript
analysisResult = {
  semanticRelevance: { score: number, analysis: string }, // 40%权重
  commercialValue: { score: number, analysis: string },   // 35%权重
  performanceAnalysis: { costEfficiency: string, clickQuality: string }, // 25%权重
  recommendation: {
    isNegative: boolean,
    confidence: number, // 0-100
    negativeKeyword: string,
    matchType: 'exact' | 'phrase' | 'broad',
    level: 'account' | 'campaign' | 'adgroup',
    reasoning: string
  }
}
```

### 判断逻辑
```
IF (语义相关性 < 30%) OR
   (商业价值 < 25% AND 零转化高消费) OR
   (CTR < 行业平均*0.5 AND 消费 > 阈值)
THEN 建议设为否词

置信度计算 = (语义分析置信度 + 数据表现置信度 + 商业价值置信度) / 3
```

## 🛣️ 开发路线图

### Phase 1: 核心功能开发
- [x] 项目架构设计
- [ ] Supabase集成和数据库设计
- [ ] 用户认证系统
- [ ] 网站信息管理模块
- [ ] 文件上传和数据处理

### Phase 2: AI分析引擎
- [ ] GPT-4o API集成
- [ ] Prompt工程优化
- [ ] 批量分析处理
- [ ] 分析结果管理

### Phase 3: 用户界面完善
- [ ] 仪表板页面
- [ ] 分析结果展示
- [ ] 导出功能
- [ ] 用户体验优化

### Phase 4: 性能优化与扩展
- [ ] 大数据量处理优化
- [ ] API调用成本控制
- [ ] 多语言支持
- [ ] 企业级功能

## 🔧 开发指南

### 代码规范
- **ESLint + Prettier**：代码格式化
- **Husky + lint-staged**：Git钩子检查
- **Conventional Commits**：提交信息规范
- **TypeScript**：类型安全保障

### 测试策略
- **单元测试**：Jest + Testing Library
- **集成测试**：Playwright
- **GPT-4o测试**：模拟API响应测试
- **端到端测试**：完整业务流程测试

## 🤝 贡献指南

我们欢迎社区贡献！请查看 [CONTRIBUTING.md](./CONTRIBUTING.md) 了解详细信息。

### 贡献方式
- **Bug报告**：提交Issue
- **功能建议**：Discussion讨论
- **代码贡献**：Pull Request
- **文档改进**：Documentation PR

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](./LICENSE) 文件了解详情。

## 📞 联系我们

- **项目主页**：https://adnegator.pro
- **文档中心**：https://docs.adnegator.pro
- **问题反馈**：https://github.com/your-org/adnegator-pro/issues
- **邮箱联系**：support@adnegator.pro

---

**AdNegator Pro** - 让Google Ads投放更精准，让广告成本更优化 �
