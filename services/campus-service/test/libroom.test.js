import test from "node:test";
import assert from "node:assert/strict";
import {
  createLibroomClient,
  decryptLibroomConfigPayload,
  libroomCasLoginOptionsFromConfig,
  libroomCasFromCallbackResult,
  libroomCasFromCallback,
  libroomRequiresCasTicket,
  resolveLibroomCasCallback,
  normalizeReservationInput,
  normalizeLibroomMyReservationRecord,
  clearLibroomLastError,
  LIBROOM_SERVICE_URL,
  summarizeLibroomAvailability
} from "../src/lib/libroom.js";

test("uses the CAS service URL published by the library system", () => {
  assert.equal(LIBROOM_SERVICE_URL, "http://libroom.hgu.edu.cn/v4/login/cas");
});

test("decrypts the official library config payload", () => {
  const encrypted = "JYDFboSfGMi8aFIYhkexQoww4fsLbIfDU+3bI6FBDiyrytfo5mC/pgSedh4eGtgjNiReD3XCDXCsurzhWmDcnw==";

  assert.deepEqual(
    decryptLibroomConfigPayload(encrypted, { now: new Date("2026-08-23T12:00:00+08:00") }),
    { ok: true, cas_url: "https://cas.hgu.edu.cn/cas/login" }
  );
});

test("derives the library CAS login and service URL from official config", () => {
  const casUrl = "https://cas.hgu.edu.cn/cas/login?service=http%3A%2F%2Flibroom.hgu.edu.cn%2Fv4%2Flogin%2Fcas";

  assert.deepEqual(libroomCasLoginOptionsFromConfig({ cas_url: casUrl }), {
    loginBaseUrl: casUrl,
    serviceUrl: "http://libroom.hgu.edu.cn/v4/login/cas"
  });
});

test("uses the CAS-registered HTTP service when config omits service", () => {
  assert.deepEqual(
    libroomCasLoginOptionsFromConfig({ cas_url: "https://cas.hgu.edu.cn/cas/login" }),
    {
      loginBaseUrl: "https://cas.hgu.edu.cn/cas/login",
      serviceUrl: "http://libroom.hgu.edu.cn/v4/login/cas"
    }
  );
});

test("clears a stale library login error after a successful authenticated request", () => {
  const meta = { libroom: { token: "member-token", lastError: "统一身份认证会话已过期，请重新登录学校账号。" } };

  clearLibroomLastError(meta);

  assert.equal(meta.libroom.lastError, null);
});

test("follows intermediate library callback redirects until the exchange code appears", async () => {
  const calls = [];
  const result = await resolveLibroomCasCallback(
    "https://libroom.hgu.edu.cn/v4/login/cas?ticket=ST-1",
    {
      requestImpl: async (url) => {
        calls.push(url);
        if (calls.length === 1) {
          return { status: 302, location: "http://libroom.hgu.edu.cn/v4/login/cas", finalUrl: url };
        }
        return {
          status: 302,
          location: "https://libroom.hgu.edu.cn/h5/index.html#/cas/?cas=exchange-code",
          finalUrl: url
        };
      }
    }
  );

  assert.equal(result, "exchange-code");
  assert.deepEqual(calls, [
    "https://libroom.hgu.edu.cn/v4/login/cas?ticket=ST-1",
    "http://libroom.hgu.edu.cn/v4/login/cas"
  ]);
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
    areaId: 9, date: "2026-08-26", startTime: "09:00", endTime: "11:00",
    title: "个人学习", content: "阅读", mobile: "13800138000"
  }, { now: new Date("2026-08-23T08:00:00+08:00") });
  assert.deepEqual(JSON.parse(requests[0].options.body), { id: 9 });
  assert.match(requests.at(-1).url, /\/v4\/seminar\/confirm$/);
  assert.deepEqual(JSON.parse(requests.at(-1).options.body), {
    area_id: 9,
    start_date: "2026-08-26",
    end_date: "2026-08-26",
    title: "个人学习",
    title_id: "",
    content: "阅读",
    open: 1,
    team: "",
    mobile: "13800138000",
    time: [{ start_time: "09:00", end_time: "11:00" }],
    file: null
  });

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
    areaId: 9, date: "2026-08-26", startTime: "09:00", endTime: "11:00",
    title: "个人学习", content: "阅读", mobile: "13800138000"
  }, { now: new Date("2026-08-23T08:00:00+08:00") });
  assert.deepEqual(JSON.parse(requests[0].options.body), { id: 9 });
  assert.match(requests.at(-1).url, /\/v4\/seminar\/submit$/);
  assert.deepEqual(JSON.parse(requests.at(-1).options.body), {
    area_id: 9,
    start_date: "2026-08-26",
    end_date: "2026-08-26",
    title: "个人学习",
    title_id: "",
    content: "阅读",
    open: 1,
    team: "",
    mobile: "13800138000",
    time: [{ start_time: "09:00", end_time: "11:00" }],
    file: null
  });
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

  await client.getAvailability({ spaceId: 9, date: "2026-08-26" });

  assert.match(requests[0].url, /\/v4\/seminar\/seminar$/);
  assert.deepEqual(JSON.parse(requests[0].options.body), { id: 9, date: "2026-08-26" });
});

test("loads my seminar reservations from the official books endpoint", async () => {
  const calls = [];
  const client = createLibroomClient({
    token: "member-token",
    requestImpl: async (pathname, data, { token }) => {
      calls.push({ pathname, data, token });
      if (pathname !== "/v4/seminar/books") throw new Error("unexpected endpoint");
      return {
        code: 0,
        data: {
          total: "1",
          per_page: 10,
          current_page: 1,
          last_page: 1,
          data: [{ id: "441", nameMerge: "图书馆-二楼-单人学习间14" }]
        }
      };
    }
  });

  const result = await client.getMyReservations();

  assert.deepEqual(calls, [{
    pathname: "/v4/seminar/books",
    data: { type: "1", page: 1, limit: 10 },
    token: "member-token"
  }]);
  assert.deepEqual(result, [{ id: "441", nameMerge: "图书馆-二楼-单人学习间14" }]);
});

test("normalizes active official seminar reservation records for app display", () => {
  const active = normalizeLibroomMyReservationRecord({
    id: "441",
    nameMerge: "图书馆-二楼-单人学习间14",
    begin_time: "2026-08-29 08:00",
    end_time: "2026-08-29 12:00",
    show_time: "2026-08-29 08:00-12:00",
    status_name: "预约成功",
    cancel_ok: 1,
    title: "个人课程研读与学习",
    create_time: "2026-08-27 07:00:00"
  });
  const used = normalizeLibroomMyReservationRecord({
    id: "440",
    nameMerge: "图书馆-二楼-单人学习间16",
    begin_time: "2026-08-27 19:30",
    end_time: "2026-08-27 21:45",
    status_name: "已使用",
    cancel_ok: 0
  });
  const unknown = normalizeLibroomMyReservationRecord({
    id: "439",
    nameMerge: "图书馆-二楼-单人学习间17",
    begin_time: "2026-08-26 19:00",
    end_time: "2026-08-26 21:45"
  });

  assert.deepEqual(active, {
    id: "441",
    spaceId: 0,
    spaceName: "图书馆-二楼-单人学习间14",
    date: "2026-08-29",
    startTime: "08:00",
    endTime: "12:00",
    title: "个人课程研读与学习",
    statusText: "预约成功",
    canCancel: true,
    createdAt: "2026-08-27 07:00:00"
  });
  assert.equal(used, null);
  assert.equal(unknown, null);
});

test("derives free reservation windows from occupied periods", () => {
  assert.deepEqual(
    summarizeLibroomAvailability({
      reservations: [
        { start_time: "09:00", end_time: "10:00" },
        { startTime: "14:00", endTime: "16:30" }
      ]
    }),
    {
      freeWindows: [
        { start: "08:00", end: "09:00" },
        { start: "10:00", end: "14:00" },
        { start: "16:30", end: "21:45" }
      ],
      busyWindows: [
        { start: "09:00", end: "10:00" },
        { start: "14:00", end: "16:30" }
      ],
      source: "derived-from-busy",
      detail: "根据学校接口返回的占用时段计算空闲时段。",
      raw: {
        reservations: [
          { start_time: "09:00", end_time: "10:00" },
          { startTime: "14:00", endTime: "16:30" }
        ]
      }
    }
  );
});

test("derives availability from the official axis for the selected date", () => {
  assert.deepEqual(
    summarizeLibroomAvailability({
      detail: {
        id: "12",
        name: "单人学习间5"
      },
      axis: {
        list: [
          {
            date: "2026-08-26",
            info: {
              start_time: 480,
              end_time: 1305,
              fully_booked: "0",
              list: [
                {
                  begin_timestamp: "2026-08-26 10:00:00",
                  end_timestamp: "2026-08-26 13:59:59",
                  begin_num: 600,
                  end_num: 839
                },
                {
                  begin_timestamp: "2026-08-26 14:00:00",
                  end_timestamp: "2026-08-26 17:30:00",
                  begin_num: 840,
                  end_num: 1050
                },
                {
                  begin_timestamp: "2026-08-26 18:30:00",
                  end_timestamp: "2026-08-26 21:45:00",
                  begin_num: 1110,
                  end_num: 1305
                }
              ]
            }
          }
        ]
      }
    }, { date: "2026-08-26" }),
    {
      freeWindows: [
        { start: "08:00", end: "10:00" },
        { start: "17:30", end: "18:30" }
      ],
      busyWindows: [
        { start: "10:00", end: "17:30" },
        { start: "18:30", end: "21:45" }
      ],
      source: "official-axis",
      detail: "根据学校接口返回的目标日期占用轴计算空闲时段。",
      raw: {
        detail: {
          id: "12",
          name: "单人学习间5"
        },
        axis: {
          list: [
            {
              date: "2026-08-26",
              info: {
                start_time: 480,
                end_time: 1305,
                fully_booked: "0",
                list: [
                  {
                    begin_timestamp: "2026-08-26 10:00:00",
                    end_timestamp: "2026-08-26 13:59:59",
                    begin_num: 600,
                    end_num: 839
                  },
                  {
                    begin_timestamp: "2026-08-26 14:00:00",
                    end_timestamp: "2026-08-26 17:30:00",
                    begin_num: 840,
                    end_num: 1050
                  },
                  {
                    begin_timestamp: "2026-08-26 18:30:00",
                    end_timestamp: "2026-08-26 21:45:00",
                    begin_num: 1110,
                    end_num: 1305
                  }
                ]
              }
            }
          ]
        }
      }
    }
  );
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
    areaId: 9, date: "2026-08-26", startTime: "09:00", endTime: "11:00",
    title: "个人学习", content: "阅读", mobile: "13800138000"
  }, { now: new Date("2026-08-23T08:00:00+08:00") });
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
      areaId: 9, date: "2026-08-26", startTime: "09:00", endTime: "11:00",
      title: "个人学习", content: "阅读", mobile: "13800138000"
    }, { now: new Date("2026-08-23T08:00:00+08:00") }),
    (error) => error.status === 409 && error.code === "LIBROOM_UPSTREAM_REJECTED" && !String(error.message).includes("member-token")
  );
});

test("rejects invalid duration and phone before any request", () => {
  assert.throws(() => normalizeReservationInput({
    areaId: 9, date: "2026-08-26", startTime: "09:00", endTime: "09:30",
    title: "个人学习", content: "阅读", mobile: "13800138000"
  }, { now: new Date("2026-08-23T08:00:00+08:00") }), /预约时长需为 1 至 4 小时/);
  assert.throws(() => normalizeReservationInput({
    areaId: 9, date: "2026-08-26", startTime: "09:00", endTime: "11:00",
    title: "个人学习", content: "阅读", mobile: "123"
  }, { now: new Date("2026-08-23T08:00:00+08:00") }), /联系电话格式不正确/);
});
