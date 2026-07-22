# External blackbox probe

Deploy this Compose project on infrastructure that does not share the MY platform host,
network, power, or alerting path. Running it in the primary platform Compose stack defeats
the failure-domain guarantee.

Required environment variables:

- `PLATFORM_BLACKBOX_PROBE_ID`: stable identifier for the external location.
- `PLATFORM_BLACKBOX_TARGETS`: JSON array such as
  `[{"id":"platform-ready","url":"https://pxyb.cn/api/readyz","expectedStatus":200}]`.
- `PLATFORM_BLACKBOX_INGEST_URL`: public
  `https://pxyb.cn/api/internal/blackbox/samples` endpoint.
- `PLATFORM_BLACKBOX_INGEST_TOKEN`: dedicated random token matching the platform setting.

The probe writes every sample to a persistent local spool before delivery. If the platform
is unavailable, samples are replayed after recovery. The platform also treats a missing
sample interval as `sampling_gap`, so probe outages are not counted as healthy time.
