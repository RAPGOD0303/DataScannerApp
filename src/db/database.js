import SQLite from 'react-native-sqlite-storage';

SQLite.DEBUG(true);
SQLite.enablePromise(true);

const DB_NAME = 'datascanner.db';

// points to Documents dir inside app sandbox
export async function openDB() {
  try {
    const db = await SQLite.openDatabase({
      name: DB_NAME,
      location: 'Documents',
    });
    return db;
  } catch (e) {
    console.error('DB open error:', e);
    throw e;
  }
}

export async function executeSql(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql(
        sql,
        params,
        (_, result) => resolve(result),
        (_, error) => {
          reject(error);
          return false;
        }
      );
    });
  });
}

export async function initDB() {
  const db = await openDB();

  // ensure table exists
  await executeSql(
    db,
    `CREATE TABLE IF NOT EXISTS scans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      aadhaar TEXT,
      recognized_text TEXT,
      file_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`
  );

  return db;
}
