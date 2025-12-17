function upload(input, preview, msg, cb) {
  let file = document.getElementById(input).files[0];
  if (!file) return;
  let data = new FormData();
  data.append('image', file);
  fetch('/api/upload', {
    method: 'POST',
    body: data
  })
  .then(r=>r.json())
  .then(a=>{
    let msg = document.getElementById(msg);
    let p = document.getElementById(preview);
    if (a.success) {
      msg.style.color = '#0F0';
      msg.textContent = a.isNew ? 'uploaded' : 'exists';
      p.src = a.filePath;
      p.style.display = 'block';
      if (cb) cb(a.imageId);
    } else {
      msg.style.color = '#F00';
      msg.textContent = 'failed';
    }
  });
}
