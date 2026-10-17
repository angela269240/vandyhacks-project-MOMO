import oracledb from "oracledb";

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.fetchAsString = [oracledb.CLOB];

export const oracleConfigured = () =>
  Boolean(process.env.ORACLE_CONNECT_STRING && process.env.ORACLE_USER && process.env.ORACLE_PASSWORD);

// One small pool per function instance, reused across invocations (and across dev hot reloads).
const g = globalThis as unknown as { __socialMapperPool?: Promise<oracledb.Pool> };

function pool() {
  g.__socialMapperPool ??= oracledb.createPool({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING,
    poolMin: 0,
    poolMax: 4,
    poolIncrement: 1,
  });
  return g.__socialMapperPool;
}

export async function withConnection<T>(fn: (conn: oracledb.Connection) => Promise<T>): Promise<T> {
  const conn = await (await pool()).getConnection();
  try {
    return await fn(conn);
  } finally {
    await conn.close();
  }
}

export async function query<T>(sql: string, binds: oracledb.BindParameters = {}): Promise<T[]> {
  return withConnection(async (conn) => {
    const res = await conn.execute<T>(sql, binds);
    return (res.rows ?? []) as T[];
  });
}
