# Cloudflare build notifications → Relay → Telegram

Receiver: `POST https://<userscripts-cf-worker-host>/webhooks/cloudflare/builds`.

Requires Worker runtime secrets:

- `CLOUDFLARE_NOTIFY_WEBHOOK_SECRET`: random secret, at least 24 characters
- `RELAY_NOTIFICATION_TOKEN`: authorization token accepted by the Relay notification endpoint

The caller must send `Authorization: Bearer <CLOUDFLARE_NOTIFY_WEBHOOK_SECRET>`
or `X-Webhook-Secret: <CLOUDFLARE_NOTIFY_WEBHOOK_SECRET>`.

Example payload:

```json
{
  "status": "failed",
  "project_name": "userscripts-cf",
  "branch": "main",
  "commit_sha": "abc123",
  "build_url": "https://dash.cloudflare.com/",
  "error_message": "Build failed"
}
```

The receiver forwards `{ "message": "..." }` to
`https://xtelegram-cf.migos.club/notifications/send`.

**Important limitations:** Cloudflare's native notification webhooks may not allow the
custom authentication header above. In that case, use an authenticated forwarding
service that validates Cloudflare's webhook signature and adds the secret header.
Cloudflare build notifications must be enabled in the dashboard and directed to
the receiver. The Relay request schema and its authorization method have not
been verified against the Relay implementation. The existing deployment script
uploads an empty bindings list, so runtime secrets must be provisioned and
preserved in the deployed Worker configuration before this receiver can work.
The receiver is not yet a complete production integration.
