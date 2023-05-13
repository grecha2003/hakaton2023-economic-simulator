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

bot.command('toplist', async ctx => {
  var top = await db.getTop15()
  let text = ''
  let i = 1;
  for (let user of top) {
    text += `${i}. ${user.balance} - ${user.name}\n`
    i += 1
  }
  ctx.reply('Топ 15 игроков за всё время:\n' +text)
})

bot.command('buybiz', async ctx => {
  let args = ctx.message.text.split(' ')
  let id = parseInt(args[1])
  if (isNaN(id)) {
    ctx.reply('Использование: /buybiz <id бизнеса>')
    return
  }
  let business = await db.getBusiness(id)
  let vars = db.BUSINESS_TYPES[business.type]
  if (!business) {
    ctx.reply('Данного бизнеса не существует 😢')
  } else if (business.owner) {
    if (business.owner != ctx.from.id) {
      ctx.reply('Вы не можете купить бизнес, которым владеет другой человек')
    } else {
      ctx.reply('Вы уже владеете этим бизнесом.')
    }
  } else if (!business.owner) {
    if (await db.removeMoney(ctx.from.id, vars.price)) {
      business.owner = ctx.from.id
      await db.updateBusiness(business)
      ctx.reply(`Поздравляем 🎉\nВы купили бизнес ${vars.friendlyName} за ${vars.price}`)
    } else {
      ctx.reply('У вас недостаточно денег чтобы купить этот бизнес.')
    }
  }
})

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
        ['Мой профиль', 'Мои бизнесы'],
        ['Получить прибыль', 'Площадка продажи'],
        ['Настройки', 'Чат участников']
      ])
      .resize()
    );
  }
});

bot.hears('Зарегистрироваться', async (ctx) => {
  console.log(ctx.session)
  ctx.session.state = 'wait_for_name'
  await ctx.reply('Скажите, как вас называть? (без пробелов)')
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
Уровень: ${db.upgrades}
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
  
  if (ctx.callbackQuery.data == 'accept_trade') {
    let trades = await db.getTrades()
    for (let trade of trades) {
      if (trade.buyer == ctx.callbackQuery.from.id) {
        console.log(trade)
        if (await db.removeMoney(ctx.callbackQuery.from.id, trade.price)) {
          await ctx.reply(`Теперь вы владелец нового бизнеса за скромную цену в ${trade.price}!`)
          let business = await db.getBusiness(trade.business_id)
          business.owner = trade.buyer
          await db.updateBusiness(business)

          let seller = await db.getUser(trade.seller)
          seller.balance += trade.price
          await db.updateUser(seller)
          await bot.telegram.sendMessage(trade.seller, `Сделка состоялась! Вы заработали ${trade.price}`)
        } else {
          await ctx.reply('У вас недостаточно денег, сделка сорвалась.')
          await bot.telegram.sendMessage(trade.seller, `Сделка сорвалась! У другой стороны недостаточно денег.`)
        }
        await db.removeTrade(trade.id)
        return
      }
    }
    return
  } else if (ctx.callbackQuery.data == 'decline_trade') {
    let trades = await db.getTrades()
    for (let trade of trades) {
      if (trade.buyer == ctx.callbackQuery.from.id) {
        await db.removeTrade(trade.id)
        await ctx.reply('Вы отказались от сделки.')
        await bot.telegram.sendMessage(trade.seller, `Сделка сорвалась! Другая сторона отказалась.`)
        return
      }
    }
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
    console.log(ctx.session)
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
      user.balance += (vars.price * 0.5)
      await db.updateUser(user)
      business.owner = null
      await db.updateBusiness(business)
      ctx.deleteMessage(ctx.callbackQuery.message.id)
      ctx.reply('Вы продали бизнес государству, больше он вам не принадлежит')
      ctx.session.state = ''
    } else if (ctx.callbackQuery.data == 'action_sell_to_user') {
      ctx.session.state = 'sell_to_user_price'
      ctx.reply('За сколько хотите продать свой бизнес?')
    }
  }

  await ctx.answerCbQuery()
})

bot.hears('Мой профиль', async (ctx) => {
  let user = await db.getUser(ctx.from.id)
  let businesses = await db.listBusiness(user.tgid)
  let incomeday = user.lastIncomeDay ? user.lastIncomeDay.toDateString() : 'никогда'
  ctx.reply(`Профиль ${user.name} 💼
Баланс: ${user.balance}
День сбора: ${incomeday}
Количество бизнесов: ${businesses.length}`);
});

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

bot.on('message', async (ctx) => {
  if (ctx.session.state == 'sell_to_user_price') {
    let price = parseInt(ctx.message.text)
    if (isNaN(price)) {
      ctx.reply('Напишите целое число в долларах')
      return
    }
    ctx.session.sell_price = price
    ctx.session.state = 'sell_to_user_user'
    ctx.reply('Какому игроку хотите передать имущество? Напишите id или @никнейм')
  }
  else if (ctx.session.state == 'sell_to_user_user') {
    let userid = parseInt(ctx.message.text)
    if (isNaN(userid)) {
      let user = await db.getUserByUsername(ctx.message.text)
      if (!user) {
        ctx.reply('Не нашли никого с этим ником 😢')
        return
      }
      userid = user.tgid
    }
    let seller_user = await db.getUser(ctx.from.id)
    let business = await db.getBusiness(ctx.session.business_id)
    let vars = db.BUSINESS_TYPES[business.type]

    await db.addTrade(seller_user.tgid, userid, ctx.session.sell_price, business.id)
    
    ctx.reply(`Отправили игроку предложение! Ждём ответа`)
    bot.telegram.sendMessage(userid, `${seller_user.name} предлагает вам купить за ${ctx.session.sell_price}:
Бизнес ${vars.friendlyName} 💹
Статус: ${db.CATEGORIES[vars.category]}
Уровень: ${business.upgrades}
Доходность: ${vars.profitPerEmployee * business.employees * vars.equipmentMultiplier[business.upgrades - 1]}
Сотрудников: ${business.employees}/${vars.maxEmployeeCount}

Вы согласны?`, Markup.inlineKeyboard([
      [{text:'Да ✔', callback_data:'accept_trade'}, {text: 'Нет ❌', callback_data:'decline_trade'}]
    ]).resize())
  }
  else if (ctx.session.state == 'wait_for_name') {
    ctx.session.state = ''
    const name = ctx.message.text.split(' ')[0]
    await db.register(ctx.from.id, name, 500000)

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
})

bot.launch();

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
