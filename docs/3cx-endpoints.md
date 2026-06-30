# 3CX XAPI Endpoints Used

All requests use:

```text
POST /connect/token
Authorization: Bearer <token>
```

Collected endpoints:

- `GET /xapi/v1/SystemStatus`
- `GET /xapi/v1/Trunks?$top=100`
- `GET /xapi/v1/ActiveCalls?$top=100&$orderby=EstablishedAt asc`
- `GET /xapi/v1/EventLogs?$top=5&$orderby=TimeGenerated desc`
- `GET /xapi/v1/CrmIntegration`
- `GET /xapi/v1/Sbcs?$top=100`

Notes:

- `SystemStatus.HasNotRunningServices` is only an aggregate service signal.
- Detailed OS or 3CX service lists need a local agent, SSH check, or another monitoring integration.
- Port `443` works; the app does not assume `5001`.
