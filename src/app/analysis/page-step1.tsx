'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function AnalysisPage() {
  console.log('AnalysisPage Step1 rendering')

  return (
    <div className="p-8 bg-white">
      <h1 className="text-3xl font-bold mb-4">AI否词分析 - 步骤1</h1>
      <Card>
        <CardHeader>
          <CardTitle>基础组件测试</CardTitle>
          <CardDescription>测试基础UI组件</CardDescription>
        </CardHeader>
        <CardContent>
          <Button>测试按钮</Button>
        </CardContent>
      </Card>
    </div>
  )
}