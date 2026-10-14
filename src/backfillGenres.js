const db = require('./db');
const imdb = require('./imdb');
const movies = require('./dbmodels/movies');

// Completa i generi IMDb dei film che non ne hanno: quelli aggiunti prima che
// la ricerca li salvasse. Da lanciare a mano, una volta, dopo la migration
// imdbGenres:
//
//   npm run backfill-genres
//
// E' idempotente: tocca solo i film con l'array vuoto, quindi rilanciarlo non
// fa danni.
async function run() {
    try {
        const list = await movies.listMoviesWithoutGenres();
        for (const movie of list) {
            const found = await imdb.getTitle(movie.imdb_id);
            const genres = found ? found.genres : [];
            await movies.setGenres(movie.movie_id, genres);
            console.log(`${movie.title}: ${genres.join(', ') || 'nessun genere su IMDb'}`);
        }
        console.log(`${list.length} film aggiornati`);
    }
    finally {
        await db.close();
    }
}

module.exports = { run };
