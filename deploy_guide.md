# Private VM Deployment Guide

이 문서는 하나의 사설망 VM에 PostgreSQL, FastAPI 백엔드, React 프런트엔드를 Docker 컨테이너로 배포하는 방법을 설명한다.

예시에서 VM의 사설 IP는 `192.168.0.50`으로 가정한다. 실제 배포 시 자신의 VM IP로 변경해야 한다.

## 1. 배포 구조

```text
사용자
  └── http://192.168.0.50:80
        └── frontend (Nginx + React)
              ├── /          -> React SPA
              ├── /api/*     -> backend:8000
              ├── /docs      -> backend:8000
              └── /redoc     -> backend:8000
                                      └── db:5432
```

외부에는 프런트엔드의 `80` 포트만 공개한다. FastAPI `8000`, PostgreSQL `5432`는 Docker 내부 네트워크에서만 사용한다.

## 2. 사전 요구 사항

- 사용자 PC와 VM이 같은 사설망에 있거나 VPN으로 연결되어 있어야 한다.
- VM에 Docker Engine과 Docker Compose 플러그인이 설치되어 있어야 한다.
- VM에서 프로젝트 저장소에 접근할 수 있어야 한다.
- VM의 사설 IP는 고정 IP로 설정하거나 DHCP 예약으로 고정하는 것이 좋다.

설치 확인:

```bash
docker version
docker compose version
```

Docker 명령이 권한 오류로 실패하면 현재 사용자를 `docker` 그룹에 추가한 후 로그아웃·로그인한다.

```bash
sudo usermod -aG docker "$USER"
```

## 3. 프로젝트 배치

예시 배포 경로는 `/opt/admin-fullstack`이다.

```bash
sudo mkdir -p /opt/admin-fullstack
sudo chown "$USER":"$USER" /opt/admin-fullstack
git clone <REPOSITORY_URL> /opt/admin-fullstack
cd /opt/admin-fullstack
```

이미 저장소가 있다면 해당 경로로 이동한다.

## 4. 환경변수 설정

프로젝트 루트의 `.env`를 다음 형태로 설정한다.

```dotenv
# Application
ENVIRONMENT=production
PROJECT_NAME=Admin Fullstack
STACK_NAME=admin-private

# Private frontend address
FRONTEND_HOST=http://192.168.0.50
BACKEND_CORS_ORIGINS=http://192.168.0.50

# Authentication
SECRET_KEY=REPLACE_WITH_RANDOM_SECRET
ACCESS_TOKEN_EXPIRE_MINUTES=11520

# Initial administrator
FIRST_SUPERUSER=admin@example.com
FIRST_SUPERUSER_PASSWORD=REPLACE_WITH_STRONG_ADMIN_PASSWORD

# PostgreSQL
POSTGRES_SERVER=db
POSTGRES_PORT=5432
POSTGRES_DB=app
POSTGRES_USER=app
POSTGRES_PASSWORD=REPLACE_WITH_STRONG_DATABASE_PASSWORD

# Container images
DOCKER_IMAGE_BACKEND=admin-backend
DOCKER_IMAGE_FRONTEND=admin-frontend
TAG=latest

# Frontend build-time settings
# Empty means that the browser uses the current origin.
VITE_API_URL=
VITE_APP_ENV=production

# Email (leave empty when unused)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_TLS=true
SMTP_SSL=false
EMAILS_FROM_EMAIL=

# Monitoring (leave empty when unused)
SENTRY_DSN=
```

`SECRET_KEY`, `FIRST_SUPERUSER_PASSWORD`, `POSTGRES_PASSWORD`는 반드시 기본값이 아닌 서로 다른 값을 사용한다. 임의의 비밀 키는 다음 명령으로 생성할 수 있다.

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```

`.env` 파일의 읽기 권한을 제한한다.

```bash
chmod 600 .env
```

> `.env`는 비밀번호를 포함하므로 Git에 커밋하지 않는다. 이미 외부 저장소에 올라간 비밀값이 있다면 해당 값을 모두 교체한다.

## 5. Nginx 설정

`frontend/nginx.conf`를 다음과 같이 설정한다.

```nginx
server {
    listen 80 default_server;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    location /api/ {
        proxy_pass http://backend:8000;

        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_connect_timeout 10s;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }

    location /docs {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /redoc {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

## 6. 프런트엔드 이미지 설정

`frontend/Dockerfile`을 다음과 같이 설정한다.

```dockerfile
FROM oven/bun:1 AS build-stage

WORKDIR /app

COPY package.json bun.lock ./
COPY frontend/package.json ./frontend/package.json

RUN bun install --frozen-lockfile

COPY frontend ./frontend

WORKDIR /app/frontend

ARG VITE_API_URL=""
ARG VITE_APP_ENV="production"

RUN bun run build


FROM nginx:1-alpine

COPY --from=build-stage /app/frontend/dist/ /usr/share/nginx/html/
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
```

기존 `frontend/nginx-backend-not-found.conf`는 `/api`를 404로 처리하므로 운영 이미지에 복사하지 않는다. `VITE_API_URL`을 빈 문자열로 빌드하면 프런트엔드의 API 요청이 현재 접속 주소의 `/api/v1/...`로 전송된다.

## 7. 백엔드 이미지 설정

기존 `backend/Dockerfile`을 그대로 사용한다. 현재 이미지는 다음 명령으로 FastAPI를 실행한다.

```dockerfile
CMD ["fastapi", "run", "--workers", "4"]
```

VM CPU가 적은 경우 `compose.ip.yml`의 `backend`에 다음과 같이 워커 수를 재정의할 수 있다.

```yaml
command: ["fastapi", "run", "--workers", "2"]
```

## 8. 단일 VM용 Compose 설정

프로젝트 루트에 `compose.ip.yml`을 생성한다.

```yaml
name: ${STACK_NAME:-admin-private}

services:
  db:
    image: postgis/postgis:18-3.6
    restart: always
    environment:
      PGDATA: /var/lib/postgresql/data/pgdata
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - app-db-data:/var/lib/postgresql/data/pgdata
    healthcheck:
      test:
        - CMD-SHELL
        - pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s

  prestart:
    image: ${DOCKER_IMAGE_BACKEND:-admin-backend}:${TAG:-latest}
    build:
      context: .
      dockerfile: backend/Dockerfile
    env_file:
      - .env
    command: ["bash", "scripts/prestart.sh"]
    restart: "no"
    depends_on:
      db:
        condition: service_healthy

  backend:
    image: ${DOCKER_IMAGE_BACKEND:-admin-backend}:${TAG:-latest}
    restart: always
    build:
      context: .
      dockerfile: backend/Dockerfile
    env_file:
      - .env
    depends_on:
      db:
        condition: service_healthy
      prestart:
        condition: service_completed_successfully
    expose:
      - "8000"
    healthcheck:
      test:
        - CMD
        - curl
        - -f
        - http://localhost:8000/api/v1/utils/health-check/
      interval: 10s
      timeout: 5s
      retries: 5

  frontend:
    image: ${DOCKER_IMAGE_FRONTEND:-admin-frontend}:${TAG:-latest}
    restart: always
    build:
      context: .
      dockerfile: frontend/Dockerfile
      args:
        VITE_API_URL: ${VITE_API_URL:-}
        VITE_APP_ENV: ${VITE_APP_ENV:-production}
    depends_on:
      backend:
        condition: service_healthy
    ports:
      - "80:80"

volumes:
  app-db-data:
```

별도의 `networks` 설정은 필요하지 않다. Compose가 기본 내부 네트워크를 생성하며, 컨테이너는 서비스 이름으로 통신한다.

```text
frontend -> backend:8000
backend  -> db:5432
```

## 9. 배포 전 검사

Compose 문법과 필수 환경변수를 검사한다.

```bash
docker compose -f compose.ip.yml config --quiet
```

VM의 80번 포트가 이미 사용 중인지 확인한다.

```bash
sudo ss -lntp | grep ':80 '
```

기존 Apache, Nginx 또는 다른 서비스가 80번 포트를 사용하고 있다면 먼저 충돌을 해결한다.

## 10. 이미지 빌드

전체 이미지를 빌드한다.

```bash
docker compose -f compose.ip.yml build
```

개별 빌드가 필요하면 다음 명령을 사용한다.

```bash
docker compose -f compose.ip.yml build backend
docker compose -f compose.ip.yml build frontend
```

## 11. 서비스 실행

```bash
docker compose -f compose.ip.yml up -d
```

Compose는 다음 순서를 보장한다.

1. PostgreSQL을 시작하고 health check를 통과할 때까지 대기한다.
2. `prestart`가 Alembic 마이그레이션과 초기 관리자 생성을 수행한다.
3. `prestart`가 성공하면 FastAPI 백엔드를 시작한다.
4. 백엔드 health check가 통과하면 Nginx 프런트엔드를 시작한다.

## 12. 상태와 로그 확인

```bash
docker compose -f compose.ip.yml ps
```

```bash
docker compose -f compose.ip.yml logs --tail=100 db
docker compose -f compose.ip.yml logs --tail=100 prestart
docker compose -f compose.ip.yml logs --tail=100 backend
docker compose -f compose.ip.yml logs --tail=100 frontend
```

`prestart`는 작업 완료 후 `Exited (0)` 상태가 되는 것이 정상이다. `db`, `backend`, `frontend`는 실행 상태여야 한다.

## 13. 동작 확인

VM 내부에서 프런트엔드를 확인한다.

```bash
curl -I http://127.0.0.1/
```

Nginx를 통한 백엔드 health check를 확인한다.

```bash
curl http://127.0.0.1/api/v1/utils/health-check/
```

정상인 경우 다음 응답이 반환된다.

```text
true
```

사용자 PC의 브라우저에서 다음 주소로 접속한다.

```text
관리 화면: http://192.168.0.50/
API 문서: http://192.168.0.50/docs
```

초기 로그인 정보는 `.env`의 `FIRST_SUPERUSER`, `FIRST_SUPERUSER_PASSWORD`다.

## 14. 방화벽

사용자 대역이 `192.168.0.0/24`라면 80번 포트를 해당 대역에만 허용한다.

```bash
sudo ufw allow from 192.168.0.0/24 to any port 80 proto tcp
sudo ufw allow from <ADMIN_IP> to any port 22 proto tcp
sudo ufw enable
sudo ufw status
```

다음 포트는 VM 방화벽과 클라우드 보안 그룹에서 외부 접근을 허용하지 않는다.

```text
5432  PostgreSQL
8000  FastAPI
8080  Adminer
```

UFW를 활성화하기 전에 SSH 허용 규칙이 올바른지 반드시 확인한다.

## 15. 코드 업데이트

```bash
cd /opt/admin-fullstack
git pull
docker compose -f compose.ip.yml build
docker compose -f compose.ip.yml up -d
docker compose -f compose.ip.yml ps
```

프런트엔드 코드 또는 `VITE_*` 값을 변경했다면 반드시 프런트엔드 이미지를 다시 빌드한다. 백엔드 시작 전에 `prestart`가 마이그레이션을 다시 적용한다.

## 16. 중지와 재시작

서비스 중지:

```bash
docker compose -f compose.ip.yml stop
```

서비스 재시작:

```bash
docker compose -f compose.ip.yml start
```

컨테이너 제거:

```bash
docker compose -f compose.ip.yml down
```

> 운영 환경에서 `docker compose down -v`를 실행하지 않는다. `-v`를 사용하면 PostgreSQL 데이터가 저장된 `app-db-data` 볼륨까지 삭제된다.

## 17. 데이터베이스 백업

백업 파일을 저장할 디렉터리를 준비한 후 PostgreSQL 백업을 생성한다.

```bash
mkdir -p backups
docker compose -f compose.ip.yml exec -T db \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc \
  > backups/app.dump
```

`.env` 값을 현재 셀에 export하지 않았다면 백업 명령에 사용할 DB 사용자와 DB 이름을 직접 지정한다.

```bash
docker compose -f compose.ip.yml exec -T db \
  pg_dump -U app -d app -Fc \
  > backups/app.dump
```

## 18. 주요 문제 해결

### 프런트엔드는 열리지만 API 요청이 404인 경우

- `frontend/nginx.conf`의 `/api/` proxy 설정을 확인한다.
- `frontend/Dockerfile`이 `nginx-backend-not-found.conf`를 복사하지 않는지 확인한다.
- 프런트엔드 이미지를 다시 빌드한다.

```bash
docker compose -f compose.ip.yml build frontend
docker compose -f compose.ip.yml up -d frontend
```

### 백엔드가 시작되지 않는 경우

```bash
docker compose -f compose.ip.yml logs --tail=200 prestart
docker compose -f compose.ip.yml logs --tail=200 backend
docker compose -f compose.ip.yml logs --tail=200 db
```

`.env`의 `POSTGRES_*`, `SECRET_KEY`, `FIRST_SUPERUSER_*` 값을 확인한다. `ENVIRONMENT=production`에서 `changethis`를 사용하면 백엔드 설정 검증이 실패한다.

### 다른 PC에서 접속할 수 없는 경우

- 사용자 PC와 VM의 사설망 라우팅을 확인한다.
- VM 방화벽의 80번 포트 허용 대역을 확인한다.
- 클라우드 VM이면 보안 그룹과 네트워크 ACL도 확인한다.
- `docker compose -f compose.ip.yml ps`에서 `frontend`의 `0.0.0.0:80->80/tcp` 표시를 확인한다.

## 19. 보안 참고

사설망이더라도 중요한 인증 정보를 다룬다면 HTTPS 적용을 권장한다. HTTP를 사용할 경우 사용자 대역을 방화벽으로 제한하고, VM을 공인 인터넷에 직접 노출하지 않는다.
