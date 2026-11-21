// Buscas na RAWG (jogos)
import config from './config.js';

const BASE = 'https://api.rawg.io/api';

async function rawg(caminho, params = {}) {
    const qs = new URLSearchParams({ key: config.rawgApiKey, lang: 'pt-br', ...params });
    const res = await fetch(`${BASE}${caminho}?${qs}`);
    if (!res.ok) throw new Error(`RAWG respondeu ${res.status}`);
    return res.json();
}

export async function searchGame(name) {
    return (await rawg('/games', { search: name })).results;
}

export const getGameDetails = id => rawg(`/games/${id}`);
