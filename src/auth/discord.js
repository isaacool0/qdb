const passport = require('passport');
const discord = require('passport-discord');
const { getAccount, addAccount } = require('./auth');

passport.use(new discord.Strategy({
  clientID: process.env.DISCORD_ID,
  clientSecret: process.env.DISCORD_SECRET,
  callbackURL: '/auth/discord/callback',
  scope: ['identify'],
}, async (accessToken, refreshToken, profile, done) => {
  const discordId = profile.id;
  const name = profile.username;
  let account = await getAccount(discordId, 'DISC');
  if (!account) {
    account = await addAccount(name, discordId, 'DISC');
  }
  return done(null, account);
}));

module.exports = (app) => {
  app.get('/auth/discord', passport.authenticate('discord'));
  app.get('/auth/discord/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => {
    res.redirect('/');
  });
};
