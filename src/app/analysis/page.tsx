'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Brain,
  Upload,
  FileText,
  Settings,
  Download,
  AlertCircle,
  CheckCircle,
  Eye,
  RefreshCw
} from 'lucide-react'

interface RawDataRow {
  [key: string]: string | number
}

interface ParsedDataRow {
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
  translation: string
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
      reasonTags: string[]
      reasoning: string
    }
  }
}

export default function AnalysisPage() {
  const [selectedTab, setSelectedTab] = useState('upload')
  const [fileName, setFileName] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [rawData, setRawData] = useState<RawDataRow[]>([])
  const [availableColumns, setAvailableColumns] = useState<string[]>([])
  const [columnMapping, setColumnMapping] = useState<{[key: string]: string}>({})
  const [headerRowIndex, setHeaderRowIndex] = useState(3) // 默认第3行是表头（Google Ads搜索词报告的标准格式）
  const [rawFileContent, setRawFileContent] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 筛选和编辑功能的状态
  const [resultsFilter, setResultsFilter] = useState('')
  const [showOnlyNegative, setShowOnlyNegative] = useState(false)
  const [selectedResults, setSelectedResults] = useState<Set<string>>(new Set())
  const [autoMapping, setAutoMapping] = useState(true) // 默认开启自动映射

  // 实时分析进度状态
  const [analysisProgress, setAnalysisProgress] = useState({
    total: 0,
    completed: 0,
    currentBatch: 0,
    totalBatches: 0,
    isAnalyzing: false
  })
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([])
  const [editableResults, setEditableResults] = useState<AnalysisResult[]>([])

  // 解析CSV文件
  const parseCSV = useCallback((text: string): RawDataRow[] => {
    const allLines = text.split('\n').filter(line => line.trim())
    // 过滤掉注释行（以#开头的行）
    const lines = allLines.filter(line => !line.trim().startsWith('#'))
    if (lines.length === 0) return []

    // 智能CSV/TSV解析 - 自动检测分隔符
    const parseCSVLine = (line: string): string[] => {
      // 检测分隔符：如果包含制表符，使用制表符；否则使用逗号
      const separator = line.includes('\t') ? '\t' : ','

      const result: string[] = []
      let current = ''
      let inQuotes = false

      for (let i = 0; i < line.length; i++) {
        const char = line[i]
        if (char === '"') {
          inQuotes = !inQuotes
        } else if (char === separator && !inQuotes) {
          result.push(current.trim())
          current = ''
        } else {
          current += char
        }
      }
      result.push(current.trim())
      return result
    }

    let headers: string[]
    let startRow: number

    if (headerRowIndex > 0 && headerRowIndex <= lines.length) {
      // 指定行是表头（行号从1开始，数组索引从0开始）
      headers = parseCSVLine(lines[headerRowIndex - 1] || '').map((h, index) => {
        const cleaned = h.replace(/"/g, '').trim()
        return cleaned || `列${index + 1}`
      })
      startRow = headerRowIndex // 数据从表头的下一行开始
    } else {
      // 没有表头，生成默认列名
      const firstRowValues = parseCSVLine(lines[0] || '')
      headers = firstRowValues.map((_, index) => `列${index + 1}`)
      startRow = 0
    }

    // 仅在开发环境中显示调试信息
    if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
      console.log('All lines:', allLines.length)
      console.log('Filtered lines (no comments):', lines.length)
      console.log('Header row index:', headerRowIndex)
      console.log('Detected separator:', lines[headerRowIndex - 1]?.includes('\t') ? 'TAB' : 'COMMA')
      console.log('Parsed headers:', headers)
      console.log('Headers count:', headers.length)
      console.log('Start row:', startRow)
    }

    const data: RawDataRow[] = []
    for (let i = startRow; i < lines.length; i++) {
      const values = parseCSVLine(lines[i] || '').map(v => v.replace(/"/g, ''))
      if (values.length >= headers.length - 2) {
        const row: RawDataRow = {}
        headers.forEach((header, index) => {
          const value = values[index] || ''
          const numValue = parseFloat(value.replace(/[¥,%]/g, ''))
          row[header] = isNaN(numValue) ? value : numValue
        })
        data.push(row)
      }
    }
    return data
  }, [headerRowIndex])

  // 手动触发自动映射 - 现在是一个独立的按钮点击处理函数
  const handleAutoMapping = () => {
    const mapping: {[key: string]: string} = {}

    // 常见的字段名映射（包含Google Ads特有字段）
    const fieldMappings = {
      searchTerm: ['搜索字词', '搜索词', 'search term', 'query', '查询词'],
      keyword: ['关键字', '关键词', 'keyword', 'kw'],
      campaign: ['推广计划', '广告系列', 'campaign', '计划'],
      adGroup: ['广告组', 'ad group', 'adgroup', '单元'],
      matchType: ['匹配类型', 'match type', '匹配方式'],
      impressions: ['展现量', '展示次数', 'impressions', 'impr', '展现次数'],
      clicks: ['点击次数', '点击量', 'clicks'],
      cost: ['费用', '花费', 'cost', 'spend'],
      conversions: ['转化次数', '转化量', 'conversions', 'conv'],
      conversionValue: ['转化价值', '转化值', 'conversion value', 'conv value', '所有转化价值'],
      ctr: ['点击率', 'ctr', 'click through rate'],
      avgCpc: ['平均点击费用', '平均cpc', 'avg cpc', 'average cpc', '平均每次点击费用'],
      conversionRate: ['转化率', 'conversion rate', 'conv rate']
    }

    Object.entries(fieldMappings).forEach(([field, possibleNames]) => {
      for (const possibleName of possibleNames) {
        const matchedColumn = availableColumns.find(col =>
          col.toLowerCase().includes(possibleName.toLowerCase()) ||
          possibleName.toLowerCase().includes(col.toLowerCase())
        )
        if (matchedColumn) {
          mapping[field] = matchedColumn
          break
        }
      }
    })

    setColumnMapping(mapping)
  }

  // 监听hasHeader变化，重新解析数据 - 使用防抖和条件触发
  useEffect(() => {
    if (rawFileContent) {
      const parsed = parseCSV(rawFileContent)
      setRawData(parsed)

      if (parsed.length > 0 && parsed[0]) {
        const columns = Object.keys(parsed[0]).filter(col => col && col.trim())
        setAvailableColumns(prevColumns => {
          // 只有当列名真正变化时才更新，避免不必要的重渲染
          const columnsString = JSON.stringify(columns.sort())
          const prevColumnsString = JSON.stringify(prevColumns.sort())
          if (columnsString === prevColumnsString) {
            return prevColumns
          }
          return columns
        })

        // 清空之前的映射，但只在列名变化时
        setColumnMapping({})
      }
    }
  }, [headerRowIndex, parseCSV, rawFileContent])

  // 自动映射 - 使用防抖和条件触发
  useEffect(() => {
    if (!autoMapping || availableColumns.length === 0) {
      return
    }

    // 使用防抖避免频繁更新
    const timer = setTimeout(() => {
      const mapping: {[key: string]: string} = {}
      let hasChanges = false

      // 常见的字段名映射
      const fieldMappings = {
        searchTerm: ['搜索字词', '搜索词', 'search term', 'query', '查询词'],
        keyword: ['关键字', '关键词', 'keyword', 'kw'],
        campaign: ['推广计划', '广告系列', 'campaign', '计划'],
        adGroup: ['广告组', 'ad group', 'adgroup', '单元'],
        matchType: ['匹配类型', 'match type', '匹配方式'],
        impressions: ['展现量', '展示次数', 'impressions', 'impr', '展现次数'],
        clicks: ['点击次数', '点击量', 'clicks'],
        cost: ['费用', '花费', 'cost', 'spend'],
        conversions: ['转化次数', '转化量', 'conversions', 'conv'],
        conversionValue: ['转化价值', '转化值', 'conversion value', 'conv value', '所有转化价值'],
        ctr: ['点击率', 'ctr', 'click through rate'],
        avgCpc: ['平均点击费用', '平均cpc', 'avg cpc', 'average cpc', '平均每次点击费用'],
        conversionRate: ['转化率', 'conversion rate', 'conv rate']
      }

      Object.entries(fieldMappings).forEach(([field, possibleNames]) => {
        for (const possibleName of possibleNames) {
          const matchedColumn = availableColumns.find(col =>
            col.toLowerCase().includes(possibleName.toLowerCase()) ||
            possibleName.toLowerCase().includes(col.toLowerCase())
          )
          if (matchedColumn) {
            mapping[field] = matchedColumn
            hasChanges = true
            break
          }
        }
      })

      // 只有当映射真正变化时才更新
      if (hasChanges) {
        setColumnMapping(mapping)
      }
    }, 300) // 300ms防抖

    return () => clearTimeout(timer)
  }, [autoMapping, availableColumns])

  // 字段映射配置
  const requiredFields = {
    searchTerm: '搜索词',
    keyword: '关键词',
    campaign: '推广计划',
    adGroup: '广告组',
    matchType: '匹配类型',
    impressions: '展现量',
    clicks: '点击次数',
    cost: '费用',
    conversions: '转化次数',
    conversionValue: '转化价值',
    ctr: '点击率',
    avgCpc: '平均点击费用',
    conversionRate: '转化率'
  }

  // 处理字段映射
  const processDataWithMapping = (): ParsedDataRow[] => {
    if (rawData.length === 0) return []

    const processed: ParsedDataRow[] = []

    for (const row of rawData) {
      const processedRow: ParsedDataRow = {
        searchTerm: String(row[columnMapping.searchTerm || ''] || ''),
        keyword: String(row[columnMapping.keyword || ''] || ''),
        campaign: String(row[columnMapping.campaign || ''] || '未知推广计划'),
        adGroup: String(row[columnMapping.adGroup || ''] || ''),
        matchType: String(row[columnMapping.matchType || ''] || ''),
        impressions: Number(row[columnMapping.impressions || ''] || 0),
        clicks: Number(row[columnMapping.clicks || ''] || 0),
        cost: Number(row[columnMapping.cost || ''] || 0),
        conversions: Number(row[columnMapping.conversions || ''] || 0),
        conversionValue: Number(row[columnMapping.conversionValue || ''] || 0),
        ctr: Number(row[columnMapping.ctr || ''] || 0),
        avgCpc: Number(row[columnMapping.avgCpc || ''] || 0),
        conversionRate: Number(row[columnMapping.conversionRate || ''] || 0)
      }
      processed.push(processedRow)
    }

    return processed
  }

  // 处理文件上传
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.match(/\.(csv|tsv|txt)$/i)) {
      setError('请选择CSV、TSV或TXT格式文件')
      return
    }

    // 检查文件大小（限制为50MB）
    const maxSize = 50 * 1024 * 1024 // 50MB in bytes
    if (file.size > maxSize) {
      setError('文件大小不能超过50MB')
      return
    }

    setFileName(file.name)
    setError('')

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string
        if (!text || text.trim() === '') {
          setError('文件内容为空')
          return
        }
        
        setRawFileContent(text)
        const parsed = parseCSV(text)
        
        if (parsed.length === 0) {
          setError('无法解析文件内容，请检查文件格式')
          return
        }
        
        setRawData(parsed)
        
        if (parsed.length > 0 && parsed[0]) {
          const columns = Object.keys(parsed[0]).filter(col => col && col.trim())
          setAvailableColumns(columns)

          // 延迟执行自动映射，确保状态已更新（如果开启）
          if (autoMapping && columns.length > 0) {
            setTimeout(() => {
              const mapping: {[key: string]: string} = {}

              const fieldMappings = {
                searchTerm: ['搜索字词', '搜索词', 'search term', 'query', '查询词'],
                keyword: ['关键字', '关键词', 'keyword', 'kw'],
                campaign: ['推广计划', '广告系列', 'campaign', '计划'],
                adGroup: ['广告组', 'ad group', 'adgroup', '单元'],
                matchType: ['匹配类型', 'match type', '匹配方式'],
                impressions: ['展现量', '展示次数', 'impressions', 'impr', '展现次数'],
                clicks: ['点击次数', '点击量', 'clicks'],
                cost: ['费用', '花费', 'cost', 'spend'],
                conversions: ['转化次数', '转化量', 'conversions', 'conv'],
                conversionValue: ['转化价值', '转化值', 'conversion value', 'conv value', '所有转化价值'],
                ctr: ['点击率', 'ctr', 'click through rate'],
                avgCpc: ['平均点击费用', '平均cpc', 'avg cpc', 'average cpc', '平均每次点击费用'],
                conversionRate: ['转化率', 'conversion rate', 'conv rate']
              }

              Object.entries(fieldMappings).forEach(([field, possibleNames]) => {
                for (const possibleName of possibleNames) {
                  const matchedColumn = columns.find(col =>
                    col.toLowerCase().includes(possibleName.toLowerCase()) ||
                    possibleName.toLowerCase().includes(col.toLowerCase())
                  )
                  if (matchedColumn) {
                    mapping[field] = matchedColumn
                    break
                  }
                }
              })

              setColumnMapping(mapping)
            }, 100)
          }

          setSelectedTab('mapping')
        }
      } catch (error) {
        console.error('文件处理错误:', error)
        setError('文件处理失败，请检查文件格式是否正确')
      }
    }
    reader.onerror = () => {
      setError('文件读取失败，请重试')
    }
    reader.readAsText(file)
  }

  // 开始分析 - 增强的错误处理和边界检查
  const handleAnalyze = async () => {
    const isDev = typeof window !== 'undefined' && window.location.hostname === 'localhost'
    if (isDev) {
      console.log('开始分析按钮被点击')
      console.log('rawData length:', rawData.length)
      console.log('columnMapping:', columnMapping)
    }

    if (rawData.length === 0) {
      setError('请先上传数据')
      return
    }

    // 检查字段映射是否完整
    const requiredMappings = ['searchTerm', 'keyword', 'clicks', 'cost']
    const missingMappings = requiredMappings.filter(field => !columnMapping[field])

    if (missingMappings.length > 0) {
      setError(`请完成字段映射：${missingMappings.join(', ')}`)
      return
    }

    // 处理数据并验证
    const processedData = processDataWithMapping()
    if (isDev) {
      console.log('Processed data:', processedData.slice(0, 2))
    }
    
    if (processedData.length === 0) {
      setError('处理后的数据为空，请检查数据格式')
      return
    }

    // 验证数据格式
    const validData = processedData.filter(item => 
      item.searchTerm && typeof item.clicks === 'number' 
      && typeof item.cost === 'number'
    )

    if (validData.length === 0) {
      setError('数据格式不正确，请检查字段映射')
      return
    }

    // 初始化实时分析状态
    const batchSize = Math.min(2, Math.max(1, Math.floor(100 / Math.max(validData.length, 1))))
    const totalBatches = Math.ceil(validData.length / batchSize)

    setAnalysisProgress({
      total: validData.length,
      completed: 0,
      currentBatch: 0,
      totalBatches,
      isAnalyzing: true
    })
    setAnalysisResults([]) // 清空之前的结果
    setEditableResults([]) // 清空可编辑结果
    setError('')
    setSelectedTab('results')

    try {
      if (isDev) {
        console.log(`开始流式分析：${validData.length}个搜索词，分${totalBatches}个批次`)
      }

      let totalProcessed = 0
      const allResults: any[] = []

      // 分批处理数据
      for (let i = 0; i < validData.length; i += batchSize) {
        const batch = validData.slice(i, i + batchSize)
        const currentBatch = Math.floor(i / batchSize) + 1

        if (isDev) {
          console.log(`处理第${currentBatch}/${totalBatches}批次，包含${batch.length}个词`)
        }

        // 更新当前批次进度
        setAnalysisProgress(prev => ({
          ...prev,
          currentBatch
        }))

        try {
          // 使用更健壮的API调用
          const apiUrl = `${window.location.origin}/api/analyze`
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 30000) // 30秒超时

          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ searchTerms: batch }),
            signal: controller.signal
          })

          clearTimeout(timeoutId)

          if (!response.ok) {
            const errorText = await response.text()
            console.error(`API错误 ${response.status}:`, errorText)
            
            // 尝试解析错误响应
            let errorMessage = `分析失败 (HTTP ${response.status})`
            try {
              const errorData = JSON.parse(errorText)
              errorMessage = errorData.error || errorMessage
            } catch {
              // 如果无法解析JSON，使用文本
              errorMessage = errorText || errorMessage
            }

            // 根据不同错误码提供具体提示
            if (response.status === 413) {
              errorMessage = '数据量过大，请减少单次分析的数据条数'
            } else if (response.status === 429) {
              errorMessage = '请求过于频繁，请稍后再试'
            } else if (response.status >= 500) {
              errorMessage = '服务器处理错误，请稍后重试'
            }

            throw new Error(errorMessage)
          }

          const data = await response.json()
          const batchResults = data.results || []

          if (isDev) {
            console.log(`批次${currentBatch}完成，获得${batchResults.length}个结果`)
          }

          // 实时更新结果和进度
          allResults.push(...batchResults)
          totalProcessed += batchResults.length

          setAnalysisResults(prev => [...prev, ...batchResults])
          setEditableResults(prev => [...prev, ...batchResults])
          setAnalysisProgress(prev => ({
            ...prev,
            completed: totalProcessed
          }))

        } catch (batchError) {
          if (isDev) {
            console.error(`批次${currentBatch}处理失败:`, batchError)
          }
          
          // 网络错误或超时处理
          if (batchError instanceof Error && batchError.name === 'AbortError') {
            console.error('请求超时')
          }
          
          // 创建一个失败的批次记录，而不是中断整个流程
          const failedResults = batch.map((item: any, index: number) => ({
            id: `failed-${i + index}`,
            searchTerm: item.searchTerm,
            translation: '分析失败',
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
              semanticRelevance: { score: 0, analysis: '分析失败' },
              commercialValue: { score: 0, analysis: '分析失败' },
              performanceAnalysis: {
                costEfficiency: '分析失败',
                clickQuality: '分析失败',
                conversionPotential: '分析失败'
              },
              recommendation: {
                isNegative: false,
                confidence: 0,
                negativeKeyword: item.searchTerm,
                matchType: 'phrase',
                level: 'campaign',
                reasonTags: ['ANALYSIS_FAILED'],
                reasoning: batchError instanceof Error ? batchError.message : '分析失败'
              }
            }
          }))

          setAnalysisResults(prev => [...prev, ...failedResults])
          setEditableResults(prev => [...prev, ...failedResults])
          setAnalysisProgress(prev => ({
            ...prev,
            completed: prev.completed + batch.length
          }))
        }

        // 更智能的延迟，基于网络状况
        if (currentBatch < totalBatches) {
          const delay = Math.min(1000, 100 + (currentBatch * 50)) // 指数退避
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }

      // 分析完成
      if (isDev) {
        console.log('所有批次分析完成，总结果:', allResults.length)
      }
      setAnalysisProgress(prev => ({
        ...prev,
        isAnalyzing: false
      }))

    } catch (err) {
      console.error('分析过程错误:', err)
      setAnalysisProgress(prev => ({
        ...prev,
        isAnalyzing: false
      }))
      
      const errorMessage = err instanceof Error 
        ? err.message 
        : '分析失败，请检查网络连接后重试'
      
      setError(errorMessage)
    }
  }

  // 切换否词建议
  const toggleNegativeRecommendation = (id: string) => {
    setEditableResults(prev => prev.map(result => 
      result.id === id 
        ? {
            ...result,
            analysis: {
              ...result.analysis,
              recommendation: {
                ...result.analysis.recommendation,
                isNegative: !result.analysis.recommendation.isNegative
              }
            }
          }
        : result
    ))
  }

  // 批量切换选中项的否词建议
  const batchToggleNegative = (isNegative: boolean) => {
    setEditableResults(prev => prev.map(result => 
      selectedResults.has(result.id)
        ? {
            ...result,
            analysis: {
              ...result.analysis,
              recommendation: {
                ...result.analysis.recommendation,
                isNegative
              }
            }
          }
        : result
    ))
  }

  // 导出否词列表
  const exportNegativeKeywords = () => {
    const negativeKeywords = editableResults
      .filter(result => result.analysis.recommendation.isNegative)
      .map(result => ({
        '搜索词': result.searchTerm,
        '翻译': result.translation,
        '否词建议': result.analysis.recommendation.negativeKeyword,
        '匹配类型': result.analysis.recommendation.matchType,
        '应用层级': result.analysis.recommendation.level,
        '推广计划': result.campaign,
        '广告组': result.adGroup,
        '原因标签': result.analysis.recommendation.reasonTags?.join(', ') || '',
        '原因': result.analysis.recommendation.reasoning,
        '费用': `¥${result.cost.toFixed(2)}`,
        '点击次数': result.clicks,
        '转化次数': result.conversions,
        '语义相关性': `${result.analysis.semanticRelevance.score}%`,
        '商业价值': `${result.analysis.commercialValue.score}%`,
        '置信度': `${result.analysis.recommendation.confidence}%`
      }))

    // 转换为CSV格式
    const headers = Object.keys(negativeKeywords[0] || {})
    const csvContent = [
      headers.join(','),
      ...negativeKeywords.map(row => 
        headers.map(header => `"${row[header as keyof typeof row] || ''}"`).join(',')
      )
    ].join('\n')

    // 下载文件
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `否词建议_${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // 筛选结果
  const filteredResults = editableResults.filter(result => {
    const matchesSearch = !resultsFilter || 
      result.searchTerm.toLowerCase().includes(resultsFilter.toLowerCase()) ||
      result.translation.toLowerCase().includes(resultsFilter.toLowerCase()) ||
      result.keyword.toLowerCase().includes(resultsFilter.toLowerCase())
    
    const matchesNegativeFilter = !showOnlyNegative || result.analysis.recommendation.isNegative
    
    return matchesSearch && matchesNegativeFilter
  })

  return (
    <div className="space-y-6 min-h-screen bg-gray-50">
      {/* 错误边界显示 */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
            <h3 className="text-sm font-medium text-red-800">错误</h3>
          </div>
          <p className="mt-1 text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* 页面标题 */}
      <div className="flex items-center justify-between bg-white p-6 rounded-lg shadow-sm">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">AI否词分析</h1>
          <p className="text-gray-600 mt-1">使用Kimi大模型智能分析搜索词，优化广告投放效果</p>
        </div>
        <div className="flex space-x-3">
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4 mr-2" />
            设置
          </Button>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            导出报告
          </Button>
        </div>
      </div>

      {/* 主要内容区域 */}
      <div className="bg-white rounded-lg shadow-sm">
        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="upload" className="flex items-center space-x-2">
              <Upload className="h-4 w-4" />
              <span>上传数据</span>
            </TabsTrigger>
            <TabsTrigger value="mapping" className="flex items-center space-x-2">
              <Settings className="h-4 w-4" />
              <span>字段映射</span>
            </TabsTrigger>
            <TabsTrigger value="preview" className="flex items-center space-x-2">
              <Eye className="h-4 w-4" />
              <span>数据预览</span>
            </TabsTrigger>
            <TabsTrigger value="results" className="flex items-center space-x-2">
              <Brain className="h-4 w-4" />
              <span>分析结果</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="p-6">
            <div className="text-center">
              <h2 className="text-xl font-semibold mb-4">上传Google Ads搜索词报告</h2>
              <p className="text-gray-600 mb-6">支持CSV、TSV、TXT格式文件，最大50MB</p>

              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 hover:border-blue-400 transition-colors">
                <Upload className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <p className="text-lg font-medium text-gray-700 mb-2">拖拽文件到此处或点击上传</p>
                <p className="text-sm text-gray-500 mb-4">支持 .csv .tsv .txt 格式</p>
                <Button onClick={() => fileInputRef.current?.click()}>
                  选择文件
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.tsv,.txt"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>

              {fileName && (
                <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-green-700">已选择文件: {fileName}</p>
                </div>
              )}

              {/* CSV解析选项 */}
              <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="space-y-2">
                  <Label htmlFor="headerRow" className="text-sm font-medium">
                    表头位置（字段名称所在行，已自动过滤注释行）
                  </Label>
                  <Select
                    value={headerRowIndex.toString()}
                    onValueChange={(value) => setHeaderRowIndex(parseInt(value))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="选择表头行" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">无表头（生成默认列名）</SelectItem>
                      <SelectItem value="1">第1行（推荐）</SelectItem>
                      <SelectItem value="2">第2行</SelectItem>
                      <SelectItem value="3">第3行</SelectItem>
                      <SelectItem value="4">第4行</SelectItem>
                      <SelectItem value="5">第5行</SelectItem>
                      <SelectItem value="6">第6行</SelectItem>
                      <SelectItem value="7">第7行</SelectItem>
                      <SelectItem value="8">第8行</SelectItem>
                      <SelectItem value="9">第9行</SelectItem>
                      <SelectItem value="10">第10行</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-gray-600 mt-2">
                  系统会自动过滤以#开头的注释行。对于Google Ads搜索词报告，过滤注释后第3行通常是表头（默认推荐）。
                </p>
              </div>

              {error && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-700 flex items-center">
                    <AlertCircle className="h-4 w-4 mr-2" />
                    {error}
                  </p>
                </div>
              )}
            </div>
          </TabsContent>

          {/* 字段映射 */}
          <TabsContent value="mapping" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center space-x-2">
                      <Settings className="h-5 w-5" />
                      <span>字段映射设置</span>
                    </CardTitle>
                    <CardDescription>
                      将您的数据字段映射到系统所需的标准字段
                    </CardDescription>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="autoMapping"
                      checked={autoMapping}
                      onChange={(e) => setAutoMapping(e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <Label htmlFor="autoMapping" className="text-sm font-medium">
                      自动映射
                    </Label>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {availableColumns.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(requiredFields).map(([field, label]) => (
                      <div key={field} className="space-y-2">
                        <Label htmlFor={field}>{label}</Label>
                        <Select
                          value={columnMapping[field] || 'none'}
                          onValueChange={(value) => {
                            if (value === 'none') {
                              setColumnMapping(prev => {
                                const newMapping = { ...prev }
                                delete newMapping[field]
                                return newMapping
                              })
                            } else {
                              setColumnMapping(prev => ({ ...prev, [field]: value }))
                            }
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={`选择${label}字段`} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">-- 不映射 --</SelectItem>
                            {availableColumns.filter(column => column && column.trim()).map(column => (
                              <SelectItem key={column} value={column}>
                                {column}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    请先上传数据文件
                  </div>
                )}

                {availableColumns.length > 0 && (
                  <div className="flex space-x-2 pt-4">
                    <Button onClick={handleAutoMapping} variant="outline">
                      <Settings className="h-4 w-4 mr-2" />
                      自动映射
                    </Button>
                    <Button
                      onClick={() => setSelectedTab('preview')}
                      disabled={Object.keys(columnMapping).length === 0}
                    >
                      下一步：预览数据
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="preview" className="p-6">
            {rawData.length > 0 ? (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">数据预览 ({rawData.length} 条记录)</h3>
                  <div className="flex space-x-2">
                    <Button
                      onClick={() => setSelectedTab('mapping')}
                      variant="outline"
                    >
                      返回映射设置
                    </Button>
                    <Button
                      onClick={() => {
                        const isDevCheck = typeof window !== 'undefined' && window.location.hostname === 'localhost'
                        if (isDevCheck) {
                          console.log('按钮点击检查:')
                          console.log('- rawData.length:', rawData.length)
                          console.log('- columnMapping keys:', Object.keys(columnMapping))
                          console.log('- columnMapping length:', Object.keys(columnMapping).length)
                          console.log('- 按钮是否禁用:', rawData.length === 0 || Object.keys(columnMapping).length === 0)
                        }
                        handleAnalyze()
                      }}
                      disabled={rawData.length === 0 || Object.keys(columnMapping).length === 0}
                    >
                      <Brain className="h-4 w-4 mr-2" />
                      开始分析
                    </Button>
                  </div>
                </div>

                {/* 显示字段映射状态 */}
                <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <h4 className="font-medium mb-2">当前字段映射：</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                    {Object.entries(columnMapping).map(([field, column]) => (
                      <div key={field} className="flex items-center space-x-2">
                        <span className="font-medium">{requiredFields[field as keyof typeof requiredFields]}:</span>
                        <span className="text-blue-600">{column}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="border rounded-lg overflow-hidden">
                  <div className="max-h-96 overflow-auto">
                    {Object.keys(columnMapping).length > 0 ? (
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            {Object.entries(requiredFields).map(([field, label]) => (
                              columnMapping[field] && (
                                <th key={field} className="px-4 py-2 text-left font-medium text-gray-900 border-b">
                                  {label}
                                </th>
                              )
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {processDataWithMapping().slice(0, 100).map((row, index) => (
                            <tr key={index} className="border-b">
                              {Object.entries(requiredFields).map(([field, _label]) => (
                                columnMapping[field] && (
                                  <td key={field} className="px-4 py-2 text-gray-700">
                                    {String(row[field as keyof ParsedDataRow])}
                                  </td>
                                )
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div className="p-8 text-center text-gray-500">
                        请先完成字段映射设置
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center text-gray-500">
                <FileText className="h-12 w-12 mx-auto mb-4" />
                <p>请先上传文件以预览数据</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="results" className="p-6">
            {analysisProgress.isAnalyzing ? (
              <div className="space-y-6">
                {/* 实时进度显示 */}
                <div className="text-center py-8">
                  <div className="flex items-center justify-center mb-4">
                    <RefreshCw className="h-8 w-8 animate-spin text-blue-500 mr-3" />
                    <span className="text-lg font-medium">正在分析中...</span>
                  </div>

                  {/* 详细进度信息 */}
                  <div className="space-y-2 mb-6">
                    <div className="text-sm text-gray-600">
                      已完成: <span className="font-semibold text-blue-600">{analysisProgress.completed}</span> / {analysisProgress.total} 个搜索词
                    </div>
                    <div className="text-sm text-gray-600">
                      当前批次: 第 {analysisProgress.currentBatch} / {analysisProgress.totalBatches} 批
                    </div>
                    <div className="text-sm text-gray-600">
                      完成度: <span className="font-semibold text-green-600">
                        {analysisProgress.total > 0 ? Math.round((analysisProgress.completed / analysisProgress.total) * 100) : 0}%
                      </span>
                    </div>
                  </div>

                  {/* 进度条 */}
                  <div className="w-full bg-gray-200 rounded-full h-3 max-w-md mx-auto">
                    <div
                      className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                      style={{
                        width: `${analysisProgress.total > 0 ? (analysisProgress.completed / analysisProgress.total) * 100 : 0}%`
                      }}
                    ></div>
                  </div>

                  <p className="text-sm text-muted-foreground mt-4">
                    正在进行语义分析、商业价值评估和数据表现分析...
                  </p>
                </div>

                {/* 实时结果表格 - 即使在分析中也显示 */}
                {analysisResults.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold mb-4">实时分析结果</h3>
                    <div className="overflow-x-auto">
                      <table className="min-w-full bg-white border border-gray-200 rounded-lg">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">搜索词</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">语义相关性</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">商业价值</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">否词建议</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {analysisResults.map((result, _index) => (
                            <tr key={result.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-sm font-medium text-gray-900">
                                {result.searchTerm}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-700">
                                <div className="flex items-center">
                                  <div className="w-12 h-2 bg-gray-200 rounded-full mr-2">
                                    <div
                                      className="h-2 bg-blue-500 rounded-full"
                                      style={{ width: `${result.analysis.semanticRelevance.score}%` }}
                                    ></div>
                                  </div>
                                  <span className="text-xs">{result.analysis.semanticRelevance.score}%</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-700">
                                <div className="flex items-center">
                                  <div className="w-12 h-2 bg-gray-200 rounded-full mr-2">
                                    <div
                                      className="h-2 bg-green-500 rounded-full"
                                      style={{ width: `${result.analysis.commercialValue.score}%` }}
                                    ></div>
                                  </div>
                                  <span className="text-xs">{result.analysis.commercialValue.score}%</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-sm">
                                <Badge variant={result.analysis.recommendation.isNegative ? "destructive" : "secondary"}>
                                  {result.analysis.recommendation.isNegative ? "否词" : "保留"}
                                </Badge>
                              </td>
                              <td className="px-4 py-3 text-sm">
                                <Badge variant="outline" className="text-green-600 border-green-600">
                                  ✅ 已完成
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ) : analysisResults.length > 0 ? (
              <div>
                {/* 筛选和控制面板 */}
                <div className="flex items-center justify-between mb-4 p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-4">
                    <Input
                      placeholder="搜索搜索词、翻译或关键词..."
                      value={resultsFilter}
                      onChange={(e) => setResultsFilter(e.target.value)}
                      className="w-64"
                    />
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={showOnlyNegative}
                        onChange={(e) => setShowOnlyNegative(e.target.checked)}
                        className="rounded"
                      />
                      <span className="text-sm">仅显示否词建议</span>
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-600">
                      显示 {filteredResults.length} / {analysisResults.length} 条记录
                    </span>
                    <Button size="sm" variant="outline" onClick={exportNegativeKeywords}>
                      <Download className="h-4 w-4 mr-2" />
                      导出否词
                    </Button>
                  </div>
                </div>

                {/* 批量操作 */}
                {selectedResults.size > 0 && (
                  <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-blue-700">
                        已选择 {selectedResults.size} 项
                      </span>
                      <div className="space-x-2">
                        <Button size="sm" variant="outline" onClick={() => batchToggleNegative(true)}>
                          批量设为否词
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => batchToggleNegative(false)}>
                          批量取消否词
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setSelectedResults(new Set())}>
                          取消选择
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 分析结果表格 */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="max-h-[600px] overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left">
                            <input
                              type="checkbox"
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedResults(new Set(filteredResults.map(r => r.id)))
                                } else {
                                  setSelectedResults(new Set())
                                }
                              }}
                              checked={selectedResults.size === filteredResults.length && filteredResults.length > 0}
                            />
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-gray-700">搜索词</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-700">翻译</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-700">关键词</th>
                          <th className="px-3 py-2 text-right font-medium text-gray-700">点击</th>
                          <th className="px-3 py-2 text-right font-medium text-gray-700">转化</th>
                          <th className="px-3 py-2 text-right font-medium text-gray-700">费用</th>
                          <th className="px-3 py-2 text-center font-medium text-gray-700">语义相关性</th>
                          <th className="px-3 py-2 text-center font-medium text-gray-700">商业价值</th>
                          <th className="px-3 py-2 text-center font-medium text-gray-700">否词建议</th>
                          <th className="px-3 py-2 text-center font-medium text-gray-700">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredResults.map((result) => (
                          <tr key={result.id} className="border-t hover:bg-gray-50">
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={selectedResults.has(result.id)}
                                onChange={(e) => {
                                  const newSelected = new Set(selectedResults)
                                  if (e.target.checked) {
                                    newSelected.add(result.id)
                                  } else {
                                    newSelected.delete(result.id)
                                  }
                                  setSelectedResults(newSelected)
                                }}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <div className="font-medium">{result.searchTerm}</div>
                              <div className="text-xs text-gray-500">{result.campaign}</div>
                            </td>
                            <td className="px-3 py-2 text-blue-600 font-medium">
                              {result.translation}
                            </td>
                            <td className="px-3 py-2 text-gray-600">{result.keyword}</td>
                            <td className="px-3 py-2 text-right">{result.clicks}</td>
                            <td className="px-3 py-2 text-right">{result.conversions}</td>
                            <td className="px-3 py-2 text-right">¥{result.cost.toFixed(2)}</td>
                            <td className="px-3 py-2 text-center">
                              <Badge variant={result.analysis.semanticRelevance.score >= 70 ? "default" : "secondary"}>
                                {result.analysis.semanticRelevance.score}%
                              </Badge>
                            </td>
                            <td className="px-3 py-2 text-center">
                              <Badge variant={result.analysis.commercialValue.score >= 70 ? "default" : "secondary"}>
                                {result.analysis.commercialValue.score}%
                              </Badge>
                            </td>
                            <td className="px-3 py-2 text-center">
                              {result.analysis.recommendation.isNegative ? (
                                <div className="space-y-2">
                                  <Badge variant="destructive" className="text-xs font-normal">
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                    否词
                                  </Badge>
                                  <div className="text-xs text-gray-500">
                                    置信度: {result.analysis.recommendation.confidence}%
                                  </div>
                                  {result.analysis.recommendation.reasonTags && result.analysis.recommendation.reasonTags.length > 0 && (
                                    <div className="flex flex-wrap gap-1 justify-center">
                                      {result.analysis.recommendation.reasonTags.slice(0, 2).map((tag, index) => {
                                        const tagMap: { [key: string]: string } = {
                                          'POOR_PERFORMANCE': '表现不佳',
                                          'IRRELEVANT': '不相关',
                                          'COMPANY_NAME': '公司名称',
                                          'LOW_RELEVANCE': '相关性低',
                                          'NO_CONVERSION': '无转化',
                                          'COMPETITOR_BRAND': '竞品',
                                          'LOW_INTENT': '意图不明',
                                          'IRRELEVANT_CATEGORY': '类别不符'
                                        };
                                        return (
                                          <span
                                            key={index}
                                            className="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-600"
                                          >
                                            {tagMap[tag] || tag.replace(/_/g, ' ').toLowerCase()}
                                          </span>
                                        );
                                      })}
                                      {result.analysis.recommendation.reasonTags.length > 2 && (
                                        <span className="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-500">
                                          +{result.analysis.recommendation.reasonTags.length - 2}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  <Badge variant="outline" className="text-xs font-normal text-green-700 border-green-200">
                                    保留
                                  </Badge>
                                  <div className="text-xs text-gray-500">
                                    置信度: {result.analysis.recommendation.confidence}%
                                  </div>
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => toggleNegativeRecommendation(result.id)}
                              >
                                {result.analysis.recommendation.isNegative ? '取消否词' : '设为否词'}
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center text-gray-500">
                <Brain className="h-12 w-12 mx-auto mb-4" />
                <p>请先上传并分析数据以查看结果</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
