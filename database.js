import mariadb from 'mariadb'

export const pool = mariadb.createPool({
  database: 'game',
  host: 'localhost',
  user: 'user',
  password: 'ilya333',
  connectionLimit: 9999,
})

export const CATEGORIES = {
  1: 'Низкий',
  2: 'Средний',
  3: 'Топ'
}
console.log(CATEGORIES[1])
export const BUSINESS_TYPES = {
  'STORE': {
    profitPerEmployee: 5000,
    price: 10000000,
    tax: 15,
    maxEmployeeCount: 15,
    startEmployeeCount: 10,
    category: 2,
    equipmentMultiplier: [1.1, 1.2, 1.3],
    friendlyName: 'Продуктовый магазин',
    employeeCount: 8000
  },
  'GAS': {
    profitPerEmployee: 10000,
    price: 30000000,
    tax: 30,
    maxEmployeeCount: 10,
    startEmployeeCount: 5,
    category: 3,
    equipmentMultiplier: [1.1, 1.2, 1.3],
    friendlyName: 'АЗС',
    employeeCount: 40000
  },
  'FOOD': {
    profitPerEmployee: 10000,
    price: 500000,
    tax: 10,
    maxEmployeeCount: 7,
    startEmployeeCount: 5,
    category: 1,
    equipmentMultiplier: [1.1, 1.2, 1.3],
    friendlyName: 'Общепит',
    employeeCount: 15000
  },
  'STO': {
    profitPerEmployee: 8000,
    price: 15000000,
    tax: 25,
    maxEmployeeCount: 8,
    startEmployeeCount: 6,
    category: 2,
    equipmentMultiplier: [1.1, 1.2, 1.3],
    friendlyName: 'СТО',
    employeeCount: 16000
  },
  'AUTO': {
    profitPerEmployee: 5000,
    price: 40000000,
    tax: 30,
    maxEmployeeCount: 30,
    startEmployeeCount: 12,
    category: 3,
    equipmentMultiplier: [1.1, 1.2, 1.3],
    friendlyName: 'Автосалон',
    employeeCount: 15000,
  },
  'GUN': {
    profitPerEmployee: 20000,
    price: 20000000,
    tax: 20,
    maxEmployeeCount: 7,
    startEmployeeCount: 5,
    category: 3,
    equipmentMultiplier: [1.1, 1.2, 1.3],
    friendlyName: 'Магазин оружия',
    employeeCount: 40000
  },
}

export async function register(tgid, name, balance) {
  let conn;
  try {
    conn = await pool.getConnection();
    console.log(tgid + name + balance)
    const user_res = await conn.query('INSERT INTO users (tgid, balance, name) VALUES (?, ?, ?)', [tgid, balance, name])
    console.log(user_res)
  } catch (err) {
    console.log(err)
    throw err;
  } finally { 
    if (conn) return conn.end();
  }
}

export async function getUsers() {
  let conn;
  let users;
  try {
    conn = await pool.getConnection()
    users = await conn.query('SELECT * from users')
  } catch (err) {
    throw err;
  } finally {
    if (conn) {
      conn.end()
      return users
    }
  }
}



export async function updateUser(user) {
  let conn;
  try {
    conn = await pool.getConnection()
    await conn.query('UPDATE users SET balance = ?, name = ? WHERE tgid = ?', [user.balance, user.name, user.tgid])
  } catch (err) {
    throw err;
  } finally {
    if (conn) {
      conn.end()
    }
  }
}

export async function getUser(tgid) {
  let conn;
  let res;
  try {
    conn = await pool.getConnection()
    res = await conn.query('SELECT * from users WHERE tgid = ?', tgid)
  } catch (err) {
    throw err;
  } finally {
    if (conn) {
      conn.end()
      return res[0]
    }
  }
}

export async function getUserByUsername(name) {
  let conn;
  let res;
  try {
    conn = await pool.getConnection()
    res = await conn.query('SELECT * from users WHERE name = ?', name)
  } catch (err) {
    throw err;
  } finally {
    if (conn) {
      conn.end()
      return res[0]
    }
  }
}

export async function getTrades() {
  let conn;
  let res;
  try {
    conn = await pool.getConnection()
    res = await conn.query('SELECT * from trades')
  } catch (err) {
    throw err;
  } finally {
    if (conn) {
      conn.end()
      return res
    }
  }
}

export async function getTrade(id) {
  let conn;
  let res;
  try {
    conn = await pool.getConnection()
    res = await conn.query('SELECT * from trades WHERE id = ?', id)
  } catch (err) {
    throw err;
  } finally {
    if (conn) {
      conn.end()
      return res[0]
    }
  }
}

export async function addTrade(seller, buyer, price, business_id) {
  let conn;
  let res;
  try {
    conn = await pool.getConnection()
    res = await conn.query('INSERT INTO trades (seller, buyer, price, business_id) VALUES (?, ?, ?, ?)', [seller, buyer, price, business_id])
  } catch (err) {
    throw err;
  } finally {
    if (conn) {
      conn.end()
    }
  }
}

export async function removeTrade(id) {
  let conn;
  let res;
  try {
    conn = await pool.getConnection()
    res = await conn.query('DELETE FROM trades WHERE id = ?', [id])
  } catch (err) {
    throw err;
  } finally {
    if (conn) {
      conn.end()
    }
  }
}

export async function removeMoney(tgid, cost) {
  let conn;
  let hasEnoughMoney = false
  try {
    conn = await pool.getConnection()
    let res = await conn.query('SELECT balance from users WHERE tgid = ?', tgid)
    if (res[0].balance >= cost) {
      hasEnoughMoney = true
      await conn.query('UPDATE users SET balance = balance - ? WHERE tgid = ?', [cost, tgid])
    } else {
      return
    }
  } catch (err) {
    throw err;
  } finally {
    if (conn) {
      conn.end()
      return hasEnoughMoney
    }
  }
}
removeMoney(1, 1)

export async function listBusiness(tgid = null) {
  let conn;
  let businesses;
  try {
    conn = await pool.getConnection()
    if (tgid === null) {
      businesses = await conn.query('SELECT * from business')
    } else {
      businesses = await conn.query('SELECT * from business WHERE owner = ?', tgid)
    }
  } catch (err) {
    throw err;
  } finally {
    if (conn) {
      conn.end()
      return businesses
    }
  }
}


export async function getBusiness(id) {
  let conn;
  let res;
  try {
    conn = await pool.getConnection()
    res = await conn.query('SELECT * from business WHERE id = ?', id)
  } catch (err) {
    throw err;
  } finally {
    if (conn) {
      conn.end()
      return res[0]
    }
  }
}

export async function updateBusiness(business) {
  let conn;
  try {
    conn = await pool.getConnection()
    await conn.query('UPDATE business SET owner = ?, upgrades = ?, employees = ? WHERE id = ?', [business.owner, business.upgrades, business.employees, business.id])
  } catch (err) {
    throw err;
  } finally {
    if (conn) {
      conn.end()
    }
  }
}

export async function tickGame(tgid) {
  let conn;
  let result = {
    didClaim: false,
    nobusiness: false,
    profitSum: 0,
  };
  try {
    conn = await pool.getConnection()

    const currentDay = new Date(new Date().toDateString());
    const user = await getUser(tgid);
    if (user.lastIncomeDay != undefined && (user.lastIncomeDay.toDateString() === currentDay.toDateString())) {
      console.log(`User [${tgid}] ${user.name} already claimed today`)
      return;
    }

    result.didClaim = true;
    for (const business of await listBusiness(user.tgid)) {
      const variables = BUSINESS_TYPES[business.type];

      let businessProfit = variables.profitPerEmployee * business.employees * variables.equipmentMultiplier[business.upgrades - 1];
      console.log(businessProfit)
      result.profitSum += businessProfit
    }
    console.log(`User [${tgid}] ${user.name} earned ${result.profitSum} today.`)

    if (result.profitSum == 0) {
      result.nobusiness = true;
      return
    }

    await conn.query('UPDATE users SET lastIncomeDay = ?, balance = balance + ? WHERE tgid = ?', [currentDay, result.profitSum, tgid]);

  } catch (err) {
    console.log(err)
    throw err;
  } finally {
    if (conn) {
      conn.end();
    }
    return result;
  }
}

export async function getTop15() {
  let conn;
  let res;
  try {
    conn = await pool.getConnection()
    res = await conn.query('SELECT name, balance FROM users ORDER BY balance DESC LIMIT 15;')
  } catch (err) {
    throw err;
  } finally {
    if (conn) {
      conn.end()
      return res
    }
  }
}

// console.log(await getUsers())
// const user = await getUser(1)
// user.name = 'Sasha'
// await updateUser(user)
// console.log(await getUsers())

// console.log(await listBusiness())
// console.log(await listBusiness(1))
// console.log(await getUser(2))
// const bus = await getBusiness(1)
// bus.upgrades += 1
// await updateBusiness(bus)
// console.log(await listBusiness())