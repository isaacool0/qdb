const pool = require('./database');
const passport = require('passport');
const session = require('express-session');
const redis = require('redis');
const connectRedis = require('connect-redis');
const discord = require('passport-discord');

let redisClient = redis.createClient({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
});

redisClient.connect().catch(console.error);

passport.use(new discord.Strategy({
  clientID: process.env.DISCORD_ID,
  clientSecret: process.env.DISCORD_SECRET,
  callbackURL: '/auth/discord/callback',
  scope: ['identify'],
}, async (accessToken, refreshToken, profile, done) => {
  let discordId = profile.id;
	let username = profile.username;
	let result = await pool.query('SELECT user_id FROM connections WHERE provider = $1 AND external_id = $2', ['DISC', discordId]);
	let id;
	if (result.rows.length > 0) {
		id = result.rows[0].user_id;
	} else {
		id = await pool.query('INSERT INTO users (username) VALUES ($1) RETURNING id', [username]).rows[0].id;
		await pool.query('INSERT INTO connections (user_id, provider, external_id) VALUES ($1, $2, $3)', [id, 'DISC', discordId]);	
	}
	return done(null, {id, discordId, username});
}));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  done(null, id);
});

let addSession = (app) => {
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
      maxAge: 90*24*60*60*1000
    }
  }));
  app.use(passport.initialize());
  app.use(passport.session());
};

let auth = (app) => {
  app.get('/auth/discord', passport.authenticate('discord'));
  app.get('/auth/discord/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => {
    res.redirect('/');
  });
  app.get('/logout', (req, res) => {
    req.logout((err) => res.redirect('/'));
  });
};

module.exports = { addSession, auth };
