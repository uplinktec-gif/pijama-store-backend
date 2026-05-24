import initSqlJs from 'sql.js';
import fs from 'fs';

const SQL = await initSqlJs();
const filebuffer = fs.readFileSync('data/pijama-store.db');
const db = new SQL.Database(filebuffer);

const result = db.exec('SELECT COUNT(*) as qtd FROM estoque');
if (result.length > 0) {
  console.log('Current estoque items:', result[0].values[0][0]);
  
  const sample = db.exec('SELECT modelo, tamanho, cor, quantidade_total FROM estoque LIMIT 5');
  if (sample.length > 0) {
    console.log('\nSample of current data:');
    sample[0].values.forEach(row => {
      console.log(`  ${row[0]}_${row[1]}_${row[2]}: ${row[3]} units`);
    });
  }
}
db.close();
