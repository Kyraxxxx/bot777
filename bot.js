const {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  PermissionFlagsBits,
  REST,
  Routes
} = require('discord.js');

// 1. Configuração do Cliente Discord (Apenas Intenções necessárias - Sem Áudio/Voz)
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User]
});

// Chave da aplicação obtida via Variável de Ambiente no Railway
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

// 2. Registro dos Comandos Slash
const commands = [
  {
    name: 'painel',
    description: 'Envia o painel de suporte e vendas no canal atual'
  }
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

async function registerCommands() {
  try {
    console.log('Registrando comandos Slash...');
    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands }
    );
    console.log('Comandos Slash registrados com sucesso!');
  } catch (error) {
    console.error('Erro ao registrar comandos:', error);
  }
}

// 3. Evento: Bot Online
client.once('ready', () => {
  console.log(`🤖 Bot online como ${client.user.tag}`);
  registerCommands();
});

// 4. Interação de Comandos Slash (/painel)
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'painel') {
    // Verifica se o usuário tem permissão de Administrador para enviar o painel
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: '❌ Você não tem permissão para usar este comando.',
        ephemeral: true
      });
    }

    const embed = new EmbedBuilder()
      .setTitle('🛒 Central de Atendimento e Vendas')
      .setDescription('Clique no botão abaixo para abrir um ticket com nossa equipe.')
      .setColor('#5865F2')
      .setFooter({ text: 'Atendimento exclusivo' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('abrir_ticket')
        .setLabel('Abrir Ticket')
        .setEmoji('🎟️')
        .setStyle(ButtonStyle.Primary)
    );

    await interaction.channel.send({
      embeds: [embed],
      components: [row]
    });

    await interaction.reply({
      content: '✅ Painel enviado neste canal!',
      ephemeral: true
    });
  }
});

// 5. Interação de Botões e Modais
client.on('interactionCreate', async (interaction) => {
  // Ação ao clicar no botão "Abrir Ticket"
  if (interaction.isButton() && interaction.customId === 'abrir_ticket') {
    const modal = new ModalBuilder()
      .setCustomId('modal_ticket')
      .setTitle('Formulário de Atendimento');

    const assuntoInput = new TextInputBuilder()
      .setCustomId('assunto')
      .setLabel('Qual o assunto do seu atendimento?')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Ex: Dúvida sobre produto, suporte, compra...')
      .setRequired(true);

    const detalheInput = new TextInputBuilder()
      .setCustomId('detalhes')
      .setLabel('Descreva brevemente o que precisa:')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(assuntoInput),
      new ActionRowBuilder().addComponents(detalheInput)
    );

    await interaction.showModal(modal);
  }

  // Ação ao enviar o Formulário (Modal)
  if (interaction.isModalSubmit() && interaction.customId === 'modal_ticket') {
    const assunto = interaction.fields.getTextInputValue('assunto');
    const detalhes = interaction.fields.getTextInputValue('detalhes') || 'Nenhum detalhe informado.';

    const guild = interaction.guild;
    const user = interaction.user;

    // Nome padronizado para o canal do ticket
    const channelName = `ticket-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

    // Criação do canal do ticket restrito ao usuário e ao bot
    try {
      const ticketChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel]
          },
          {
            id: user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.AttachFiles
            ]
          },
          {
            id: client.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ManageChannels
            ]
          }
        ]
      });

      const ticketEmbed = new EmbedBuilder()
        .setTitle(`🎟️ Ticket de ${user.username}`)
        .addFields(
          { name: '📌 Assunto', value: assunto },
          { name: '📝 Detalhes', value: detalhes }
        )
        .setColor('#57F287')
        .setTimestamp();

      const closeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('fechar_ticket')
          .setLabel('Fechar Ticket')
          .setEmoji('🔒')
          .setStyle(ButtonStyle.Danger)
      );

      await ticketChannel.send({
        content: `<@${user.id}>, seu ticket foi criado!`,
        embeds: [ticketEmbed],
        components: [closeRow]
      });

      await interaction.reply({
        content: `✅ Ticket criado com sucesso! Acesse: ${ticketChannel}`,
        ephemeral: true
      });
    } catch (err) {
      console.error('Erro ao criar o canal de ticket:', err);
      await interaction.reply({
        content: '❌ Ocorreu um erro ao criar seu ticket. Verifique as permissões do bot.',
        ephemeral: true
      });
    }
  }

  // Ação ao clicar em "Fechar Ticket"
  if (interaction.isButton() && interaction.customId === 'fechar_ticket') {
    await interaction.reply('🔒 Este ticket será encerrado em 5 segundos...');
    setTimeout(() => {
      interaction.channel.delete().catch(console.error);
    }, 5000);
  }
});

// 6. Login do Bot
client.login(TOKEN);
