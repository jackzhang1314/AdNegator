// Mock data for frontend testing without backend

export const mockAnalysisResults = [
  {
    id: '1',
    searchTerm: '免费软件下载',
    keyword: '软件',
    campaign: '科技产品推广',
    adGroup: '软件类别',
    impressions: 1250,
    clicks: 45,
    cost: 89.50,
    conversions: 0,
    conversionValue: 0,
    analysis: {
      semanticRelevance: {
        score: 15,
        analysis: '搜索词与业务高度不相关，用户寻找免费软件而非商业产品'
      },
      commercialValue: {
        score: 20,
        analysis: '免费需求强烈，商业价值极低，转化可能性很小'
      },
      performanceAnalysis: {
        costEfficiency: '高消费零转化，ROI为负',
        clickQuality: '点击质量差，跳出率高'
      },
      recommendation: {
        isNegative: true,
        confidence: 95,
        negativeKeyword: '免费',
        matchType: 'phrase',
        level: 'campaign',
        reasoning: '强烈建议添加为否定关键词，避免浪费广告预算'
      }
    }
  },
  {
    id: '2',
    searchTerm: '企业项目管理软件',
    keyword: '项目管理软件',
    campaign: '企业服务推广',
    adGroup: '企业解决方案',
    impressions: 890,
    clicks: 67,
    cost: 234.80,
    conversions: 12,
    conversionValue: 2400,
    analysis: {
      semanticRelevance: {
        score: 85,
        analysis: '搜索词与业务高度相关，明确的企业软件需求'
      },
      commercialValue: {
        score: 90,
        analysis: '企业级需求，高价值客户，购买意图明确'
      },
      performanceAnalysis: {
        costEfficiency: '转化率高，ROI优秀',
        clickQuality: '点击质量高，用户精准'
      },
      recommendation: {
        isNegative: false,
        confidence: 92,
        negativeKeyword: '',
        matchType: 'exact',
        level: 'account',
        reasoning: '保持投放，考虑增加出价'
      }
    }
  },
  {
    id: '3',
    searchTerm: '破解版设计软件',
    keyword: '设计软件',
    campaign: '创意工具推广',
    adGroup: '设计软件类别',
    impressions: 2100,
    clicks: 156,
    cost: 445.20,
    conversions: 0,
    conversionValue: 0,
    analysis: {
      semanticRelevance: {
        score: 10,
        analysis: '用户寻找盗版软件，与正版商业软件无关'
      },
      commercialValue: {
        score: 5,
        analysis: '盗版需求，无商业价值'
      },
      performanceAnalysis: {
        costEfficiency: '高消费无转化，严重浪费预算',
        clickQuality: '点击质量极差'
      },
      recommendation: {
        isNegative: true,
        confidence: 98,
        negativeKeyword: '破解版',
        matchType: 'exact',
        level: 'account',
        reasoning: '必须立即添加为否定关键词，避免进一步预算浪费'
      }
    }
  }
];

export const mockWebsites = [
  {
    id: '1',
    name: '科技产品商城',
    url: 'https://techstore.example.com',
    description: '专业的科技产品电商平台，主营电子产品、数码配件等',
    industry: '电子商务',
    targetMarket: '全国',
    language: 'zh-CN',
    status: 'active',
    createdAt: '2024-01-15',
    lastAnalyzed: '2024-01-20',
    keywordsCount: 1250,
    negativeKeywords: 320,
    crawledInfo: {
      title: '科技产品商城 - 专业电子产品平台',
      metaDescription: '提供最新的科技产品，包括手机、电脑、数码配件等，品质保证，价格优惠',
      keywords: ['科技产品', '电子产品', '数码配件', '手机', '电脑']
    }
  }
];

export const mockStats = {
  totalKeywords: 15420,
  processedKeywords: 12350,
  negativeKeywords: 3245,
  costSaved: 8920,
  analysisProgress: 80,
  websites: 5,
  activeAnalyses: 3
};

// 模拟API响应
export const mockApi = {
  getAnalysisResults: () => Promise.resolve(mockAnalysisResults),
  getWebsites: () => Promise.resolve(mockWebsites),
  getStats: () => Promise.resolve(mockStats),
  uploadFile: (file: File) => Promise.resolve({ success: true, filename: file.name }),
  startAnalysis: (_data: any) => Promise.resolve({ id: 'mock-analysis-1', status: 'processing' })
};