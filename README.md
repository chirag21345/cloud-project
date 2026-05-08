# QPC IPChecker — Cloud Computing Coursework

A polyglot microservice IP-address checker built for **CSC3065 Cloud Computing (QUB, 2025/26)**.
Started from a small PHP base (frontend + two counting services) provided by the module team
and extended into a 10-service distributed system with a custom reverse proxy, monitoring
service, stateful persistence, and CI tests across five languages.

> The base frontend, `ipchecker-totalips`, and `ipchecker-totalemptyips` services were provided
> by the module organiser. Everything else in this repo (services, proxy, monitor, store, CI,
> tests, dockerisation, error-handling improvements) is my own work.

---

## Architecture

```
                            ┌─────────────────────────────┐
                            │       ipchecker-frontend    │
                            │     (PHP + HTML/JS, :80)    │
                            │  - external config.js       │
                            │  - multi-URL round-robin    │
                            │  - timeout + failover       │
                            └──────────────┬──────────────┘
                                           │  XHR
                                           ▼
                            ┌─────────────────────────────┐
                            │       ipchecker-proxy       │
                            │     (Node/Express, :8090)   │
                            │  - dynamic config.json      │
                            │  - ROUTES_JSON env override │
                            │  - bearer-token admin API   │
                            │  - SSRF-guarded probe       │
                            │  - round-robin + failover   │
                            └──┬───┬───┬───┬───┬───┬───┬──┘
                               │   │   │   │   │   │   │
        ┌──────────────────────┘   │   │   │   │   │   └──────────────────────┐
        ▼                          ▼   ▼   ▼   ▼   ▼                          ▼
  ┌───────────┐  ┌──────────────────┐ ┌────────────┐ ┌─────────┐  ┌──────────────────┐
  │ totalips  │  │ totalemptyips    │ │ totalvalid │ │classify │  │   country-fn     │
  │  PHP :80  │  │     PHP :80      │ │ Python :80 │ │Node :80 │  │ Node FaaS-shape  │
  └───────────┘  └──────────────────┘ └────────────┘ └─────────┘  └──────────────────┘
                                              ┌─────────┐  ┌──────────────────┐
                                              │ badips  │  │  ipchecker-store │
                                              │Java :80 │  │  Node :8087      │
                                              │ Spring  │  │  (stateful)      │
                                              └─────────┘  └──────────────────┘

                            ┌─────────────────────────────┐
                            │     ipchecker-monitor       │
                            │     (Python/Flask, :8070)   │
                            │  - random IP probes         │
                            │  - correctness + latency    │
                            │  - email + webhook alerts   │
                            │  - Prometheus /metrics      │
                            └─────────────────────────────┘
```

---

## Service map

| Service | Language / runtime | Role | Source |
|---|---|---|---|
| [ipchecker-frontend/](ipchecker-frontend/) | PHP 8.3 + Apache + JS | UI, multi-URL XHR client with failover | extended from base |
| [ipchecker-proxy/](ipchecker-proxy/) | Node 18 / Express | Reverse proxy with dynamic config + admin API | **mine** |
| [ipchecker-totalips/](ipchecker-totalips/) | PHP 7.4 | Count total IP entries | base, error handling added |
| [ipchecker-totalemptyips/](ipchecker-totalemptyips/) | PHP 7.4 | Count empty entries | base, error handling added |
| [ipchecker-totalvalidips/](ipchecker-totalvalidips/) | Python 3.11 / Flask | Validate IPv4 + IPv6 | **mine — Task A.I** |
| [ipchecker-classifyips/](ipchecker-classifyips/) | Node 18 / Express | Bucket addresses into v4 vs v6 | **mine — Task A.II** |
| [country-fn/](country-fn/) | Node 18, FaaS-style handler | Country lookup (US/UK/China) | **mine — Task A.III, FaaS paradigm** |
| [ipchecker-badips-java/](ipchecker-badips-java/) | Java 21 / Spring Boot 3 | Match against bad-IP list | **mine — Task A.IV** |
| [ipchecker-store/](ipchecker-store/) | Node 18 / Express | Save/load IPs by short ID | **mine — Task E** |
| [ipchecker-monitor/](ipchecker-monitor/) | Python 3.11 / Flask | Periodic health + correctness checks | **mine — Task D** |

Five distinct languages: PHP, Python, Node.js, Java — plus a Function-as-a-Service handler shape in `country-fn`.

---

## What I added per assignment task

### Task A — four new functions
1. **Total valid IPs** — Python/Flask. IPv4 validated as 4 dotted groups, IPv6 as 2–8 colon groups. Empty entries reported as invalid. ([app.py](ipchecker-totalvalidips/app.py))
2. **Classify v4/v6** — Node/Express. Returns `{ipv4: [...], ipv6: [...]}`. ([index.js](ipchecker-classifyips/index.js))
3. **Country** — Node, written as an AWS-Lambda-style `exports.handler` so it could be deployed as FaaS, with a small Express runner for local/Docker use. ([index.js](country-fn/index.js))
4. **Bad IPs** — Java + Spring Boot 3 on JDK 21. Returns per-IP status plus `total_bad_ips`. ([BadIpsController.java](ipchecker-badips-java/src/main/java/com/ipchecker/badips/BadIpsController.java))

### Task B — improvements over the base
- **Frontend error handling**: empty-input check, 4 s XHR timeout, JSON `error/message` surfaced to the user, generic fallback when all retries fail. ([index.html lines 27–81](ipchecker-frontend/src/index.html))
- **Multi-URL config + round-robin**: frontend loads endpoints from external [config.js](ipchecker-frontend/src/config.js) as arrays, rotates per-call, falls over on any non-200/network error.
- **Backend validation**: each provided PHP service now returns 400 + JSON error on missing/empty `items` (added in [totalips/src/index.php](ipchecker-totalips/src/index.php) and [totalemptyips/src/index.php](ipchecker-totalemptyips/src/index.php)).
- **CI for every backend**: `.gitlab-ci.yml` runs PHP unit + HTTP tests, pytest, npm tests, JUnit via Maven, and a Python lint stage for the monitor.

### Task C — custom reverse proxy ([ipchecker-proxy/](ipchecker-proxy/))
- Routes loaded from [config.json](ipchecker-proxy/config.json), hot-reloaded via `fs.watch`, overridable via `ROUTES_JSON` env.
- **Dynamic admin API** behind a bearer token: `GET /admin/add`, `/remove`, `/reload`, `/probe`; `POST /routes` for full table updates.
- **Service discovery**: `/admin/probe?target=…` HEADs the URL and registers it on success.
- **SSRF guard**: probe rejects loopback, RFC 1918, link-local, and `*.internal` targets.
- **Failover**: round-robin per service; on connection error or non-2xx, the next target is tried before any error is returned to the caller.

### Task D — monitor ([ipchecker-monitor/monitor.py](ipchecker-monitor/monitor.py))
- Builds a randomised input set (mix of valid IPv4/IPv6 and deliberately invalid entries) on every cycle.
- Calls all six functions through the proxy and **checks results against expected values** (not just HTTP 200).
- Records `duration_ms` per check.
- **Periodic** via a daemon thread (default 60 s, env-controlled) plus on-demand `/run`.
- Exposes Prometheus-format `/metrics` (`ipchecker_check_ok{service=…}`, `ipchecker_latency_ms{service=…}`, plus a `ipchecker_monitor_ready` gauge so the first scrape never blocks).
- Alert hooks: SMTP email and HTTP webhook on any failed cycle.

A local Prometheus + Grafana stack is wired in [docker-compose-monitor.yml](docker-compose-monitor.yml) with the datasource auto-provisioned in [monitoring/grafana-provisioning/](monitoring/grafana-provisioning/).

### Task E — stateful saving ([ipchecker-store/index.js](ipchecker-store/index.js))
- `GET /?op=save&items=…` returns `{id}` (8-hex token); `GET /?op=load&id=…` returns the stored items.
- Persists to `data/store.json` with a `VOLUME` directive in the Dockerfile so saved IDs survive container restarts.
- Returns 400 / 404 for missing / unknown inputs.

### Task F — multi-vendor architecture
Design-only; not implemented in code. Lives in the report.

---

## Run it locally

Each service is independently runnable. Quickest way to see the whole pipeline:

```bash
# in separate terminals

# four Task A backends
PORT=18083 python3 ipchecker-totalvalidips/app.py
PORT=18084 node ipchecker-classifyips/index.js
PORT=18085 node country-fn/index.js
cd ipchecker-badips-java && mvn spring-boot:run -Dspring-boot.run.arguments="--server.port=18086"

# stateful store
PORT=18087 node ipchecker-store/index.js

# proxy in front of them
ROUTES_JSON='{"totalvalid":["http://127.0.0.1:18083/"],"classify":["http://127.0.0.1:18084/"],"country":["http://127.0.0.1:18085/"],"badips":["http://127.0.0.1:18086/"],"store":["http://127.0.0.1:18087/"]}' \
ADMIN_TOKEN=dev PORT=18090 node ipchecker-proxy/index.js

# monitor pointed at the proxy
BASE_URL=http://127.0.0.1:18090 MONITOR_INTERVAL=10 python3 ipchecker-monitor/monitor.py
```

Try it:

```bash
curl 'http://127.0.0.1:18090/classify?items=1.1.1.1,2a00::1,foo'
curl 'http://127.0.0.1:18090/badips?items=101.201.301.401,1.1.1.1'
curl 'http://127.0.0.1:18090/store?op=save&items=1.1.1.1,2.2.2.2'
curl 'http://127.0.0.1:8070/metrics'
```

Or build all images:

```bash
for d in ipchecker-*/ country-fn/; do
  docker build -t "${d%/}" "$d"
done
```

Local Prometheus + Grafana:

```bash
docker compose -f docker-compose-monitor.yml up -d
# Prometheus  http://localhost:9090
# Grafana     http://localhost:3000  (admin / admin)
```

---

## Tests

Unit + HTTP tests run in CI for every backend. Locally:

```bash
cd ipchecker-classifyips && npm test                       # Node assertions
cd country-fn && npm test                                  # Node assertions
cd ipchecker-totalvalidips && python3 -m pytest            # 3 pytest cases
cd ipchecker-badips-java && mvn test                       # 2 JUnit / Spring tests
cd ipchecker-totalips && sh test.sh                        # PHP unit + HTTP
cd ipchecker-totalemptyips && sh test.sh                   # PHP unit + HTTP
```

CI definition: [.gitlab-ci.yml](.gitlab-ci.yml).

---

## Repository layout

```
.
├── ipchecker-frontend/        # PHP+JS UI (extended from base)
├── ipchecker-proxy/           # custom reverse proxy with dynamic admin API
├── ipchecker-totalips/        # provided base (PHP), error handling added
├── ipchecker-totalemptyips/   # provided base (PHP), error handling added
├── ipchecker-totalvalidips/   # Task A.I  — Python / Flask
├── ipchecker-classifyips/     # Task A.II — Node / Express
├── country-fn/                # Task A.III — Node, FaaS-style handler
├── ipchecker-badips-java/     # Task A.IV — Java 21 / Spring Boot
├── ipchecker-store/           # Task E    — Node, stateful save/load
├── ipchecker-monitor/         # Task D    — Python monitor + Prometheus exporter
├── monitoring/                # Prometheus config + Grafana datasource provisioning
├── docker-compose-monitor.yml # local Prometheus + Grafana stack
└── .gitlab-ci.yml             # CI pipeline (per-service test jobs)
```

---

## Acknowledgements

- Base `ipchecker-frontend`, `ipchecker-totalips`, and `ipchecker-totalemptyips` provided by
  Esha Barlaskar / David Cutting as part of CSC3065 at Queen's University Belfast.
- AI assistance was used during development for code review, debugging, and refactoring;
  this is acknowledged in the report submitted with the assignment.
