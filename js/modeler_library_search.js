/* Filter presentation only: cards keep their native open/copy/delete handlers. */
export function savedLibraryNameMatches(record, query) {
  const name=String(record?.name || record?.key || '').normalize('NFKC').toLocaleLowerCase();
  return String(query || '').normalize('NFKC').trim().toLocaleLowerCase().split(/\s+/).every(word=>name.includes(word));
}

export function appendSavedLibrarySearch(host, {query='',label='Search saved models',noMatches='No matching saved models',onQuery=()=>{}}={}) {
  const doc=host.ownerDocument,field=doc.createElement('label'),caption=doc.createElement('span'),input=doc.createElement('input'),status=doc.createElement('div'),cards=[];
  field.className='md-field';caption.textContent=label;input.type='search';input.value=query;input.placeholder=label;input.setAttribute('aria-label',label);input.setAttribute('autocomplete','off');
  status.className='md-card-note';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  field.appendChild(caption);field.appendChild(input);host.appendChild(field);host.appendChild(status);
  function setVisible(card,visible){card.hidden=!visible;if(card.style)card.style.display=visible?'':'none';}
  function apply(){let shown=0;for(const {record,card} of cards){const visible=savedLibraryNameMatches(record,input.value);setVisible(card,visible);if(visible)shown++;}status.textContent=shown?`${shown} / ${cards.length}`:noMatches;}
  input.addEventListener('input',()=>{onQuery(input.value);apply();});
  return {input,add(record,card){cards.push({record,card});setVisible(card,savedLibraryNameMatches(record,input.value));},apply};
}
