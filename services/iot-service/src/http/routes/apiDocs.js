function createApiDocsMarkdown(baseUrl) {
  return `# MQTT Smart Dashboard API Developer Documentation (LLM & AI Friendly)

This documentation provides the official API endpoints of the MQTT Smart Dashboard. It is designed to be easily read and parsed by AI assistants (like Gemini, ChatGPT, Claude) to help write code integrations for WeChat mini-programs, dashboard displays, or other third-party services.

---

## 🔒 Authentication

All API requests must carry the following HTTP authorization header. 

\`\`\`http
Authorization: Bearer sk_mqttapi_your_token_here
\`\`\`

> **Note:** Replace \`sk_mqttapi_your_token_here\` with a valid API Key generated from the system administrator's console.

---

## 📡 API Endpoints Reference

### 1. Get Device Snapshots
Retrieve real-time snapshots of all registered IoT devices, including sensor metrics (temperature, humidity), relay statuses, and online state.

- **Method**: \`GET\`
- **Path**: \`/api/devices\`
- **Authentication**: Required (Bearer Token)
- **Response Format**: JSON (Array of Devices)

#### cURL Example:
\`\`\`bash
curl -X GET "${baseUrl}/api/devices" \\
  -H "Authorization: Bearer sk_mqttapi_your_token_here"
\`\`\`

#### JavaScript (Fetch) Example:
\`\`\`javascript
fetch("${baseUrl}/api/devices", {
  method: "GET",
  headers: {
    "Authorization": "Bearer sk_mqttapi_your_token_here"
  }
})
.then(res => res.json())
.then(data => console.log(data));
\`\`\`

---

### 2. Control Device Relay
Publish control directives to open or close a specific relay switch on a device.

- **Method**: \`POST\`
- **Path**: \`/api/devices/:deviceId/relays/:relayId/control\`
- **Authentication**: Required (Bearer Token)
- **Request Body (JSON)**:
  - \`status\`: \`"on"\` (close/enable) or \`"off"\` (open/disable).
- **Response Format**: JSON (Result confirmation)

#### cURL Example:
\`\`\`bash
curl -X POST "${baseUrl}/api/devices/esp8266_living/relays/relay1/control" \\
  -H "Authorization: Bearer sk_mqttapi_your_token_here" \\
  -H "Content-Type: application/json" \\
  -d '{"status": "on"}'
\`\`\`

#### JavaScript (Fetch) Example:
\`\`\`javascript
fetch("${baseUrl}/api/devices/esp8266_living/relays/relay1/control", {
  method: "POST",
  headers: {
    "Authorization": "Bearer sk_mqttapi_your_token_here",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ status: "on" })
})
.then(res => res.json())
.then(data => console.log(data));
\`\`\`

---

### 3. Query Sensor History Timeseries
Query history log of temperature and humidity readings for a specific device, supporting query limits and time-span ranges.

- **Method**: \`GET\`
- **Path**: \`/api/devices/:deviceId/history\`
- **Authentication**: Required (Bearer Token)
- **Query Parameters**:
  - \`limit\` (Optional): Maximum number of log records to fetch. Default is \`100\`. Value must be between \`1\` and \`500\`.
  - \`range\` (Optional): Time range window to filter records. Supported options:
    - \`1h\` : Retrieve data within the last hour.
    - \`24h\`: Retrieve data within the last 24 hours.
    - \`7d\` : Retrieve data within the last 7 days.
    - *Note*: If \`range\` is specified, timeseries filtering takes priority and the maximum record limit is hard-capped at 500.

#### cURL Examples:
\`\`\`bash
# Example 1: Fetch default 100 latest samples
curl -X GET "${baseUrl}/api/devices/esp8266_living/history" \\
  -H "Authorization: Bearer sk_mqttapi_your_token_here"

# Example 2: Query last 24 hours of data
curl -X GET "${baseUrl}/api/devices/esp8266_living/history?range=24h" \\
  -H "Authorization: Bearer sk_mqttapi_your_token_here"
\`\`\`

#### JavaScript (Fetch) Example:
\`\`\`javascript
fetch("${baseUrl}/api/devices/esp8266_living/history?range=24h", {
  method: "GET",
  headers: {
    "Authorization": "Bearer sk_mqttapi_your_token_here"
  }
})
.then(res => res.json())
.then(data => {
  console.log(data);
});
\`\`\`
`;
}

function registerApiDocsRoute(app) {
  app.get('/api-docs', (req, res) => {
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');

    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.get('host') || 'localhost:4066';
    res.send(createApiDocsMarkdown(`${protocol}://${host}`));
  });
}

module.exports = {
  createApiDocsMarkdown,
  registerApiDocsRoute
};
