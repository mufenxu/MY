import test from "node:test";
import assert from "node:assert/strict";
import {
  createLibrarySeatClient,
  librarySeatTokenFromOfficialUrl,
  normalizeLibrarySeatAreasPayload,
  normalizeLibrarySeatBreachPayload,
  normalizeLibrarySeatCancelResult,
  normalizeLibrarySeatCreditPayload,
  normalizeLibrarySeatCurrentUsePayload,
  normalizeLibrarySeatDoorLogPayload,
  normalizeLibrarySeatLayoutPayload,
  normalizeLibrarySeatMakeLifePayload,
  normalizeLibrarySeatOverviewPayload,
  normalizeLibrarySeatReservationInput,
  normalizeLibrarySeatSeatsPayload,
  normalizeLibrarySeatStartTimesPayload,
  normalizeLibrarySeatTimelinePayload,
  LIBRARY_SEAT_API_BASE,
  LIBRARY_SEAT_CAS_SERVICE_URL,
  LIBRARY_SEAT_OFFICIAL_ENTRY_URL
} from "../src/lib/library-seat.js";
import { buildLibrarySeatReminderPayload, librarySeatReminderPlan } from "../src/lib/library-seat-reminder.js";

test("uses the WebVPN CAS service URL of the seat reservation system", () => {
  assert.equal(LIBRARY_SEAT_API_BASE, "https://libic.hgu.edu.cn/jsq");
  assert.equal(
    LIBRARY_SEAT_CAS_SERVICE_URL,
    "https://libic.hgu.edu.cn/remote/static/sso/login?redirectUrl=https%3A%2F%2Flibic.hgu.edu.cn%2Fjsq-v%2F%23%2Flogin"
  );
  assert.equal(LIBRARY_SEAT_OFFICIAL_ENTRY_URL, "https://libic.hgu.edu.cn/jsq-v/#/login");
});

test("extracts the entrance token from the official URL", () => {
  assert.equal(
    librarySeatTokenFromOfficialUrl("https://libic.hgu.edu.cn/jsq-v/?token=seat-entry-token#/main/home"),
    "seat-entry-token"
  );
  assert.equal(
    librarySeatTokenFromOfficialUrl("https://libic.hgu.edu.cn/jsq-v/#/login?token=fragment-entry-token"),
    "fragment-entry-token"
  );
});

test("normalizes venue, floor and date metadata", () => {
  const result = normalizeLibrarySeatOverviewPayload({
    data: {
      buildings: [
        {
          id: "1744276833606668288",
          name: "图书馆",
          floors: [{ id: "1935932081147318272", name: "二层" }]
        }
      ],
      dates: ["2026-08-29", "2026-08-30"]
    }
  });

  assert.deepEqual(result, {
    venues: [
      {
        id: "1744276833606668288",
        name: "图书馆",
        floors: [{ id: "1935932081147318272", name: "二层" }]
      }
    ],
    dates: ["2026-08-29", "2026-08-30"]
  });
});

test("normalizes seat area cards with long string ids", () => {
  const result = normalizeLibrarySeatAreasPayload({
    data: {
      pageList: [
        {
          id: "1935932990019440640",
          buildingId: "1744276833606668288",
          floorId: "1935932081147318272",
          name: "二层电子阅览区",
          buildingName: "图书馆",
          floorName: "二层",
          seatTotal: 188,
          seatFree: 7,
          maxMinute: 240,
          type: "NORMAL"
        }
      ],
      total: 1,
      currentPage: 1,
      pageSize: 12
    }
  });

  assert.equal(result.areas[0].id, "1935932990019440640");
  assert.equal(result.areas[0].seatFree, 7);
  assert.equal(result.areas[0].floorName, "二层");
  assert.deepEqual(result.paging, { total: 1, currentPage: 1, pageSize: 12 });
});

test("normalizes free seat status keyed by seat id", () => {
  const result = normalizeLibrarySeatSeatsPayload({
    data: {
      "1935965539382956032": { id: "1935965539382956032", label: "1", name: "1行1列", status: "IN_USE" },
      "1935965539382956037": { id: "1935965539382956037", label: "6", name: "1行6列", status: "FREE" }
    }
  });

  assert.deepEqual(result, [
    { id: "1935965539382956032", label: "1", name: "1行1列", status: "IN_USE", statusText: "已占用", isFree: false },
    { id: "1935965539382956037", label: "6", name: "1行6列", status: "FREE", statusText: "可预约", isFree: true }
  ]);
});

test("normalizes a seat reservation request", () => {
  assert.deepEqual(
    normalizeLibrarySeatReservationInput({
      seatId: "1935965539382956037",
      date: "2026-08-29",
      startMinute: 480,
      endMinute: 600
    }),
    {
      seatId: "1935965539382956037",
      date: "2026-08-29",
      startMinute: 480,
      endMinute: 600,
      capToken: ""
    }
  );
});

test("calls the official area and submit endpoints", async () => {
  const calls = [];
  const client = createLibrarySeatClient({
    token: "member-token",
    requestImpl: async (pathname, data, { token }) => {
      calls.push({ pathname, data, token });
      return {
        payload: {
          status: true,
          code: 200,
          data: pathname.includes("/freeBook/") ? { makeId: "mk-1" } : { pageList: [] }
        },
        status: 200,
        ok: true
      };
    }
  });

  await client.listAreas({
    venueId: "1744276833606668288",
    date: "2026-08-29",
    startMinute: 480,
    endMinute: 600,
    floorId: "1935932081147318272",
    power: true,
    window: false
  });
  await client.submitReservation({
    seatId: "1935965539382956037",
    date: "2026-08-29",
    startMinute: 480,
    endMinute: 600
  });

  assert.deepEqual(calls[0], {
    pathname: "/static/frontApi/res/findRoomDuration/1744276833606668288/2026-08-29",
    data: {
      beginMinute: 480,
      currentPage: 1,
      endMinute: 600,
      floorId: "1935932081147318272",
      minMinute: 0,
      pageSize: 50,
      power: true,
      roomType: false,
      sortField: "",
      sortType: "",
      windows: false
    },
    token: "member-token"
  });
  assert.equal(
    calls[1].pathname,
    "/static/frontApi/make/freeBook/1935965539382956037/2026-08-29/480/600?capToken="
  );
});

test("normalizes the usage cycle, credit and access records", () => {
  assert.deepEqual(
    normalizeLibrarySeatCurrentUsePayload({
      status: true,
      data: { id: "mk-1", seatLabel: "12", status: "CHECK_IN", makeDateStr: "2026-09-12" }
    }),
    {
      id: "mk-1",
      seatId: "",
      seatLabel: "12",
      receipt: "",
      date: "2026-09-12",
      startTime: "",
      endTime: "",
      actualTime: "",
      location: "",
      buildName: "",
      floorName: "",
      roomName: "",
      status: "CHECK_IN",
      statusText: "履约中",
      message: "",
      awayRange: ""
    }
  );
  assert.equal(normalizeLibrarySeatCurrentUsePayload({ status: true, data: null }), null);
  assert.deepEqual(normalizeLibrarySeatCancelResult({ status: true, data: 3 }), { remainingCancelCount: 3 });
  assert.deepEqual(normalizeLibrarySeatCancelResult({ status: true, data: null }), { remainingCancelCount: 0 });

  const breaches = normalizeLibrarySeatBreachPayload({
    status: true,
    data: {
      count: 2,
      list: [
        { id: "1", status: "MISS", seatLabel: "9", location: "图书馆|二层", makeDateStr: "2026-09-01" },
        { id: "2", status: "NO_STOP", seatLabel: "10", location: "图书馆|三层", makeDateStr: "2026-09-02" }
      ]
    }
  });
  assert.equal(breaches.total, 2);
  assert.equal(breaches.records[0].statusText, "失约");
  assert.equal(breaches.records[1].statusText, "未签退");

  assert.deepEqual(
    normalizeLibrarySeatDoorLogPayload({
      code: 200,
      data: [{ doorName: "图书馆正门", dateTimeStr: "2026-09-12 08:01:00", direction: 0 }]
    }),
    [{ id: "", doorName: "图书馆正门", dateTime: "2026-09-12 08:01:00", direction: 0, directionText: "入馆" }]
  );

  assert.deepEqual(
    normalizeLibrarySeatMakeLifePayload({
      status: true,
      data: [{ stageName: "暂离", createdDate: "2026-09-12 09:00", sourceName: "PC" }]
    }),
    [{ stageName: "暂离", createdDate: "2026-09-12 09:00", sourceName: "PC" }]
  );
});

test("calls the official usage cycle endpoints", async () => {
  const calls = [];
  const client = createLibrarySeatClient({
    token: "member-token",
    requestImpl: async (pathname, data) => {
      calls.push({ pathname, data });
      if (pathname.startsWith("/static/frontApi/make/cancel/")) {
        return { payload: { status: true, data: 2 }, status: 200, ok: true };
      }
      if (pathname.startsWith("/static/frontApi/user/breach/")) {
        return { payload: { status: true, data: { count: 0, list: [] } }, status: 200, ok: true };
      }
      return { payload: { status: true, code: 200, data: { message: "操作成功" } }, status: 200, ok: true };
    }
  });

  await client.getCurrentUse();
  const checkInMessage = await client.checkIn();
  const leaveMessage = await client.leaveSeat();
  await client.stopSeat();
  const cancelResult = await client.cancelReservation("1935965539382956037");
  await client.getBreachRecords({ page: 0, size: 10 });
  await client.getDoorLog({ date: "2026-09-12" });
  await client.getMakeLife({ id: "1935965539382956037" });

  assert.deepEqual(calls.map((call) => call.pathname), [
    "/static/frontApi/user/currentUseMake",
    "/static/frontApi/make/checkIn?qrMd5=PC",
    "/static/frontApi/make/leave",
    "/static/frontApi/make/stop",
    "/static/frontApi/make/cancel/1935965539382956037",
    "/static/frontApi/user/breach/0/10",
    "/static/frontApi/user/doorLog/2026-09-12",
    "/static/frontApi/user/makeLife/1935965539382956037"
  ]);
  assert.deepEqual(cancelResult, { remainingCancelCount: 2 });
  assert.equal(checkInMessage, "操作成功");
  assert.equal(leaveMessage, "操作成功");
});

test("normalizes the availability timeline and candidate start times", () => {
  assert.deepEqual(
    normalizeLibrarySeatTimelinePayload({
      data: {
        freeList: [{ left: 10, width: 20 }, { left: 50.555, width: 0 }, { left: 40, width: 5 }],
        markList: [{ left: 30, label: "已占用" }, { left: "70" }]
      }
    }),
    {
      free: [{ left: 10, width: 20 }, { left: 40, width: 5 }],
      marks: [{ left: 30, label: "已占用" }, { left: 70, label: "" }]
    }
  );
  assert.deepEqual(
    normalizeLibrarySeatStartTimesPayload({ data: [[480, "08:00"], ["540", "09:00"], null] }),
    [{ value: "480", text: "08:00" }, { value: "540", text: "09:00" }]
  );
});

test("normalizes the versioned seat layout payload", () => {
  const layout = {
    objects: [
      { type: "labeledImage", left: 12, top: 34, seat: { id: "s-1", label: "1", name: "1行1列" } },
      { type: "rect", left: 0, top: 0 }
    ]
  };
  assert.deepEqual(
    normalizeLibrarySeatLayoutPayload(`${JSON.stringify(layout)}_updVersion_7`, { roomId: "room-1" }),
    {
      roomId: "room-1",
      unchanged: false,
      version: "7",
      seats: [{ id: "s-1", label: "1", name: "1行1列", left: 12, top: 34 }]
    }
  );
  assert.deepEqual(
    normalizeLibrarySeatLayoutPayload("", { roomId: "room-1" }),
    { roomId: "room-1", unchanged: true, version: "", seats: [] }
  );
});

test("calls the seat timeline, layout and slice endpoints", async () => {
  const calls = [];
  const client = createLibrarySeatClient({
    token: "member-token",
    requestImpl: async (pathname, data) => {
      calls.push({ pathname, data });
      if (pathname.startsWith("/static/frontApi/res/getTimeLine/")) {
        return {
          payload: { status: true, code: 200, data: { freeList: [{ left: 0, width: 100 }], markList: [] } },
          status: 200,
          ok: true
        };
      }
      if (pathname.startsWith("/static/frontApi/res/getStartTimes/")) {
        return { payload: { status: true, code: 200, data: [[480, "08:00"]] }, status: 200, ok: true };
      }
      if (pathname.startsWith("/static/frontApi/res/querySeatLayout/")) {
        return { payload: { status: true, code: 200, data: "{\"objects\":[]}_updVersion_3" }, status: 200, ok: true };
      }
      return { payload: { status: true, code: 200, data: {} }, status: 200, ok: true };
    }
  });

  const timeline = await client.getTimeline({ seatId: "seat-1", date: "2026-09-12" });
  const startTimes = await client.getStartTimes({ seatId: "seat-1", date: "2026-09-12" });
  const layout = await client.getSeatLayout({ roomId: "room-1", updV: 2 });
  await client.getSeats({ roomId: "room-1", date: "2026-09-12", startMinute: 480, endMinute: 600, amPm: 1 });

  assert.deepEqual(calls.map((call) => call.pathname), [
    "/static/frontApi/res/getTimeLine/seat-1/2026-09-12",
    "/static/frontApi/res/getStartTimes/seat-1/2026-09-12",
    "/static/frontApi/res/querySeatLayout/room-1/2",
    "/static/frontApi/res/freeSeatIdsSlice/room-1/2026-09-12"
  ]);
  assert.deepEqual(calls[3].data, { beginMinute: 480, endMinute: 600, minMinute: 0, amPm: 1 });
  assert.deepEqual(timeline, { free: [{ left: 0, width: 100 }], marks: [] });
  assert.deepEqual(startTimes, [{ value: "480", text: "08:00" }]);
  assert.equal(layout.version, "3");
});

test("plans reminders across the seat usage cycle", () => {
  const usage = {
    id: "mk-1",
    status: "RESERVE",
    date: "2026-09-12",
    startTime: "08:00",
    endTime: "10:00",
    seatLabel: "42",
    buildName: "图书馆",
    floorName: "3 层",
    roomName: "阅览区 A"
  };
  const soon = librarySeatReminderPlan(usage, new Date("2026-09-12T07:50:00+08:00"));
  assert.deepEqual(soon.map((reminder) => reminder.kind), ["check_in_soon"]);
  assert.equal(soon[0].location, "图书馆 3 层 阅览区 A");
  assert.deepEqual(
    librarySeatReminderPlan(usage, new Date("2026-09-12T08:10:00+08:00")).map((reminder) => reminder.kind),
    ["check_in_overdue"]
  );
  assert.deepEqual(
    librarySeatReminderPlan({ ...usage, status: "CHECK_IN" }, new Date("2026-09-12T09:55:00+08:00"))
      .map((reminder) => reminder.kind),
    ["ending_soon"]
  );
  assert.deepEqual(
    librarySeatReminderPlan({ ...usage, status: "CHECK_IN" }, new Date("2026-09-12T09:30:00+08:00")),
    []
  );
  assert.deepEqual(
    librarySeatReminderPlan(
      { ...usage, status: "AWAY", awayRange: "09:40 _ 10:00" },
      new Date("2026-09-12T10:20:00+08:00")
    ).map((reminder) => reminder.kind),
    ["away_overdue"]
  );
});

test("builds a deduplicated seat reminder notification payload", () => {
  const [reminder] = librarySeatReminderPlan(
    { id: "mk-1", status: "CHECK_IN", date: "2026-09-12", startTime: "08:00", endTime: "10:00", seatLabel: "42" },
    new Date("2026-09-12T09:55:00+08:00")
  );
  const payload = buildLibrarySeatReminderPayload(reminder, { appId: "app-1" });
  assert.equal(payload.category, "campus.library-seat.reminder");
  assert.deepEqual(payload.audience, { users: ["app-1"] });
  assert.deepEqual(payload.channels, ["app"]);
  assert.match(payload.dedupeKey, /^campus-library-seat-[0-9a-f]{48}$/);
  assert.equal(payload.content.title, "座位即将结束");
  assert.equal(buildLibrarySeatReminderPayload(reminder, { appId: "" }), null);
});

test("normalizes the credit profile and quota policy", () => {
  assert.deepEqual(
    normalizeLibrarySeatCreditPayload(
      { data: { fullName: "张三", score: 96 } },
      { data: { policyType: 1, superviseAway: "30", buildSeTime: "06:30", ruleText: "每日可预约 2 次" } }
    ),
    {
      fullName: "张三",
      score: 96,
      policyType: 1,
      scoreEnabled: true,
      superviseAway: 30,
      buildSeTime: "06:30",
      ruleText: "每日可预约 2 次"
    }
  );
  assert.deepEqual(
    normalizeLibrarySeatCreditPayload({ data: { score: 0 } }, { data: { policyType: -1 } }),
    {
      fullName: "",
      score: 0,
      policyType: -1,
      scoreEnabled: false,
      superviseAway: 0,
      buildSeTime: "",
      ruleText: ""
    }
  );
});

test("calls the credit and policy endpoints", async () => {
  const calls = [];
  const client = createLibrarySeatClient({
    token: "member-token",
    requestImpl: async (pathname, data) => {
      calls.push({ pathname, data });
      if (pathname === "/static/frontApi/user/getUserInfo") {
        return { payload: { status: true, code: 200, data: { fullName: "张三", score: 88 } }, status: 200, ok: true };
      }
      return { payload: { status: true, code: 200, data: { policyType: 0, superviseAway: 30 } }, status: 200, ok: true };
    }
  });

  const profile = await client.getCreditProfile();

  assert.deepEqual(calls.map((call) => call.pathname), [
    "/static/frontApi/user/getUserInfo",
    "/static/public/cg/getSysSet/PC"
  ]);
  assert.equal(profile.score, 88);
  assert.equal(profile.superviseAway, 30);
});
