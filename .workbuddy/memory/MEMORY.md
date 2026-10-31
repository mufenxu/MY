# 项目长期约定（MY）

## 安卓改动：本机验证口径（用户 2026-10-30 明确要求，长期生效）

产物只由 GitHub Actions 出，本机**不出包**。默认只跑两条，约 20 秒：

```bash
npm.cmd run check:android-design
cd apps/android-app && ./gradlew :app:compileDebugKotlin
```

- 不默认跑：`assembleDebug`（要装真机才跑）、`assembleRelease`（本机无 keystore，签名是仓库 secrets）、`connectedDebugAndroidTest`（需设备）、`lintDebug`/`lintRelease`（交给 CI）。
- 按改动类型追加：动 JVM 单测 → `testDebugUnitTest`；动 androidTest → `compileDebugAndroidTestKotlin`；动 Manifest/资源/权限/新增组件/依赖 → `lintDebug`（lint 红会让 CI 失败，必须补跑）。
- JAVA_HOME 已设为用户级环境变量 `D:\My-ruanjian\Android Studio\jbr`，直接 `./gradlew`，不再手动 export。
- 完整口径见 `apps/android-app/AGENTS.md` §13。

## 校园服务 / 安卓学校账号登录

- campus-service 的 401 统一码：`SCHOOL_ACCOUNT_REQUIRED`（判定在 `src/lib/auth-errors.js`，`respondApiError` 出口归一化）。安卓侧 `isSchoolAccountRequired` 刻意不并入 `shouldInvalidatePlatformSession`，否则会误把用户踢回登录页。
- 学校会话目前全局共享一份（`PLATFORM_SSO_CAMPUS_USERNAME:-admin` 把所有平台用户映射到 admin）。按平台用户隔离会话 jar 是 P2，未做。
