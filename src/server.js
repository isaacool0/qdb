require('dotenv').config();

const express = require('express');
const pool = require('./database');
const api = require('./api');
const { addSession, auth } = require('./auth/auth');
const app = express();
const port = process.env.PORT;
const path = require('path');

app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

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

app.get('/list/:tags{/:mode}', async (req, res) => {
  let tags = req.params.tags ? req.params.tags.split(":") : [];
  if (!req.params.mode) return res.redirect(302, `/list/${tags.join(":")}/top`);
  if (!req.params.tags) return res.redirect(302, '/');
  if (tags.length === 0) return res.redirect(302, '/');
  let result = await getResults(tags, req.params.mode, req.query.dir||'desc')
  if (result.items?.length > 0) {
		res.render('list/index', { tags: result.tags, items: result.items});
  } else {
    res.render('list/no-results', { tags: tags });
  }
});

//TODO merge queries 
app.get('/item/:item{/:action}', async (req, res) => {
  let name = req.params.item;
  let result = (await pool.query('SELECT id, description, image FROM items WHERE name = $1', [name])).rows[0];
  if (!result) return res.redirect(302, `/new/item?name=${name}`);
  let id = result.id;
  let desc = result.description || '';
  let image = result.image;
  let action = req.params.action;
  let tags = (await pool.query(
    `SELECT tags.name, tags.id FROM tags
     JOIN item_tags ON tags.id = item_tags.tag_id
     JOIN items ON items.id = item_tags.item_id
     WHERE items.name = $1 AND item_tags.active = true`, [name])).rows;
  let votes = await getVotes(id,'item');
  if (!action) return res.render('item/index', {name, id, tags, desc, votes, image});
  //TODO get tag votes
  if (action === 'tags') return res.render('item/tags', {name, id, tags, desc, image});
  if (!req.user) return res.redirect('/login');
  if (action === 'edit') return res.render('item/edit', {name, id, tags, desc, image});
  res.redirect(302, `/item/${name}`);
});

app.get('/user/:user{/:action}', async (req, res) => {
  let username = req.params.user;
  let action = req.params.action;
  let user = (await pool.query('SELECT id, name, bio FROM users WHERE name = $1', [username])).rows[0];
	if (!user) return res.render(`user/not-found`, {username});
	if (!action) return res.render('user/index', {user});
  if (action === 'edit') return res.render('user/edit', {user});
  res.redirect(302, `/user/${username}`);
});

app.get('/new{/:thing}', (req, res) => {
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

async function getResults(tags, mode, dir) {
  // sanitize direction
  dir = dir && dir.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  // whitelist order columns
  const orderMap = {
    pop: '(upvotes + downvotes)',
    top: 'rating'
  };
  const orderCol = orderMap[mode] || 'rating';
  const order = `${orderCol} ${dir}`;

  const sql = `
    WITH sel_tags AS (
      SELECT id, name FROM tags WHERE name = ANY($1::text[])
    ),
    item_stats AS (
      SELECT
        items.id,
        items.name,
        items.image,
        COUNT(tag_votes.*) FILTER (WHERE tag_votes.rating IS TRUE)::float AS upvotes,
        COUNT(tag_votes.*) FILTER (WHERE tag_votes.rating IS FALSE)::float AS downvotes,
        (100.0 * (COUNT(tag_votes.*) FILTER (WHERE tag_votes.rating IS TRUE) + 1)) /
          (COUNT(tag_votes.*) FILTER (WHERE tag_votes.rating IS TRUE) + 1 +
           COUNT(tag_votes.*) FILTER (WHERE tag_votes.rating IS FALSE)) AS rating
      FROM items
      JOIN item_tags ON item_tags.item_id = items.id AND item_tags.active = true
      JOIN sel_tags ON sel_tags.id = item_tags.tag_id
      LEFT JOIN tag_votes ON tag_votes.item_id = items.id AND tag_votes.tag_id = sel_tags.id
      GROUP BY items.id, items.name, items.image
    )
    SELECT
      (SELECT json_agg(
        jsonb_build_object(
          'id', item_stats.id,
          'name', item_stats.name,
          'image', item_stats.image,
          'upvotes', item_stats.upvotes,
          'downvotes', item_stats.downvotes,
          'rating', item_stats.rating
        ) ORDER BY ${order}
      ) FROM item_stats) AS items,
      (SELECT json_agg(jsonb_build_object('id', sel_tags.id, 'name', sel_tags.name)) FROM sel_tags) AS tags
  `;
  return (await pool.query(sql, [tags])).rows[0];
}


app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
