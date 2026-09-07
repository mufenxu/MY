import { HttpError } from "./http.js";

function monthCompact(month) {
  return String(month || "").replace("-", "");
}

function campusDealCount(payload) {
  const list = Array.isArray(payload?.list) ? payload.list : [];
  return list.reduce((sum, group) => {
    if (Array.isArray(group?.dealDetail)) return sum + group.dealDetail.length;
    if (Array.isArray(group?.list)) return sum + group.list.length;
    return sum + (group && typeof group === "object" ? 1 : 0);
  }, 0);
}

export function createCampusBillService({
  campusAuth,
  easytongAuthedRequest,
  uwcAuthedRequest
}) {
  async function requestCardBill(jar, billPayload, options = {}) {
    try {
      return await easytongAuthedRequest(jar, "/easytong_app/GetDealRec", (session) => ({
        ...billPayload,
        AccNum: session.accNum || billPayload.AccNum
      }), options);
    } catch (firstError) {
      try {
        return await easytongAuthedRequest(jar, "/easytong_app/GetDealRec", (session) => ({
          ...billPayload,
          AccNum: session.accNum || billPayload.AccNum,
          EPID: session.epId || 0
        }), options);
      } catch (secondError) {
        throw new HttpError(
          secondError.status || firstError.status || 502,
          secondError.message || firstError.message || "暂无一卡通账单"
        );
      }
    }
  }

  async function getCardBill(jar, billQuery, options = {}) {
    const session = campusAuth(jar, "easytong");
    const pageSize = 100;
    const basePayload = {
      AccNum: session.accNum,
      CardAccNum: "-1",
      Count: pageSize,
      EPID: 0,
      TypeNum: -1,
      WalletNum: "0"
    };
    if (billQuery.mode === "month") basePayload.YearMonth = monthCompact(billQuery.time);

    let begin = 1;
    let combined = null;
    for (let page = 0; page < 10; page += 1) {
      const payload = await requestCardBill(jar, {
        ...basePayload,
        BeginRecNum: begin
      }, options);
      const list = Array.isArray(payload.list) ? payload.list : [];
      const dealCount = campusDealCount(payload);
      combined ||= { ...payload, list: [] };
      combined.list.push(...list);
      if (dealCount < pageSize || list.length === 0) break;
      begin += dealCount;
    }
    return combined || { code: 1, list: [], msg: "暂无一卡通账单" };
  }

  async function getWaterBill(jar, waterMonth) {
    const pageSize = 100;
    let combined = null;
    for (let page = 1; page <= 10; page += 1) {
      const payload = await uwcAuthedRequest(jar, "/public/getTransactionBill", (currentSession) => ({
        accNum: currentSession.accNum,
        epId: currentSession.epId,
        date: waterMonth,
        current: page,
        pageSize
      }));
      const rows = Array.isArray(payload.data) ? payload.data : [];
      combined ||= { ...payload, data: [] };
      combined.data.push(...rows);
      const totalCount = Number(payload.totalCount ?? payload.total ?? payload.count ?? rows.length);
      if (!rows.length || !Number.isFinite(totalCount) || combined.data.length >= totalCount || rows.length < pageSize) break;
    }
    return combined || { msg: "暂无生活用水账单", code: "1", data: [], totalCount: 0 };
  }

  return { getCardBill, getWaterBill };
}
