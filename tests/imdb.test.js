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

test('parsing delle piattaforme', () => {
    const option = (id, link, logo = 'https://m.media-amazon.com/images/M/x._V1_.png') => ({
        provider: { id: `amzn1.imdb.w2w.provider.${id}`, logos: logo ? { icon: { url: logo } } : null },
        link,
    });
    const payload = { data: { title: { watchOptionsByCategory: { categorizedWatchOptionsList: [
        { categoryName: { value: 'STREAMING' }, watchOptions: [
            option('disneyplus', 'https://www.disneyplus.com/play/1', null),
            // fuori lista
            option('now_tv', 'https://www.nowtv.it/'),
            option('netflix', 'https://www.netflix.com/watch/1'),
            option('prime_video.PRIME', 'https://www.primevideo.com/2'),
            // doppione
            option('netflix', 'https://www.netflix.com/watch/2'),
        ] },
        // a pagamento: non conta
        { categoryName: { value: 'RENT/BUY' }, watchOptions: [option('prime_video', 'https://www.primevideo.com/1')] },
    ] } } } };
    assert.deepEqual(imdb.parseWatchOptions(payload), [
        { name: 'Disney+', logo_url: null, link: 'https://www.disneyplus.com/play/1' },
        { name: 'Netflix', logo_url: 'https://m.media-amazon.com/images/M/x._V1_QL75_UX64_.jpg', link: 'https://www.netflix.com/watch/1' },
        { name: 'Prime Video', logo_url: 'https://m.media-amazon.com/images/M/x._V1_QL75_UX64_.jpg', link: 'https://www.primevideo.com/2' },
    ]);
    // film senza piattaforme
    assert.deepEqual(imdb.parseWatchOptions({ data: { title: { watchOptionsByCategory: null } } }), []);
});

test('piattaforme: IMDb giu\' e\' 502, id non valido 422', async (t) => {
    t.mock.method(imdb, 'getWatchOptions', async () => {
        throw new imdb.ImdbError('timeout');
    });
    assert.equal((await call(server, 'GET', '/api/imdb/tt0120737/platforms')).status, 502);
    assert.equal((await call(server, 'GET', '/api/imdb/nm0000631/platforms')).status, 422);
});
