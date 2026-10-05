function search(a) {
  let input = document.getElementById(`search${a}`);
  let tags = input.value.trim().toLowerCase().replace(/[^a-z0-9\s-]/g,' ').replace(/\s+/g,':')
  window.location.href = `/list/${tags}/top`;
}
