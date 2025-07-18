import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Sidebar from '@/components/layout/Sidebar'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'AdNegator Pro - 谷歌广告智能否词工具',
  description: '基于GPT-4o的谷歌搜索广告智能否词分析系统，帮助广告主优化投放成本',
  keywords: ['Google Ads', '否定关键词', 'GPT-4o', '广告优化', '成本控制'],
  authors: [{ name: 'AdNegator Team' }],
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className={inter.className}>
        <div className="min-h-screen bg-background font-sans antialiased">
          <Sidebar>
            {children}
          </Sidebar>
        </div>
      </body>
    </html>
  )
}
