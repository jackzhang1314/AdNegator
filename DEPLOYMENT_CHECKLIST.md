# AdNegator Pro - Vercel 部署检查清单

## 🚀 部署前检查

### 1. 环境变量配置 ✅
确保在 Vercel Dashboard 中配置了以下环境变量：

#### 必需变量：
- `KIMI_API_KEY` - Moonshot AI API密钥
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase项目URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase匿名密钥
- `NODE_ENV=production`

#### 可选变量：
- `KIMI_API_BASE=https://api.moonshot.cn/v1`
- `KIMI_MODEL=moonshot-v1-8k`

### 2. 构建配置验证 ✅
- [x] `vercel.json` 文件存在且配置正确
- [x] API路由超时设置为60秒
- [x] CORS头配置正确
- [x] 文件大小限制配置为10MB

### 3. 代码兼容性检查 ✅
- [x] 移除了无限循环的useEffect依赖
- [x] 添加了完善的错误边界处理
- [x] 增加了API调用超时和重试机制
- [x] 提供了API密钥缺失时的降级体验

### 4. 错误处理增强 ✅
- [x] 客户端错误处理：超时、网络错误、API错误
- [x] 服务器端错误处理：数据验证、JSON解析、API响应
- [x] 用户友好的错误提示
- [x] 失败批次的优雅降级

## 🔧 部署步骤

1. **推送最新代码到GitHub**
   ```bash
   git add .
   git commit -m "fix: resolve Vercel deployment issues with enhanced error handling"
   git push origin main
   ```

2. **在Vercel Dashboard检查**
   - 访问 https://vercel.com/dashboard
   - 检查项目的环境变量配置
   - 查看最新的部署日志

3. **测试部署后的功能**
   - 访问 https://your-app.vercel.app/analysis
   - 上传测试CSV文件
   - 验证API调用是否正常

## 🐛 常见问题排查

### 问题1: Client-side exception
**症状**: 上传CSV后显示"Application error: a client-side exception has occurred"
**解决方案**: 
- 检查浏览器控制台错误
- 确认所有useEffect依赖正确
- 验证数据格式转换

### 问题2: API调用失败
**症状**: 网络错误或超时
**解决方案**:
- 检查环境变量KIMI_API_KEY是否正确
- 验证API端点URL
- 查看Vercel函数日志

### 问题3: 数据处理错误
**症状**: CSV解析失败或字段映射错误
**解决方案**:
- 检查CSV文件格式
- 验证表头行设置
- 使用浏览器开发者工具调试

## 📊 监控和日志

### Vercel日志查看
- 访问: https://vercel.com/dashboard/[team]/[project]/logs
- 筛选函数日志: `src/app/api/analyze/route.ts`
- 查看运行时错误和性能指标

### 浏览器调试
- 打开开发者工具 (F12)
- 查看Console标签页的错误
- 检查Network标签页的API调用

## 🔄 回滚策略

如果部署后出现问题，可以快速回滚：
1. 在Vercel Dashboard中找到上一个正常版本
2. 点击"Promote to Production"
3. 或者使用Git回滚：
   ```bash
   git revert HEAD
   git push origin main
   ```

## 📞 紧急联系

如果问题持续存在：
1. 检查Vercel状态页面: https://www.vercel-status.com/
2. 查看项目Issues页面
3. 收集错误日志和重现步骤