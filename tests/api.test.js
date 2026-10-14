const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { buildServer, call, fixtures, fakeImdbId } = require('./helpers');

let server = null;

before(async () => {
    server = buildServer();
    await server.ready();
});

after(async () => {
    await server.close();
});

test('health', async () => {
    assert.deepEqual((await call(server, 'GET', '/api/health')).body, { status: 'ok' });
});

// ---------- film ----------

test('crud di un film', async (t) => {
    const { addUser, addMovie } = fixtures(t, server);
    const user = await addUser();
    const movie = await addMovie('  Alien ', {
        owner: user, year: 1979, director: 'Ridley Scott', genres: ['Horror', ' Fantascienza '],
        poster_url: 'https://m.media-amazon.com/images/M/x._V1_QL75_UX300_.jpg',
    });
    assert.equal(movie.title, 'Alien');
    assert.equal(movie.director, 'Ridley Scott');
    assert.deepEqual(movie.genres, ['Horror', 'Fantascienza']);
    assert.ok(movie.imdb_id.startsWith('tt'));
    assert.equal(movie.user_name, user.name);
    assert.equal(movie.watched, null);

    // La modifica tocca solo note e utente: i dati IMDb restano com'erano.
    const other = await addUser();
    const url = `/api/movies/${movie.movie_id}`;
    const body = { notes: 'in originale', user_id: other.user_id, title: 'Altro', genres: ['Western'] };
    const edited = (await call(server, 'PUT', url, body)).body;
    assert.equal(edited.notes, 'in originale');
    assert.equal(edited.user_name, other.name);
    assert.equal(edited.title, 'Alien');
    assert.deepEqual(edited.genres, ['Horror', 'Fantascienza']);

    const watched = (await call(server, 'PUT', `${url}/watched`, { watched: true })).body;
    assert.notEqual(watched.watched, null);

    const listed = (await call(server, 'GET', '/api/movies')).body.map((item) => item.movie_id);
    assert.ok(listed.includes(movie.movie_id));

    assert.deepEqual((await call(server, 'DELETE', url)).body, { deleted: movie.movie_id });
    assert.equal((await call(server, 'DELETE', url)).status, 404);
});

test('lo stesso film IMDb una volta sola', async (t) => {
    const { addUser, addMovie } = fixtures(t, server);
    const user = await addUser();
    const movie = await addMovie('Alien', { owner: user });
    const body = { imdb_id: movie.imdb_id, title: 'Alien', user_id: user.user_id };
    assert.equal((await call(server, 'POST', '/api/movies', body)).status, 409);
});

test('un film visto si puo\' riaggiungere', async (t) => {
    const { created, addUser, addMovie, watch } = fixtures(t, server);
    const first = await addMovie('Alien', { owner: await addUser() });
    await watch(first);

    // Riaggiunto, magari da un altro: riga nuova, candidata; la vecchia resta
    // nei visti e continua a contare per chi l'aveva proposto.
    const other = await addUser();
    const body = { imdb_id: first.imdb_id, title: 'Alien', user_id: other.user_id };
    const res = await call(server, 'POST', '/api/movies', body);
    assert.equal(res.status, 201);
    const again = res.body;
    created.movies.push(again.movie_id);
    assert.notEqual(again.movie_id, first.movie_id);
    assert.equal(again.watched, null);
    assert.equal(again.user_name, other.name);

    const rows = (await call(server, 'GET', '/api/movies')).body.filter((m) => m.imdb_id === first.imdb_id);
    assert.deepEqual(rows.map((m) => m.watched === null).sort(), [false, true]);

    // Una seconda copia fra i da vedere no: ne' aggiunta, ne' rimettendo in
    // gioco quella vecchia.
    assert.equal((await call(server, 'POST', '/api/movies', body)).status, 409);
    const back = await call(server, 'PUT', `/api/movies/${first.movie_id}/watched`, { watched: false });
    assert.equal(back.status, 409);
});

test('un film non valido viene rifiutato', async (t) => {
    const { addUser } = fixtures(t, server);
    const user = await addUser();

    async function post(fields) {
        const body = { imdb_id: fakeImdbId(), title: 'X', user_id: user.user_id, ...fields };
        return (await call(server, 'POST', '/api/movies', body)).status;
    }

    assert.equal(await post({ imdb_id: 'nm0000631' }), 422);
    assert.equal(await post({ title: '   ' }), 422);
    assert.equal(await post({ poster_url: 'javascript:alert(1)' }), 422);
    assert.equal(await post({ genres: ['  '] }), 422);
});

test('un film vuole un utente che esiste', async () => {
    const body = { imdb_id: fakeImdbId(), title: 'X' };
    assert.equal((await call(server, 'POST', '/api/movies', body)).status, 422);
    const res = await call(server, 'POST', '/api/movies', { ...body, user_id: 999999999 });
    assert.equal(res.status, 422);
    assert.equal(res.body.detail, 'Utente non trovato');
});

test('un film che non esiste e\' 404', async () => {
    assert.equal((await call(server, 'PUT', '/api/movies/999999999', { notes: 'X' })).status, 404);
    assert.equal((await call(server, 'PUT', '/api/movies/999999999/watched', { watched: true })).status, 404);
    // Un id fuori dagli integer di Postgres non arriva al database.
    assert.equal((await call(server, 'DELETE', '/api/movies/99999999999')).status, 422);
});

// ---------- utenti ----------

test('crud di un utente', async (t) => {
    const { addUser, addMovie, watch } = fixtures(t, server);
    const user = await addUser('stefano');
    assert.equal(user.candidates, 0);
    assert.equal(user.watched, 0);

    const url = `/api/users/${user.user_id}`;
    const renamed = (await call(server, 'PUT', url, { name: `  ${user.name}-bis ` })).body;
    assert.equal(renamed.name, `${user.name}-bis`);

    // Il nome e' unico senza distinzione di maiuscole.
    const other = await addUser('simone');
    assert.equal((await call(server, 'POST', '/api/users', { name: other.name.toUpperCase() })).status, 409);
    assert.equal((await call(server, 'PUT', url, { name: other.name.toUpperCase() })).status, 409);

    // I conteggi seguono i film.
    const movie = await addMovie('Alien', { owner: user });
    await addMovie('Heat', { owner: user });
    await watch(movie);
    const listed = (await call(server, 'GET', '/api/users')).body.find((item) => item.user_id === user.user_id);
    assert.equal(listed.candidates, 1);
    assert.equal(listed.watched, 1);

    // Con dei film non si cancella; senza, si'.
    assert.equal((await call(server, 'DELETE', url)).status, 409);
    const otherUrl = `/api/users/${other.user_id}`;
    assert.deepEqual((await call(server, 'DELETE', otherUrl)).body, { deleted: other.user_id });
    assert.equal((await call(server, 'DELETE', otherUrl)).status, 404);
});

test('il nome utente e\' obbligatorio', async () => {
    assert.equal((await call(server, 'POST', '/api/users', { name: '   ' })).status, 422);
});

// ---------- estrazione ----------

test('si estraggono solo i non visti del genere', async (t) => {
    const { addUser, addMovie, watch, genre } = fixtures(t, server);
    const owner = await addUser();

    // Nessun film di questo genere: niente da estrarre.
    assert.equal((await call(server, 'POST', '/api/draw', { genre })).status, 409);

    const alien = await addMovie('Alien', { genre, owner });
    await watch(await addMovie('Heat', { genre, owner }));

    // Il genere filtra fra i generi di ogni film, senza distinzione di
    // maiuscole; Heat e' gia' visto.
    for (let i = 0; i < 5; i++) {
        const pick = (await call(server, 'POST', '/api/draw', { genre: genre.toUpperCase() })).body;
        assert.equal(pick.movie.movie_id, alien.movie_id);
    }

    const history = (await call(server, 'GET', '/api/picks')).body;
    assert.equal(history[0].movie.title, 'Alien');
});

test('le probabilita\' pesano le scelte passate', async (t) => {
    const { addUser, addMovie, watch, genre } = fixtures(t, server);
    const lucky = await addUser('fortunato');   // 3 film gia' visti: peso 1/4
    const behind = await addUser('indietro');   // nessuno: peso 1
    for (const title of ['A', 'B', 'C']) {
        await watch(await addMovie(title, { genre, owner: lucky }));
    }
    await addMovie('D', { genre, owner: lucky });
    // Quanti film si propongono non conta: tre candidati pesano come uno.
    for (const title of ['E', 'F', 'G']) {
        await addMovie(title, { genre, owner: behind });
    }

    const rows = (await call(server, 'GET', `/api/draw/odds?genre=${genre}`)).body;
    const odds = Object.fromEntries(rows.map((row) => [row.user_name, row]));
    assert.equal(odds[behind.name].probability, 0.8);
    assert.equal(odds[behind.name].candidates, 3);
    assert.equal(odds[lucky.name].probability, 0.2);
    assert.equal(odds[lucky.name].watched, 3);
});

test('estrazione per utente', async (t) => {
    const { addUser, addMovie, watch, genre } = fixtures(t, server);
    const lucky = await addUser('fortunato');
    const behind = await addUser('indietro');
    await watch(await addMovie('A', { genre, owner: lucky }));
    const luckyMovies = new Set();
    for (const title of ['B', 'C']) {
        luckyMovies.add((await addMovie(title, { genre, owner: lucky })).movie_id);
    }
    await addMovie('D', { genre, owner: behind });

    // Filtrando per utente esce solo lui, al 100%, anche se il peso lo sfavorirebbe.
    const odds = (await call(server, 'GET', `/api/draw/odds?genre=${genre}&user_id=${lucky.user_id}`)).body;
    assert.deepEqual(odds.map((row) => [row.user_name, row.probability]), [[lucky.name, 1]]);

    // A caso fra i suoi: in 30 giri escono entrambi.
    const drawn = new Set();
    for (let i = 0; i < 30; i++) {
        const pick = (await call(server, 'POST', '/api/draw', { genre, user_id: lucky.user_id })).body;
        drawn.add(pick.movie.movie_id);
    }
    assert.deepEqual(drawn, luckyMovies);

    // Un utente senza candidati (col genere scelto): niente da estrarre.
    const other = await addUser();
    assert.equal((await call(server, 'POST', '/api/draw', { genre, user_id: other.user_id })).status, 409);
});

test('l\'estrazione segue le probabilita\'', async (t) => {
    const { addUser, addMovie, watch, genre } = fixtures(t, server);
    const lucky = await addUser('fortunato');
    const behind = await addUser('indietro');
    for (const title of ['A', 'B', 'C']) {
        await watch(await addMovie(title, { genre, owner: lucky }));
    }
    await addMovie('D', { genre, owner: lucky });
    await addMovie('E', { genre, owner: behind });

    // Atteso 80% a "indietro". Con 300 estrazioni la deviazione standard e'
    // ~2,3 punti: la forbice 70-90% e' oltre 4 sigma, non fallisce per caso.
    const draws = 300;
    let wins = 0;
    for (let i = 0; i < draws; i++) {
        const pick = (await call(server, 'POST', '/api/draw', { genre })).body;
        if (pick.movie.user_name === behind.name) {
            wins++;
        }
    }
    assert.ok(wins / draws > 0.70 && wins / draws < 0.90, `${wins} su ${draws}`);
});
