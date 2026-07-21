// Dev Gateway Launcher
process.env.PLATFORM_AUTH_DISABLED = 'true';
process.env.PLATFORM_EXTERNAL_SERVICES = 'true';
process.env.CORE_SERVICE_URL = 'http://127.0.0.1:3045';
process.env.EXAM_SERVICE_URL = 'http://127.0.0.1:3110';
process.env.CAMPUS_SERVICE_URL = 'http://127.0.0.1:22101';
process.env.MQTT_SERVICE_URL = 'http://127.0.0.1:22102';
process.env.NOTIFICATION_SERVICE_URL = 'http://127.0.0.1:3000';
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'local-development-jwt-secret-key-32bytes-min';
if (!process.env.ENCRYPTION_KEY) process.env.ENCRYPTION_KEY = 'local-development-encryption-key-32bytes';

await import('../services/platform-api/src/server.mjs');
