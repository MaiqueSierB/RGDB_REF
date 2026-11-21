import 'dotenv/config';
import fs from 'node:fs';
import dotenv from 'dotenv';

// Na Hostinger: segredos (TOKEN, RAWG_API_KEY...) ficam fora da public_html,
// num arquivo que não é apagado nos deploys nem fica acessível pela web.
const secretsFile = process.env.SECRETS_FILE || '/home/u243267678/domains/mrbnexus.com.br/.rgdb.env';
if (fs.existsSync(secretsFile)) dotenv.config({ path: secretsFile });
console.log(`Segredos: ${secretsFile} ${fs.existsSync(secretsFile) ? 'encontrado' : 'NÃO encontrado'}; ` +
    ['TOKEN', 'CLIENT_ID', 'GUILD_ID', 'RAWG_API_KEY']
        .map(k => `${k}=${process.env[k] ? 'ok' : 'faltando'}`).join(' '));

// Este objeto vai conter todas as nossas variáveis de ambiente.
// Nós lemos do process.env aqui, e apenas aqui.
const config = {
    token: process.env.TOKEN,
    clientId: process.env.CLIENT_ID,
    guildId: process.env.GUILD_ID,
    rawgApiKey: process.env.RAWG_API_KEY
};

// Exportamos o objeto para que outros ficheiros o possam importar.
export default config;