# UV 패키지 매니저 사용 가이드

bnbong.xyz 프로젝트의 FastAPI 서비스들은 `uv` 패키지 매니저를 사용하여 가상환경을 분리해서 운영합니다.

## UV 설치

### macOS/Linux
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### Windows
```bash
powershell -c "irm https://astral.sh/uv/install.ps1 | iex"
```

## 기본 명령어

### 1. 가상환경 생성 및 의존성 설치

#### Gateway 서비스
```bash
cd gateway
uv sync  # 가상환경 생성 및 의존성 설치
```

#### Auth Server
```bash
cd auth-server
uv sync  # 가상환경 생성 및 의존성 설치
```

### 2. 가상환경 활성화

#### Gateway 서비스
```bash
cd gateway
source .venv/bin/activate  # macOS/Linux
# 또는
.venv\Scripts\activate     # Windows
```

#### Auth Server
```bash
cd auth-server
source .venv/bin/activate  # macOS/Linux
# 또는
.venv\Scripts\activate     # Windows
```

### 3. 개발 서버 실행

#### Gateway 서비스
```bash
cd gateway
uv run python -m src.main
# 또는
uv run uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
```

#### Auth Server
```bash
cd auth-server
uv run python -m src.main
# 또는
uv run uvicorn src.main:app --reload --host 0.0.0.0 --port 8001
```

## 개발 워크플로우

### 1. 새로운 의존성 추가

#### Gateway 서비스
```bash
cd gateway
uv add fastapi  # 프로덕션 의존성 추가
uv add --dev pytest  # 개발 의존성 추가
```

#### Auth Server
```bash
cd auth-server
uv add sqlalchemy  # 프로덕션 의존성 추가
uv add --dev black  # 개발 의존성 추가
```

### 2. 의존성 제거
```bash
uv remove package-name
```

### 3. 의존성 업데이트
```bash
uv sync --upgrade
```

### 4. 특정 패키지 업데이트
```bash
uv add package-name@latest
```

## 코드 품질 도구

### 1. 코드 포맷팅
```bash
# Black으로 코드 포맷팅
uv run black src/

# isort로 import 정렬
uv run isort src/
```

### 2. 린팅
```bash
# flake8으로 코드 검사
uv run flake8 src/

# mypy로 타입 검사
uv run mypy src/
```

### 3. 테스트 실행
```bash
# pytest로 테스트 실행
uv run pytest

# 커버리지와 함께 테스트
uv run pytest --cov=src
```

## 프로덕션 배포

### 1. requirements.txt 생성
```bash
# 프로덕션 의존성만 export
uv export --no-hashes > requirements.txt

# 모든 의존성 export (개발 의존성 포함)
uv export --no-hashes --all-extras > requirements.txt
```

### 2. Docker 빌드
```bash
# Docker 이미지 빌드
docker build -t gateway .
docker build -t auth-server .
```

## 환경별 설정

### 1. 개발 환경
```bash
# 환경 변수 설정
cp env.example .env
# .env 파일 편집

# 개발 서버 실행
uv run uvicorn src.main:app --reload
```

### 2. 프로덕션 환경
```bash
# 프로덕션 서버 실행
uv run uvicorn src.main:app --host 0.0.0.0 --port 8000
```

## 문제 해결

### 1. 가상환경 재생성
```bash
# 기존 가상환경 삭제
rm -rf .venv

# 새로 생성
uv sync
```

### 2. 의존성 충돌 해결
```bash
# 의존성 해결 상태 확인
uv tree

# 강제로 의존성 재설치
uv sync --reinstall
```

### 3. 캐시 클리어
```bash
# UV 캐시 클리어
uv cache clean
```

## 유용한 명령어 모음

### Gateway 서비스
```bash
cd gateway

# 개발 서버 실행
uv run uvicorn src.main:app --reload --host 0.0.0.0 --port 8000

# 테스트 실행
uv run pytest

# 코드 포맷팅
uv run black src/ && uv run isort src/

# 린팅
uv run flake8 src/ && uv run mypy src/
```

### Auth Server
```bash
cd auth-server

# 개발 서버 실행
uv run uvicorn src.main:app --reload --host 0.0.0.0 --port 8001

# 테스트 실행
uv run pytest

# 코드 포맷팅
uv run black src/ && uv run isort src/

# 린팅
uv run flake8 src/ && uv run mypy src/
```

## 스크립트 예제

### 개발 시작 스크립트 (gateway/dev.sh)
```bash
#!/bin/bash
cd gateway
source .venv/bin/activate
uv run uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
```

### 개발 시작 스크립트 (auth-server/dev.sh)
```bash
#!/bin/bash
cd auth-server
source .venv/bin/activate
uv run uvicorn src.main:app --reload --host 0.0.0.0 --port 8001
```

## 참고 자료

- [UV 공식 문서](https://docs.astral.sh/uv/)
- [UV GitHub](https://github.com/astral-sh/uv)
- [FastAPI 문서](https://fastapi.tiangolo.com/)
- [Uvicorn 문서](https://www.uvicorn.org/)
