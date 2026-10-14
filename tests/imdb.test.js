const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const imdb = require('../src/imdb');
const { buildServer, call } = require('./helpers');

// IMDb senza rete: parsing delle risposte e comportamento quando non risponde.

let server = null;

before(async () => {
    server = buildServer();
    await server.ready();
});

after(async () => {
    await server.close();
});

test('locandina ridimensionata', () => {
    const url = 'https://m.media-amazon.com/images/M/MV5BN2Nh@._V1_.jpg';
    assert.equal(imdb.resizePoster(url), 'https://m.media-amazon.com/images/M/MV5BN2Nh@._V1_QL75_UX300_.jpg');
    assert.equal(imdb.resizePoster(null), null);
});

test('parsing della ricerca', () => {
    const payload = { data: { mainSearch: { edges: [
        { node: { entity: {
            id: 'tt0078748',
            titleText: { text: 'Alien' },
            releaseYear: { year: 1979 },
            primaryImage: { url: 'https://m.media-amazon.com/images/M/a._V1_.jpg' },
            titleGenres: { genres: [{ genre: { text: 'Horror' } }, { genre: { text: 'Fantascienza' } }] },
            directors: { edges: [{ node: { name: { nameText: { text: 'Ridley Scott' } } } }] },
        } } },
        // senza anno, locandina, generi e regista
        { node: { entity: {
            id: 'tt0000001',
            titleText: { text: 'Senza dati' },
            releaseYear: null,
            primaryImage: null,
            titleGenres: null,
            directors: { edges: [] },
        } } },
        // un risultato che non e' un titolo
        { node: { entity: {} } },
    ] } } };
    assert.deepEqual(imdb.parseSearch(payload), [
        { imdb_id: 'tt0078748', title: 'Alien', year: 1979,
          poster_url: 'https://m.media-amazon.com/images/M/a._V1_QL75_UX300_.jpg', director: 'Ridley Scott',
          genres: ['Horror', 'Fantascienza'] },
        { imdb_id: 'tt0000001', title: 'Senza dati', year: null, poster_url: null, director: null,
          genres: [] },
    ]);
});

test('IMDb giu\' e\' 502', async (t) => {
    t.mock.method(imdb, 'search', async () => {
        throw new imdb.ImdbError('timeout');
    });
    const res = await call(server, 'GET', '/api/imdb/search?q=alien');
    assert.equal(res.status, 502);
    assert.equal(res.body.detail, 'IMDb non risponde, riprova fra poco');
});

test('la ricerca vuole almeno due caratteri', async () => {
    assert.equal((await call(server, 'GET', '/api/imdb/search?q=a')).status, 422);
});
