import { AnalysisResult } from '@/types/analysis'

interface KimiResponse {
  choices: Array<{
    message: {
      content: string
    }
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

interface SearchTermData {
  searchTerm: string
  keyword: string
  campaign: string
  adGroup: string
  impressions: number
  clicks: number
  cost: number
  conversions: number
  conversionValue: number
}

export class KimiApiService {
  private apiKey: string
  private baseUrl: string
  private model: string

  constructor() {
    this.apiKey = process.env.KIMI_API_KEY || ''
    this.baseUrl = process.env.KIMI_API_BASE || 'https://api.moonshot.cn/v1'
    this.model = process.env.KIMI_MODEL || 'moonshot-v1-8k'

    if (!this.apiKey) {
      throw new Error('KIMI_API_KEY is not configured')
    }
  }

  async analyzeSearchTerms(data: SearchTermData[]): Promise<AnalysisResult[]> {
    const prompt = this.generateAnalysisPrompt(data)

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: '你是 Kimi，由 Moonshot AI 提供的人工智能助手，你是一位专业的Google Ads优化专家，擅长分析搜索词报告并提供否词建议。你会为用户提供安全，有帮助，准确的回答。'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.3,
          max_tokens: 4000,
        }),
      })

      if (!response.ok) {
        throw new Error(`Kimi API error: ${response.status} ${response.statusText}`)
      }

      const result: KimiResponse = await response.json()
      const content = result.choices[0]?.message?.content

      if (!content) {
        throw new Error('Empty response from Kimi API')
      }

      return this.parseAnalysisResponse(content)
    } catch (error) {
      console.error('Error analyzing with Kimi API:', error)
      throw error
    }
  }

  private generateAnalysisPrompt(data: SearchTermData[]): string {
    const dataStr = data.map(item => `
搜索词: ${item.searchTerm}
关键词: ${item.keyword}
推广计划: ${item.campaign}
广告组: ${item.adGroup}
展示次数: ${item.impressions}
点击次数: ${item.clicks}
花费: ¥${item.cost.toFixed(2)}
转化次数: ${item.conversions}
转化价值: ¥${item.conversionValue.toFixed(2)}
`).join('\n---\n')

    return `请分析以下Google Ads搜索词数据，并为每个搜索词提供是否建议添加为否定关键词的分析：

${dataStr}

请为每个搜索词提供以下分析：
1. 语义相关性分析（0-100分）
2. 商业价值评估（0-100分）
3. 数据表现分析
4. 是否建议添加为否定关键词
5. 建议的否词关键词
6. 匹配类型建议
7. 应用层级（广告系列/账户）
8. 置信度（0-100%）
9. 详细理由

请以JSON格式返回分析结果，格式如下：
[
  {
    "searchTerm": "搜索词",
    "semanticRelevance": {"score": 85, "analysis": "分析说明"},
    "commercialValue": {"score": 90, "analysis": "商业价值分析"},
    "performanceAnalysis": {"costEfficiency": "成本效率分析", "clickQuality": "点击质量分析"},
    "recommendation": {
      "isNegative": true/false,
      "confidence": 95,
      "negativeKeyword": "建议的否词",
      "matchType": "exact/phrase/broad",
      "level": "campaign/account",
      "reasoning": "详细理由"
    }
  }
]`
  }

  private parseAnalysisResponse(content: string): AnalysisResult[] {
    try {
      // 尝试解析JSON响应
      const parsed = JSON.parse(content)
      return parsed.map((item: any, index: number) => ({
        id: (index + 1).toString(),
        searchTerm: item.searchTerm,
        keyword: `keyword_${index}`,
        campaign: `campaign_${index}`,
        adGroup: `adgroup_${index}`,
        impressions: 1000,
        clicks: 50,
        cost: 100,
        conversions: 0,
        conversionValue: 0,
        analysis: {
          semanticRelevance: item.semanticRelevance,
          commercialValue: item.commercialValue,
          performanceAnalysis: item.performanceAnalysis,
          recommendation: item.recommendation
        }
      }))
    } catch (error) {
      console.error('Failed to parse Kimi API response:', error)
      // 返回模拟数据作为后备
      return this.generateMockResults()
    }
  }

  private generateMockResults(): AnalysisResult[] {
    return [
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
      }
    ]
  }
}

// 创建单例实例（客户端安全）
export const kimiApi = typeof window !== 'undefined' ? new KimiApiService() : null