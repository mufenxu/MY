export function buildMongoshArguments({ username, password, authenticationDatabase, script }) {
  return [
    'mongosh',
    '--quiet',
    '--host=127.0.0.1',
    '--port=27017',
    `--username=${username}`,
    `--password=${password}`,
    `--authenticationDatabase=${authenticationDatabase}`,
    '--eval',
    script,
  ];
}
