'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { 
  Download, 
  FileText, 
  Settings,
  Target,
  CheckCircle,
  TrendingDown,
  Archive,
  RefreshCw,
  FileSpreadsheet
} from 'lucide-react'

const mockNegativeKeywords = [
  {
    id: '1',
    keyword: '免费下载软件',
    matchType: 'phrase',
    level: 'adgroup',
    confidence: 95,
    campaign: '主推广系列',
    adGroup: '软件工具组',
    cost: 89.50,
    selected: true
  },
  {
    id: '2',
    keyword: '如何破解软件',
    matchType: 'exact',
    level: 'account',
    confidence: 98,
    campaign: '品牌推广',
    adGroup: '通用软件组',
    cost: 45.30,
    selected: true
  },
  {
    id: '3',
    keyword: '盗版软件下载',
    matchType: 'broad',
    level: 'campaign',
    confidence: 92,
    campaign: '主推广系列',
    adGroup: '软件下载组',
    cost: 24.60,
    selected: false
  }
]

export default function ExportPage() {
  const [selectedTab, setSelectedTab] = useState('current')
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>(['1', '2'])
  const [isExporting, setIsExporting] = useState(false)

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedKeywords(mockNegativeKeywords.map(k => k.id))
    } else {
      setSelectedKeywords([])
    }
  }

  const handleSelectKeyword = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedKeywords(prev => [...prev, id])
    } else {
      setSelectedKeywords(prev => prev.filter(kid => kid !== id))
    }
  }

  const handleExport = async () => {
    setIsExporting(true)
    setTimeout(() => {
      setIsExporting(false)
      alert('导出成功！')
    }, 2000)
  }

  const selectedCount = selectedKeywords.length
  const totalCostSaved = mockNegativeKeywords
    .filter(k => selectedKeywords.includes(k.id))
    .reduce((sum, k) => sum + k.cost, 0)

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">导出中心</h1>
          <p className="text-gray-600 mt-1">导出否词分析结果，直接应用到Google Ads</p>
        </div>
        <div className="flex space-x-3">
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4 mr-2" />
            导出设置
          </Button>
          <Button variant="outline" size="sm">
            <Archive className="h-4 w-4 mr-2" />
            导出历史
          </Button>
        </div>
      </div>

      {/* 统计概览 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">可导出否词</p>
                <p className="text-2xl font-bold">{mockNegativeKeywords.length}</p>
              </div>
              <Target className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">已选择</p>
                <p className="text-2xl font-bold text-primary">{selectedCount}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">预计节省</p>
                <p className="text-2xl font-bold text-green-600">¥{totalCostSaved.toFixed(2)}</p>
              </div>
              <TrendingDown className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">导出次数</p>
                <p className="text-2xl font-bold">12</p>
              </div>
              <Download className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 主要内容区域 */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="current">当前结果</TabsTrigger>
          <TabsTrigger value="history">导出历史</TabsTrigger>
          <TabsTrigger value="settings">导出设置</TabsTrigger>
        </TabsList>

        {/* 当前结果标签页 */}
        <TabsContent value="current" className="space-y-6">
          {/* 否词列表 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>否词列表</span>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    checked={selectedKeywords.length === mockNegativeKeywords.length}
                    onCheckedChange={handleSelectAll}
                  />
                  <span className="text-sm text-muted-foreground">全选</span>
                </div>
              </CardTitle>
              <CardDescription>
                选择要导出的否词，系统将根据您的选择生成导出文件
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">选择</TableHead>
                    <TableHead>否词</TableHead>
                    <TableHead>匹配类型</TableHead>
                    <TableHead>应用级别</TableHead>
                    <TableHead>置信度</TableHead>
                    <TableHead>预计节省</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mockNegativeKeywords.map((keyword) => (
                    <TableRow key={keyword.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedKeywords.includes(keyword.id)}
                          onCheckedChange={(checked) => handleSelectKeyword(keyword.id, checked as boolean)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{keyword.keyword}</div>
                        <div className="text-sm text-muted-foreground">
                          {keyword.campaign} • {keyword.adGroup}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{keyword.matchType}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{keyword.level}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="bg-green-100 text-green-800">
                          {keyword.confidence}%
                        </Badge>
                      </TableCell>
                      <TableCell>¥{keyword.cost}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* 导出选项 */}
          <Card>
            <CardHeader>
              <CardTitle>导出选项</CardTitle>
              <CardDescription>选择导出格式和相关设置</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div>
                  <p className="text-sm font-medium mb-4">选择导出格式：</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 border rounded-lg cursor-pointer hover:border-primary">
                      <div className="flex items-center space-x-3">
                        <FileSpreadsheet className="h-6 w-6 text-primary" />
                        <div>
                          <div className="font-medium">Google Ads CSV</div>
                          <div className="text-sm text-muted-foreground">
                            可直接导入Google Ads的否词列表格式
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="p-4 border rounded-lg cursor-pointer hover:border-primary">
                      <div className="flex items-center space-x-3">
                        <FileText className="h-6 w-6 text-primary" />
                        <div>
                          <div className="font-medium">Excel详细报告</div>
                          <div className="text-sm text-muted-foreground">
                            包含完整分析数据的Excel表格
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t">
                  <div className="text-sm text-muted-foreground">
                    已选择 {selectedCount} 个否词，预计节省 ¥{totalCostSaved.toFixed(2)}
                  </div>
                  <Button 
                    onClick={handleExport} 
                    disabled={selectedCount === 0 || isExporting}
                    size="lg"
                  >
                    {isExporting ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        导出中...
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4 mr-2" />
                        导出否词列表
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 导出历史标签页 */}
        <TabsContent value="history" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>导出历史</CardTitle>
              <CardDescription>查看和管理您的导出记录</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                暂无导出历史记录
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 导出设置标签页 */}
        <TabsContent value="settings" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>导出设置</CardTitle>
              <CardDescription>配置默认的导出选项和格式</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium mb-2">默认导出格式</p>
                  <div className="text-sm text-muted-foreground">
                    Google Ads CSV格式
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">文件命名规则</p>
                  <div className="text-sm text-muted-foreground">
                    否词导出_{'{网站名称}'}_{'{日期}'}
                  </div>
                </div>
                <Button>
                  <Settings className="h-4 w-4 mr-2" />
                  保存设置
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}