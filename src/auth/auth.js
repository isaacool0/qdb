const pool = require('../database');
const passport = require('passport');
const session = require('express-session');
const redis = require('redis');
const connectRedis = require('connect-redis');
const redisClient = redis.createClient({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
});

redisClient.on('error', (err) => console.error('Redis Error:', err));

(async () => {
  await redisClient.connect();
})();

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
	let result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
	if (result.rows.length) {
	  done(null, result.rows[0]);
	} else {
	  done(new Error('user not found'), null);
	}
});

const getAccount = async (externalId, provider) => {
  const result = await pool.query(
    `SELECT users.id, users.name, connections.external_id
    FROM connections
    JOIN users ON users.id = connections.user_id
    WHERE connections.provider = $1 AND connections.external_id = $2`, [provider, externalId]);
  if (result.rows.length > 0) {
		return { id: result.rows[0].id, externalId: result.rows[0].external_id, name: result.rows[0].name };    
  }
  return null;
};

const addAccount = async (name, externalId, provider) => {
  const userResult = await pool.query('INSERT INTO users (name) VALUES ($1) RETURNING id', [name]);
  const userId = userResult.rows[0].id;
  await pool.query('INSERT INTO connections (user_id, provider, external_id, name) VALUES ($1, $2, $3, $4)', [userId, provider, externalId, name]);
  return { id: userId, externalId, name };
};

const addSession = (app) => {
  const RedisStore = connectRedis.RedisStore;
  const redisStore = new RedisStore({
    client: redisClient,
    prefix: "qdb:",
    ttl: 24*60*60
  });
  app.use(session({
    store: redisStore,
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { 
    	maxAge: 90*24*60*60*1000, 
			httpOnly: true,
			sameSite: 'strict'
    }
  }));
  app.use(passport.initialize());
  app.use(passport.session());
};

const auth = (app) => {
  require('./discord')(app);
  //TODO generate salt then hash password
  app.post('/auth/register', async (req, res) => {
    let { name, pass } = req.body;
    if (!name || !pass) return res.status(400).json({ success: false, error: 'missing info' });
    try {
      let result = await pool.query('INSERT INTO users (name, pass) VALUES ($1, $2) RETURNING id, name', [name, pass]);
      let user = result.rows[0];
      req.login(user, (err) => {
        if (err) return res.status(500).json({ error: 'Login failed' });
        return res.status(201).json({ success: true, id: user.id, name: user.name });
      });
    } catch (err) {
      if (err.code === '23505') {
        return res.status(400).json({success: false, nameExists: true});
      }
      console.error(err);
    }
  });
  //TODO use salt to hash and test pass
  app.post('/auth/login', async (req, res) => {
    const { name, pass } = req.body;
    if (!name || !pass) return res.status(400).json({ error: 'missing info' });
    try {
      let result = await pool.query('SELECT * FROM users WHERE name = $1 AND pass = $2', [name, pass]);
      if (!result.rows.length) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }
      const user = result.rows[0];
      req.login(user, (err) => {
        if (err) return res.status(500).json({ error: 'Login failed' });
        return res.json({ id: user.id, name: user.name });
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Login failed' });
    }
  });
	app.get('/auth/:provider', (req, res, next) => {
    const provider = req.params.provider;
    passport.authenticate(provider)(req, res, next);
  });
  app.get('/auth/:provider/callback', (req, res, next) => {
    const provider = req.params.provider;
    passport.authenticate(provider, { failureRedirect: '/' }, (err, user) => {
      if (err || !user) {
        return res.redirect('/');
      }
      req.logIn(user, (err) => {
        if (err) return next(err);
        res.redirect('/');
      });
    })(req, res, next);
  });

  app.get('/logout', (req, res) => {
    req.logout((err) => res.redirect('/'));
  });
};

module.exports = { getAccount, addAccount, addSession, auth };
