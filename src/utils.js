// Gli errori hanno la forma { detail }, la stessa dell'API Python che questa
// ha sostituito: la UI la legge cosi' (plugins/api.js).
function httpError(reply, status, detail) {
    return reply.status(status).send({ detail });
}

// Gli spazi in testa e in coda non fanno parte di un valore: un titolo di soli
// spazi non e' un titolo, e " Stefano" e "Stefano" sono lo stesso nome. Una
// stringa vuota diventa null, cioe' "non c'e'". Scende in oggetti e array
// (i generi di un film).
function trimStrings(value) {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed === '') {
            return null;
        }
        return trimmed;
    }
    if (Array.isArray(value)) {
        return value.map(trimStrings);
    }
    if (value !== null && typeof value === 'object') {
        for (const key of Object.keys(value)) {
            value[key] = trimStrings(value[key]);
        }
    }
    return value;
}

module.exports = { httpError, trimStrings };
