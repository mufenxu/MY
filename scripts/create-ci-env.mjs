import crypto from 'node:crypto';
import { chmod, chown, stat, writeFile } from 'node:fs/promises';
import { createPasswordHash } from '../apps/admin-console/src/auth.js';

const random = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
const privateValue = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64url');
const publicValue = publicKey.export({ format: 'der', type: 'spki' }).toString('base64url');
const adminPassword = `Aa1!${random(18)}`;
const adminPasswordHash = await createPasswordHash(adminPassword);
const dockerGid = process.platform === 'win32' ? 0 : (await stat('/var/run/docker.sock')).gid;

const values = {
  TZ: 'Asia/Shanghai',
  COMPOSE_PROFILES: 'release',
  MONGODB_IMAGE: 'my-platform/mongodb:ci',
  PLATFORM_API_IMAGE: 'my-platform/platform-api:ci',
  CORE_API_IMAGE: 'my-platform/core-api:ci',
  EXAM_API_IMAGE: 'my-platform/exam-api:ci',
  NOTIFICATION_SERVICE_IMAGE: 'my-platform/notification-service:ci',
  BACKUP_RUNNER_IMAGE: 'my-platform/backup-runner:ci',
  DEPLOYMENT_RUNNER_IMAGE: 'my-platform/deployment-runner:ci',
  DEPLOY_RUNNER_WORKSPACE_ROOT: process.platform === 'win32' ? '/opt/my-platform' : process.cwd(),
  DEPLOY_RUNNER_COMPOSE_PATH: 'infra/docker/compose.yml',
  DEPLOY_RUNNER_DOCKER_GID: String(dockerGid),
  CAMPUS_SERVICE_IMAGE: 'my-platform/campus-service:ci',
  IOT_SERVICE_IMAGE: 'my-platform/iot-service:ci',
  PLATFORM_BIND_ADDRESS: '127.0.0.1',
  PLATFORM_API_PORT: '22100',
  PLATFORM_PUBLIC_ORIGIN: 'https://admin.example.com',
  CORE_HOSTS: 'core.example.com',
  EXAM_HOSTS: 'exam.example.com',
  NOTIFY_HOSTS: 'notify.example.com',
  CAMPUS_BIND_ADDRESS: '127.0.0.1',
  CAMPUS_PORT: '22101',
  IOT_BIND_ADDRESS: '127.0.0.1',
  IOT_PORT: '22102',
  IOT_PUBLIC_ORIGIN: 'https://admin.example.com',
  MONGO_ROOT_USERNAME: 'root',
  MONGO_ROOT_PASSWORD: random(24),
  MONGO_REPLICA_SET_KEY: crypto.randomBytes(48).toString('base64'),
  MONGO_PLATFORM_USERNAME: 'platform_app',
  MONGO_PLATFORM_PASSWORD: random(24),
  MONGO_CORE_USERNAME: 'core_app',
  MONGO_CORE_PASSWORD: random(24),
  MONGO_EXAM_USERNAME: 'exam_app',
  MONGO_EXAM_PASSWORD: random(24),
  MONGO_CAMPUS_USERNAME: 'campus_app',
  MONGO_CAMPUS_PASSWORD: random(24),
  MONGO_IOT_USERNAME: 'iot_app',
  MONGO_IOT_PASSWORD: random(24),
  MONGO_NOTIFICATION_USERNAME: 'notification_app',
  MONGO_NOTIFICATION_PASSWORD: random(24),
  MONGO_BACKUP_USERNAME: 'platform_backup',
  MONGO_BACKUP_PASSWORD: random(24),
  PLATFORM_ADMIN_USERNAME: 'admin',
  CI_PLATFORM_ADMIN_PASSWORD: adminPassword,
  PLATFORM_ADMIN_PASSWORD_HASH: `'${adminPasswordHash}'`,
  PLATFORM_SESSION_SECRET: random(),
  PLATFORM_INTERNAL_AUTH_PRIVATE_KEY: privateValue,
  PLATFORM_INTERNAL_AUTH_PUBLIC_KEY: publicValue,
  PLATFORM_SESSION_TTL_HOURS: '12',
  PLATFORM_METRICS_TOKEN: random(),
  PLATFORM_BACKUP_RUNNER_TOKEN: random(),
  PLATFORM_GITHUB_TOKEN: '',
  PLATFORM_RELEASE_ACTIONS_ENABLED: 'false',
  PLATFORM_RELEASE_ENVIRONMENT: 'production',
  PLATFORM_RELEASE_CALLBACK_TOKEN: random(),
  PLATFORM_RELEASE_ALLOWED_IMAGE_REPOSITORY: 'registry.example.com/team/platform',
  PLATFORM_DEPLOY_HOOK_URL: 'http://deployment-runner:22104',
  PLATFORM_DEPLOY_HOOK_TOKEN: random(),
  DEPLOY_RUNNER_ENV_FILE: process.argv[2] || '.env',
  DEPLOY_RUNNER_ALLOW_MONGODB: 'false',
  PLATFORM_SSO_CORE_USERNAME: 'admin',
  PLATFORM_SSO_EXAM_USERNAME: 'admin',
  CORE_JWT_SECRET: random(),
  CORE_ENCRYPTION_KEY: random(24),
  CORE_WECHAT_APP_ID: 'wx_ci_core',
  CORE_WECHAT_APP_SECRET: random(),
  GH_WEBHOOK_SECRET: '',
  GH_WEBHOOK_ENABLED: 'false',
  MQTT_API_KEY: '',
  EXAM_JWT_SECRET: random(),
  EXAM_WECHAT_APP_ID: 'wx_ci_exam',
  EXAM_WECHAT_APP_SECRET: random(),
  EXAM_CORS_ORIGINS: 'https://exam.example.com,https://admin.example.com',
  EXAM_DEFAULT_ADMIN_USERNAME: 'admin',
  EXAM_DEFAULT_ADMIN_DISPLAY_NAME: 'CI Admin',
  EXAM_DEFAULT_ADMIN_PASSWORD: `Aa1!${random(18)}`,
  EXAM_SEED_SAMPLE_DATA: 'false',
  WECOM_CORP_ID: 'ww_ci',
  WECOM_AGENT_ID: '1000002',
  WECOM_SECRET: random(),
  NOTIFY_API_KEY: random(),
  NOTIFY_HISTORY_ENCRYPTION_KEY: random(),
  TOKEN_CACHE_MARGIN: '120',
  HGU_ADMIN_USERNAME: 'admin',
  PLATFORM_SSO_CAMPUS_USERNAME: 'admin',
  HGU_ADMIN_PASSWORD: `Aa1!${random(18)}`,
  HGU_APP_SESSION_SECRET: random(),
  HGU_DATA_ENCRYPTION_KEY: random(),
  HGU_EXTRA_ALLOWED_SCHOOL_HOSTS: '',
  MQTT_URL: 'mqtt://mqtt-ci:1883',
  MQTT_USERNAME: '',
  MQTT_PASSWORD: '',
  MQTT_CLIENT_ID: 'my-platform-ci',
  IOT_ADMIN_USERNAME: 'admin',
  IOT_ADMIN_PASSWORD: `Aa1!${random(18)}`,
  IOT_SESSION_SECRET: random(),
  IOT_LOG_HTTP_REQUESTS: '0',
};

const output = `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n')}\n`;
const destination = process.argv[2];
if (destination) {
  await writeFile(destination, output, { encoding: 'utf8', mode: 0o600 });
  if (process.platform !== 'win32') {
    await chown(destination, process.getuid(), dockerGid);
    await chmod(destination, 0o640);
  }
}
else process.stdout.write(output);
