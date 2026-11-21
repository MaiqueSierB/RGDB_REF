import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import config from './config.js';

const commands = [
    // /jogo
    new SlashCommandBuilder()
        .setName('jogo')
        .setDescription('Procurar um jogo para avaliar')
        .addStringOption(o =>
            o.setName('titulo')
             .setDescription('Nome do jogo')
             .setRequired(true)
        ),

    // /jogosavaliados
    new SlashCommandBuilder()
        .setName('jogosavaliados')
        .setDescription('Lista todos os jogos que o servidor já avaliou'),

    // /ranking
    new SlashCommandBuilder()
        .setName('ranking')
        .setDescription('Ver o ranking de XP dos jogadores'),

    // /removerjogo (ATUALIZADO)
    new SlashCommandBuilder()
        .setName('removerjogo')
        .setDescription('Remove um jogo ou os votos de um usuário específico (Admin)')
        .addStringOption(o =>
            o.setName('titulo')
             .setDescription('Nome exato do jogo')
             .setRequired(true)
        )
        .addUserOption(o =>
            o.setName('usuario')
             .setDescription('Usuário cujos votos serão removidos (opcional)')
             .setRequired(false)
        ),

    // /recomendacaointeligente
    new SlashCommandBuilder()
        .setName('recomendacaointeligente')
        .setDescription('Sugere um jogo que você ainda não jogou'),

    // /perfil
    new SlashCommandBuilder()
        .setName('perfil')
        .setDescription('Ver o seu nível e progresso de XP')
        .addUserOption(o =>
            o.setName('usuario')
             .setDescription('Ver o perfil de outro membro')
             .setRequired(false)
        )

].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(config.token);

(async () => {
    try {
        console.log("⏳ Atualizando comandos globais do RGDB...");
        await rest.put(
            Routes.applicationGuildCommands(config.clientId, config.guildId),
            { body: commands }
        );
        console.log("✅ Comandos atualizados com sucesso!");
    } catch (error) {
        console.error("❌ Erro ao atualizar comandos:", error);
    }
})();