<p align="center">
    <img align="top" width="30%" src="https://raw.githubusercontent.com/BNGdrasil/.github/main/images/Bantheon.png" alt="Bantheon"/>
</p>

<div align="center">

# Bantheon (Bnbong + pantheon)

**BNGdrasil의 웹 클라이언트와 VM1 Nginx 설정**

![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?style=flat-square&logo=vite&logoColor=white)
![Nginx](https://img.shields.io/badge/Nginx-alpine-009639?style=flat-square&logo=nginx&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white)

*[BNGdrasil](https://github.com/BNGdrasil) 생태계의 일부입니다*

</div>

---

## 소개

Bantheon은 BNGdrasil의 웹 클라이언트 저장소입니다. VM1의 정적 사이트와 Nginx 설정을 담고 있습니다. client는 포트폴리오, admin은 관리자 콘솔입니다. Bifrost와 Bidar로 요청을 전달합니다.

## 구성

| 경로 | 내용 |
|---|---|
| `client/` | 공개 포트폴리오 사이트 |
| `admin/` | 관리자 콘솔 |
| `nginx/` | VM1 Nginx 설정 |
| `scripts/` | 배포 스크립트 |
| `docs/` | 상세 문서 |
| `docker-compose.yml` | Nginx 컨테이너 정의 |

## 빠른 시작

Node.js 22 이상이 필요합니다.

```bash
cd admin   # 또는 client
npm ci
npm run dev -- --host
npm run build
```

## 문서

| 문서 | 내용 |
|---|---|
| [관리자 콘솔](docs/admin-console.md) | 화면과 API, 권한 경계 |
| [Nginx 설정](docs/nginx.md) | 도메인 처리와 캐시 정책 |
| [배포 가이드](docs/deployment.md) | CI 워크플로와 롤백 |
| [로컬 개발](docs/development.md) | 환경 변수와 빌드 |
| [Nginx 기준선](docs/nginx-baseline.md) | 운영 설정 병합 기록 |

## 관련 프로젝트

- [Bidar](https://github.com/BNGdrasil/Bidar): 인증 서버
- [Bifrost](https://github.com/BNGdrasil/Bifrost): API 게이트웨이
- [Baedalus](https://github.com/BNGdrasil/Baedalus): 인프라 코드와 운영 도구
