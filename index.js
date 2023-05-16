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
  if (!business) {
    ctx.reply('Данного бизнеса не существует 😢')
  } else if (business.owner) {
    if (business.owner != ctx.from.id) {
      ctx.reply('Вы не можете купить данное предприятие, так-как которым владеет другой человек')
    } else {
      ctx.reply('Вы уже владеете этим бизнесом.')
    }
  } else if (!business.owner) {
    let vars = db.BUSINESS_TYPES[business.type]
    if (await db.removeMoney(ctx.from.id, vars.price)) {
      business.owner = ctx.from.id
      await db.updateBusiness(business)
      ctx.reply(`Поздравляем 🎉\nВы купили предприятие ${vars.friendlyName} за ${vars.price}`)
    } else {
      ctx.reply('У вас недостаточно денег чтобы купить это предприятие.')
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
        ['🙂Мой профиль', '🏢Мои предприятия'],
        ['💸Получить прибыль', '⚙️Настройки'],
        ['🏦Площадка продажи', '🗺Карта предприятий'],
        ['🤖Помощь по игре', '✉️Чат участников']
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

// Обработчик кнопки "💸Получить прибыль"
bot.hears('💸Получить прибыль', async (ctx) => {
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

// Обработчик кнопки "🏢Мои предприятия"
bot.hears('🏢Мои предприятия', async (ctx) => {
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
  let text = `Предприятие ${vars.friendlyName} 💹
Статус: ${db.CATEGORIES[vars.category]}
Уровень: ${business.upgrades}
Доходность: ${vars.profitPerEmployee * business.employees * vars.equipmentMultiplier[business.upgrades - 1]}
Сотрудников: ${business.employees}/${vars.maxEmployeeCount}`
  
  let upgrade_price = vars.price * 0.1
  let hire_price = 10000
  let keys = [
    [
      {text: `Улучшить ($${upgrade_price})`, callback_data: 'action_upgrade'},
      {text: `Нанять сотрудника ($${hire_price})`, callback_data: 'action_hire'}
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

  if (ctx.callbackQuery.data == 'change_name') {
    ctx.reply('Введите свой новый ник')
    ctx.session.state = 'wait_for_name'
  }

  if (ctx.callbackQuery.data == 'Список команд') {
    ctx.replyWithHTML(
      'Ниже предоставлен набор команд для игры ⬇️\n\n'+
      '/start' + '-данная функция предназначена для запуска бота, либо если хотите начать игру заново.\n' +
      '/toplist' + '-вывод списка самых успешных предпринимателей.\n' +
      '/buybiz id' + '(замените идентификатор id на id бизнеса)' + '-команда используется для реализации покупки бизнеса доступного к продаже.')
    return
  }

  if (ctx.callbackQuery.data == 'Правила игры') {
    ctx.replyWithHTML(
     'Шаг 1: Добро пожаловать в "Экономический император"!\n' +
     'Приветствуем вас в захватывающем мире предпринимательства и финансового успеха. В этом туториале мы поможем вам овладеть основами игры и стать  экономическим экспертом.\n\n' +
     'Шаг 2: Основы игрового интерфейса.\n' +
     'На экране вы увидите карту города, которая будет вашим игровым полем. Слева расположены кнопки и меню, которые позволят вам взаимодействовать с игрой. Обратите внимание на доступные вам ресурсы, баланс средств и текущие задачи.\n\n' +
     'Шаг 3: Покупка предприятия.\n' +
     'Чтобы начать развитие своего предприятия, вам нужно приобрести недвижимость. Нажмите на кнопку "Купить" на панели инструментов и выберите доступный для покупки участок земли на карте города. Затем подтвердите покупку и вы станете владельцем этого участка.\n\n' +
     'Шаг 4: Развитие и улучшение предприятия.\n' +
     'Теперь, когда у вас есть недвижимость, вы можете развивать ее. Нажмите на кнопку "Улучшить" рядом с вашим имуществом и выберите улучшения, которые хотите сделать. Улучшение недвижимости повышает ее стоимость и прибыльность.\n\n' +
     'Шаг 7: Рынок недвижимости и торговля.\n' +
     'Не забывайте следить за рыночной ситуацией и активно торговать недвижимостью. Иногда вы можете найти выгодные предложения для покупки или продажи имущества. Нажмите на кнопку "Карта бизнесов" и изучите доступные сделки. Вы можете предлагать свои предприятия на продажу или покупать предложения других игроков.\n\n' +
     'Шаг 8: Стратегический рост и развитие бизнеса.\n' +
     'Чтобы стать успешным экономическим императором, вам необходимо стратегически планировать и развивать свое предприятие. Рассмотрите возможности расширения штата сотрудников, покупки дополнительной недвижимости или запуска новых предприятий. Используйте свои финансовые ресурсы с умом и добивайтесь постоянного роста и процветания.\n\n' +
     'Шаг 9: Конкуренция и рейтинг игроков.\n' +
     'Не забывайте, что вы не единственный игрок в игре. Вас ожидает ожесточенная конкуренция с другими предпринимателями. Соревнуйтесь за лидерство в рейтинге игроков, достигайте высоких позиций и демонстрируйте свои предпринимательские навыки. Топов можно найти в списке по команде /toplist\n\n' +
     'Шаг 10: Обновления и события.\n' +
     'Игра будет регулярно обновляться с добавлением нового контента, функций и событий. Будьте в курсе всех обновлений, участвуйте в событиях и получайте уникальные возможности для развития своего бизнеса.\n\n' +
     'Шаг 11: Получение помощи и поддержка.\n' +
     'Если у вас возникнут вопросы или потребуется помощь, обратитесь к нашей команде поддержки. Мы всегда готовы помочь вам решить любые проблемы и предоставить рекомендации по игре.\n\n' +
     'Шаг 12: Завершение туториала и начало вашего пути к успеху!\n' +
     'Поздравляем! Теперь вы овладели основами игры "Экономический император". Ваше путешествие к финансовому процветанию только начинается. Проявите свои предпринимательские навыки, принимайте стратегические решения и достигайте новых высот в бизнесе.\n'
    );
    return
  };
  
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
        let upgrade_price = vars.price * 0.1
        if (db.removeMoney(ctx.from.id, upgrade_price)) {
          business.upgrades += 1
          await db.updateBusiness(business)
          ctx.reply(`Предприятие теперь улучшено на ${business.upgrades}/3!`)
        } else {
          ctx.reply('Вам не хватает денег, чтобы улучшить свое предприятие.')
        }
      }
    } else if (ctx.callbackQuery.data == 'action_hire') {
      if (business.employees >= vars.maxEmployeeCount) {
        ctx.reply('В вашем бизнесе максимальное количество сотрудников.')
      } else {
        let hire_price = 10000
        if (await db.removeMoney(ctx.from.id, hire_price)) {
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
      ctx.reply('Вы продали свое предприятие государству, больше он вам не принадлежит')
      ctx.session.state = ''
    } else if (ctx.callbackQuery.data == 'action_sell_to_user') {
      ctx.session.state = 'sell_to_user_price'
      ctx.reply('За сколько хотите продать свое предприятие?')
    }
  }

  await ctx.answerCbQuery()
})

bot.hears('🙂Мой профиль', async (ctx) => {
  let user = await db.getUser(ctx.from.id)
  let businesses = await db.listBusiness(user.tgid)
  let incomeday = user.lastIncomeDay ? user.lastIncomeDay.toDateString() : 'никогда'
  ctx.reply(`Профиль ${user.name} 💼
Баланс: ${user.balance}
День сбора: ${incomeday}
Количество бизнесов: ${businesses.length}`);
});

// Обработчик кнопки "✉️Чат участников"
bot.hears('✉️Чат участников', (ctx) => {
  ctx.reply('Залетайте в наш чат и обменивайтесь предприятиями с другими людьми! 🤑', Markup.inlineKeyboard([
    Markup.button.url('Перейти в чат', 'https://t.me/+tcgVdSKiygY0Njky')
  ]));
});

// Обработчик кнопки "⚙️Настройки"
bot.hears('⚙️Настройки', (ctx) => {
  ctx.reply('⚙️Настройки', Markup.inlineKeyboard([
    Markup.button.callback('Сменить имя', 'change_name')
  ]));
});

// Обработчик кнопки "🏦Площадка продажи"
bot.hears('🏦Площадка продажи', (ctx) => {
  ctx.reply('Вы находитесь на площадке продажи/покупки валюты. Здесь вы можете осуществлять операции с валютой. При выборе варианта оплаты откроется окно в браузере и вы будете направлены на сервис оплаты', 
  Markup.inlineKeyboard([
    [Markup.button.url('1000000 игровой валюты за 50 рублей', "https://retail.paymaster.ru/")],
    [Markup.button.url('2000000 игровой валюты за 100 рублей', "https://retail.paymaster.ru/")],
    [Markup.button.url('3000000 игровой валюты за 150 рублей', "https://retail.paymaster.ru/")],
    [Markup.button.url('4000000 игровой валюты за 200 рублей', "https://retail.paymaster.ru/")],
    [Markup.button.url('5000000 игровой валюты за 250 рублей', "https://retail.paymaster.ru/")],
    [Markup.button.url('6000000 игровой валюты за 300 рублей', "https://retail.paymaster.ru/")]],));
});

// Обработчик кнопки "Карта бизнесов"
bot.hears('🗺Карта предприятий', (ctx) => {
  ctx.reply('Карта откроется в отдельном окне браузера, где вы сможете ознакомится с доступными для вас вариантами покупки предприятий! 💰', Markup.inlineKeyboard([
    Markup.button.url('Перейти на карту предприятий', 'https://samp-maps-burrubin.vercel.app/')]));
});

// Обработчик кнопки "🤖Помощь по игре"
bot.hears('🤖Помощь по игре', (ctx) => {
  ctx.reply('Вы находитесь в разделе помощи. Здесь вы сможете узнать правила игры, узнать список команд, получить поддержку со стороны разработчиков игры! 🧞‍♂️', Markup.inlineKeyboard([
    Markup.button.callback('Список команд', "Список команд"), Markup.button.callback('Правила игры', "Правила игры"), Markup.button.url('Поддержка', 'https://t.me/+tcgVdSKiygY0Njky')
]));
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
Предприятие ${vars.friendlyName} 💹
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
    let user = await db.getUser(ctx.from.id)
    if (!user) {
      await db.register(ctx.from.id, name, 500000)
    } else {
      user.name = name
      await db.updateUser(user)
    }

    await ctx.reply('Добро пожаловать! Выберите действие:', Markup
      .keyboard([
        ['🙂Мой профиль', '🏢Мои предприятия'],
        ['💸Получить прибыль', '⚙️Настройки'],
        ['🏦Площадка продажи', '🗺Карта предприятий'],
        ['🤖Помощь по игре', '✉️Чат участников']
      ])
      .resize()
    );
  }
})

bot.launch();

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
