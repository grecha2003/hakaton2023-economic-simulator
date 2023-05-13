import * as dotenv from 'dotenv'
dotenv.config()
import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { Markup } from 'telegraf';
import { session } from 'telegraf';
import { MySQL } from "@telegraf/session/mysql";
import * as db from './database.js';


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
        ['Получить прибыль', 'Мои бизнесы'],
        ['Чат участников', 'Настройки'],
        ['Площадка продажи', 'Карта бизнесов'],
        ['Помощь по игре']
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

// Обработчик кнопки "Мои бизнесы"
bot.hears('Мои бизнесы', async (ctx) => {
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

async function editBusinessDataFromContext(ctx) {
  let business = await db.getBusiness(ctx.session.business_id)
  let vars = db.BUSINESS_TYPES[business.type]
  let text = `Бизнес ${vars.friendlyName} 💹
Статус: ${db.CATEGORIES[vars.category]}
Доходность: ${vars.profitPerEmployee * business.employees * vars.equipmentMultiplier[business.upgrades - 1]}
Сотрудников: ${business.employees}/${vars.maxEmployeeCount}`
  
  let keys = [
    [
      {text: 'Улучшить ($123)', callback_data: 'action_upgrade'},
      {text: 'Нанять сотрудника ($100)', callback_data: 'action_hire'}
    ],
    [
      {text: 'Продать государству (50%)', callback_data: 'action_sell_to_state'},
      {text: 'Продать игроку', callback_data: 'action_sell_to_user'}
    ]
  ]

  await ctx.editMessageText(text, Markup.inlineKeyboard(keys).resize())
}

bot.on('callback_query', async (ctx) => {
  var msg = ctx.message;

  if (ctx.callbackQuery.data == 'Список команд') {
    ctx.replyWithHTML(
      'Ниже предоставлен набор команд для игры ⬇️\n\n'+
      '/start' + '-данная функция предназначена для запуска бота, либо если хотите начать игру заново.\n' +
      '/toplist' + '-вывод списка самых успешных предпринимателей.\n' +
      '/bybiz id' + '(замените слово id на id бизнеса)' + '-команда используется для реализации покупки бизнеса доступного к продаже.')
    return
  }
  
  if (ctx.session.state == 'list_business') {
    let business_id = ctx.callbackQuery.data
    ctx.session.state = 'business_detail'
    ctx.session.business_id = business_id
    
    await editBusinessDataFromContext(ctx)
  }
  
  if (ctx.session.state == 'business_detail') {
    let user = await db.getUser(ctx.from.id)
    let business = await db.getBusiness(ctx.session.business_id)
    let vars = db.BUSINESS_TYPES[business.type]
    if (ctx.callbackQuery.data == 'action_upgrade') {
      if (business.upgrades >= 3) {
        ctx.reply('У вас и так максимальное улучшение')
      } else {
        if (db.removeMoney(ctx.from.id, 123)) {
          business.upgrades += 1
          await db.updateBusiness(business)
          ctx.reply(`Бизнес теперь улучшен на ${business.upgrades}/3!`)
        } else {
          ctx.reply('Вам не хватает денег, чтобы улучшить бизнес.')
        }
      }
    } else if (ctx.callbackQuery.data == 'action_hire') {
      if (business.employees >= vars.maxEmployeeCount) {
        ctx.reply('В вашем бизнесе максимальное количество сотрудников.')
      } else {
        if (await db.removeMoney(ctx.from.id, 100)) {
          business.employees += 1
          await db.updateBusiness(business)
          await editBusinessDataFromContext(ctx)
          ctx.reply(`Вы наняли сотрудника! Теперь их ${business.employees}/${vars.maxEmployeeCount}.`)
        } else {
          ctx.reply('Вам не хватает денег, чтобы нанять нового сотрудника.')
        }
      }
    } else if (ctx.callbackQuery.data == 'action_sell_to_state') {
      user.balance += (vars.price * 0.5) % 1
      await db.updateUser(user)
      business.owner = null
      await db.updateBusiness(business)
      ctx.deleteMessage(ctx.callbackQuery.message.id)
      ctx.reply('Вы продали бизнес государству, больше он вам не принадлежит')
      ctx.session.state = ''
    }
  }

  await ctx.answerCbQuery()
})

// Обработчик кнопки "Чат участников"
bot.hears('Чат участников', (ctx) => {
  ctx.reply('Залетайте в наш чат и обменивайтесь бизнесами с другими людьми! 🤑', Markup.inlineKeyboard([
    Markup.button.url('Перейти в чат', 'https://t.me/+tcgVdSKiygY0Njky')
  ]));
});

// Обработчик кнопки "Настройки"
bot.hears('Настройки', (ctx) => {
  ctx.reply('Вы находитесь в настройках. Здесь вы можете настроить различные параметры и предпочтения.');
});

// Обработчик кнопки "Площадка продажи"
bot.hears('Площадка продажи', (ctx) => {
  ctx.reply('Вы находитесь на площадке продажи/покупки валюты. Здесь вы можете осуществлять операции с валютой.');
});

// Обработчик кнопки "Карта бизнесов"
bot.hears('Карта предприятий', (ctx) => {
  ctx.reply('Карта откроется в отдельном окне браузера, где вы можете посмотреть варианты покупки бизнесса! 💸', Markup.inlineKeyboard([
    Markup.button.url('Перейти на карту бизнесов', 'https://samp-maps-burrubin.vercel.app/')]));
});

// Обработчик кнопки "Помощь по игре"
bot.hears('Помощь по игре', (ctx) => {
  ctx.reply('Вы находитесь в разделе помощи. Здесь вы сможете узнать правила игры, узнать список команд, получить поддержку со стороны разработчиков игры! 🧞‍♂️', Markup.inlineKeyboard([
    Markup.button.callback('Список команд', "Список команд"), Markup.button.url('Правила игры', 'https://samp-maps-burrubin.vercel.app/'), Markup.button.url('Поддержка', 'https://t.me/+tcgVdSKiygY0Njky')
]));
});
 
bot.on('message', async (ctx) => {
  if (ctx.session.state == 'wait_for_name') {
    ctx.session.state = ''
    const name = ctx.message.text
    await db.register(ctx.from.id, name, 500000)

    await ctx.reply('Добро пожаловать! Выберите действие:', Markup
      .keyboard([
        ['Получить прибыль', 'Мои бизнесы'],
        ['Чат участников', 'Настройки'],
        ['Площадка продажи', 'Карта предприятий'],
        ['Помощь по игре']
      ])
      .resize()
    );
  }
})

bot.launch();

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
