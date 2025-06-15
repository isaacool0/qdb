const express = require("express");
const router = express.Router();
const pool = require('./database');
const oldSlugify = require('slugify');
const slugify = (text) => oldSlugify(text, { lower: true });

router.use(express.json());

//TODO add username/passwprd accounts
//TODO add logging for users
router.post('/add/:thing', async (req, res) => {
	if (!req.user) return res.sendStatus(401);
  switch (req.params.thing) {
  case 'item':
    let name = await redirect(slugify(req.body.name),'I');
    let desc = req.body.desc;
    let tags = req.body.tags;
		if ((await pool.query('SELECT 1 FROM items WHERE name = $1', [name])).rows.length) {
      return res.status(400).json({success: false, nameExists: true});
    } else {
      let result = await pool.query('INSERT INTO items (name, description, updated_by) VALUES ($1, $2, $3) RETURNING id', [name, desc, req.user.id]);
      if (result.rowCount > 0) {
        res.status(200).json({success: true, nameExists: false});
        await addTags(result.rows[0].id,tags);
      } else {
        res.status(500).json({success: false, nameExists: false});
      }
    };
    break;
  }
});

//TODO edit logic
router.post('/edit/:thing/:type?', async (req, res) => {
	if (!req.user) return res.sendStatus(401);
	let user = req.user.id;
  switch (req.params.thing) {
  case 'item':
    let item = req.body.item;
		switch (req.params.type) {
		case 'name':
			try {
				await pool.query('UPDATE items SET (name, updated_by) = ($2, $3) WHERE id = $1', [item, slugify(req.body.name), user])
				res.json({success: true});
			} catch (e) {
				console.error(e);
				res.status(500).json({success: false});
			}
			break;
		case 'desc':
			try {
    		await pool.query('UPDATE items SET (description, updated_by) = ($2, $3) WHERE id = $1', [item, req.body.desc, user]);
        res.json({success: true});
			} catch (e) {
				console.error(e);
				res.status(500).json({success: false});
			}
    	break;
		case 'tags':
			let newtags = new Set(req.body.tags.map(tag => slugify(tag)));
      try {
        let oldtags = (await pool.query(`
        SELECT tags.id, tags.name, item_tags.active
        FROM tags 
        JOIN item_tags ON tags.id = item_tags.tag_id 
        WHERE item_tags.item_id = $1
        `, [item])).rows.map(row => ({ id: row.id, name: row.name, active: row.active}));
      for (let tag of newtags) {
        let oldtag = oldtags.find(t => t.name === tag);
        if (oldtag) {
          if (!oldtag.active) {
            await pool.query('UPDATE item_tags SET active = true WHERE item_id = $1 AND tag_id = $2', [item, oldtag.id]);
            }
        } else {
          await addTags(item, [tag]);
        }
      }
      for(let oldtag of oldtags) {
        if (!newtags.has(oldtag.name)) {
          await pool.query('UPDATE item_tags SET active = false WHERE item_id = $1 AND tag_id = $2', [item, oldtag.id]);
        };
      }
      res.json({success: true});
      } catch (e) {
        console.error(e);
        res.status(500).json({success: false});        
      }
  	  break;
    }
    break;
  case 'tag':
   	switch(req.params.type) {
   		case 'name':
   			//TODO edit tag name
        break;
			case 'info': 
			  //TODO edit tag info
        break;
   	}
    break;
  case 'user':
		switch (req.params.type) {
		case 'name':
			try {
				await pool.query('UPDATE users SET name = ($2) WHERE id = $1', [user, slugify(req.body.name)]);
				res.json({success: true});
			} catch (e) {
				console.error(e);
				res.status(500).json({success: false});
			}
			break;
		case 'bio':
			try {
    		await pool.query('UPDATE users SET bio = ($2) WHERE id = $1', [user, req.body.bio])
        res.json({success: true});
			} catch (e) {
				console.error(e);
				res.status(500).json({success: false});
			}
    	break;
		};
    break;
  }
});

async function addTags(item,tags) {
  for (let tag of tags) {
  	tag = await redirect(slugify(tag),'T');
    let result = await pool.query('SELECT id FROM tags WHERE name = $1', [tag]);
    if (result.rows.length) {
      await pool.query('INSERT INTO item_tags (item_id, tag_id) VALUES ($1, $2)', [item, result.rows[0].id]);
    } else {
      let addTag = await pool.query('INSERT INTO tags (name) VALUES ($1) RETURNING id', [tag]);
      await pool.query('INSERT INTO item_tags (item_id, tag_id) VALUES ($1, $2)', [item, addTag.rows[0].id]);
    }
  };
}

router.post('/vote/:type', async (req, res) => {
	if (!req.user) return res.sendStatus(401);
	if (!['item','tag','comment','profile'].includes (req.params.type)) return res.sendStatus(400);
	let result = await vote(req.user.id, req.body.object, req.params.type, req.body.rating);
	if (result.success===true) {
		res.json(result);
	} else {
		res.status(500).json({success: false});
	};
});

async function vote(user, object, type, rating) {
	let vote = rating === 1 ? true : false;
	let result;
	if (type==='tag') {
		result = await pool.query(`SELECT rating FROM tag_votes WHERE user_id = $1 AND item_id = $2 AND tag_id = $3`, [user, object[0], object[1]]);
	} else {
		result = await pool.query(`SELECT rating FROM ${type}_votes WHERE user_id = $1 AND ${type}_id = $2`, [user, object]);
	}
	if (result.rows.length===0) return await addVote(user, object, type, rating); //add vote
	if (result.rows[0].rating===vote) return await delVote(user, object, type); //remove vote
	if (result.rows[0].rating!=vote) { await delVote(user, object, type); return await addVote(user, object, type, rating)}; //change vote
	return {success: false};
};

async function addVote(user, object, type, rating) {
try {
	if (type==='tag') {
		await pool.query(`INSERT INTO tag_votes (user_id, item_id, tag_id, rating) VALUES ($1, $2, $3, $4)`, [user, object[0], object[1], rating]);
	} else {
		await pool.query(`INSERT INTO ${type}_votes (user_id, ${type}_id, rating) VALUES ($1, $2, $3)`, [user, object, rating]);
	}
	return {success: true, action: 'add'};
	} catch (e) {
		console.error(e);
		return {success: false};
	}
};

async function delVote(user, object, type) {
try {
	if (type==='tag') {
		await pool.query(`DELETE FROM tag_votes WHERE user_id = $1 AND item_id = $2 AND tag_id = $3`, [user, object[0], object[1]]);
	} else {
		await pool.query(`DELETE FROM ${type}_votes WHERE user_id =$1 AND ${type}_id = $2`, [user, object]);
	}
	return {success: true, action: 'remove'};
	} catch (e) {
		console.error(e);
		return {success: false};
	}
};

async function redirect(name,type) {
  let result = await pool.query('SELECT to_name FROM redirects WHERE from_name = $1 AND redirect_type = $2', [name, type])
  if (result.rows.length>0) {
    return result.rows[0].to_name;
  } else {
    return name;
  }
}

module.exports = router;
