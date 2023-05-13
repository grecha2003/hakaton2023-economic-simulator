import * as dotenv from 'dotenv'
dotenv.config()
import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { Markup } from 'telegraf';
import { session } from 'telegraf';
import { MySQL } from "@telegraf/session/mysql";
import * as db from './database.js';

function getPagination( current, maxpage ) {
  var keys = [];
  if (current>1) keys.push({ text: `«1`, callback_data: '1' });
  if (current>2) keys.push({ text: `‹${current-1}`, callback_data: (current-1).toString() });
  keys.push({ text: `-${current}-`, callback_data: current.toString() });
  if (current<maxpage-1) keys.push({ text: `${current+1}›`, callback_data: (current+1).toString() })
  if (current<maxpage) keys.push({ text: `${maxpage}»`, callback_data: maxpage.toString() });

  return {
    reply_markup: JSON.stringify({
      inline_keyboard: [ keys ]
    })
  };
}


const bot = new Telegraf(process.env.BOT_TOKEN);

const pool = db.pool
const store = MySQL({ 
  database: 'game',
  host: 'localhost',
  user: 'user',
  password: 'ilya333',
  table: 'sessions'
})

// bot.use(session({ store }));
bot.use(session( { store: store, defaultSession: () => ({}) }));


// Обработчик команды /start
bot.start(async (ctx) => {
  const userid = ctx.from.id;
  let user = await db.getUser(userid)
  if (user == undefined) {
    await ctx.reply('Добро пожаловать! Если хотите зарегистрироваться, нажмите кнопку!', Markup
      .keyboard([
        ['Зарегистрироваться']
      ]).resize())
  } else {
    ctx.session.state = ''
    await ctx.reply('Добро пожаловать! Выберите действие:', Markup
      .keyboard([
        ['Получить прибыль', 'Информация о бизнесах'],
        ['Чат участников', 'Настройки'],
        ['Площадка продажи/покупки валюты']
      ])
      .resize()
    );
  }
});

bot.hears('Зарегистрироваться', async (ctx) => {
  console.log(ctx.session)
  ctx.session.state = 'wait_for_name'
  await ctx.reply('Скажите, как вас называть?')
})

// Обработчик кнопки "Получить прибыль"
bot.hears('Получить прибыль', async (ctx) => {
  // ctx.reply('Вы можете получить информацию о своей прибыли здесь.');
  let result = await db.tickGame(ctx.from.id)
  if (result.nobusiness) {
    await ctx.reply('Вы не заработали сегодня ни с каких бизнесов!')
  } else if (result.didClaim) {
    await ctx.reply(`Сегодня вы заработали ${result.profitSum}!`)
  } else {
    await ctx.reply('Вы уже получали сегодня прибыль, завтра она появится!')
  }
});

// Обработчик кнопки "Информация о бизнесах"
bot.hears('Информация о бизнесах', async (ctx) => {
  let business = await db.listBusiness(ctx.from.id)
  ctx.session.businessCount = business.length
  var keys = []
  console.log(business)
  if (business != undefined) {
    for (let bus of business) {
      const bustype = db.BUSINESS_TYPES[bus.type]
      keys.push([{
        text: `${bus.type} Ур.${bus.upgrades} - ${bus.employees}/${bustype.maxEmployeeCount}`,
        callback_data: `${bus.id}`
      }])
    }
  }
  await ctx.reply(`Ваши бизнесы: ${business?.length}`, Markup.inlineKeyboard(
    keys
  ))
  ctx.session.state = 'list_business'
});

bot.on('callback_query', async (ctx) => {
  var msg = ctx.message;

  if (ctx.session.state == 'list_business') {
    let business_id = ctx.callbackQuery.data
    ctx.session.state = 'business_detail'
    ctx.session.business_id = business_id

    let business = await db.getBusiness(ctx.session.business_id)
    let vars = db.BUSINESS_TYPES[business.type]
    let text = `Бизнес
Тип: ${business.type}
Статус: ${vars.category}
Доходность: ${vars.profitPerEmployee * business.employees * vars.equipmentMultiplier[business.upgrades - 1]}
Сотрудников: ${business.employees}/${vars.maxEmployeeCount}`
    
    let keys = [
      [{text: 'Улучшить ($123)', callback_data: 'action_upgrade'},
      {text: 'Нанять сотрудника ($100)', callback_data: 'action_hire'}]
    ]

    await ctx.editMessageText(text)
    await ctx.editMessageReplyMarkup(Markup.inlineKeyboard(keys).resize())
  }
  
  if (ctx.session.state == 'business_detail') {
    if (ctx.callbackQuery.data == 'action_upgrade') {
      
    } else if (ctx.callbackQuery.data == 'action_hire') {

    }
  }

  await ctx.answerCbQuery()
})

// Обработчик кнопки "Чат участников"
bot.hears('Чат участников', (ctx) => {
  ctx.reply('Вы находитесь в чате участников. Здесь вы можете общаться с другими участниками бота.');
});

// Обработчик кнопки "Настройки"
bot.hears('Настройки', (ctx) => {
  ctx.reply('Вы находитесь в настройках. Здесь вы можете настроить различные параметры и предпочтения.');
});

// Обработчик кнопки "Площадка продажи/покупки валюты"
bot.hears('Площадка продажи/покупки валюты', (ctx) => {
  ctx.reply('Вы находитесь на площадке продажи/покупки валюты. Здесь вы можете осуществлять операции с валютой.');
});

bot.on('message', async (ctx) => {
  if (ctx.session.state == 'wait_for_name') {
    ctx.session.state = ''
    const name = ctx.message.text
    await db.register(ctx.from.id, name, 500000)

    await ctx.reply('Добро пожаловать! Выберите действие:', Markup
      .keyboard([
        ['Получить прибыль', 'Информация о бизнесах'],
        ['Чат участников', 'Настройки'],
        ['Площадка продажи/покупки валюты']
      ])
      .resize()
    );
  }
})

bot.launch();

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
