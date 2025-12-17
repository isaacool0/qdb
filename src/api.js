const express = require("express");
const router = express.Router();
const pool = require('./database');
const oldSlugify = require('slugify');
const slugify = (text) => oldSlugify(text, { lower: true });
const multer = require('multer');
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');

let bhash;

async function loadBlake3() {
  if (!bhash) {
    const wasm = await import('hash-wasm');
    bhash = wasm.blake3;
  }
  return bhash;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 16777216 //16MB
  }
});

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
    let image = req.body.image;
		if ((await pool.query('SELECT 1 FROM items WHERE name = $1', [name])).rows.length) {
      return res.status(400).json({success: false, nameExists: true});
    } else {
      let result = await pool.query('INSERT INTO items (name, description, image, updated_by) VALUES ($1, $2, $3, $4) RETURNING id', [name, desc, image, req.user.id]);
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
router.post('/edit/:thing{/:type}', async (req, res) => {
  if (!req.user) return res.sendStatus(401);
  let user = req.user.id;
  switch (req.params.thing) {
  case 'item':
    let item = req.body.item;
    switch (req.params.type) {
    case 'name':
      res.json(await editString('items', 'name', item, slugify(req.body.name), user));
      break;
    case 'desc':
      res.json(await editString('items', 'description', item, req.body.desc, user));
      break;
    case 'image':
      res.json(await editString('items', 'image', item, req.body.image, user));
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
          }
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
      res.json(await editString('users', 'name', user, slugify(req.body.name), user));
      break;
    case 'bio':
      res.json(await editString('users', 'bio', user, req.body.bio, user));
      break;
    case 'avatar':
      res.json(await editString('users', 'avatar', user, req.body.avatar, user));
      break;
    }
    break;
  }
});

async function editString(table, type, id, value, user) {
  try {
    if(table=='users') {
      await pool.query(`UPDATE ${table} SET ${type} = $2 WHERE id = $1`, [user, value]);
    } else {
      await pool.query(`UPDATE ${table} SET (${type}, updated_by) = ($2, $3) WHERE id = $1`, [id, value, user]);
    }
    return {success: true};
  } catch (e) {
    console.error(e);
    return {success: false};
  }
}

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

router.post('/upload', upload.single('image'), async (req, res) => {
	if (!req.user) return res.sendStatus(401);
  if (!req.file) return res.status(400).json({ success: false, message: 'No file' });
  let types = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'];
  if (!types.includes(req.file.mimetype)) return res.status(400).json({ success: false, error: 'Unsupported file type' });
  try {
    let normalized = await normalizeImage(req.file.buffer);
    let imageId = await hashImage(normalized);
    let result = await saveImage(imageId, normalized, req.user.id);
    res.json({ success: true, ...result });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false });
  }
});

async function hashImage(buffer) {
  let blake3 = await loadBlake3();
  let hex = await blake3(buffer);
  return Buffer.from(hex, 'hex').slice(0, 16).toString('base64url');
}

async function normalizeImage(buffer) {
  return await sharp(buffer)
    .resize(1024, 1024, { 
      fit: 'inside', 
      withoutEnlargement: true 
    })
    .avif({ quality: 60 })
    .rotate()
    .toBuffer();
}

async function saveImage(imageId, buffer, userId) {
  let uploadDir = path.join(__dirname, '..', 'uploads');
  await fs.mkdir(uploadDir, { recursive: true });
  let diskPath = path.join(uploadDir, `${imageId}.avif`);
  let imageResult = await pool.query(
    'INSERT INTO images (id) VALUES ($1) ON CONFLICT (id) DO NOTHING RETURNING id',
    [imageId]
  );
  await pool.query(
    'INSERT INTO uploads (image_id, user_id) VALUES ($1, $2) ON CONFLICT (image_id, user_id) DO NOTHING',
    [imageId, userId]
  );
  if (imageResult.rows.length > 0) {
    await fs.writeFile(diskPath, buffer);
  }
  return { isNew: imageResult.rows.length > 0, imageId };
}

module.exports = router;
