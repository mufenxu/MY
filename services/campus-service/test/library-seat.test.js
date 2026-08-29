import test from "node:test";
import assert from "node:assert/strict";
import {
  createLibrarySeatClient,
  librarySeatTokenFromOfficialUrl,
  normalizeLibrarySeatAreasPayload,
  normalizeLibrarySeatOverviewPayload,
  normalizeLibrarySeatReservationInput,
  normalizeLibrarySeatSeatsPayload,
  LIBRARY_SEAT_API_BASE,
  LIBRARY_SEAT_CAS_SERVICE_URL,
  LIBRARY_SEAT_OFFICIAL_ENTRY_URL
} from "../src/lib/library-seat.js";

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
