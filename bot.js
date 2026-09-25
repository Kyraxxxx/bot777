/**
 * Bot Discord v14 - Painel de Entrega, Criador de Embeds e Tickets
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
        .setName('painel')
        .setDescription('Envia o painel fixo de entrega de dados.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    new SlashCommandBuilder()
        .setName('embed')
        .setDescription('Cria e envia uma Embed personalizada no canal.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addStringOption(opt => opt.setName('titulo').setDescription('Título da Embed').setRequired(true))
        .addStringOption(opt => opt.setName('descricao').setDescription('Conteúdo/Texto da Embed (use \\n para quebrar linha)').setRequired(true))
        .addStringOption(opt => opt.setName('cor').setDescription('Cor Hexadecimal (ex: #1E1F22 ou #FF0000)').setRequired(false))
        .addStringOption(opt => opt.setName('imagem').setDescription('URL da imagem/banner').setRequired(false)),

    new SlashCommandBuilder()
        .setName('painelticket')
        .setDescription('Envia o painel de atendimento/tickets no canal.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
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
            await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
        } else {
            await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        }
        console.log('[BOT] Todos os comandos foram sincronizados!');
    } catch (error) {
        console.error('[ERRO REST]:', error);
    }
});

client.on('interactionCreate', async interaction => {

    if (interaction.isChatInputCommand() && interaction.commandName === 'embed') {
        const titulo = interaction.options.getString('titulo');
        const descricaoRaw = interaction.options.getString('descricao');
        const cor = interaction.options.getString('cor') || '#1E1F22';
        const imagem = interaction.options.getString('imagem');

        const descricao = descricaoRaw.replace(/\\n/g, '\n');

        const customEmbed = new EmbedBuilder()
            .setTitle(titulo)
            .setDescription(descricao)
            .setColor(cor)
            .setTimestamp();

        if (imagem) customEmbed.setImage(imagem);

        await interaction.reply({ content: '✅ Embed enviada no canal com sucesso!', flags: 64 });
        await interaction.channel.send({ embeds: [customEmbed] });
        return;
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'painel') {
        const embedPainel = new EmbedBuilder()
            .setColor('#1E1F22')
            .setTitle('⚙️ | Central de Entrega de Dados')
            .setDescription(
                `Clique no botão abaixo para iniciar o processo de entrega de dados.\n\n` +
                `1️⃣ Escolha o cliente que receberá a mensagem.\n` +
                `2️⃣ Preencha as informações do produto no formulário.\n` +
                `3️⃣ O bot enviará a mensagem formatada diretamente na DM do cliente.`
            )
            .setFooter({ text: 'Sistema Restrito à Staff' })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('btn_iniciar_entrega')
                .setLabel('📦 Entregar Dados')
                .setStyle(ButtonStyle.Success)
        );

        await interaction.reply({ embeds: [embedPainel], components: [row] });
        return;
    }

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
            reason: `Ticket de ${categoria} aberto por${user.tag}`
        }).catch(async () => {
            return await interaction.channel.threads.create({
                name: threadName,
                autoArchiveDuration: 1440,
                type: ChannelType.PublicThread,
                reason: `Ticket de ${categoria} aberto por${user.tag}`
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

        await thread.send({ content: `<@${user.id}>${mentionRole}`, embeds: [embedBoasVindas], components: [btnFechar] });

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

        const formatadoFull = `${cartaoPipe}\vert{}${bandeira}|${banco}\vert{}${level}`;

        const embedDM = new EmbedBuilder()
            .setColor('#1E1F22')
            .setDescription(
                `💳 **Produto:**\n` +
                `País: 🇧🇷 Brasil\n` +
                `Cartão: \`${cartaoPipe}\`\n` +
                `Bandeira: ${bandeira}\n` +
                `Level: **${level}**\n` +
                `Banco: **${banco}**\n` +
                `Formatado:\n` +
                `✅ \`${formatadoFull}\`\n\n` +
                `🆔 **Dados do titular:**\n` +
                `CPF: ${cpf}\n\n` +
                `🆘 **Dados auxiliares:**\n` +
                `Nome: ${titular}\n` +
                `CPF: ${cpf}`
            )
            .setFooter({ text: 'Sistema de Entrega • Store' })
            .setTimestamp();

        const btnRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('btn_copiar_dados')
                .setLabel('Copiar Dados Formatados')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📋')
        );

        try {
            const cliente = await client.users.fetch(targetUserId);
            const dmMessage = await cliente.send({ embeds: [embedDM], components: [btnRow] });

            const collector = dmMessage.createMessageComponentCollector({ time: 86400000 });
            collector.on('collect', async i => {
                if (i.customId === 'btn_copiar_dados') {
                    await i.reply({ content: `\`\`\`text\n${formatadoFull}\n\`\`\``, flags: 64 });
                }
            });

            userTargetCache.delete(interaction.user.id);
            const msgSucesso = '✅ Dados entregues com sucesso na DM de <@' + targetUserId + '>!';
            await interaction.editReply({ content: msgSucesso });

        } catch (error) {
            console.error('[ERRO DM]:', error);
            await interaction.editReply({ content: '⚠️ Não foi possível enviar a DM para o cliente.' });
        }
    }
});

if (!TOKEN) {
    console.error('[ERRO CRÍTICO] Defina a variável TOKEN no painel!');
} else {
    client.login(TOKEN).catch(err => console.error('[ERRO LOGIN]:', err));
}
