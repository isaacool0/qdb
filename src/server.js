require('dotenv').config();

const express = require('express');
const pool = require('./database');
const api = require('./api');
const { addSession, auth } = require('./auth/auth');
const app = express();
const port = process.env.PORT;

app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');

app.use(express.static('public'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

addSession(app);
auth(app);
app.get('/login', (req, res) => {  res.render('login')});

app.use('/api', api);

app.get('/', (req, res) => {
  res.render('home');
});

app.get('/test', (req, res) => {
  res.json({user: req.user});
});


app.get('/test/:test', async (req, res) => {
  console.log(test);
});

app.get('/list/:tags', async (req, res) => {
  if (!req.params.tags) return res.redirect(302, '/');
  let tags = req.params.tags ? req.params.tags.split(":") : [];
  if (tags.length === 0) return res.redirect(302, '/');
  let result = (await pool.query(`
    SELECT
      json_agg(DISTINCT jsonb_build_object('id', items.id, 'name', items.name)) AS items,
      json_agg(DISTINCT jsonb_build_object('id', tags.id, 'name', tags.name)) AS tags
    FROM tags
    JOIN item_tags ON tags.id = item_tags.tag_id
    JOIN items ON items.id = item_tags.item_id
    WHERE tags.name IN (${tags.map((_,i)=>`$${i+1}`).join(", ")})
    AND item_tags.active = true`, tags)).rows[0];
  if (result.items?.length > 0) {
    for (let item of result.items) {
      item.upvotes = 0;
      item.downvotes = 0;
      for (let tag of result.tags) {
        let votes = await getVotes([item.id, tag.id], 'tag');
        item.upvotes += parseInt(votes.upvotes);
        item.downvotes += parseInt(votes.downvotes);
      }
    }
		res.render('list/index', { tags: result.tags, items: result.items});
  } else {
    res.render('list/no-results', { tags: tags });
  }
});

//TODO merge queries 
app.get('/item/:item/:action?', async (req, res) => {
  let name = req.params.item;
  let id = (await pool.query('SELECT id FROM items WHERE name = $1', [name])).rows[0]?.id;
	if (!id) return res.redirect(302, `/new/item?name=${name}`);
  let action = req.params.action;
  let tags = (await pool.query(
    `SELECT tags.name, tags.id FROM tags
     JOIN item_tags ON tags.id = item_tags.tag_id
     JOIN items ON items.id = item_tags.item_id
     WHERE items.name = $1 AND item_tags.active = true`, [name])).rows;
  let desc = (await pool.query('SELECT description FROM items WHERE name = $1', [name])).rows[0]?.description || '';
  let votes = await getVotes(id,'item');
	if (!action) return res.render('item/index', {name, id, tags, desc, votes});
  //TODO get tag votes
	if (action === 'tags') return res.render('item/tags', {name, id, tags, desc});
  if (!req.user) return res.redirect('/login');
  if (action === 'edit') return res.render('item/edit', {name, id, tags, desc});
  res.redirect(302, `/item/${name}`);
});

app.get('/user/:user/:action?', async (req, res) => {
  let username = req.params.user;
  let action = req.params.action;
  let user = (await pool.query('SELECT id, name, bio FROM users WHERE name = $1', [username])).rows[0];
	if (!user) return res.render(`user/not-found`, {username});
	if (!action) return res.render('user/index', {user});
  if (action === 'edit') return res.render('user/edit', {user});
  res.redirect(302, `/user/${username}`);
});

app.get('/new/:thing?', (req, res) => {
  let thing = req.params.thing;
  switch (thing) {
    case 'item':
      //TODO logic to optionally send item name and/or description prefilled
      if (!req.user) return res.redirect('/login');
      res.render('new/item');
      break;
	  case 'user':
      res.render('new/user');
      break;
    case undefined:
      res.render('new');
    break;
  default:
    res.redirect(302, '/new');
    break;
  }
});

app.get('/get-votes/:object/:type', async (req, res) => {
  getVotes(req.params.object, req.params.type);
});

async function getVotes(object, type) {
	let votes;
	if (type==='tag') {
	  votes = (await pool.query(`
	  SELECT
	     COUNT(*) FILTER (WHERE rating = true) AS upvotes, 
	     COUNT(*) FILTER (WHERE rating = false) AS downvotes 
	  FROM tag_votes 
	  WHERE item_id = $1 AND tag_id = $2`, [object[0], object[1]])).rows[0];
	} else {
	  votes = (await pool.query(`
	  SELECT 
	    COUNT(*) FILTER (WHERE rating = true) AS upvotes, 
	    COUNT(*) FILTER (WHERE rating = false) AS downvotes 
	  FROM ${type}_votes 
	  WHERE ${type}_id = $1`, [object])).rows[0];
	}
	return votes;
};



app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
