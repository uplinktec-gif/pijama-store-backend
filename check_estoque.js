const initSqlJs = require('sql.js');
const fs = require('fs');

async function checkEstoque() {
  try {
    const SQL = await initSqlJs();
    const filebuffer = fs.readFileSync('data/pijama-store.db');
    const db = new SQL.Database(filebuffer);
    
    const result = db.exec('SELECT COUNT(*) as qtd FROM estoque');
    if (result.length > 0) {
      console.log('Current estoque items:', result[0].values[0][0]);
      
      // Also get a sample of data
      const sample = db.exec('SELECT modelo, tamanho, cor, quantidade_total FROM estoque LIMIT 3');
      if (sample.length > 0) {
        console.log('\nSample data:');
        sample[0].values.forEach(row => {
          console.log(`  ${row[0]} - ${row[1]} - ${row[2]}: ${row[3]} units`);
        });
      }
    }
    db.close();
  } catch(e) {
    console.error('Error:', e.message);
  }
}

checkEstoque();
