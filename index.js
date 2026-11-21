import http from 'node:http';
import {
    Client, Events, GatewayIntentBits,
    EmbedBuilder, ActionRowBuilder,
    ButtonBuilder, ButtonStyle,
    ModalBuilder, TextInputBuilder, TextInputStyle
} from 'discord.js';

import db from "./db.js";
import config from './config.js';
import { searchGame, getGameDetails } from './rawg.js';

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// ===== UTILITÁRIO: BARRA DE XP =====
function criarBarraXp(xp, level) {
    const max = level * 500;
    const progresso = Math.min(xp / max, 1);
    const total = 10;
    const filled = Math.round(progresso * total);
    return "🟩".repeat(filled) + "⬜".repeat(total - filled) + ` (${xp}/${max})`;
}

client.once(Events.ClientReady, c => {
    console.log(`🎮 Bot RGDB Online! Logado como ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async interaction => {
    try {
        // ================= SISTEMA DE BOTÕES =================
        if (interaction.isButton()) {

            // Escolha do jogo após a busca
            if (interaction.customId.startsWith('jogo_escolha_')) {
                await interaction.deferUpdate();
                const id = interaction.customId.split('_')[2];
                const game = await getGameDetails(id);

                let descricaoBruta = game.description || game.description_raw || "Sem descrição disponível.";
                let descricaoLimpa = descricaoBruta.replace(/<\/?[^>]+(>|$)/g, "");

                const embed = new EmbedBuilder()
                    .setTitle(game.name)
                    .setDescription(descricaoLimpa.length > 500 ? descricaoLimpa.slice(0, 500) + "..." : descricaoLimpa)
                    .setThumbnail(game.background_image)
                    .addFields(
                        { name: 'Lançamento', value: game.released || 'N/A', inline: true },
                        { name: 'Nota Metacritic', value: game.metacritic?.toString() || 'N/A', inline: true }
                    )
                    .setColor(0x5865F2);

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`avaliar_jogo_${id}`)
                        .setLabel('Avaliar este Jogo')
                        .setStyle(ButtonStyle.Success)
                );

                await interaction.editReply({ embeds: [embed], components: [row] });
            }

            // --- FILTROS DO PERFIL PESSOAL ---
            if (interaction.customId.startsWith('perfil_filtro_')) {
                await interaction.deferUpdate();
                const [,, filtro, targetId] = interaction.customId.split('_');

                let query = `
                    SELECT v.score, a.title 
                    FROM votos_jogos v 
                    JOIN avaliacoes_jogos a ON v.game_id = a.game_id 
                    WHERE v.user_id = ?
                `;

                if (filtro === 'obras') query += " AND v.score >= 9";
                else if (filtro === 'excelentes') query += " AND v.score >= 7.5 AND v.score < 9";
                else if (filtro === 'medianos') query += " AND v.score >= 6 AND v.score < 7.5";
                else if (filtro === 'bombas') query += " AND v.score < 6";

                const jogos = db.prepare(query + " ORDER BY v.score DESC, a.title ASC").all(targetId);
                const lista = jogos.map(j => `⭐ **${j.score.toFixed(1)}** - ${j.title}`).join('\n') || "Nenhum jogo nesta categoria.";

                const embed = EmbedBuilder.from(interaction.message.embeds[0])
                    .setDescription(`### 🎮 ${filtro.toUpperCase()} (${jogos.length})\n${lista.slice(0, 3800)}`);

                await interaction.editReply({ embeds: [embed] });
            }

            // --- FILTROS DA BIBLIOTECA GLOBAL ---
            if (interaction.customId.startsWith('lib_filtro_')) {
                await interaction.deferUpdate();
                const tipo = interaction.customId.split('_')[2];
                
                let query = `SELECT title, server_score, vote_count FROM avaliacoes_jogos`;
                if (tipo === 'obras') query += " WHERE server_score >= 9";
                else if (tipo === 'excelentes') query += " WHERE server_score >= 7.5 AND server_score < 9";
                else if (tipo === 'medianos') query += " WHERE server_score >= 6 AND server_score < 7.5";
                else if (tipo === 'bombas') query += " WHERE server_score < 6";
                
                const resultados = db.prepare(query + " ORDER BY server_score DESC").all();
                const lista = resultados.map(j => `⭐ **${j.server_score.toFixed(1)}** | ${j.title}`).join('\n') || "Nenhum jogo nesta faixa.";

                const embed = EmbedBuilder.from(interaction.message.embeds[0])
                    .setDescription(`### Filtro: ${tipo.toUpperCase()}\n${lista.slice(0, 3800)}`);

                await interaction.editReply({ embeds: [embed] });
            }

            // Abrir formulário de nota
            if (interaction.customId.startsWith('avaliar_jogo_')) {
                const id = interaction.customId.split('_')[2];
                const modal = new ModalBuilder()
                    .setCustomId(`modal_${id}`)
                    .setTitle('Sua Avaliação');

                const notaInput = new TextInputBuilder()
                    .setCustomId('nota')
                    .setLabel('Qual nota você dá? (0 a 10)')
                    .setPlaceholder('Exemplo: 9.5')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(notaInput));
                await interaction.showModal(modal);
            }

            // Processamento de XP e Status
            if (interaction.customId.startsWith('xp_')) {
                const [_, tipo, gameId, notaStr] = interaction.customId.split('_');
                const userId = interaction.user.id;
                const username = interaction.user.username;
                
                let score = parseFloat(notaStr.replace(',', '.'));
                if (isNaN(score)) score = 0;
                score = Math.max(0, Math.min(10, score));

                let gainXp = 0;
                let statusMsg = "";
                if (tipo === 'joguei') { gainXp = 25; statusMsg = "Apenas Joguei"; }
                else if (tipo === 'zerou') { gainXp = 50; statusMsg = "Zerou o Jogo"; }
                else if (tipo === '100') { gainXp = 200; statusMsg = "Platinou/100%"; }

                db.prepare(`
                    INSERT INTO votos_jogos (game_id, user_id, username, score) 
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(game_id, user_id) DO UPDATE SET score=excluded.score
                `).run(gameId, userId, username, score);

                const stats = db.prepare(`SELECT AVG(score) as avg, COUNT(*) as total FROM votos_jogos WHERE game_id=?`).get(gameId);
                const game = await getGameDetails(gameId);

                db.prepare(`
                    INSERT INTO avaliacoes_jogos (game_id, title, server_score, vote_count) 
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(game_id) DO UPDATE SET
                    server_score=excluded.server_score,
                    vote_count=excluded.vote_count
                `).run(gameId, game.name, stats.avg, stats.total);

                const user = db.prepare(`SELECT * FROM usuarios WHERE user_id=?`).get(userId);
                let totalXp = (user?.xp || 0) + gainXp;
                let level = user?.level || 1;

                while (totalXp >= level * 500) {
                    totalXp -= (level * 500);
                    level++;
                }

                db.prepare(`
                    INSERT INTO usuarios (user_id, username, xp, level) VALUES (?, ?, ?, ?)
                    ON CONFLICT(user_id) DO UPDATE SET xp=?, level=?, username=?
                `).run(userId, username, totalXp, level, totalXp, level, username);

                await interaction.update({
                    content: `✅ **${statusMsg}** registrado! Ganhaste **+${gainXp} XP** | Nível Atual: **${level}**`,
                    embeds: [],
                    components: []
                });
            }
            return;
        }

        // ================= SISTEMA DE FORMULÁRIOS (MODAL) =================
        if (interaction.isModalSubmit()) {
            const gameId = interaction.customId.split('_')[1];
            const nota = interaction.fields.getTextInputValue('nota');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`xp_joguei_${gameId}_${nota}`)
                    .setLabel('🎮 Apenas Joguei (+25 XP)')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`xp_zerou_${gameId}_${nota}`)
                    .setLabel('🚩 Zerou (+50 XP)')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`xp_100_${gameId}_${nota}`)
                    .setLabel('💯 100% / Platina (+200 XP)')
                    .setStyle(ButtonStyle.Success)
            );

            await interaction.reply({
                content: `Recebido! Tu deste nota **${nota}**. Qual o teu progresso no jogo?`,
                components: [row],
                ephemeral: true
            });
            return;
        }

        // ================= COMANDOS SLASH =================
        if (interaction.isChatInputCommand()) {
            const { commandName } = interaction;

            if (commandName === 'jogo') {
                await interaction.deferReply();
                const nome = interaction.options.getString('titulo');
                const results = await searchGame(nome);

                if (!results || results.length === 0) return interaction.editReply("❌ Não encontrei nenhum jogo.");

                const embed = new EmbedBuilder()
                    .setTitle(`Pesquisa: ${nome}`)
                    .setDescription(results.slice(0, 5).map((g, i) => `**${i + 1}.** ${g.name}`).join('\n'))
                    .setColor(0x5865F2);

                const row = new ActionRowBuilder().addComponents(
                    results.slice(0, 5).map((g, i) =>
                        new ButtonBuilder()
                            .setCustomId(`jogo_escolha_${g.id}`)
                            .setLabel(`${i + 1}`)
                            .setStyle(ButtonStyle.Secondary)
                    )
                );
                await interaction.editReply({ embeds: [embed], components: [row] });
            }

            if (commandName === 'jogosavaliados') {
                await interaction.deferReply();
                const total = db.prepare(`SELECT COUNT(*) as count FROM avaliacoes_jogos`).get();
                const melhores = db.prepare(`SELECT title, server_score FROM avaliacoes_jogos ORDER BY server_score DESC LIMIT 20`).all();

                const lista = melhores.map(j => `⭐ **${j.server_score.toFixed(1)}** | ${j.title}`).join('\n');

                const embed = new EmbedBuilder()
                    .setTitle(`📚 Biblioteca do Servidor (${total.count} jogos)`)
                    .setDescription(`### Top 20 Geral\n${lista}`)
                    .setColor(0xFFD700);
                
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('lib_filtro_obras').setLabel('Obras-Primas').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('lib_filtro_excelentes').setLabel('Excelentes').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('lib_filtro_medianos').setLabel('Medianos').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('lib_filtro_bombas').setLabel('Bombas').setStyle(ButtonStyle.Danger)
                );

                await interaction.editReply({ embeds: [embed], components: [row] });
            }

            if (commandName === 'perfil') {
                await interaction.deferReply();
                const target = interaction.options.getUser('usuario') || interaction.user;
                const stats = db.prepare(`SELECT xp, level FROM usuarios WHERE user_id=?`).get(target.id);
                
                const meusJogos = db.prepare(`
                    SELECT v.score, a.title FROM votos_jogos v 
                    JOIN avaliacoes_jogos a ON v.game_id = a.game_id 
                    WHERE v.user_id = ? ORDER BY v.score DESC, a.title ASC
                `).all(target.id);

                const xp = stats?.xp || 0;
                const lvl = stats?.level || 1;
                const barra = criarBarraXp(xp, lvl);
                
                let listaJogos = meusJogos.length > 0 
                    ? meusJogos.map(j => `⭐ **${j.score.toFixed(1)}** - ${j.title}`).join('\n')
                    : "Ainda não avaliou nenhum jogo.";

                const embed = new EmbedBuilder()
                    .setTitle(`Perfil de ${target.username}`)
                    .setThumbnail(target.displayAvatarURL())
                    .setColor(0x00AE86)
                    .addFields(
                        { name: "🏆 Nível", value: lvl.toString(), inline: true },
                        { name: "✨ Experiência", value: barra }
                    )
                    .setDescription(`### 🎮 Jogos Avaliados (${meusJogos.length})\n${listaJogos.slice(0, 3800)}`);

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`perfil_filtro_obras_${target.id}`).setLabel('Obras-Primas').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId(`perfil_filtro_excelentes_${target.id}`).setLabel('Excelentes').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`perfil_filtro_medianos_${target.id}`).setLabel('Medianos').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(`perfil_filtro_bombas_${target.id}`).setLabel('Bombas').setStyle(ButtonStyle.Danger)
                );

                await interaction.editReply({ embeds: [embed], components: [row] });
            }

            if (commandName === 'ranking') {
                await interaction.deferReply();
                const top = db.prepare(`SELECT username, xp, level FROM usuarios ORDER BY level DESC, xp DESC LIMIT 10`).all();
                const texto = top.map((u, i) => `**${i + 1}.** ${u.username} — Lvl ${u.level}`).join("\n");
                const embed = new EmbedBuilder().setTitle("🏆 Top Jogadores").setDescription(texto).setColor(0xF1C40F);
                await interaction.editReply({ embeds: [embed] });
            }

         if (commandName === 'removerjogo') {
    await interaction.deferReply();
    const titulo = interaction.options.getString('titulo');
    const target = interaction.options.getUser('usuario');

    // Busca o jogo no banco
    const jogo = db.prepare(`SELECT game_id, title FROM avaliacoes_jogos WHERE title LIKE ?`).get(`%${titulo}%`);
    
    if (!jogo) return interaction.editReply("❌ Jogo não encontrado.");

    if (target) {
        // Lógica para remover apenas os votos de um usuário específico
        const result = db.prepare(`DELETE FROM votos_jogos WHERE game_id = ? AND user_id = ?`).run(jogo.game_id, target.id);

        if (result.changes === 0) {
            return interaction.editReply(`O usuário **${target.username}** não possui votos registrados para o jogo **${jogo.title}**.`);
        }

        // Recalcula a média e total após a remoção
        const stats = db.prepare(`SELECT AVG(score) as avg, COUNT(*) as total FROM votos_jogos WHERE game_id = ?`).get(jogo.game_id);

        if (stats.total > 0) {
            db.prepare(`UPDATE avaliacoes_jogos SET server_score = ?, vote_count = ? WHERE game_id = ?`)
              .run(stats.avg, stats.total, jogo.game_id);
            await interaction.editReply(`🗑️ Os votos de **${target.username}** foram removidos de **${jogo.title}**. Nova média: **${stats.avg.toFixed(1)}**.`);
        } else {
            // Se era o único voto, remove o jogo da lista de avaliados
            db.prepare(`DELETE FROM avaliacoes_jogos WHERE game_id = ?`).run(jogo.game_id);
            await interaction.editReply(`🗑️ Os votos de **${target.username}** foram removidos e, como era o único, o jogo saiu da lista.`);
        }

    } else {
        // Lógica original: Remover o jogo e TODOS os votos dele
        db.prepare(`DELETE FROM votos_jogos WHERE game_id = ?`).run(jogo.game_id);
        db.prepare(`DELETE FROM avaliacoes_jogos WHERE game_id = ?`).run(jogo.game_id);
        await interaction.editReply(`🗑️ O jogo **${jogo.title}** e todos os seus votos foram removidos.`);
    }
}
        }
    } catch (err) {
        console.error("❌ ERRO NO BOT:", err);
    }
});

// Servidor HTTP mínimo: a hospedagem precisa de uma porta respondendo.
http.createServer((req, res) => {
    const ok = client.isReady();
    res.writeHead(ok ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok, bot: client.user?.tag ?? null }));
}).listen(Number(process.env.PORT || 3000), () => {
    console.log(`Health check na porta ${process.env.PORT || 3000}`);
});

client.login(config.token);