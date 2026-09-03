import { PageHeader } from '../components/shell/PageHeader'

export function AccountPage() {
  return (
    <section className="page page--account">
      <PageHeader eyebrow="身份" title="账户" description="查看当前原型身份与同步状态。" />

      <section className="account-identity" aria-labelledby="account-name">
        <span className="account-identity__mark" aria-hidden="true">L</span>
        <div>
          <h2 id="account-name">本地演示账户</h2>
          <p>用于体验学习流程，不连接真实账户服务。</p>
        </div>
      </section>

      <dl className="account-facts">
        <div><dt>账户状态</dt><dd>本地原型</dd></div>
        <div><dt>学习记录</dt><dd>当前会话</dd></div>
        <div><dt>跨设备同步</dt><dd>未连接</dd></div>
      </dl>

      <p className="prototype-disclosure">正式版本将在这里提供登录、资料同步与账户安全管理。</p>
    </section>
  )
}
