function vote(object, rating, type, message) {
	if (type==='tag'&&object[1].includes(',')) {
  	object[1].split(',').forEach(tag => {
			 vote([object[0], tag], rating, type, message);
		});
    return;
  };
  let msg = document.getElementById(message);
  let xvote = rating === 1 ? 'up' : 'down';
  fetch(`/api/vote/${type}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      object: object,
      rating: rating
    })
  })
  .then(r=>r.json())
  .then(a=>{
    if (a.success) {
      switch (a.action) {
      case 'add':
        msg.style.color = '#0F0';
        msg.textContent = `${xvote}voted`;
        break;
      case 'remove':
        msg.style.color = '#F00';
        msg.textContent = `removed ${xvote}vote`;
        break;
      }
    } else {
      msg.style.color = '#F00';
      msg.textContent = `failed ${xvote}vote`;
    }
  })
};
