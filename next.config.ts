import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // React Compiler：自动记忆化，替代手写 useMemo / useCallback / memo。
  // Next 用 SWC 只对含 JSX 或 Hooks 的文件应用编译器，构建开销有限。
  reactCompiler: true,
  // playwright / playwright-core / @sparticuz/chromium 已被 Next 官方自动外部化，
  // 这里显式声明是为了在打包/standalone 输出时确保它们走原生 require。
  serverExternalPackages: ['playwright', 'playwright-core', '@sparticuz/chromium'],
  outputFileTracingIncludes: {
    // 部署到 Vercel 时需要把 @sparticuz/chromium 自带的 chromium 二进制一起打包
    '/api/crawl': ['./node_modules/@sparticuz/chromium/bin/**/*'],
  },
}

export default nextConfig