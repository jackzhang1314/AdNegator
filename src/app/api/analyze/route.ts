import { NextRequest, NextResponse } from 'next/server'

interface SearchTermData {
  searchTerm: string
  keyword: string
  campaign: string
  adGroup: string
  matchType: string
  impressions: number
  clicks: number
  cost: number
  conversions: number
  conversionValue: number
  ctr: number
  avgCpc: number
  conversionRate: number
}

interface AnalysisResult {
  id: string
  searchTerm: string
  translation: string // 添加翻译字段
  keyword: string
  campaign: string
  adGroup: string
  matchType: string
  impressions: number
  clicks: number
  cost: number
  conversions: number
  conversionValue: number
  ctr: number
  avgCpc: number
  conversionRate: number
  analysis: {
    semanticRelevance: { score: number; analysis: string }
    commercialValue: { score: number; analysis: string }
    performanceAnalysis: { costEfficiency: string; clickQuality: string; conversionPotential: string }
    recommendation: {
      isNegative: boolean
      confidence: number
      negativeKeyword: string
      matchType: string
      level: string
      reasonTags: string[] // 添加原因标签
      reasoning: string
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    // 添加请求大小限制检查
    const contentLength = request.headers.get('content-length')
    const maxRequestSize = 10 * 1024 * 1024 // 10MB限制
    
    if (contentLength && parseInt(contentLength) > maxRequestSize) {
      return NextResponse.json({ 
        error: '请求数据过大，请分批上传' 
      }, { status: 413 })
    }

    const body = await request.text()
    let parsedBody: any
    
    try {
      parsedBody = JSON.parse(body)
    } catch (parseError) {
      console.error('JSON解析错误:', parseError)
      return NextResponse.json({ 
        error: '请求数据格式错误，请检查JSON格式' 
      }, { status: 400 })
    }

    const { searchTerms } = parsedBody
    console.log('API received search terms:', searchTerms?.length)

    if (!searchTerms || !Array.isArray(searchTerms)) {
      console.error('Invalid data format:', searchTerms)
      return NextResponse.json({ error: '无效的数据格式' }, { status: 400 })
    }

    if (searchTerms.length === 0) {
      return NextResponse.json({ error: '数据为空' }, { status: 400 })
    }

    if (searchTerms.length > 100) {
      return NextResponse.json({ 
        error: '单次分析超过100条限制，请分批处理' 
      }, { status: 400 })
    }

    const apiKey = process.env.KIMI_API_KEY
    const baseUrl = process.env.KIMI_API_BASE || 'https://api.moonshot.cn/v1'
    const model = process.env.KIMI_MODEL || 'moonshot-v1-8k'

    console.log('API config:', { 
      hasApiKey: !!apiKey, 
      baseUrl, 
      model,
      nodeEnv: process.env.NODE_ENV 
    })

    if (!apiKey) {
      console.error('API key not configured')
      // 在生产环境中提供友好的错误提示
      if (process.env.NODE_ENV === 'production') {
        // 返回模拟数据而不是错误，确保用户体验
        const mockResults = searchTerms.map((item: any, index: number) => ({
          id: (index + 1).toString(),
          searchTerm: item.searchTerm || item['搜索字词'] || '',
          translation: '翻译服务',
          keyword: item.keyword || item['关键词'] || '',
          campaign: item.campaign || item['推广计划'] || '',
          adGroup: item.adGroup || item['广告组'] || '',
          matchType: item.matchType || item['匹配类型'] || '',
          impressions: item.impressions || item['展现量'] || 0,
          clicks: item.clicks || item['点击次数'] || 0,
          cost: item.cost || item['费用'] || 0,
          conversions: item.conversions || item['转化次数'] || 0,
          conversionValue: item.conversionValue || item['转化价值'] || 0,
          ctr: item.ctr || item['点击率'] || 0,
          avgCpc: item.avgCpc || item['平均点击费用'] || 0,
          conversionRate: item.conversionRate || item['转化率'] || 0,
          analysis: {
            semanticRelevance: { score: 70, analysis: '默认分析：相关性中等' },
            commercialValue: { score: 60, analysis: '默认分析：商业价值中等' },
            performanceAnalysis: {
              costEfficiency: '需要进一步分析',
              clickQuality: '质量评估中',
              conversionPotential: '潜力评估中'
            },
            recommendation: {
              isNegative: false,
              confidence: 50,
              negativeKeyword: item.searchTerm || '',
              matchType: 'phrase',
              level: 'campaign',
              reasonTags: ['DEFAULT_ANALYSIS'],
              reasoning: '使用默认分析，API配置不完整'
            }
          }
        }))
        return NextResponse.json({ results: mockResults, warning: '使用默认分析数据' })
      }
      return NextResponse.json({ error: 'API密钥未配置' }, { status: 500 })
    }

    // 分批处理，每批2个搜索词（避免token限制）
    const batchSize = 2
    const allResults: AnalysisResult[] = []

    for (let i = 0; i < searchTerms.length; i += batchSize) {
      const batch = searchTerms.slice(i, i + batchSize)
      console.log(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(searchTerms.length/batchSize)}, items: ${batch.length}`)

      // 构建简洁的英文prompt
      const prompt = `Analyze PCBA search terms. Return JSON array only:
${batch.map((item: any, index: number) => {
  const searchTerm = item['搜索字词'] || item.searchTerm || `term${index + 1}`
  const clicks = Number(item['点击次数'] || item.clicks || 0)
  const conversions = Number(item['转化次数'] || item.conversions || 0)
  const cost = Number(item['费用'] || item.cost || 0)

  return `"${searchTerm}":${clicks}c,${conversions}cv,$${cost}`
}).join(' ')}`

      try {
        console.log('调用真实Kimi API进行分析')

        // 真实API调用
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: 'system',
                content: 'You are a Google Ads expert analyzing PCBA business search terms. Return ONLY a valid JSON array with no explanations, no markdown formatting, no Chinese text. Each object must have: searchTerm, translation, semanticRelevance{score,analysis}, commercialValue{score,analysis}, performanceAnalysis{costEfficiency,clickQuality,conversionPotential}, recommendation{isNegative,confidence,negativeKeyword,matchType,level,reasonTags,reasoning}'
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            temperature: 0.1,
            max_tokens: 2000,
          }),
        })

        if (!response.ok) {
          const errorText = await response.text()
          console.error(`Kimi API error for batch ${Math.floor(i/batchSize) + 1}: ${response.status}`, errorText)
          throw new Error(`Kimi API error: ${response.status} - ${errorText}`)
        }

        const result = await response.json()
        const content = result.choices[0]?.message?.content

        if (!content) {
          console.error('Empty response from Kimi API for batch', Math.floor(i/batchSize) + 1)
          throw new Error('Empty response from Kimi API')
        }

        console.log(`Batch ${Math.floor(i/batchSize) + 1} response:`, content.substring(0, 200) + '...')

        try {
          console.log('Raw API response:', content.substring(0, 500) + '...')

          // 多种方式提取JSON内容
          let jsonContent = content.trim()

          // 方法1: 提取```json```包围的内容
          const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/)
          if (jsonMatch) {
            jsonContent = jsonMatch[1].trim()
            console.log('Extracted from markdown:', jsonContent.substring(0, 200) + '...')
          }

          // 方法2: 如果以中文开头，查找JSON数组
          else if (/^[\u4e00-\u9fa5]/.test(jsonContent)) {
            const arrayMatch = content.match(/\[\s*\{[\s\S]*\}\s*\]/g)
            if (arrayMatch && arrayMatch.length > 0) {
              jsonContent = arrayMatch[arrayMatch.length - 1] // 取最后一个匹配
              console.log('Extracted from Chinese text:', jsonContent.substring(0, 200) + '...')
            }
          }

          // 方法3: 如果直接是JSON数组
          else if (jsonContent.startsWith('[')) {
            console.log('Direct JSON array detected')
          }

          // 清理和修复常见的JSON问题
          jsonContent = jsonContent
            .replace(/```json\n?/g, '')
            .replace(/```\n?/g, '')
            .replace(/,(\s*[}\]])/g, '$1') // 移除尾随逗号
            .trim()

          console.log('Final JSON content:', jsonContent.substring(0, 300) + '...')

          const parsedResults = JSON.parse(jsonContent)

          // 格式化结果匹配前端数据结构
          const formattedResults: AnalysisResult[] = parsedResults.map((item: any, batchIndex: number) => ({
            id: (i + batchIndex + 1).toString(),
            searchTerm: item.searchTerm || batch[batchIndex]?.searchTerm || '',
            translation: item.translation || batch[batchIndex]?.searchTerm || '',
            keyword: batch[batchIndex]?.keyword || '',
            campaign: batch[batchIndex]?.campaign || '',
            adGroup: batch[batchIndex]?.adGroup || '',
            matchType: batch[batchIndex]?.matchType || '',
            impressions: batch[batchIndex]?.impressions || 0,
            clicks: batch[batchIndex]?.clicks || 0,
            cost: batch[batchIndex]?.cost || 0,
            conversions: batch[batchIndex]?.conversions || 0,
            conversionValue: batch[batchIndex]?.conversionValue || 0,
            ctr: batch[batchIndex]?.ctr || 0,
            avgCpc: batch[batchIndex]?.avgCpc || 0,
            conversionRate: batch[batchIndex]?.conversionRate || 0,
            analysis: {
              semanticRelevance: item.semanticRelevance || { score: 50, analysis: '分析中...' },
              commercialValue: item.commercialValue || { score: 50, analysis: '分析中...' },
              performanceAnalysis: item.performanceAnalysis || {
                costEfficiency: '分析中...',
                clickQuality: '分析中...',
                conversionPotential: '分析中...'
              },
              recommendation: {
                isNegative: item.recommendation?.isNegative || false,
                confidence: item.recommendation?.confidence || 50,
                negativeKeyword: item.recommendation?.negativeKeyword || batch[batchIndex]?.searchTerm || '',
                matchType: item.recommendation?.matchType || 'phrase',
                level: item.recommendation?.level || 'campaign',
                reasonTags: item.recommendation?.reasonTags || [],
                reasoning: item.recommendation?.reasoning || '分析中...'
              }
            }
          }))

          allResults.push(...formattedResults)

        } catch (parseError) {
          console.error('Failed to parse Kimi response for batch:', parseError)
          console.error('Raw content:', content)

          // 如果解析失败，创建基础结果
          const fallbackResults: AnalysisResult[] = batch.map((item: SearchTermData, batchIndex: number) => {
            const translation = item.searchTerm // 简化处理
            return {
              id: (i + batchIndex + 1).toString(),
              searchTerm: item.searchTerm,
              translation,
              keyword: item.keyword,
              campaign: item.campaign,
              adGroup: item.adGroup,
              matchType: item.matchType,
              impressions: item.impressions,
              clicks: item.clicks,
              cost: item.cost,
              conversions: item.conversions,
              conversionValue: item.conversionValue,
              ctr: item.ctr,
              avgCpc: item.avgCpc,
              conversionRate: item.conversionRate,
              analysis: {
                semanticRelevance: {
                  score: 50,
                  analysis: 'API解析失败，使用默认值'
                },
                commercialValue: {
                  score: 50,
                  analysis: 'API解析失败，使用默认值'
                },
                performanceAnalysis: {
                  costEfficiency: 'API解析失败',
                  clickQuality: 'API解析失败',
                  conversionPotential: 'API解析失败'
                },
                recommendation: {
                  isNegative: item.conversions === 0 && item.cost > 50,
                  confidence: 50,
                  negativeKeyword: item.searchTerm,
                  matchType: 'phrase',
                  level: 'campaign',
                  reasonTags: ['POOR_PERFORMANCE'],
                  reasoning: 'API解析失败，基于基础规则判断'
                }
              }
            }
          })

          allResults.push(...fallbackResults)
        }

      } catch (batchError) {
        console.error(`Error processing batch ${Math.floor(i/batchSize) + 1}:`, batchError)
        // 继续处理下一批
        continue
      }
    }

    return NextResponse.json({ results: allResults })

  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '分析服务异常' },
      { status: 500 }
    )
  }
}