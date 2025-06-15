function tagInput(a) {
  let tag = a.target.value.trim();
  if ([',', ' ', ':','Enter'].includes(a.key) && tag) {
    if(getTags().includes(tag)){a.target.value='';return;};
    addTag(tag,a);
    a.target.value = '';
    a.preventDefault();
    return;
  }
  if (a.key == 'Backspace' && !tag) {
    let prev = a.target.previousSibling;
    if(prev&&prev.classList?.contains('tag')) {
      prev.remove();    
    }
    return;
  }
}

function addTag(tag,a) {
  a.target.before(Object.assign(document.createElement('span'), {
    className: "tag",
    textContent: tag,
    onclick() { this.remove(); }
  }));
};

function getTags() {
  return Array.from(document.querySelectorAll('.tag')).map(tag => tag.textContent.trim());
};

document.querySelectorAll('.tag').forEach(tag => {
  tag.onclick = function () { this.remove(); };
});

document.head.appendChild(Object.assign(document.createElement("style"), { textContent: `
  .tag {
    display: inline-block;
    padding: 2px 5px;
    border: 1px solid;
    cursor: pointer;
  }
`}));
