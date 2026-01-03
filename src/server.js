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

//TODO paginate results on frontend template
//TODO make frontend show rating as a % for top, or (upvotes-downvotes)/tags for pop
app.get('/list/:tags{/:mode}', async (req, res) => {
  let tags = req.params.tags ? req.params.tags.split(":") : [];
  if (!req.params.mode) return res.redirect(302, `/list/${tags.join(":")}/top`);
  if (!req.params.tags) return res.redirect(302, '/');
  if (tags.length === 0) return res.redirect(302, '/');
  let page = parseInt(req.query.page) || 1;
  let size = parseInt(req.query.size) || 10;
  let dir = req.query.dir || 'desc';
  let results = await getResults(tags, req.params.mode, dir, page, size);
  if (results.items.length > 0) {
    res.render('list/index', { results, page, size, dir });
  } else {
    res.render('list/no-results', { tags });
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

//TODO sanitize type
async function getVotes(object, type) {
	let votes;
	if (type==='tag') {
	  votes = (await pool.query(`
	  SELECT
	     COUNT(*) FILTER (WHERE vote = true) AS upvotes, 
	     COUNT(*) FILTER (WHERE vote = false) AS downvotes 
	  FROM tag_votes 
	  WHERE item_id = $1 AND tag_id = $2`, [object[0], object[1]])).rows[0];
	} else {
	  votes = (await pool.query(`
	  SELECT 
	    COUNT(*) FILTER (WHERE vote = true) AS upvotes, 
	    COUNT(*) FILTER (WHERE vote = false) AS downvotes 
	  FROM ${type}_votes 
	  WHERE ${type}_id = $1`, [object])).rows[0];
	}
	return votes;
};

async function getResults(tagNames, mode = 'top', dir, page, size) {
  dir = dir && dir.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  let offset = (page - 1) * size;
  let order = mode === 'pop'
    ? `(item_stats.up + item_stats.down) ${dir}`
    : `get_rating(item_stats.up, item_stats.down) ${dir}`;

  let tags = (await pool.query(`SELECT id, name FROM tags WHERE name = ANY($1)`, [tagNames])).rows;

  let items = (await pool.query(`
    SELECT
      item_stats.id,
      item_stats.name,
      item_stats.image,
      item_stats.up,
      item_stats.down,
      get_rating(item_stats.up, item_stats.down) AS rating,
      JSON_AGG(JSON_BUILD_OBJECT('id', tags.id, 'name', tags.name)) AS tags
    FROM item_stats
    JOIN item_tags ON item_tags.item_id = item_stats.id
    JOIN tags ON tags.id = item_tags.tag_id
    GROUP BY item_stats.id, item_stats.name, item_stats.image, item_stats.up, item_stats.down
    HAVING COUNT(DISTINCT CASE WHEN tags.id = ANY($1) THEN tags.id END) = $2
    ORDER BY ${order}
    LIMIT $3 OFFSET $4
  `, [tags.map(t => t.id), tags.length, size, offset])).rows;

  return {tags, items};
}



app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
