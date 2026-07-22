import test from "node:test";
import assert from "node:assert/strict";
import { normalizePagination } from "../src/lib/pagination.js";

test("pagination applies positive defaults and an upper page-size bound", () => {
  assert.deepEqual(normalizePagination({}), { page: 1, pageSize: 100, offset: 0 });
  assert.deepEqual(
    normalizePagination({ page: "3", pageSize: "999" }),
    { page: 3, pageSize: 200, offset: 400 }
  );
  assert.deepEqual(
    normalizePagination({ page: "-1", pageSize: "0" }),
    { page: 1, pageSize: 1, offset: 0 }
  );
  assert.deepEqual(
    normalizePagination({ page: "999999999", pageSize: "200" }),
    { page: 10_000, pageSize: 200, offset: 1_999_800 }
  );
});
