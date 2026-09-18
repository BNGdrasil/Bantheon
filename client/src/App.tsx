/* ------------------------------------------------------------------ *
 * Public landing page for bnbong.com.
 *
 * Static content only: no admin API call, no internal host name, no account
 * count and no backup location. Every link points at a public entry point.
 * ------------------------------------------------------------------ */

const SERVICES = [
  {
    name: '운영 콘솔',
    href: 'https://admin.bnbong.com',
    host: 'admin.bnbong.com',
    note: '등록된 서비스와 계정을 관리하는 화면입니다. 허가된 계정만 로그인할 수 있습니다.',
  },
  {
    name: '모니터링',
    href: 'https://monitoring.bnbong.com',
    host: 'monitoring.bnbong.com',
    note: '지표와 로그를 모아 보는 Grafana입니다. 별도 계정이 필요합니다.',
  },
  {
    name: 'ambiw',
    href: 'https://ambiw.bnbong.com',
    host: 'ambiw.bnbong.com',
    note: '개인 프로젝트로 운영 중인 서비스입니다.',
  },
  {
    name: 'Overlock',
    href: 'https://overlock.bnbong.com',
    host: 'overlock.bnbong.com',
    note: '개인 프로젝트로 운영 중인 서비스입니다.',
  },
]

const PILLARS = [
  {
    name: 'API 게이트웨이',
    note: '요청을 받아 각 서비스로 전달하고, 인증과 요청 제한을 한곳에서 처리합니다.',
  },
  {
    name: '인증 서버',
    note: '계정과 권한을 소유합니다. 토큰 발급과 검증이 여기서 이뤄집니다.',
  },
  {
    name: '관측',
    note: '지표와 로그를 모아 서비스 상태를 확인하고 변경 시점을 기록합니다.',
  },
]

const STACK = ['FastAPI', 'PostgreSQL', 'React', 'Nginx', 'Prometheus', 'Grafana', 'Terraform', 'Oracle Cloud']

function App() {
  return (
    <>
      <a className="skip-link" href="#main">
        본문으로 건너뛰기
      </a>
      <div className="page" id="main">
        <header>
          <p className="eyebrow">bnbong · personal cloud</p>
          <h1 className="site-title">
            작게 운영하는
            <br />
            개인 클라우드<span className="decor">.</span>
          </h1>
          <p className="lead">
            BNGdrasil은 개인 프로젝트를 한 인프라 위에서 운영하기 위해 만든 환경입니다. 게이트웨이와
            인증 서버를 공통으로 두고, 각 서비스는 그 뒤에서 독립적으로 동작합니다.
          </p>
          <div className="accent-bar" aria-hidden="true" />
        </header>

        <hr className="rule" />

        <section aria-labelledby="services-heading">
          <h2 className="section-title" id="services-heading">
            공개 서비스
          </h2>
          <p className="section-lead">
            아래 주소에서 각 서비스에 접근할 수 있습니다. 관리 화면과 모니터링은 권한이 있는 계정만
            사용할 수 있습니다.
          </p>
          <ul className="card-grid">
            {SERVICES.map((service) => (
              <li key={service.host}>
                <a className="card link-card" href={service.href}>
                  <span className="card-name">{service.name}</span>
                  <span className="card-note">
                    {service.note}
                  </span>
                  <span className="card-host">
                    {service.host}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>

        <hr className="rule" />

        <section aria-labelledby="structure-heading">
          <h2 className="section-title" id="structure-heading">
            구성
          </h2>
          <p className="section-lead">
            공통 계층 세 가지가 서비스를 떠받칩니다. 세부 구성과 내부 주소는 공개하지 않습니다.
          </p>
          <ul className="card-grid">
            {PILLARS.map((pillar) => (
              <li className="card" key={pillar.name}>
                <span className="card-name">{pillar.name}</span>
                <p className="card-note">{pillar.note}</p>
              </li>
            ))}
          </ul>
        </section>

        <hr className="rule" />

        <section aria-labelledby="stack-heading">
          <h2 className="section-title" id="stack-heading">
            사용 기술
          </h2>
          <ul className="stack-list">
            {STACK.map((item) => (
              <li className="chip" key={item}>
                {item}
              </li>
            ))}
          </ul>
        </section>

        <footer className="site-foot">
          <p>bnbong · BNGdrasil</p>
        </footer>
      </div>
    </>
  )
}

export default App
