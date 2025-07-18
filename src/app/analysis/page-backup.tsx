'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Brain,
  Upload,
  FileText,
  Settings,
  Download,
  AlertCircle,
  CheckCircle,
  XCircle,
  Eye,
  RefreshCw,
  Filter,
  Search
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
    performanceAnalysis: { costEfficiency: string; clickQuality: string }
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

export default function AnalysisPage() {
  const [selectedTab, setSelectedTab] = useState('upload')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisProgress, setAnalysisProgress] = useState(0)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileName, setFileName] = useState<string>('')
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([])
  const [error, setError] = useState<string>('')
  const [rawData, setRawData] = useState<RawDataRow[]>([])
  const [parsedData, setParsedData] = useState<ParsedDataRow[]>([])
  const [columnMapping, setColumnMapping] = useState<{[key: string]: string}>({})
  const [availableColumns, setAvailableColumns] = useState<string[]>([])
  const [isPreviewMode, setIsPreviewMode] = useState(false)
  const [previewFilter, setPreviewFilter] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // 新增筛选和编辑功能的状态
  const [resultsFilter, setResultsFilter] = useState('')
  const [showOnlyNegative, setShowOnlyNegative] = useState(false)
  const [editableResults, setEditableResults] = useState<AnalysisResult[]>([])
  const [selectedResults, setSelectedResults] = useState<Set<string>>(new Set())

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
                <Button>
                  选择文件
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="preview" className="p-6">
            <div className="text-center text-gray-500">
              <FileText className="h-12 w-12 mx-auto mb-4" />
              <p>请先上传文件以预览数据</p>
            </div>
          </TabsContent>

          <TabsContent value="results" className="p-6">
            <div className="text-center text-gray-500">
              <Brain className="h-12 w-12 mx-auto mb-4" />
              <p>请先上传并分析数据以查看结果</p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
