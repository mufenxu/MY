import test from "node:test";
import assert from "node:assert/strict";
import {
  createLibroomClient,
  decryptLibroomConfigPayload,
  libroomCasLoginOptionsFromConfig,
  libroomCasFromCallbackResult,
  libroomCasFromCallback,
  libroomRequiresCasTicket,
  normalizeReservationInput,
  LIBROOM_SERVICE_URL
} from "../src/lib/libroom.js";

test("uses the CAS service URL published by the library system", () => {
  assert.equal(LIBROOM_SERVICE_URL, "https://libroom.hgu.edu.cn/v4/login/cas");
});

test("decrypts the official library config payload", () => {
  const encrypted = "JYDFboSfGMi8aFIYhkexQoww4fsLbIfDU+3bI6FBDiyrytfo5mC/pgSedh4eGtgjNiReD3XCDXCsurzhWmDcnw==";

  assert.deepEqual(
    decryptLibroomConfigPayload(encrypted, { now: new Date("2026-08-23T12:00:00+08:00") }),
    { ok: true, cas_url: "https://cas.hgu.edu.cn/cas/login" }
  );
});

test("derives the library CAS login and service URL from official config", () => {
  const casUrl = "https://cas.hgu.edu.cn/cas/login?service=https%3A%2F%2Flibroom.hgu.edu.cn%2Fv4%2Flogin%2Fcas";

  assert.deepEqual(libroomCasLoginOptionsFromConfig({ cas_url: casUrl }), {
    loginBaseUrl: casUrl,
    serviceUrl: "https://libroom.hgu.edu.cn/v4/login/cas"
  });
});

test("extracts the library exchange code from its CAS callback redirect", () => {
  assert.equal(
    libroomCasFromCallback("https://libroom.hgu.edu.cn/h5/index.html#/cas/?cas=library-code"),
    "library-code"
  );
});

test("extracts the library exchange code from a followed callback final URL", () => {
  assert.equal(
    libroomCasFromCallbackResult({
      finalUrl: "https://libroom.hgu.edu.cn/h5/index.html#/cas/?cas=webvpn-code",
      location: "https://libroom.hgu.edu.cn/v4/login/cas?ticket=already-used"
    }),
    "webvpn-code"
  );
});

test("does not require a CAS ticket when the library callback already carries cas", () => {
  assert.equal(
    libroomRequiresCasTicket("https://libroom.hgu.edu.cn/h5/index.html#/cas/?cas=direct-code"),
    false
  );
  assert.equal(
    libroomRequiresCasTicket("https://libroom.hgu.edu.cn/v4/login/cas?ticket=ST-1"),
    true
  );
});

test("normalizes a single-person reservation with an empty team", () => {
  const result = normalizeReservationInput({
    areaId: 9,
    date: "2026-08-24",
    startTime: "09:00",
    endTime: "11:00",
    title: "个人学习",
    content: "完成课程阅读",
    mobile: "13800138000",
    open: false
  }, { now: new Date("2026-08-23T08:00:00+08:00") });

  assert.deepEqual(result.payload, {
    area_id: 9,
    start_date: "2026-08-24",
    end_date: "2026-08-24",
    title: "个人学习",
    title_id: "",
    content: "完成课程阅读",
    open: 1,
    team: "",
    mobile: "13800138000",
    time: [{ start_time: "09:00", end_time: "11:00" }],
    file: null
  });
});

test("selects confirm for a first-period reservation and submit otherwise", async () => {
  const requests = [];
  const client = createLibroomClient({
    token: "member-token",
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return new Response(JSON.stringify({ code: 0, data: { earlierPeriods: 0, ok: true } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  });

  await client.submitReservation({
    areaId: 9, date: "2026-08-24", startTime: "09:00", endTime: "11:00",
    title: "个人学习", content: "阅读", mobile: "13800138000"
  });
  assert.deepEqual(JSON.parse(requests[0].options.body), { id: 9 });
  assert.match(requests.at(-1).url, /\/v4\/seminar\/confirm$/);

  requests.length = 0;
  const submitClient = createLibroomClient({
    token: "member-token",
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return new Response(JSON.stringify({ code: 0, data: { earlierPeriods: 1, ok: true } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  });
  await submitClient.submitReservation({
    areaId: 9, date: "2026-08-24", startTime: "09:00", endTime: "11:00",
    title: "个人学习", content: "阅读", mobile: "13800138000"
  });
  assert.deepEqual(JSON.parse(requests[0].options.body), { id: 9 });
  assert.match(requests.at(-1).url, /\/v4\/seminar\/submit$/);
});

test("loads space availability by the upstream space id", async () => {
  const requests = [];
  const client = createLibroomClient({
    token: "member-token",
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return new Response(JSON.stringify({ code: 0, data: { id: 9 } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  });

  await client.getAvailability({ spaceId: 9, date: "2026-08-24" });

  assert.match(requests[0].url, /\/v4\/seminar\/seminar$/);
  assert.deepEqual(JSON.parse(requests[0].options.body), { id: 9 });
});

test("refreshes the member token once after an upstream auth error", async () => {
  const requests = [];
  let tokenCalls = 0;
  const client = createLibroomClient({
    token: "expired-token",
    getMemberToken: async () => {
      tokenCalls += 1;
      return "fresh-token";
    },
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      if (requests.length === 1) {
        return new Response(JSON.stringify({ code: 10001, msg: "登录失效" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      return new Response(JSON.stringify({ code: 0, data: { earlierPeriods: 0, id: "r1" } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  });

  const result = await client.submitReservation({
    areaId: 9, date: "2026-08-24", startTime: "09:00", endTime: "11:00",
    title: "个人学习", content: "阅读", mobile: "13800138000"
  });
  assert.equal(result.id, "r1");
  assert.equal(tokenCalls, 1);
  assert.equal(requests[1].options.headers.Authorization, "bearerfresh-token");
});

test("loads a member token before the first upstream request", async () => {
  const requests = [];
  let tokenCalls = 0;
  const client = createLibroomClient({
    getMemberToken: async () => {
      tokenCalls += 1;
      return "fresh-token";
    },
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return new Response(JSON.stringify({ code: 0, data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  });

  await client.listSpaces();

  assert.equal(tokenCalls, 1);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.headers.Authorization, "bearerfresh-token");
});

test("allows the caller to provide the upstream request transport", async () => {
  const calls = [];
  const client = createLibroomClient({
    token: "member-token",
    requestImpl: async (pathname, data, { token }) => {
      calls.push({ pathname, data, token });
      return { code: 0, data: [{ id: 14, name: "单人研修间" }] };
    }
  });

  const result = await client.listSpaces();

  assert.deepEqual(result, [{ id: 14, name: "单人研修间" }]);
  assert.deepEqual(calls, [{
    pathname: "/v4/seminar/list",
    data: {
      premises: [], members: "", date: "", floor: [], category: [], room: "", name: "", boutique: [],
      page: 1, start_time: "", end_time: ""
    },
    token: "member-token"
  }]);
});

test("loads booking rules from the official rules endpoint", async () => {
  const calls = [];
  const client = createLibroomClient({
    token: "member-token",
    requestImpl: async (pathname, data, { token }) => {
      calls.push({ pathname, data, token });
      return { code: 0, data: { rules: "single room" } };
    }
  });

  await client.getRules(23);
  assert.deepEqual(calls, [{ pathname: "/v4/index/bookingRules", data: {}, token: "member-token" }]);
});

test("maps upstream failures without exposing credentials", async () => {
  const client = createLibroomClient({
    token: "member-token",
    fetchImpl: async () => new Response(JSON.stringify({ code: 20001, msg: "时段已被预约" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    })
  });

  await assert.rejects(
    () => client.submitReservation({
      areaId: 9, date: "2026-08-24", startTime: "09:00", endTime: "11:00",
      title: "个人学习", content: "阅读", mobile: "13800138000"
    }),
    (error) => error.status === 409 && error.code === "LIBROOM_UPSTREAM_REJECTED" && !String(error.message).includes("member-token")
  );
});

test("rejects invalid duration and phone before any request", () => {
  assert.throws(() => normalizeReservationInput({
    areaId: 9, date: "2026-08-24", startTime: "09:00", endTime: "09:30",
    title: "个人学习", content: "阅读", mobile: "13800138000"
  }), /预约时长需为 1 至 4 小时/);
  assert.throws(() => normalizeReservationInput({
    areaId: 9, date: "2026-08-24", startTime: "09:00", endTime: "11:00",
    title: "个人学习", content: "阅读", mobile: "123"
  }), /联系电话格式不正确/);
});
