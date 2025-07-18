'use client'

import { useState, useEffect } from 'react'

export default function DebugPage() {
  const [mounted, setMounted] = useState(false)
  const [error, setError] = useState<string>('')

  useEffect(() => {
    console.log('DebugPage mounted')
    setMounted(true)
    
    // 模拟错误检查
    const timer = setTimeout(() => {
      console.log('DebugPage: 2秒后进行错误检查')
    }, 2000)

    return () => {
      console.log('DebugPage unmounting')
      clearTimeout(timer)
    }
  }, [])

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">调试页面</h1>
      <p>挂载状态: {mounted ? '已挂载' : '未挂载'}</p>
      {error && (
        <div className="bg-red-100 p-4 rounded">
          <p className="text-red-600">{error}</p>
        </div>
      )}
      <div className="mt-4 space-y-2">
        <button 
          className="px-4 py-2 bg-blue-500 text-white rounded"
          onClick={() => console.log('按钮点击')}
        >
          测试按钮
        </button>
        <button 
          className="px-4 py-2 bg-red-500 text-white rounded"
          onClick={() => setError('测试错误')}
        >
          触发错误
        </button>
      </div>
    </div>
  )
}