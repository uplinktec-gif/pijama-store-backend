import sql from 'sql.js';
import fs from 'fs';

const initDb = async () => {
  const SQL = await sql();
  const buffer = fs.readFileSync('./data/pijama-store.db');
  const db = new SQL.Database(buffer);
  
  const result = db.exec('SELECT username, email FROM admin_usuarios ORDER BY username;');
  console.log('Admin users in local database:');
  if (result.length > 0) {
    result[0].values.forEach(row => {
      console.log(`  - ${row[0]} (${row[1]})`);
    });
  } else {
    console.log('  No users found');
  }
};

initDb();
