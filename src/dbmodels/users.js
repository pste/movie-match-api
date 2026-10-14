const { fetchAll, fetchOne } = require('../db');

// Ogni utente con quanti film ha ancora in gara e quanti ne sono gia' stati
// visti: il secondo numero e' quello che pesa nell'estrazione (picks.js).
// ::int perche' count() e' bigint, e pg lo restituirebbe come stringa.
const SELECT_USERS = `
    SELECT u.user_id, u."name",
           (count(m.movie_id) FILTER (WHERE m.watched IS NULL))::int AS candidates,
           (count(m.movie_id) FILTER (WHERE m.watched IS NOT NULL))::int AS watched
    FROM users u
    LEFT JOIN movies m ON m.user_id = u.user_id
`;

async function listUsers() {
    return await fetchAll(SELECT_USERS + ' GROUP BY u.user_id ORDER BY lower(u."name")');
}

async function getUser(userId) {
    return await fetchOne(SELECT_USERS + ' WHERE u.user_id = $1 GROUP BY u.user_id', [userId]);
}

// Un nome gia' usato (senza distinzione di maiuscole) solleva
// UNIQUE_VIOLATION: la gestisce la rotta.
async function addUser(name) {
    const row = await fetchOne('INSERT INTO users ("name") VALUES ($1) RETURNING user_id', [name]);
    return await getUser(row.user_id);
}

async function renameUser(userId, name) {
    const row = await fetchOne('UPDATE users SET "name" = $2 WHERE user_id = $1 RETURNING user_id', [userId, name]);
    if (!row) {
        return null;
    }
    return await getUser(userId);
}

// Un utente con dei film solleva FOREIGN_KEY_VIOLATION (ON DELETE RESTRICT):
// la gestisce la rotta.
async function deleteUser(userId) {
    const row = await fetchOne('DELETE FROM users WHERE user_id = $1 RETURNING user_id', [userId]);
    return row !== null;
}

module.exports = { listUsers, addUser, renameUser, deleteUser };
