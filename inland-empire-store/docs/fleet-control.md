# Fleet Control (`fleetctl`)

One-command remote control of the Anstelias fleet, run **from your local
computer** (laptop/desktop on the LAN or Tailscale tailnet).

> This must be run from a machine on your network. A cloud/CI sandbox cannot
> reach `192.168.5.x` or the tailnet, so `fleetctl` only works locally.

## Prerequisites

- `ssh` (and `rsync` for `deploy`/`import`) installed locally.
- Key-based SSH to each host as `andrew` (recommended): `ssh-copy-id andrew@192.168.5.33`, etc.
- Connectivity: on your LAN use the defaults; when away, use Tailscale with `FLEET_NET=ts`.

## Hosts

| Alias | LAN | Tailscale | Role |
|-------|-----|-----------|------|
| `anstelias` | 192.168.5.33 | 192.168.5.33 | Production store |
| `builder` | 192.168.5.29 | 100.110.40.108 | Staging, CI, Ollama |
| `watcher` | 192.168.5.26 | 100.85.38.3 | Monitoring |
| `ops` | 192.168.5.30 | 100.103.12.2 | Importer / OCR |
| `utility` | 192.168.5.23 | 100.112.51.11 | Pi-hole / Tailscale |

## Commands

```bash
cd inland-empire-store

./scripts/fleetctl.sh ping                 # which hosts are up (colored ●/○)
./scripts/fleetctl.sh status               # uptime + docker containers per host
./scripts/fleetctl.sh ssh builder          # interactive shell into a host
./scripts/fleetctl.sh run all -- 'df -h /' # run a command on all (or one) host
./scripts/fleetctl.sh deploy production     # deploy store -> anstelias (.33)
./scripts/fleetctl.sh deploy staging        # deploy store -> builder (.29)
./scripts/fleetctl.sh store ps              # docker compose ps on the store host
./scripts/fleetctl.sh store logs            # tail store logs (Ctrl-C to stop)
./scripts/fleetctl.sh store restart         # restart the store stack
./scripts/fleetctl.sh health               # GET /?ie-health=1 on the store host
./scripts/fleetctl.sh backup               # run backup.sh on the store host
./scripts/fleetctl.sh import ./ebay.csv     # copy CSV to store + DRY-RUN import
./scripts/fleetctl.sh import ./ebay.csv --real   # ...and import for real
```

## Environment overrides

| Var | Default | Purpose |
|-----|---------|---------|
| `SSH_USER` | `andrew` | SSH login user |
| `FLEET_NET` | `lan` | `ts` to use Tailscale IPs (when off-LAN) |
| `STORE_HOST` | `anstelias` | set to `builder` to target staging |
| `REMOTE_DIR` | `/opt/inland-empire-store` | project path on hosts |
| `HTTP_PORT` | `8080` | store HTTP port (for `health`) |

Example (remote, over Tailscale, targeting staging):

```bash
FLEET_NET=ts STORE_HOST=builder ./scripts/fleetctl.sh status
```

## First-time setup on a host

```bash
ssh andrew@192.168.5.33 'sudo mkdir -p /opt/inland-empire-store && sudo chown $USER /opt/inland-empire-store'
scp .env andrew@192.168.5.33:/opt/inland-empire-store/.env     # edit secrets on the host
./scripts/fleetctl.sh deploy production
```
