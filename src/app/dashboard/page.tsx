'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  Target, 
  Upload, 
  Download,
  Settings,
  Plus,
  Eye,
  CheckCircle,
  AlertCircle,
  Clock
} from 'lucide-react'

export default function DashboardPage() {
  const [stats] = useState({
    totalKeywords: 15420,
    processedKeywords: 12350,
    negativeKeywords: 3245,
    costSaved: 8920,
    analysisProgress: 80,
    websites: 5,
    activeAnalyses: 3
  })

  const [recentAnalyses] = useState([
    {
      id: '1',
      name: '电商网站A - 搜索词分析',
      status: 'completed',
      date: '2024-01-15',
      keywords: 1250,
      negatives: 320,
      confidence: 92
    },
    {
      id: '2', 
      name: '服务类网站B - 关键词优化',
      status: 'processing',
      date: '2024-01-14',
      keywords: 890,
      negatives: 0,
      confidence: 0
    },
    {
      id: '3',
      name: '教育平台C - 广告优化',
      status: 'pending',
      date: '2024-01-13',
      keywords: 2340,
      negatives: 580,
      confidence: 88
    }
  ])

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'processing':
        return <Clock className="h-4 w-4 text-yellow-500" />
      case 'pending':
        return <AlertCircle className="h-4 w-4 text-gray-500" />
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return '已完成'
      case 'processing':
        return '分析中'
      case 'pending':
        return '待处理'
      default:
        return '未知'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800'
      case 'processing':
        return 'bg-yellow-100 text-yellow-800'
      case 'pending':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">仪表板</h1>
          <p className="text-gray-600 mt-1">管理您的广告否词分析项目</p>
        </div>
        <div className="flex space-x-3">
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4 mr-2" />
            设置
          </Button>
          <Button size="sm">
            <Plus className="h-4 w-4 mr-2" />
            新建分析
          </Button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总关键词数</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalKeywords.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              <span className="text-green-600">+12%</span> 较上月
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">已处理关键词</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.processedKeywords.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              处理进度 {Math.round((stats.processedKeywords / stats.totalKeywords) * 100)}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">否定关键词</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.negativeKeywords.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              <span className="text-red-600">节省成本</span> ¥{stats.costSaved.toLocaleString()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">管理网站</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.websites}</div>
            <p className="text-xs text-muted-foreground">
              {stats.activeAnalyses} 个活跃分析
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 分析进度 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <TrendingUp className="h-5 w-5 mr-2" />
            当前分析进度
          </CardTitle>
          <CardDescription>
            GPT-4o正在分析您的搜索词数据，预计还需要15分钟完成
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">总体进度</span>
              <span className="text-sm text-muted-foreground">{stats.analysisProgress}%</span>
            </div>
            <Progress value={stats.analysisProgress} className="h-2" />
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>已处理: {stats.processedKeywords.toLocaleString()}</span>
              <span>剩余: {(stats.totalKeywords - stats.processedKeywords).toLocaleString()}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 最近分析 */}
      <Card>
        <CardHeader>
          <CardTitle>最近分析</CardTitle>
          <CardDescription>查看您最近的搜索词分析项目</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recentAnalyses.map((analysis) => (
              <div key={analysis.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center space-x-4">
                  {getStatusIcon(analysis.status)}
                  <div>
                    <h3 className="font-medium">{analysis.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {analysis.date} • {analysis.keywords} 关键词
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <Badge variant="secondary" className={getStatusColor(analysis.status)}>
                    {getStatusText(analysis.status)}
                  </Badge>
                  {analysis.status === 'completed' && (
                    <div className="text-sm text-muted-foreground">
                      否词: {analysis.negatives} | 置信度: {analysis.confidence}%
                    </div>
                  )}
                  <Button variant="ghost" size="sm">
                    <Eye className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 快速操作 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="flex items-center justify-center p-6">
            <div className="text-center">
              <Upload className="h-8 w-8 mx-auto mb-2 text-primary" />
              <h3 className="font-medium">上传数据</h3>
              <p className="text-sm text-muted-foreground">导入Google Ads搜索词报告</p>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="flex items-center justify-center p-6">
            <div className="text-center">
              <Plus className="h-8 w-8 mx-auto mb-2 text-primary" />
              <h3 className="font-medium">添加网站</h3>
              <p className="text-sm text-muted-foreground">管理新的网站信息</p>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="flex items-center justify-center p-6">
            <div className="text-center">
              <Download className="h-8 w-8 mx-auto mb-2 text-primary" />
              <h3 className="font-medium">导出结果</h3>
              <p className="text-sm text-muted-foreground">下载否词分析结果</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}