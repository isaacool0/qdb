function vote(object, value, type, id) {
  let msg = document.getElementById(`vote-${id}`);
  let count = document.getElementById(`count-${id}`);
  let xvote = value === 1 ? 'up' : 'down';
  fetch(`/api/vote/${type}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      object: object,
      vote: value
    })
  })
  .then(r=>r.json())
  .then(a=>{
    if (a.success) {
      count.textContent = Math.round(a.rating.up - a.rating.down);
      switch (a.action) {
      case 'add':
      case 'change':
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
