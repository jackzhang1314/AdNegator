'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { 
  Globe, 
  Plus, 
  Edit, 
  Trash2, 
  Eye,
  Search,
  Filter,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  Settings,
  Download
} from 'lucide-react'

// 模拟网站数据
const mockWebsites: Website[] = [
  {
    id: '1',
    name: '科技产品商城',
    url: 'https://techstore.example.com',
    description: '专业的科技产品电商平台，主营电子产品、数码配件等',
    industry: 'E-commerce',
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
  },
  {
    id: '2',
    name: '企业管理软件',
    url: 'https://erp-system.example.com',
    description: '面向中小企业的一体化管理软件解决方案',
    industry: 'SaaS',
    targetMarket: '企业客户',
    language: 'zh-CN',
    status: 'active',
    createdAt: '2024-01-10',
    lastAnalyzed: '2024-01-22',
    keywordsCount: 890,
    negativeKeywords: 156,
    crawledInfo: {
      title: '企业管理软件 - ERP系统解决方案',
      metaDescription: '专业的企业资源规划软件，帮助企业提升管理效率，降低运营成本',
      keywords: ['企业管理', 'ERP系统', '管理软件', '企业资源规划']
    }
  },
  {
    id: '3',
    name: '在线教育平台',
    url: 'https://eduonline.example.com',
    description: '专业的在线教育平台，提供各类技能培训课程',
    industry: 'Education',
    targetMarket: '学生群体',
    language: 'zh-CN',
    status: 'pending',
    createdAt: '2024-01-18',
    lastAnalyzed: '',
    keywordsCount: 0,
    negativeKeywords: 0,
    crawledInfo: {
      title: '在线教育平台 - 专业技能培训',
      metaDescription: '提供丰富的在线课程，包括编程、设计、营销等专业技能培训',
      keywords: ['在线教育', '技能培训', '编程课程', '设计课程']
    }
  }
]

interface Website {
  id: string
  name: string
  url: string
  description: string
  industry: string
  targetMarket: string
  language: string
  status: 'active' | 'pending' | 'inactive'
  createdAt: string
  lastAnalyzed: string | null
  keywordsCount: number
  negativeKeywords: number
  crawledInfo: {
    title: string
    metaDescription: string
    keywords: string[]
  }
}

export default function WebsitesPage() {
  const [websites, setWebsites] = useState<Website[]>(mockWebsites)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingWebsite, setEditingWebsite] = useState<Website | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [isLoading, setIsLoading] = useState(false)

  const [formData, setFormData] = useState({
    name: '',
    url: '',
    description: '',
    industry: '',
    targetMarket: '',
    language: 'zh-CN'
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    // 模拟API调用
    setTimeout(() => {
      if (editingWebsite) {
        // 更新网站
        setWebsites(prev => prev.map(site => 
          site.id === editingWebsite.id 
            ? { 
                ...site, 
                ...formData,
                crawledInfo: {
                  title: `${formData.name} - 专业服务平台`,
                  metaDescription: formData.description,
                  keywords: [formData.industry, formData.name]
                }
              }
            : site
        ))
      } else {
        // 添加新网站
        const newWebsite: Website = {
          id: Date.now().toString(),
          ...formData,
          status: 'pending',
          createdAt: new Date().toISOString().split('T')[0] || '',
          lastAnalyzed: null,
          keywordsCount: 0,
          negativeKeywords: 0,
          crawledInfo: {
            title: `${formData.name} - 专业服务平台`,
            metaDescription: formData.description,
            keywords: [formData.industry, formData.name]
          }
        }
        setWebsites(prev => [...prev, newWebsite])
      }

      setIsDialogOpen(false)
      setEditingWebsite(null)
      setFormData({
        name: '',
        url: '',
        description: '',
        industry: '',
        targetMarket: '',
        language: 'zh-CN'
      })
      setIsLoading(false)
    }, 1000)
  }

  const handleEdit = (website: Website) => {
    setEditingWebsite(website)
    setFormData({
      name: website.name,
      url: website.url,
      description: website.description,
      industry: website.industry,
      targetMarket: website.targetMarket,
      language: website.language
    })
    setIsDialogOpen(true)
  }

  const handleDelete = (id: string) => {
    if (confirm('确定要删除这个网站吗？')) {
      setWebsites(prev => prev.filter(site => site.id !== id))
    }
  }

  const handleCrawl = (id: string) => {
    setWebsites(prev => prev.map(site => 
      site.id === id 
        ? { ...site, status: 'active' as const }
        : site
    ))
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800'
      case 'pending':
        return 'bg-yellow-100 text-yellow-800'
      case 'inactive':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active':
        return '活跃'
      case 'pending':
        return '待处理'
      case 'inactive':
        return '已停用'
      default:
        return '未知'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'pending':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />
      case 'inactive':
        return <AlertCircle className="h-4 w-4 text-gray-500" />
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />
    }
  }

  const filteredWebsites = websites.filter(website => {
    const matchesSearch = website.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         website.url.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         website.industry.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = filterStatus === 'all' || website.status === filterStatus
    return matchesSearch && matchesStatus
  })

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">网站管理</h1>
          <p className="text-gray-600 mt-1">管理您的业务网站信息，为AI分析提供上下文</p>
        </div>
        <div className="flex space-x-3">
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            导出列表
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                添加网站
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>
                  {editingWebsite ? '编辑网站' : '添加新网站'}
                </DialogTitle>
                <DialogDescription>
                  {editingWebsite ? '更新网站信息' : '添加新的网站信息，系统将自动抓取网站内容'}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name">网站名称 *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      placeholder="输入网站名称"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="url">网站URL *</Label>
                    <Input
                      id="url"
                      type="url"
                      value={formData.url}
                      onChange={(e) => setFormData({...formData, url: e.target.value})}
                      placeholder="https://example.com"
                      required
                    />
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="description">网站描述</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    placeholder="简要描述网站的主要业务和服务"
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="industry">行业类型</Label>
                    <Select value={formData.industry} onValueChange={(value) => setFormData({...formData, industry: value})}>
                      <SelectTrigger>
                        <SelectValue placeholder="选择行业" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="E-commerce">电子商务</SelectItem>
                        <SelectItem value="SaaS">软件服务</SelectItem>
                        <SelectItem value="Education">教育培训</SelectItem>
                        <SelectItem value="Healthcare">医疗健康</SelectItem>
                        <SelectItem value="Finance">金融服务</SelectItem>
                        <SelectItem value="Manufacturing">制造业</SelectItem>
                        <SelectItem value="Real Estate">房地产</SelectItem>
                        <SelectItem value="Travel">旅游服务</SelectItem>
                        <SelectItem value="Other">其他</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="targetMarket">目标市场</Label>
                    <Input
                      id="targetMarket"
                      value={formData.targetMarket}
                      onChange={(e) => setFormData({...formData, targetMarket: e.target.value})}
                      placeholder="例：全国、华东地区"
                    />
                  </div>
                  <div>
                    <Label htmlFor="language">语言</Label>
                    <Select value={formData.language} onValueChange={(value) => setFormData({...formData, language: value})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="zh-CN">中文</SelectItem>
                        <SelectItem value="en-US">英文</SelectItem>
                        <SelectItem value="ja-JP">日文</SelectItem>
                        <SelectItem value="ko-KR">韩文</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    取消
                  </Button>
                  <Button type="submit" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        {editingWebsite ? '更新中...' : '添加中...'}
                      </>
                    ) : (
                      <>
                        {editingWebsite ? '更新网站' : '添加网站'}
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">总网站数</p>
                <p className="text-2xl font-bold">{websites.length}</p>
              </div>
              <Globe className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">活跃网站</p>
                <p className="text-2xl font-bold text-green-600">
                  {websites.filter(w => w.status === 'active').length}
                </p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">待处理</p>
                <p className="text-2xl font-bold text-yellow-600">
                  {websites.filter(w => w.status === 'pending').length}
                </p>
              </div>
              <AlertCircle className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">总关键词</p>
                <p className="text-2xl font-bold">
                  {websites.reduce((sum, w) => sum + w.keywordsCount, 0)}
                </p>
              </div>
              <Settings className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 搜索和过滤 */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="搜索网站名称、URL或行业..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-80"
                />
              </div>
              <div className="flex items-center space-x-2">
                <Filter className="h-4 w-4" />
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部状态</SelectItem>
                    <SelectItem value="active">活跃</SelectItem>
                    <SelectItem value="pending">待处理</SelectItem>
                    <SelectItem value="inactive">已停用</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              显示 {filteredWebsites.length} / {websites.length} 个网站
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 网站列表 */}
      <Card>
        <CardHeader>
          <CardTitle>网站列表</CardTitle>
          <CardDescription>管理所有网站的基本信息和分析状态</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>网站信息</TableHead>
                <TableHead>行业/市场</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>分析数据</TableHead>
                <TableHead>最后分析</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredWebsites.map((website) => (
                <TableRow key={website.id}>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="font-medium">{website.name}</div>
                      <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                        <span>{website.url}</span>
                        <a href={website.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {website.description}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <Badge variant="secondary">{website.industry}</Badge>
                      <div className="text-sm text-muted-foreground">
                        {website.targetMarket}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(website.status)}
                      <Badge variant="secondary" className={getStatusColor(website.status)}>
                        {getStatusText(website.status)}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1 text-sm">
                      <div>关键词: {website.keywordsCount}</div>
                      <div>否词: {website.negativeKeywords}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {website.lastAnalyzed ? website.lastAnalyzed : '未分析'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEdit(website)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCrawl(website.id)}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDelete(website.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}