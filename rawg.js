import axios from 'axios';
import config from './config.js';

const BASE = 'https://api.rawg.io/api';

export async function searchGame(name) {
    const res = await axios.get(`${BASE}/games`, {
        params: { 
            key: config.rawgApiKey, 
            search: name,
            lang: 'pt-br' // Solicita resultados preferencialmente em PT-BR
        }
    });
    return res.data.results;
}

export async function getGameDetails(id) {
    const res = await axios.get(`${BASE}/games/${id}`, {
        params: { 
            key: config.rawgApiKey,
            lang: 'pt-br' // Garante que os detalhes tentem vir em português
        }
    });
    return res.data;
}