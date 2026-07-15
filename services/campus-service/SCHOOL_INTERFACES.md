# 学校接口记录

## 能耗计费平台

来源页面：`https://nrg.hgu.edu.cn/wecom/oauth/servicecenter/main.do#`

## 请求封装

学校前端定义在 `/wecom/static/custom/js/common.js?20180116`：

- `take.ajax(url, params, ...)` 使用 `GET`
- `take.ajaxP(url, params, ...)` 使用 `POST`
- 返回结构通常为 `{ success: true, data: ... }` 或 `{ success: false, reason: ... }`

## 已对接接口

| 功能 | 方法 | 路径 | 参数 |
| --- | --- | --- | --- |
| 服务中心账户信息 | POST | `/wecom/oauth/servicecenter/getviewdata.do?timestamp=...` | 无 |
| 钱包余额 | POST | `/wecom/oauth/wallet/getWalletAccount.do?timestamp=...` | 无 |
| 钱包套餐备注 | POST | `/wecom/oauth/wallet/getPackageInfo.do?timestamp=...` | 无 |
| 月账单 | GET | `/wecom/oauth/mybill/monthOfBillOther.do` | `time=YYYY-MM` |
| 昨日账单 | GET | `/wecom/oauth/mybill/yesterdayOfBill.do` | 无 |
| 仪表列表 | POST | `/wecom/oauth/meter/getAllMyMetersList.do` | `account` |
| 仪表实时读数 | POST | `/wecom/oauth/meter/doBatchCheck.do` | `autoCheckParamData` JSON 字符串 |
| 能耗官方充值页 | GET | `/wecom/oauth/recharge/main.do?ticket=ST-...#` | 本系统用已保存 CAS 会话生成一次性 ticket 后交给浏览器 |

## 暂不对接的接口

这些接口会触发操作或资金相关流程，当前项目故意不实现：

- `/wecom/onecard/cashier.do`：充值页“确定”后提交金额并返回收银台地址，可能创建支付订单
- `/wecom/oauth/meter/openOrClose.do`
- `/wecom/oauth/meter/controlPanel.do`
- `/wecom/oauth/suggest/*`

能耗充值当前只生成学校官方充值页的一次性 CAS 跳转链接，不在本系统内选择金额、创建订单、收集支付信息或完成支付。

## 部署认证

学校能耗入口未登录时会跳转到：

```text
https://cas.hgu.edu.cn/cas/login?service=https%3A%2F%2Fnrg.hgu.edu.cn%2Fwecom%2Foauth%2Fservicecenter%2Fmain.do
```

CAS 登录页使用字段：

- `username`
- `password`：前端 RSA 加密后提交
- `execution`：每次打开登录页动态生成
- `encrypted=true`
- `_eventId=submit`
- `loginType=1`
- `rememberMe=true` 可选

本项目已在后端复现这套 CAS 登录流程。密码只用于一次登录请求，不保存到磁盘。登录成功后，会把 CAS / 能耗平台返回的会话 Cookie 保存到 `data/school-session.json`。

`NRG_COOKIE` 仍可作为手动 Cookie 兜底方案。

## 校园一卡通

来源页面：

- `https://ykt.hgu.edu.cn/uias-h5/home`
- `https://ykt.hgu.edu.cn/easytong_webapp/`

登录链路：

1. 通过 CAS 访问 `https://ykt.hgu.edu.cn/uias/authentication/index/cas/login-page`
2. 使用返回的 `ticket` 调用 `/uias/authentication/index/cas/login`
3. 调用 `/uias/authentication/index/token-h5` 获取具体应用 Token
4. 使用应用 Token 进入一卡通 H5：`/easytong_app/h5uia/uiaApp`

已对接查询接口：

| 功能 | 方法 | 路径 |
| --- | --- | --- |
| 一卡通账户信息 | POST | `/easytong_app/GetAccInfo` |
| 钱包余额 | POST | `/easytong_app/GetWalletMoney` |
| 卡信息 | POST | `/easytong_app/GetAccCardInfoForDev` |
| 历史账单 | POST | `/easytong_app/GetDealRec` |

`GetDealRec` 不传 `YearMonth` 时返回最近交易；指定月份时传 `YearMonth=YYYYMM`。本项目页面默认使用当前月份，并按 `BeginRecNum` / `Count` 分页合并，尽量展示当月全部交易。

## 生活用水 / 用水码

来源页面：`https://ykt.hgu.edu.cn/uwc_webapp/#/home`

登录链路：

1. 先通过 UIAS 获取 `uwc_webapp` 的应用 Token
2. 调用 `/uwc_web_app/miniapps/loginByToken`
3. 保存返回的 UWC Token、账户号和 `epId`

已对接查询接口：

| 功能 | 方法 | 路径 |
| --- | --- | --- |
| 用水码 | POST | `/uwc_web_app/randomWaterCodeApp/queryRanCode` |
| 重新获取用水码 | POST | `/uwc_web_app/randomWaterCodeApp/createRanCode` |
| 用水账单 | POST | `/uwc_web_app/public/getTransactionBill` |

`getTransactionBill` 使用 `date=YYYY-MM`、`current`、`pageSize` 分页查询。本项目默认使用当前月份，并按 `totalCount` 继续翻页，合并展示当月全部生活用水账单。

项目只读取余额、账单、用水码等信息；充值只提供学校官方充值页跳转，不在本系统内创建订单、开闸、收集支付密码或完成支付。

## 公寓管理系统

来源页面：

- `https://ykt.hgu.edu.cn/appdm-home/wxweb/#/home`
- `https://ykt.hgu.edu.cn/appdm-home/wxweb/#/personAccommodation`

登录链路：

1. 读取 `/appdm-home/appsys/sys/config/listAll` 获取 `MOBILE_CAS_URL` 和 `interfaceParam`。
2. 使用已有 CAS 会话访问 `MOBILE_CAS_URL`。
3. 学校回跳到 `#/hoyOauth?sqcode=...&personId=...`。
4. 使用 `interfaceParam` 作为 AES-ECB key 解密 `sqcode`，得到 AppDM Token。
5. 后续请求使用请求头 `token: <AppDM Token>`。

已对接只读接口：

| 功能 | 方法 | 路径 |
| --- | --- | --- |
| 当前用户 | GET | `/appdm-home/appsys/sys/user/info` |
| 住宿详情 | POST | `/appdm-home/appou/person/search/queryPersonDetailInfoByPersonsn` |
| 宿友列表 | POST | `/appdm-home/appdm/scattered/scatteredreside/selectInRoomStudentInfoListBybedCode` |
| 宿舍设备/Wi-Fi | POST | `/appdm-home/appdm/dormitory/dormitorydevice/getDeviceInfo` |

住宿详情接口需要：

- `personsn`：当前学号
- `accessKey=md5(personsn + "SQ" + YYYYMMDDHHmmss)`
- `timestamp`

宿友列表接口需要：

- `bedCode`
- `accessKey=md5(bedCode + "SQ" + YYYYMMDDHHmmss)`
- `timestamp`

本地 API：

```text
GET /api/campus/accommodation
```

当前只展示住宿位置、院系班级、入住状态、入住周期、费用、宿友和设备信息，不实现在线申请、承诺书提交或退宿等写操作。

## 本科教务学生端课表

来源页面：

- `https://newjwxs.hgu.edu.cn/student/courseSelect/courseSelectResult/index`

页面标题：`选课结果`。页面初始化时会调用 JSON 回调接口填充课表。

核心数据接口：

- `https://newjwxs.hgu.edu.cn/student/courseSelect/thisSemesterCurriculum/callback`

返回字段：

- `allUnits`：本学期总学分
- `xkxx`：选课结果，内部按 `课程号_课序号` 存放课程对象
- `dateList`：培养方案/课程分类统计

课程对象内的 `timeAndPlaceList` 提供每条上课安排：

- `classDay`：星期，1-7
- `classSessions`：开始节次
- `continuingSession`：持续节次
- `weekDescription` / `classWeek`：周次
- `campusName`、`teachingBuildingName`、`classroomName`：校区、教学楼、教室

已集成方式：

1. 使用 CAS / WebVPN 会话访问“选课结果”页，建立教务系统访问状态。
2. 请求 `thisSemesterCurriculum/callback` 获取结构化课程数据。
3. 将 `timeAndPlaceList` 转为前端周课表需要的周次、星期、节次、时间段和地点。
4. 如果 JSON 接口临时异常，保留 HTML 表格解析作为兜底，并在失败时回退最近缓存。

后端接口：

| 功能 | 方法 | 路径 |
| --- | --- | --- |
| 选课结果课表 | GET | `/api/academic/timetable` |
| 新校区空闲教室 | GET | `/api/academic/free-classrooms` |
| 教学评估清单 | GET | `/api/academic/evaluations` |
| 加载单门评估问卷 | GET | `/api/academic/evaluations/:ktid` |
| 确认提交单门评估 | POST | `/api/academic/evaluations/:ktid/submit` |

## 本科教务教学评估

来源页面：

- `https://newjwxs.hgu.edu.cn/student/teachingEvaluation/newEvaluation/index`

学校页面使用的核心接口：

1. `POST /student/teachingAssessment/evaluation/queryAll`
   - `flag=ktjs`：课堂教师评估
   - 返回问卷、教师、课程、课程号/课序号、是否已评等信息
2. `GET /student/teachingEvaluation/newEvaluation/evaluation/{ktid}`
   - 返回动态题号字段、问卷编号 `wjbm`、课堂编号 `ktid` 和一次性 `tokenValue`
3. `POST /student/teachingAssessment/baseInformation/questionsAdd/doSave?tokenValue=...`
   - 使用 `multipart/form-data` 提交动态答案字段和问卷元数据

本地实现只展示当前登录用户自己的评估任务。加载问卷时，后端把学校令牌保存在短期内存草稿中，不把一次性令牌暴露给前端；草稿默认 15 分钟失效。分数题按学校返回的 `jgf` 上限预填，当前问卷上限是 10 分。提交仍需经过系统 CSRF 校验、用户确认、官方等待时间、重复评估检查和学校服务端校验，不尝试绕过已结束的评估窗口。

## 本科教务空闲教室

来源页面：

- `https://newjwxs.hgu.edu.cn/student/teachingResources/freeClassroom/index`

学校页面先按校区/楼宇进入当天空教室页，再按节次和日期偏移拉 JSON：

1. `POST /student/teachingResources/freeClassroom/today`
   - `position=00_n`：新校区全部楼宇
   - `position=00_203`：新校区指定楼宇，例如教一
   - `xqm=新校区`
2. `GET /student/teachingResources/freeClassroom/today/{sections}?dayplus={0|1|2}`
   - `sections`：节次，支持 `11,12` 这种多节次格式
   - `dayplus=0` 今天，`1` 明天，`2` 后天

项目只展示新校区，默认楼宇为适合自习的教学楼：`1号学院楼`、`2号学院楼`、`图书馆`、`实验楼`、`教一`、`教二`、`综合楼`。

本地 API：

```text
GET /api/academic/free-classrooms?dayplus=0&sections=11,12&building=study
```

`building` 可选：

- `study`：自习常用楼
- `all`：全部新校区楼宇
- `111`、`112`、`201`、`202`、`203`、`205`、`701`：指定楼宇

注意：

- `newjwxs.hgu.edu.cn` 外层会触发 `webvpn.hgu.edu.cn/controller/v1/public/verify` 校验。
- 项目会尝试 WebVPN 校验；如果实时同步失败，会返回 `data/academic-timetable-cache.json` 最近缓存，并带上 `live=false` 与 `staleReason`。
- 当前只做只读课表展示，不实现选课、退课、导出或打印等操作。
