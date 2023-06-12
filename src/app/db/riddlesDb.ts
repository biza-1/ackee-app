import * as sqlite3  from 'sqlite3';

const db = new sqlite3.Database(':memory:');

// create DBs
db.serialize(() => {
  db.run('CREATE TABLE problems (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, authorId TEXT, question TEXT)');
  db.run('CREATE TABLE userAnswered (id INTEGER PRIMARY KEY AUTOINCREMENT, problemId INTEGER, userId TEXT)');
});

// create mock data
db.serialize(() => {
  db.run('INSERT INTO problems (type, authorId, question) VALUES (?, ?, ?)', ['riddle', 'matej', "what is 5 o 4?"]);
  db.run('INSERT INTO problems (type, authorId, question) VALUES (?, ?, ?)', ['expression', 'matej', "5+1"]);
});

export default db
