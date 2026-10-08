/**
 * Application entry page: the dashboard is fully client-side, wrapped in the
 * locale provider.
 *
 * 應用程式入口頁：儀表板完全在客戶端執行，外層包上語系 Provider。
 */
import { SitemapBuilder } from '@/components/dashboard/SitemapBuilder'
import { LocaleProvider } from '@/components/providers/LocaleProvider'

export default function Home() {
  return (
    <LocaleProvider>
      <SitemapBuilder />
    </LocaleProvider>
  )
}