# Qianchang server deployment

This deployment uses this repository's Endspace theme and the existing Notion database. No content is exported or hardcoded. Node 22 runs the Next.js standalone server with ISR, blocking fallback routes and APIs.

## Installed layout

- `/opt/notionnext/repo`: upstream Git checkout; deployments use `git archive`, never local untracked files.
- `/opt/notionnext/deploy.sh`: root-owned trusted deployment entry point, installed from `deploy/deploy.sh`.
- `/opt/notionnext/build.env`: build-time settings; root-owned, 0600, passed through a BuildKit secret mount.
- `/opt/notionnext/runtime.env`: runtime settings and generated revalidation token; root-owned, 0600.
- `/opt/notionnext/releases/<SHA>`: versioned source and Compose manifests.
- `/opt/notionnext/logs`: deployment logs, also streamed to the SSH caller / GitHub Actions.
- `/opt/notionnext/state/active`: active slot and commit; `history` records successful switches.
- `/opt/notionnext/health-paths.json`: local list of important routes to check before switching.
- `/opt/notionnext/gateway`: small nginx forwarding container, stable upstream `127.0.0.1:3080`.

The application slots use `127.0.0.1:3000` and `127.0.0.1:3001`. Neither is published on the public interface. Containers bind `0.0.0.0:3000` internally. Set the 1Panel/OpenResty website reverse proxy to `http://127.0.0.1:3080` when OpenResty uses host networking. If OpenResty uses bridge networking, configure a dedicated shared Docker network / reachable private upstream first; loopback inside its container is not the host. Do not expose the application ports publicly to fix this.

Do not enable a proxy HTML/API cache. Preserve Host and X-Forwarded-* headers. Configure TLS in 1Panel after the domain is supplied and DNS resolves. Keep Netlify running until acceptance is complete.

## First installation

An administrator installs the files under `/opt/notionnext`, the dedicated SSH account and forced-command gate. The deployment account must not belong to the Docker group. Install the root-owned gate as `/usr/local/sbin/notionnext-ssh-gate`, and grant only `/opt/notionnext/deploy.sh` through sudo. Put the public deployment key in `~notiondeploy/.ssh/authorized_keys` with:

```
restrict,command="/usr/local/sbin/notionnext-ssh-gate" ssh-ed25519 PUBLIC_KEY
```

The SSH account only accepts `deploy <40-character lowercase SHA>`. The root-owned deployment script validates the argument again and checks that the commit belongs to upstream main. No PR or self-hosted runner executes on this server. Changes to trusted installed deployment helpers require an administrator to review and reinstall them; deployments do not silently replace their own privileged entry point.

Copy the example build and runtime environment files outside the checkout. Generate REVALIDATION_TOKEN on the server. Do not use Docker build arguments for secrets. Optional Notion credentials must also stay outside Git. Keep build-only secrets out of runtime/browser bundles; never use NEXT_PUBLIC_* for credentials.

## GitHub Actions secrets

Repository Settings → Secrets and variables → Actions → New repository secret:

| Name | Value |
| --- | --- |
| DEPLOY_HOST | Server public address or final SSH hostname |
| DEPLOY_PORT | SSH port, currently 22 |
| DEPLOY_USER | notiondeploy |
| DEPLOY_SSH_KEY | Dedicated private key, copied securely from `/opt/notionnext/secrets/actions_ed25519` |
| DEPLOY_KNOWN_HOSTS | Verified known_hosts entry from `/opt/notionnext/secrets/known_hosts` |

Verify the public host-key fingerprint directly on the server using `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`. Do not populate trust using an unverified network scan. If the SSH hostname or port changes, regenerate the matching known_hosts entry. The generated key is retained only for initial provisioning; after recording it in GitHub Secrets, remove the server-side private copy when local SSH deployment tests are finished.

The workflow runs on push to main and Actions → Deploy blog → Run workflow (select main). It streams build and deployment logs. Hosted ubuntu runners have no repository write permissions and do not need to check out code. A GitHub concurrency group and server `flock` serialize deployments.

## Deploy and roll back

```bash
# Deploy an exact commit that belongs to main (as administrator):
/opt/notionnext/deploy.sh FULL_SHA

# Quick rollback without building or accessing GitHub:
/opt/notionnext/deploy.sh --rollback RETAINED_FULL_SHA

# Active version / successful history:
cat /opt/notionnext/state/active
cat /opt/notionnext/state/history

# Logs and containers:
docker ps --filter name=notionnext
docker logs --tail 100 notionnext-blue-app-1
docker logs --tail 100 notionnext-green-app-1
docker logs --tail 100 notionnext-gateway-gateway-1
ls -lt /opt/notionnext/logs

# Stop/start the stable entry point (application slots continue running):
docker compose -p notionnext-gateway -f /opt/notionnext/gateway/compose.yml stop
docker compose -p notionnext-gateway -f /opt/notionnext/gateway/compose.yml start
```

The script builds first, starts the inactive slot, checks homepage and configured routes, switches nginx and checks again. Startup/check/reload failures before commit restore the previous gateway route. The previous slot remains available. It retains five successful distinct image versions; images referenced by containers remain protected by Docker. No global Docker prune runs and other applications are untouched. Application and gateway containers restart with Docker (`unless-stopped`), and Docker must remain enabled at boot. An intentionally stopped container stays stopped after reboot.

For an application slot, find its SHA and port using `state/active` / `history`, then use:

```bash
IMAGE_TAG=FULL_SHA APP_PORT=3000 docker compose -p notionnext-blue -f /opt/notionnext/releases/FULL_SHA/deploy/compose.yml stop app
IMAGE_TAG=FULL_SHA APP_PORT=3000 docker compose -p notionnext-blue -f /opt/notionnext/releases/FULL_SHA/deploy/compose.yml up -d app
```

Use port 3001 and project notionnext-green for green. Container logs rotate at 10 MiB × 3 per container. Deployment log rotation is handled by `/etc/logrotate.d/notionnext-deploy` on this installation. Image/build caches consume additional disk: monitor `df -h` and `docker system df`; do not prune unrelated workloads.

## Notion updates and caches

`VERCEL_ENV=production` explicitly selects the repository's production cache behavior. `ENABLE_CACHE=true` enables bounded production memory caching (default 10 minutes) without requiring Redis. File cache is used during builds; production runtime does not read the build file cache in this configuration. Next.js ISR is 60 seconds unless overridden by Notion site settings. Updates are request-driven and may take longer than one ISR interval while the data cache is valid. Idle pages regenerate on subsequent requests; no deploy is required.

`lib/build/staticPaths.js` uses `fallback: 'blocking'` for server deployments, so new Notion slugs can be generated without rebuilding. Keep EXPORT unset. Do not replace this deployment with HTML export.

`POST /api/revalidate` accepts `Authorization: Bearer <server token>` and JSON `{"all":true,"invalidateData":true,"batchSize":25}`. It clears data caches and regenerates discovered pages. HTTP 202 means continue with `{"paths":remainingPaths,"batchSize":25}` until `complete=true`; continuations must not repeat all/invalidateData. HTTP success alone is insufficient: check `ok`, `complete`, and per-path results. Run `python3 /opt/notionnext/revalidate.py` as an administrator; it reads the token from runtime.env without exposing it in shell history or logs and follows all continuation batches.

To change public build settings (e.g. final NEXT_PUBLIC_LINK), update both build.env and runtime.env, then redeploy. The script includes a build.env checksum in the Docker build cache key. Runtime-only secret changes need a container recreation. Notion content edits and new posts require neither image rebuild nor code deployment.

Acceptance includes a browser check on desktop and mobile, known note routes, expandable directory navigation, images/avatar, music controls, and a real Notion edit observed after automatic/explicit invalidation. A successful refresh API test does not by itself prove that a new Notion edit has propagated.
