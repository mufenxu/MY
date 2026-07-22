# Question versions and quality diagnostics

All endpoints use the existing service response envelope: `{ code, data, message }`.
The `/api/manage` routes require an authenticated administrator, CSRF protection,
and accept only the `admin` or `demo` library scope. The `/api/console` routes use
the authenticated console user's `personal` scope and never accept an owner ID
from the request.

## Version history

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/manage/questions/:id/versions` | List versions for an admin/demo question. |
| `GET` | `/api/manage/questions/:id/versions/:revision` | Read one version. |
| `POST` | `/api/manage/questions/:id/versions/:revision/restore` | Restore a version as a new revision. |
| `GET` | `/api/console/questions/:id/versions` | List versions for an owned personal question. |
| `GET` | `/api/console/questions/:id/versions/:revision` | Read one owned version. |
| `POST` | `/api/console/questions/:id/versions/:revision/restore` | Restore an owned editable version. |

Manage requests select a library with `?scopeType=admin|demo`. Version lists accept
`page` and `limit` (`limit <= 50`). A restore never rewrites old history: it applies
the selected snapshot to the live question and creates a new `rollback` revision
that records the source revision, changed fields, actor, and request ID.

Single-question updates use the current revision as an optimistic concurrency guard.
Concurrent stale writes return HTTP 409. Batch replacement preserves question IDs,
increments changed revisions, and writes version records in the same MongoDB
transaction as the question and category updates. Batch requests must also include
`baseQuestions`, the complete list of `{ _id, revision }` pairs from the last
successful full load. This baseline lets the API distinguish an intentional deletion
from an incomplete or stale paginated load; a mismatch returns HTTP 409 without
changing the collection. Version restore, category-count changes, and AI-analysis
invalidation commit in one transaction.

## Quality diagnostics

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/manage/question-quality` | Diagnose an admin/demo library. |
| `GET` | `/api/console/question-quality` | Diagnose the current user's personal library. |

Query parameters:

- `categoryId`: optionally restrict the scan to one accessible category.
- `page`, `limit`: paginate problematic questions (`limit <= 100`).
- `issue`: optionally filter the returned list by one issue code.
- `staleDays`: age threshold from 30 to 3650 days; default 365.
- `scanLimit`: hard scan window from 100 to 10000 questions; default 2000.
- `scopeType`: manage route only, either `admin` or `demo`.

The response contains issue counts, healthy/problematic counts, and a paginated list.
The scan uses MongoDB cursors and retains only content fingerprints plus the requested
page in memory. When `summary.truncated` is true, the collection contains more records
than the selected scan window, so counts describe that bounded window rather than the
entire library.

Issue codes are `missing_analysis`, `missing_answer`, `insufficient_options`,
`duplicate_option_label`, `empty_option`, `answer_not_in_options`,
`single_answer_count`, `duplicate_content`, and `stale_question`.
