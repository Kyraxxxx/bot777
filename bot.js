/**
 * Bot Discord v14 - Painel de Entrega, Criador de Embeds, Tickets e Moderação
 */

const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    SlashCommandBuilder, 
    PermissionFlagsBits, 
    REST, 
    Routes,
    UserSelectMenuBuilder,
    StringSelectMenuBuilder,
    RoleSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    InteractionType,
    ChannelType
} = require('discord.js');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID || '';

// URL da imagem de entrega
const BANNER_ENTREGA = process.env.BANNER_URL || 'https://i.imgur.com/vHq1vK1.png';

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent
    ] 
});

const userTargetCache = new Map();
const ticketRoleCache = new Map();

const commands = [
    new SlashCommandBuilder()
        .setName('paineldados')
        .setDescription('Envia o painel fixo de entrega de dados.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    new SlashCommandBuilder()
        .setName('embed')
        .setDescription('Cria e envia uma Embed personalizada com imagem superior.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addStringOption(opt => opt.setName('titulo').setDescription('Título principal').setRequired(true))
        .addStringOption(opt => opt.setName('descricao').setDescription('Conteúdo/Texto (use \\n para quebrar linha)').setRequired(true))
        .addStringOption(opt => opt.setName('imagem').setDescription('URL da imagem/banner').setRequired(false))
        .addStringOption(opt => opt.setName('subtitulo').setDescription('Subtítulo opcional (acima da imagem)').setRequired(false))
        .addStringOption(opt => opt.setName('cor').setDescription('Cor Hexadecimal (ex: #1E1F22)').setRequired(false)),

    new SlashCommandBuilder()
        .setName('painelticket')
        .setDescription('Envia o painel de atendimento/tickets no canal.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('clean')
        .setDescription('Limpa uma quantidade específica de mensagens no canal.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addIntegerOption(opt => 
            opt.setName('quantidade')
               .setDescription('Quantidade de mensagens para apagar (1 a 100)')
               .setRequired(true)
               .setMinValue(1)
               .setMaxValue(100)
        ),

    new SlashCommandBuilder()
        .setName('lock')
        .setDescription('Bloqueia o canal atual para que membros não enviem mensagens.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    new SlashCommandBuilder()
        .setName('unlock')
        .setDescription('Desbloqueia o canal atual permitindo mensagens novamente.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
].map(command => command.toJSON());

client.once('ready', async () => {
    console.log(`[RAILWAY] Bot online com sucesso como: ${client.user.tag}`);

    if (!TOKEN || !CLIENT_ID) {
        console.error('[ERRO] TOKEN ou CLIENT_ID ausentes nas variáveis.');
        return;
    }

    const rest = new REST({ version: '10' }).setToken(TOKEN);

    try {
        console.log('[BOT] Registrando comandos Slash no Discord...');
        if (GUILD_ID && GUILD_ID.length > 0) {
            await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });
            await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
            console.log('[BOT] Comandos sincronizados no servidor sem duplicações!');
        } else {
            await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
            console.log('[BOT] Comandos sincronizados globalmente!');
        }
    } catch (error) {
        console.error('[ERRO REST]:', error);
    }
});

client.on('interactionCreate', async interaction => {

    // --- COMANDO /CLEAN ---
    if (interaction.isChatInputCommand() && interaction.commandName === 'clean') {
        const quantidade = interaction.options.getInteger('quantidade');

        try {
            const deleted = await interaction.channel.bulkDelete(quantidade, true);
            await interaction.reply({
                content: `🧹 **${deleted.size}** mensagem(ns) apagada(s) com sucesso!`,
                flags: 64
            });
        } catch (error) {
            console.error('[ERRO CLEAN]:', error);
            await interaction.reply({
                content: '❌ Ocorreu um erro ao tentar apagar as mensagens. (Mensagens com mais de 14 dias não podem ser apagadas em massa).',
                flags: 64
            });
        }
        return;
    }

    // --- COMANDO /LOCK ---
    if (interaction.isChatInputCommand() && interaction.commandName === 'lock') {
        try {
            await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                SendMessages: false
            });

            const embedLock = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🔒 Canal Bloqueado')
                .setDescription('Este canal foi bloqueado pela moderação. Ninguém pode enviar mensagens no momento.')
                .setTimestamp();

            await interaction.reply({ embeds: [embedLock] });
        } catch (error) {
            console.error('[ERRO LOCK]:', error);
            await interaction.reply({ content: '❌ Erro ao bloquear o canal.', flags: 64 });
        }
        return;
    }

    // --- COMANDO /UNLOCK ---
    if (interaction.isChatInputCommand() && interaction.commandName === 'unlock') {
        try {
            await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                SendMessages: null
            });

            const embedUnlock = new EmbedBuilder()
                .setColor('#57F287')
                .setTitle('🔓 Canal Desbloqueado')
                .setDescription('O canal foi desbloqueado! O envio de mensagens está liberado novamente.')
                .setTimestamp();

            await interaction.reply({ embeds: [embedUnlock] });
        } catch (error) {
            console.error('[ERRO UNLOCK]:', error);
            await interaction.reply({ content: '❌ Erro ao desbloquear o canal.', flags: 64 });
        }
        return;
    }

    // --- COMANDO /EMBED ---
    if (interaction.isChatInputCommand() && interaction.commandName === 'embed') {
        const titulo = interaction.options.getString('titulo');
        const subtitulo = interaction.options.getString('subtitulo');
        const descricaoRaw = interaction.options.getString('descricao');
        const cor = interaction.options.getString('cor') || '#1E1F22';
        const imagem = interaction.options.getString('imagem');

        const descricao = descricaoRaw.replace(/\\n/g, '\n');
        const embedsParaEnviar = [];

        if (imagem) {
            const embedTop = new EmbedBuilder()
                .setColor(cor)
                .setTitle(titulo)
                .setImage(imagem);

            if (subtitulo) {
                embedTop.setDescription(subtitulo);
            }

            const embedBottom = new EmbedBuilder()
                .setColor(cor)
                .setDescription(descricao)
                .setTimestamp();

            embedsParaEnviar.push(embedTop, embedBottom);
        } else {
            const customEmbed = new EmbedBuilder()
                .setColor(cor)
                .setTitle(titulo)
                .setDescription(descricao)
                .setTimestamp();

            if (subtitulo) {
                customEmbed.setDescription(`${subtitulo}\n\n${descricao}`);
            }

            embedsParaEnviar.push(customEmbed);
        }

        await interaction.reply({ content: '✅ Embed enviada no canal com sucesso!', flags: 64 });
        await interaction.channel.send({ embeds: embedsParaEnviar });
        return;
    }

    // --- COMANDO /PAINELDADOS ---
    if (interaction.isChatInputCommand() && interaction.commandName === 'paineldados') {
        const embedPainel = new EmbedBuilder()
            .setColor('#FF6B00')
            .setTitle('🟧 Central de Entrega de Dados')
            .setDescription(
                `> ✨ *Sistema automatizado e seguro para despacho de credenciais e produtos.*\n\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                `🔸 **COMO UTILIZAR:**\n\n` +
                `1️⃣ **Clique no botão abaixo** para abrir o seletor.\n` +
                `2️⃣ **Selecione o cliente** que irá receber o produto.\n` +
                `3️⃣ **Preencha os dados** no formulário rápido.\n` +
                `4️⃣ O bot fará a entrega **diretamente na DM do cliente**.\n\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
            )
            .setFooter({ text: '🔒 Módulo Restrito à Equipe de Staff' })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('btn_iniciar_entrega')
                .setLabel('Entregar Dados')
                .setStyle(ButtonStyle.Success)
                .setEmoji('📦')
        );

        await interaction.reply({ embeds: [embedPainel], components: [row] });
        return;
    }

    // --- PAINEL TICKET ---
    if (interaction.isChatInputCommand() && interaction.commandName === 'painelticket') {
        const roleMenu = new ActionRowBuilder().addComponents(
            new RoleSelectMenuBuilder()
                .setCustomId('select_cargo_atendente')
                .setPlaceholder('Selecione o cargo de Atendente/Staff para os tickets...')
        );

        await interaction.reply({
            content: '⚙️ **Configuração do Painel:** Selecione qual cargo será notificado quando um ticket for aberto:',
            components: [roleMenu],
            flags: 64
        });
        return;
    }

    if (interaction.isRoleSelectMenu() && interaction.customId === 'select_cargo_atendente') {
        const roleId = interaction.values[0];
        ticketRoleCache.set(interaction.guild.id, roleId);

        const embedTicketPainel = new EmbedBuilder()
            .setColor('#2B2D31')
            .setTitle('🎫 | Central de Atendimento')
            .setDescription(
                `Precisa de ajuda ou deseja realizar uma compra? Abra um ticket abaixo!\n\n` +
                `📌 **Categorias disponíveis:**\n` +
                `• ❓ **Dúvida:** Esclareça questões sobre nossos produtos.\n` +
                `• 🛒 **Compra:** Adquira novos produtos diretamente com a Staff.\n` +
                `• 📄 **Comprovante:** Envie o comprovante de pagamento do seu pedido.\n\n` +
                `*Selecione a categoria desejada no menu abaixo:*`
            )
            .setFooter({ text: 'Suporte Oficial' })
            .setTimestamp();

        const selectTicketMenu = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('select_categoria_ticket')
                .setPlaceholder('Selecione o tipo de atendimento...')
                .addOptions([
                    { label: 'Dúvida', value: 'Dúvida', description: 'Tirar dúvidas gerais', emoji: '❓' },
                    { label: 'Compra', value: 'Compra', description: 'Realizar um novo pedido', emoji: '🛒' },
                    { label: 'Comprovante', value: 'Comprovante', description: 'Enviar comprovante de pagamento', emoji: '📄' }
                ])
        );

        await interaction.channel.send({ embeds: [embedTicketPainel], components: [selectTicketMenu] });
        await interaction.update({ content: '✅ Painel de tickets gerado com sucesso!', components: [] });
        return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'select_categoria_ticket') {
        const categoria = interaction.values[0];
        const user = interaction.user;
        const threadName = `ticket-${user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '');

        await interaction.deferUpdate();

        const existingThread = interaction.channel.threads.cache.find(t => t.name === threadName && !t.archived);
        if (existingThread) {
            await interaction.followUp({
                content: `❌ Você já possui um ticket aberto! Acesse ele aqui: <#${existingThread.id}>`,
                flags: 64
            });
            return;
        }

        const thread = await interaction.channel.threads.create({
            name: threadName,
            autoArchiveDuration: 1440,
            type: ChannelType.PrivateThread,
            reason: `Ticket de ${categoria} aberto por ${user.tag}`
        }).catch(async () => {
            return await interaction.channel.threads.create({
                name: threadName,
                autoArchiveDuration: 1440,
                type: ChannelType.PublicThread,
                reason: `Ticket de ${categoria} aberto por ${user.tag}`
            });
        });

        await thread.members.add(user.id);

        const roleId = ticketRoleCache.get(interaction.guild.id);
        const mentionRole = roleId ? `<@&${roleId}>` : 'A equipe';

        const embedBoasVindas = new EmbedBuilder()
            .setColor('#57F287')
            .setTitle(`🎫 Atendimento: ${categoria}`)
            .setDescription(
                `Olá <@${user.id}>, bem-vindo ao seu ticket!\n\n` +
                `• **Categoria:** ${categoria}\n` +
                `• **Instruções:** Explique sua solicitação ou envie o comprovante/dados aqui no chat.\n\n` +
                `${mentionRole} foi notificado e atenderá você em breve.`
            )
            .setFooter({ text: 'Clique no botão abaixo para encerrar o atendimento' })
            .setTimestamp();

        const btnFechar = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('btn_fechar_ticket')
                .setLabel('Fechar Ticket')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🔒')
        );

        await thread.send({ content: `<@${user.id}> ${mentionRole}`, embeds: [embedBoasVindas], components: [btnFechar] });

        await interaction.followUp({
            content: `✅ Seu ticket de **${categoria}** foi criado: <#${thread.id}>`,
            flags: 64
        });
        return;
    }

    if (interaction.isButton() && interaction.customId === 'btn_fechar_ticket') {
        await interaction.reply({ content: '🔒 Este ticket será arquivado em 5 segundos...' });
        setTimeout(async () => {
            if (interaction.channel.isThread()) {
                await interaction.channel.setArchived(true, 'Ticket fechado');
            }
        }, 5000);
        return;
    }

    if (interaction.isButton() && interaction.customId === 'btn_iniciar_entrega') {
        const selectUserRow = new ActionRowBuilder().addComponents(
            new UserSelectMenuBuilder()
                .setCustomId('select_cliente_target')
                .setPlaceholder('Selecione o cliente que receberá a DM...')
        );

        await interaction.reply({
            content: '👤 **Passo 1/2:** Selecione o cliente que receberá os dados:',
            components: [selectUserRow],
            flags: 64
        });
        return;
    }

    if (interaction.isUserSelectMenu() && interaction.customId === 'select_cliente_target') {
        const targetUserId = interaction.values[0];
        userTargetCache.set(interaction.user.id, targetUserId);

        const modal = new ModalBuilder()
            .setCustomId('modal_preencher_dados')
            .setTitle('📦 Preencher Dados do Cartão');

        const inputCartao = new TextInputBuilder().setCustomId('field_cartao').setLabel('Cartão (Número|Validade|CVV)').setPlaceholder('Ex: 5502096608978326|04|2033|741').setStyle(TextInputStyle.Short).setRequired(true);
        const inputBandeira = new TextInputBuilder().setCustomId('field_bandeira').setLabel('Bandeira').setPlaceholder('Ex: MASTERCARD').setStyle(TextInputStyle.Short).setRequired(true);
        const inputLevel = new TextInputBuilder().setCustomId('field_level').setLabel('Level').setPlaceholder('Ex: NUBANK GOLD').setStyle(TextInputStyle.Short).setRequired(true);
        const inputBanco = new TextInputBuilder().setCustomId('field_banco').setLabel('Banco').setPlaceholder('Ex: NU PAGAMENTOS SA').setStyle(TextInputStyle.Short).setRequired(true);
        const inputTitularCpf = new TextInputBuilder().setCustomId('field_titular_cpf').setLabel('Nome do Titular e CPF').setPlaceholder('Ex: Marcelo Martins De Oliveira | 000.088.836-29').setStyle(TextInputStyle.Short).setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(inputCartao),
            new ActionRowBuilder().addComponents(inputBandeira),
            new ActionRowBuilder().addComponents(inputLevel),
            new ActionRowBuilder().addComponents(inputBanco),
            new ActionRowBuilder().addComponents(inputTitularCpf)
        );

        await interaction.showModal(modal);
        return;
    }

    // --- ENVIO DA DM DO CLIENTE ---
    if (interaction.type === InteractionType.ModalSubmit && interaction.customId === 'modal_preencher_dados') {
        await interaction.deferReply({ flags: 64 });

        const targetUserId = userTargetCache.get(interaction.user.id);
        if (!targetUserId) {
            await interaction.editReply({ content: '❌ Erro ao identificar o cliente. Tente novamente.' });
            return;
        }

        const cartaoPipe = interaction.fields.getTextInputValue('field_cartao');
        const bandeira = interaction.fields.getTextInputValue('field_bandeira').toUpperCase();
        const level = interaction.fields.getTextInputValue('field_level').toUpperCase();
        const banco = interaction.fields.getTextInputValue('field_banco').toUpperCase();
        const titularCpfRaw = interaction.fields.getTextInputValue('field_titular_cpf');

        let titular = titularCpfRaw;
        let cpf = 'Não informado';
        if (titularCpfRaw.includes('|')) {
            const parts = titularCpfRaw.split('|');
            titular = parts[0].trim();
            cpf = parts[1].trim();
        }

        const formatadoFull = `${cartaoPipe}|${bandeira}|${banco}|${level}`;

        // EMBED PRINCIPAL DE ENTREGA LIMPA E DECORADA NA DM
        const embedDM = new EmbedBuilder()
            .setColor('#FF6B00')
            .setTitle('📦 OBRIGADO PELA SUA COMPRA!')
            .setDescription(
                `Olá! Os seus dados foram gerados e entregues com sucesso.\n\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                `💳 **INFORMAÇÕES DO PRODUTO**\n` +
                `• **País:** 🇧🇷 Brasil\n` +
                `• **Cartão:** \`${cartaoPipe}\`\n` +
                `• **Bandeira:** ${bandeira}\n` +
                `• **Nível:** ${level}\n` +
                `• **Banco:** ${banco}\n\n` +
                `🆔 **TITULAR**\n` +
                `• **Nome:** ${titular}\n` +
                `• **CPF:** ${cpf}\n\n` +
                `⚡ **FORMATO COMPLETO:**\n` +
                `\`${formatadoFull}\`\n\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
            )
            .setImage(BANNER_ENTREGA)
            .setFooter({ text: 'Sistema de Entrega • 777 Store' })
            .setTimestamp();

        const btnRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('btn_copiar_dados')
                .setLabel('Copiar Texto Formatado')
                .setStyle(ButtonStyle.Success)
                .setEmoji('📋')
        );

        try {
            const cliente = await client.users.fetch(targetUserId);
            const dmMessage = await cliente.send({ embeds: [embedDM], components: [btnRow] });

            const collector = dmMessage.createMessageComponentCollector({ time: 86400000 });
            collector.on('collect', async i => {
                if (i.customId === 'btn_copiar_dados') {
                    await i.reply({ content: `${formatadoFull}`, flags: 64 });
                }
            });

            userTargetCache.delete(interaction.user.id);
            const msgSucesso = '✅ Dados entregues com sucesso na DM de <@' + targetUserId + '>';
            await interaction.editReply({ content: msgSucesso });

        } catch (error) {
            console.error('[ERRO DM]:', error);
            await interaction.editReply({ content: '⚠️ Não foi possível enviar a DM para o cliente. Verifique se as DMs dele estão abertas.' });
        }
    }
});

if (!TOKEN) {
    console.error('[ERRO CRÍTICO] Defina a variável TOKEN no painel!');
} else {
    client.login(TOKEN).catch(err => console.error('[ERRO LOGIN]:', err));
}
