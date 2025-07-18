'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
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
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisProgress, setAnalysisProgress] = useState(0)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileName, setFileName] = useState<string>('')
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([])
  const [error, setError] = useState<string>('')
  const [rawData, setRawData] = useState<RawDataRow[]>([])
  const [availableColumns, setAvailableColumns] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // 筛选和编辑功能的状态
  const [resultsFilter, setResultsFilter] = useState('')
  const [showOnlyNegative, setShowOnlyNegative] = useState(false)
  const [editableResults, setEditableResults] = useState<AnalysisResult[]>([])
  const [selectedResults, setSelectedResults] = useState<Set<string>>(new Set())

  // 解析CSV文件
  const parseCSV = (text: string): RawDataRow[] => {
    const lines = text.split('\n').filter(line => line.trim())
    if (lines.length === 0) return []

    // 简单但有效的CSV解析
    const parseCSVLine = (line: string): string[] => {
      const result: string[] = []
      let current = ''
      let inQuotes = false
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i]
        if (char === '"') {
          inQuotes = !inQuotes
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim())
          current = ''
        } else {
          current += char
        }
      }
      result.push(current.trim())
      return result
    }

    const headers = parseCSVLine(lines[0]).map(h => h.replace(/"/g, ''))
    console.log('Parsed headers:', headers)
    
    const data: RawDataRow[] = []
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]).map(v => v.replace(/"/g, ''))
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
  }

  // 处理文件上传
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith('.csv')) {
      setError('请选择CSV格式文件')
      return
    }

    setSelectedFile(file)
    setFileName(file.name)
    setError('')

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      const parsed = parseCSV(text)
      setRawData(parsed)
      
      if (parsed.length > 0) {
        setAvailableColumns(Object.keys(parsed[0]))
        setSelectedTab('preview')
      }
    }
    reader.readAsText(file)
  }

  // 开始分析
  const handleAnalyze = async () => {
    if (rawData.length === 0) {
      setError('请先上传数据')
      return
    }

    setIsAnalyzing(true)
    setError('')
    setSelectedTab('results')
    setAnalysisProgress(0)

    try {
      // 模拟分析进度
      const progressInterval = setInterval(() => {
        setAnalysisProgress(prev => {
          if (prev >= 80) {
            clearInterval(progressInterval)
            return 80
          }
          return prev + 10
        })
      }, 300)

      // 调用API分析
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ searchTerms: rawData }),
      })

      if (!response.ok) {
        throw new Error('分析服务响应异常')
      }

      const data = await response.json()

      clearInterval(progressInterval)
      setAnalysisProgress(100)
      setAnalysisResults(data.results || [])
      setEditableResults(data.results || [])
      setIsAnalyzing(false)

    } catch (err) {
      setIsAnalyzing(false)
      setError(err instanceof Error ? err.message : '分析失败，请重试')
      console.error('Analysis error:', err)
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
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="upload" className="flex items-center space-x-2">
              <Upload className="h-4 w-4" />
              <span>上传数据</span>
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
              <p className="text-gray-600 mb-6">支持CSV格式文件，最大50MB</p>

              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 hover:border-blue-400 transition-colors">
                <Upload className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <p className="text-lg font-medium text-gray-700 mb-2">拖拽文件到此处或点击上传</p>
                <p className="text-sm text-gray-500 mb-4">支持 .csv 格式</p>
                <Button onClick={() => fileInputRef.current?.click()}>
                  选择文件
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>

              {fileName && (
                <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-green-700">已选择文件: {fileName}</p>
                </div>
              )}

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

          <TabsContent value="preview" className="p-6">
            {rawData.length > 0 ? (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">数据预览 ({rawData.length} 条记录)</h3>
                  <Button onClick={handleAnalyze} disabled={rawData.length === 0}>
                    <Brain className="h-4 w-4 mr-2" />
                    开始分析
                  </Button>
                </div>
                <div className="border rounded-lg overflow-hidden">
                  <div className="max-h-96 overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          {availableColumns.slice(0, 6).map((col) => (
                            <th key={col} className="px-4 py-2 text-left font-medium text-gray-700">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rawData.slice(0, 10).map((row, index) => (
                          <tr key={index} className="border-t">
                            {availableColumns.slice(0, 6).map((col) => (
                              <td key={col} className="px-4 py-2 text-gray-600">
                                {String(row[col] || '')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
            {isAnalyzing ? (
              <div className="text-center py-8">
                <div className="flex items-center justify-center mb-4">
                  <RefreshCw className="h-8 w-8 animate-spin text-blue-500 mr-3" />
                  <span className="text-lg font-medium">正在分析中...</span>
                  <span className="text-sm text-muted-foreground ml-2">{analysisProgress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 max-w-md mx-auto">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${analysisProgress}%` }}
                  ></div>
                </div>
                <p className="text-sm text-muted-foreground mt-4">
                  正在进行语义分析、商业价值评估和数据表现分析...
                </p>
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
                                <div className="space-y-1">
                                  <Badge variant="destructive" className="text-xs">
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                    建议否词
                                  </Badge>
                                  <div className="text-xs text-gray-600">
                                    {result.analysis.recommendation.negativeKeyword}
                                  </div>
                                  {result.analysis.recommendation.reasonTags && (
                                    <div className="flex flex-wrap gap-1">
                                      {result.analysis.recommendation.reasonTags.map((tag, index) => (
                                        <span
                                          key={index}
                                          className={`px-1 py-0.5 text-xs rounded ${
                                            tag === 'COMPETITOR_BRAND' ? 'bg-red-100 text-red-700' :
                                            tag === 'LOW_INTENT' ? 'bg-yellow-100 text-yellow-700' :
                                            tag === 'POOR_PERFORMANCE' ? 'bg-orange-100 text-orange-700' :
                                            tag === 'IRRELEVANT_CATEGORY' ? 'bg-gray-100 text-gray-700' :
                                            'bg-blue-100 text-blue-700'
                                          }`}
                                        >
                                          {tag.replace(/_/g, ' ').toLowerCase()}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <Badge variant="outline" className="text-xs">
                                  保留
                                </Badge>
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
