/**
 * Root layout: locale, metadata and the tooltip provider shadcn/ui asks for.
 *
 * 根版面：語系、metadata 與 shadcn/ui 要求的 TooltipProvider。
 */
import type { Metadata } from 'next'

import { TooltipProvider } from '@/components/ui/tooltip'

import './globals.css'

export const metadata: Metadata = {
  title: 'Sitemap Builder',
  description: '基于 Playwright 无头浏览器的全站 Sitemap 生成器',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-svh antialiased">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  )
}