const $ = (q) => document.querySelector(q);
const $$ = (q) => [...document.querySelectorAll(q)];
let savedDeckBatchSizes={};try{savedDeckBatchSizes=JSON.parse(localStorage.getItem('palavra.deckBatchSizes')||'{}')||{};}catch{}
const state = { cards: [], contexts: [], context: '', deck: '', view: 'study', screen: 'decks', study: [], roundReviewed: new Set(), batchSize: 10, deckBatchSizes:savedDeckBatchSizes, studyStarted: false, index: 0, revealed: false, editing: null, collectionMode: 'context', collectionParent: '', swipeStart: null, suppressCardClick: false, ratingBusy: false };

const norm = s => String(s || '').trim().toLocaleLowerCase();
const languageAliases = {en:'english',eng:'english',ingles:'english',english:'english',pt:'portuguese',por:'portuguese',portugues:'portuguese',portuguese:'portuguese',es:'spanish',spa:'spanish',espanhol:'spanish',spanish:'spanish',fr:'french',fra:'french',frances:'french',french:'french',de:'german',deu:'german',alemao:'german',german:'german',it:'italian',ita:'italian',italiano:'italian',italian:'italian'};
const langKey = s => {const plain=String(s||'').trim().toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');return languageAliases[plain]||plain;};
function termFor(card,language){if(!card?.terms)return '';if(card.terms[language])return card.terms[language];const match=Object.entries(card.terms).find(([label])=>langKey(label)===langKey(language));return match?.[1]||'';}
function examplesFor(card,language){return [...new Set(Object.entries(card.examples||{}).filter(([label])=>langKey(label)===langKey(language)).flatMap(([,values])=>Array.isArray(values)?values:[values]))];}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtLang = s => (s || '').toLocaleUpperCase('pt-BR');
async function api(url, options={}) {
  const res = await fetch(url, {headers:{'Content-Type':'application/json', ...(options.headers||{})}, ...options});
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Não foi possível concluir a ação.');
  return data;
}
function toast(message) { const el=$('#toast'); el.textContent=message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.classList.remove('show'),3000); }
function findContext(name=state.context) { return state.contexts.find(c=>norm(c.name)===norm(name)); }
function findDeck(context=state.context, name=state.deck) { return findContext(context)?.decks.find(d=>norm(d.name)===norm(name)); }
function deckBatchKey(context,deck){return `${norm(context)}::${norm(deck)}`;}
function getDeckBatchSize(context,deck){const value=Number(state.deckBatchSizes[deckBatchKey(context,deck)]);return [10,20,30,50].includes(value)?value:10;}

async function refresh(preserve=true) {
  const [cardsData, structureData] = await Promise.all([api('/api/cards'),api('/api/structure')]);
  state.cards=cardsData.cards; state.contexts=structureData.contexts;
  if (!preserve || !findContext()) state.context=state.contexts[0]?.name || '';
  const context=findContext();
  if (state.screen==='study'&&!context?.decks.some(d=>norm(d.name)===norm(state.deck))) {state.screen='decks';state.studyStarted=false;state.deck='';}
  if(state.screen==='study')state.batchSize=getDeckBatchSize(state.context,state.deck);
  $('#navCount').textContent=state.cards.length;
  renderContextTree(); renderContextDecks(); populateImportTarget(); renderLibrary(); prepareStudy();
}
function renderContextTree() {
  $('#contextTree').innerHTML=state.contexts.map(context=>`<section class="context-group"><div class="context-heading"><button class="context-name ${norm(context.name)===norm(state.context)?'active':''}" data-open-context-decks="${esc(context.name)}" title="Abrir decks de ${esc(context.name)}">▸ &nbsp;${esc(context.name)}</button><button class="add-deck-small" data-add-deck="${esc(context.name)}" title="Criar deck em ${esc(context.name)}">＋</button></div></section>`).join('');
  $('#contextTree').classList.toggle('empty-tree',state.contexts.length===0);
}
function renderContextDecks(){
  const context=findContext();
  $('#contextDeckList').innerHTML=(context?.decks||[]).map(deck=>{
    const deckCards=state.cards.filter(card=>norm(card.context_name)===norm(context.name)&&norm(card.deck_name)===norm(deck.name));
    const reviews=deckCards.reduce((sum,card)=>sum+(Number(card.review_total)||0),0);
    const correct=deckCards.reduce((sum,card)=>sum+(Number(card.review_correct)||0),0);
    const accuracy=reviews?Math.round(correct/reviews*100):null;
    const batchSize=getDeckBatchSize(context.name,deck.name);
    return `<article class="context-deck-row"><div class="context-deck-info"><h2>${esc(deck.name)}</h2><p>${reviews?`${reviews} revisões · ${correct} acertos · ${accuracy}% de acerto`:'Ainda sem revisões'} <span>· ${deck.count} cartões</span></p></div><div class="deck-row-actions"><button class="button primary-button" data-start-context="${esc(context.name)}" data-start-deck="${esc(deck.name)}">Iniciar</button><div class="deck-options"><button class="deck-options-trigger" type="button" aria-label="Quantidade de palavras em ${esc(deck.name)}" aria-haspopup="menu" aria-expanded="false">⋯</button><div class="deck-options-menu hidden" role="menu" aria-label="Palavras por tentativa">${[10,20,30,50].map(size=>`<button type="button" role="menuitemradio" aria-checked="${size===batchSize}" class="${size===batchSize?'selected':''}" data-deck-batch="${size}" data-batch-context="${esc(context.name)}" data-batch-deck="${esc(deck.name)}">${size} palavras</button>`).join('')}</div></div></div></article>`;
  }).join('');
  $('#contextDeckEmpty').classList.toggle('hidden',!context||!!context.decks.length);
}
function populateImportTarget() {
  const oldContext=$('#importContext').value, oldDeck=$('#importTargetDeck').value;
  $('#importContext').innerHTML=state.contexts.map(c=>`<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('');
  if(state.contexts.some(c=>norm(c.name)===norm(state.context))) $('#importContext').value=state.context;
  else if(state.contexts.some(c=>norm(c.name)===norm(oldContext))) $('#importContext').value=oldContext;
  updateImportDecks(oldDeck);
}
function updateImportDecks(preferred='') {
  const context=$('#importContext').value, decks=findContext(context)?.decks||[];
  $('#importTargetDeck').innerHTML=decks.map(d=>`<option value="${esc(d.name)}">${esc(d.name)}</option>`).join('');
  if(decks.some(d=>norm(d.name)===norm(state.deck))) $('#importTargetDeck').value=state.deck;
  else if(decks.some(d=>norm(d.name)===norm(preferred))) $('#importTargetDeck').value=preferred;
}
function cardsInDeck() { return state.cards.filter(c=>norm(c.context_name)===norm(state.context)&&norm(c.deck_name)===norm(state.deck)); }
function prepareStudy(keepIndex=false) {
  const deckCards=cardsInDeck(), context=findContext();
  const langMap=new Map();for(const language of deckCards.flatMap(c=>Object.keys(c.terms))){const key=langKey(language);if(!langMap.has(key))langMap.set(key,language);}const langs=[...langMap.values()].sort((a,b)=>a.localeCompare(b));
  const front=$('#frontLang').value, back=$('#backLang').value;
  const fallback=langs.length ? langs : [context?.learning_language || 'inglês','português'];
  $('#frontLang').innerHTML=fallback.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
  $('#backLang').innerHTML=fallback.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
  if (fallback.includes(front)) $('#frontLang').value=front;
  if (fallback.includes(back) && norm(back)!==norm($('#frontLang').value)) $('#backLang').value=back;
  if (norm($('#backLang').value)===norm($('#frontLang').value)) $('#backLang').value=fallback.find(x=>norm(x)!==norm($('#frontLang').value)) || fallback[0];
  const frontLanguage=$('#frontLang').value, learningLanguage=context?.learning_language||frontLanguage;
  const candidates=deckCards.filter(c=>termFor(c,frontLanguage)||termFor(c,learningLanguage));
  const remaining=candidates.filter(c=>!state.roundReviewed.has(c.id));
  state.study=state.roundReviewed.size>=state.batchSize?[]:remaining.slice(0,state.batchSize-state.roundReviewed.size);
  if (!keepIndex) state.index=0;
  state.index=Math.min(state.index,Math.max(0,state.study.length-1)); state.revealed=false;
  $('#deckCount').textContent=state.study.length;
  $('#studyArea').classList.toggle('hidden',deckCards.length===0||state.study.length===0);
  $('#studyEmpty').classList.toggle('hidden',!!context&&(state.screen!=='study'||deckCards.length>0));
  $('#reviewComplete').classList.toggle('hidden',deckCards.length===0||state.study.length>0);
  $('#contextDeckList').classList.toggle('hidden',state.screen!=='decks'||!context);
  $('#studyControls').classList.toggle('hidden',state.screen!=='study'||!context);
  $('#studyArea').classList.toggle('hidden',state.screen!=='study'||deckCards.length===0||state.study.length===0);
  $('#reviewComplete').classList.toggle('hidden',state.screen!=='study'||deckCards.length===0||state.study.length>0);
  if(state.screen==='study'&&deckCards.length&&!state.study.length){
    $('#reviewCompleteTitle').textContent=candidates.length?'Pacote concluído.':'Escolha um idioma com cartões.';
    $('#reviewCompleteText').textContent=candidates.length?`Você revisou ${state.roundReviewed.size} palavra(s). Pode começar mais ${state.batchSize} quando quiser.`:'Este deck não tem cartões no idioma selecionado.';
    $('#nextBatchBtn').classList.toggle('hidden',!candidates.length);
    $('#nextBatchBtn').innerHTML=`Revisar mais ${state.batchSize} palavras <span>↗</span>`;
  }
  $('#addDeckBtn').classList.toggle('hidden',!context||state.screen==='study');
  $('#shuffleBtn').classList.toggle('hidden',state.screen!=='study'||!deckCards.length);
  $('#studyHeading').innerHTML=context?(state.screen==='study'?`${esc(context.name)} <span class="heading-slash">/</span> ${esc(state.deck)}<span class="period">.</span>`:`${esc(context.name)}<span class="period">.</span>`):'Escolha um idioma<span class="period">.</span>';
  $('#studyContextEyebrow').textContent=context?`ESTUDANDO ${fmtLang(context.learning_language)}`:'SEU MOMENTO DE APRENDER';
  $('#studyDescription').textContent=state.screen==='decks'?'Seus decks de estudo.':deckCards.length?`Pacote de até ${state.batchSize} palavras · ${deckCards.length} no deck.`:context?`Este deck está vazio. Adicione ou importe cartões para ${context.name}.`:'Crie um contexto de idioma e organize as palavras em decks.';
  $('#crumb').textContent=context?(state.screen==='study'?`${context.name} / ${state.deck}`:context.name):'Selecione um idioma';
  $('#studyEmptyTitle').textContent=context?'Este deck ainda está vazio.':'Seu espaço de estudo começa aqui.';
  $('#studyEmptyText').textContent=context?'Adicione cartões aqui ou importe palavras para este deck.':'Crie uma pasta para cada idioma que está aprendendo.';
  $('#emptyContextBtn').classList.toggle('hidden',!!context); $('#emptyAddBtn').classList.toggle('hidden',!context); $('#emptyImportBtn').classList.toggle('hidden',!context);
  drawCard();
}
function drawCard() {
  const card=state.study[state.index];
  $('#flashcard').classList.remove('swipe-left','swipe-right','drag-left','drag-right');$('#flashcard').style.transform='';
  const learningLanguage=findContext()?.learning_language||$('#frontLang').value;
  const displayFront=termFor(card||{},$('#frontLang').value)?$('#frontLang').value:learningLanguage;
  $('#cardFrontLang').textContent=fmtLang(displayFront);
  $('#cardBackLang').textContent=fmtLang($('#backLang').value);
  $('#cardPosition').innerHTML=state.study.length?`${String(state.index+1).padStart(2,'0')} <span>/ ${String(state.study.length).padStart(2,'0')}</span>`:'00 <span>/ 00</span>';
  $('#progressText').textContent=state.study.length?`${state.index+1} de ${state.study.length}`:'0 de 0';
  const deckCards=cardsInDeck(),deckReviews=deckCards.reduce((sum,item)=>sum+(Number(item.review_total)||0),0),deckCorrect=deckCards.reduce((sum,item)=>sum+(Number(item.review_correct)||0),0);
  $('#reviewProgress').textContent=card&&deckReviews?`${deckCorrect}/${deckReviews} acertos neste deck`:'';
  $('#forgotBtn').disabled=$('#rememberedBtn').disabled=!card||state.ratingBusy;
  $('#flashcard').classList.toggle('revealed',state.revealed);
  if(!card){$('#cardWord').textContent='Sem cartões neste sentido';$('#frontExample').textContent='';$('#cardHint').textContent='Escolha outro idioma ou adicione traduções';$('#backWord').textContent='—';$('#backExample').textContent='';$('#backNote').textContent='';return;}
  const frontExamples=examplesFor(card,displayFront),backExamples=examplesFor(card,$('#backLang').value);
  const backTerm=langKey($('#backLang').value)===langKey(displayFront)?'':termFor(card,$('#backLang').value);
  $('#cardWord').textContent=termFor(card,displayFront);
  $('#cardPartOfSpeech').textContent=card.part_of_speech||'';$('#cardPartOfSpeech').classList.toggle('hidden',!card.part_of_speech);
  $('#frontExample').innerHTML=frontExamples.length?frontExamples.map(example=>`<span class="example-line">${esc(example)}</span>`).join(''):'<span class="example-missing">Exemplo ainda não adicionado</span>';
  $('#cardHint').textContent=state.revealed?'Tradução revelada':'Clique para revelar a tradução';
  $('#backWord').textContent=backTerm||'Tradução ainda não adicionada';$('#backPartOfSpeech').textContent=card.part_of_speech||'';$('#backPartOfSpeech').classList.toggle('hidden',!card.part_of_speech);$('#backExample').innerHTML=backExamples.map(example=>`<span class="example-line">${esc(example)}</span>`).join('');$('#backNote').textContent=card.notes||'';
}
function renderLibrary() {
  const query=norm($('#searchInput').value);
  const cards=state.cards.filter(c=>!query||`${c.context_name} ${c.deck_name} ${c.notes} ${c.part_of_speech||''} ${Object.entries(c.terms).map(([k,v])=>`${k} ${v}`).join(' ')}`.toLocaleLowerCase().includes(query));
  $('#libraryTotal').textContent=`${cards.length} ${cards.length===1?'cartão':'cartões'}`;
  $('#cardList').innerHTML=cards.map(c=>`<article class="library-card"><div class="deck-tag">${esc(c.context_name)} <span>/ ${esc(c.deck_name)} · ${esc(c.source)}</span></div>${c.part_of_speech?`<span class="pos-tag">${esc(c.part_of_speech)}</span>`:''}<div class="terms-grid">${Object.entries(c.terms).map(([lang,term])=>`<div class="term-cell"><small>${esc(fmtLang(lang))}</small><strong>${esc(term)}</strong>${examplesFor(c,lang).map(example=>`<span class="term-example">${esc(example)}</span>`).join('')}</div>`).join('')}</div>${c.notes?`<p class="list-note">${esc(c.notes)}</p>`:''}<div class="row-actions"><button data-edit="${c.id}" title="Editar">Editar</button><button data-delete="${c.id}" title="Excluir">Excluir</button></div></article>`).join('');
  $('#libraryEmpty').classList.toggle('hidden',state.cards.length>0); $('#cardList').classList.toggle('hidden',state.cards.length===0);
}
function setView(view) {
  state.view=view; $$('.view').forEach(x=>x.classList.remove('active')); $(`#${view}View`).classList.add('active');
  $$('.secondary-nav .nav-item').forEach(x=>x.classList.toggle('active',x.dataset.view===view));
  if(view==='study')prepareStudy(true);
  if(view==='import'){populateImportTarget();if(!state.contexts.length)toast('Crie um contexto antes de importar.');}
  if(view==='library')$('#crumb').textContent='Todos os cartões';
}
function showContextDecks(context){state.context=context;state.deck='';state.screen='decks';state.studyStarted=false;state.roundReviewed.clear();renderContextTree();renderContextDecks();setView('study');}
function selectDeck(context,deck) { state.roundReviewed.clear();state.context=context;state.deck=deck;state.batchSize=getDeckBatchSize(context,deck);state.screen='study';state.studyStarted=true;renderContextTree();setView('study'); }
function flip(){if(!state.study.length||state.suppressCardClick)return;state.revealed=!state.revealed;drawCard();}
function move(step){if(!state.study.length)return;state.index=(state.index+step+state.study.length)%state.study.length;state.revealed=false;drawCard();}
async function rateCard(remembered){if(state.ratingBusy)return;const card=state.study[state.index];if(!card)return;state.ratingBusy=true;drawCard();const stage=$('#flashcard');stage.classList.add(remembered?'swipe-right':'swipe-left');try{await new Promise(resolve=>setTimeout(resolve,280));await api(`/api/cards/${card.id}/review`,{method:'POST',body:JSON.stringify({remembered})});state.roundReviewed.add(card.id);state.ratingBusy=false;stage.classList.remove('swipe-right','swipe-left');await refresh();toast(remembered?'Resposta registrada.':'Anotado — você pode tentar de novo em outro pacote.');}catch(err){stage.classList.remove('swipe-right','swipe-left');state.ratingBusy=false;drawCard();toast(err.message);}}
function startSwipe(e){if(!state.study.length||state.ratingBusy||e.target.closest('button'))return;state.swipeStart={x:e.clientX,y:e.clientY};$('#flashcard').setPointerCapture?.(e.pointerId);}
function moveSwipe(e){if(!state.swipeStart)return;const dx=e.clientX-state.swipeStart.x,dy=e.clientY-state.swipeStart.y;if(Math.abs(dx)<Math.abs(dy)*1.2)return;$('#flashcard').style.transform=`translateX(${dx}px) rotate(${dx*.035}deg)`;$('#flashcard').classList.toggle('drag-right',dx>18);$('#flashcard').classList.toggle('drag-left',dx< -18);}
function endSwipe(e){if(!state.swipeStart)return;const dx=e.clientX-state.swipeStart.x;state.swipeStart=null;const card=$('#flashcard');card.style.transform='';card.classList.remove('drag-right','drag-left');if(Math.abs(dx)>90){state.suppressCardClick=true;rateCard(dx>0).finally(()=>setTimeout(()=>state.suppressCardClick=false,80));}}

function showCardModal(card=null) {
  if(!state.contexts.length){openCollection('context');return;}
  state.editing=card;
  $('#modalTitle').textContent=card?'Editar cartão':'Novo cartão';$('#modalEyebrow').textContent=card?`${card.context_name} / ${card.deck_name}`:'SUA COLEÇÃO';
  const selectedContext=card?.context_name||state.context, selectedDeck=card?.deck_name||state.deck;
  $('#cardContext').innerHTML=state.contexts.map(c=>`<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('');$('#cardContext').value=selectedContext;
  populateCardDecks(selectedDeck);
  const pairs=card?Object.entries(card.terms):[[findContext()?.learning_language||'inglês',''],['português','']];
  $('#termFields').innerHTML=pairs.map(([lang,val])=>termField(lang,val,examplesFor(card||{},lang))).join('');$('#cardForm').elements.notes.value=card?.notes||'';$('#cardPos').value=card?.part_of_speech||'';
  $('#modalBackdrop').classList.remove('hidden');setTimeout(()=>$('#termFields input')?.focus(),20);
}
function populateCardDecks(preferred='') { const decks=findContext($('#cardContext').value)?.decks||[];$('#cardDeck').innerHTML=decks.map(d=>`<option value="${esc(d.name)}">${esc(d.name)}</option>`).join('');if(decks.some(d=>norm(d.name)===norm(preferred)))$('#cardDeck').value=preferred; }
function termField(lang='',value='',examples=[]){return `<div class="term-field"><label class="form-label">IDIOMA<input class="lang-name" value="${esc(lang)}" placeholder="Ex.: inglês" required></label><label class="form-label">PALAVRA<input class="term-value" value="${esc(value)}" placeholder="Palavra ou expressão" required></label><button type="button" class="remove-lang" title="Remover idioma">×</button><label class="form-label example-field">EXEMPLOS DE USO <span>opcional · uma frase por linha</span><textarea class="example-value" rows="3" placeholder="Adicione até três frases naturais, uma por linha">${esc(examples.join('\n'))}</textarea></label></div>`;}
function hideCardModal(){$('#modalBackdrop').classList.add('hidden');state.editing=null;}
function openCollection(mode='context',parent='') {
  state.collectionMode=mode;state.collectionParent=parent;
  const isContext=mode==='context';
  $('#collectionTitle').textContent=isContext?'Novo contexto':'Novo deck';$('#collectionIntro').textContent=isContext?'Crie uma pasta para organizar um idioma que está aprendendo.':`Este deck ficará dentro de ${parent}.`;
  $('#collectionEyebrow').textContent=isContext?'ORGANIZE SEUS ESTUDOS':`CONTEXTO · ${parent.toLocaleUpperCase()}`;
  $('#collectionNameLabel').firstChild.textContent=isContext?'NOME DO CONTEXTO':'NOME DO DECK';
  $('#collectionName').placeholder=isContext?'Ex.: Inglês':'Ex.: Aeroporto';$('#collectionName').value='';
  $('#collectionLanguageLabel').classList.toggle('hidden',!isContext);$('#collectionLanguage').required=isContext;$('#collectionLanguage').value=isContext?'':'';
  $('#saveCollection').innerHTML=isContext?'Criar contexto <span>↗</span>':'Criar deck <span>↗</span>';
  $('#collectionBackdrop').classList.remove('hidden');$('#collectionName').focus();
}
function hideCollection(){ $('#collectionBackdrop').classList.add('hidden'); }

function parseDelimited(text,delim){const rows=[];let row=[],field='',quoted=false;for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'&&quoted&&text[i+1]==='"'){field+='"';i++;}else if(ch==='"'){quoted=!quoted;}else if(ch===delim&&!quoted){row.push(field.trim());field='';}else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(field.trim());if(row.some(x=>x))rows.push(row);row=[];field='';}else field+=ch;}row.push(field.trim());if(row.some(x=>x))rows.push(row);return rows;}
function parseImport(text){text=text.trim();if(!text)throw new Error('Cole ou selecione um conteúdo para importar.');if(text.startsWith('{')||text.startsWith('[')){const parsed=JSON.parse(text);return Array.isArray(parsed)?parsed:(parsed.cards||[]);}const delim=text.includes('\t')?'\t':(text.split('\n')[0].includes(';')?';':',');if(!text.includes(delim))return text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map(word=>({terms:{[findContext($('#importContext').value)?.learning_language||'inglês']:word}}));const rows=parseDelimited(text,delim);if(rows.length<2)throw new Error('Adicione um cabeçalho com os idiomas e pelo menos uma palavra.');const headers=rows.shift().map(x=>x.trim());return rows.map(row=>{const terms={},examples={};let notes='',meaning='',part_of_speech='';headers.forEach((h,i)=>{const v=row[i]||'';if(!v)return;const key=h.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/_/g,' ').trim();const exampleHeader=key.match(/^(?:example|exemplo|sentence|frase)[\s:_-]+(.+)$/)||key.match(/^(.+)[\s:_-]+(?:example|exemplo|sentence|frase)$/);if(exampleHeader){const language=exampleHeader[1].trim().replace(/[\s#:_-]+\d+$/,'').trim();examples[language]||=[];examples[language].push(v);}else if(['meaning','meanings','significado','significados','definicao','definicoes'].includes(key))meaning=v;else if(['notas','notes','contexto'].includes(key))notes=v;else if(['part of speech','word class','classe gramatical','classe de palavra','pos'].includes(key))part_of_speech=v;else terms[h]=v;});return{terms,examples,notes:[meaning,notes].filter(Boolean).join('\n'),part_of_speech};});}
async function importText(text){const context=findContext($('#importContext').value);if(!context)throw new Error('Crie ou selecione um contexto de estudo.');const cards=parseImport(text);const result=await api('/api/import',{method:'POST',body:JSON.stringify({context_name:context.name,deck_name:$('#importTargetDeck').value,learning_language:context.learning_language,source:$('#importSource').value.trim()||'importação',cards})});const suffix=result.skipped?` · ${result.skipped} ignorado(s) por erro`:'';$('#importResult').innerHTML=`<strong>Importação concluída</strong><span>${result.added} novo(s), ${result.existing} já existente(s)${suffix}.</span>${result.errors.length?`<details><summary>Ver detalhes</summary><ul>${result.errors.map(e=>`<li>Linha ${e.row}: ${esc(e.error)}</li>`).join('')}</ul></details>`:''}`;$('#importResult').classList.remove('hidden');await refresh();toast(`${result.added} cartão(ões) novo(s) adicionado(s)`);}

$$('.secondary-nav .nav-item').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
$$('[data-go="import"]').forEach(b=>b.addEventListener('click',()=>setView('import')));
$('#contextTree').addEventListener('click',e=>{const context=e.target.closest('[data-open-context-decks]'),add=e.target.closest('[data-add-deck]');if(add)openCollection('deck',add.dataset.addDeck);else if(context)showContextDecks(context.dataset.openContextDecks);});
$('#frontLang').addEventListener('change',()=>prepareStudy());$('#backLang').addEventListener('change',()=>prepareStudy());
$('#flashcard').addEventListener('click',flip);$('#flashcard').addEventListener('keydown',e=>{if(e.key==='Enter')flip();});$('#prevBtn').addEventListener('click',()=>move(-1));$('#nextBtn').addEventListener('click',()=>move(1));
$('#nextBatchBtn').addEventListener('click',()=>{state.roundReviewed.clear();prepareStudy();});
$('#contextDeckList').addEventListener('click',e=>{const start=e.target.closest('[data-start-deck]'),trigger=e.target.closest('.deck-options-trigger'),option=e.target.closest('[data-deck-batch]');if(start){selectDeck(start.dataset.startContext,start.dataset.startDeck);return;}if(trigger){const menu=trigger.nextElementSibling,open=menu.classList.contains('hidden');$$('.deck-options-menu').forEach(item=>item.classList.add('hidden'));$$('.deck-options-trigger').forEach(item=>item.setAttribute('aria-expanded','false'));menu.classList.toggle('hidden',!open);trigger.setAttribute('aria-expanded',String(open));return;}if(option){const key=deckBatchKey(option.dataset.batchContext,option.dataset.batchDeck);state.deckBatchSizes[key]=Number(option.dataset.deckBatch);localStorage.setItem('palavra.deckBatchSizes',JSON.stringify(state.deckBatchSizes));if(norm(state.context)===norm(option.dataset.batchContext)&&norm(state.deck)===norm(option.dataset.batchDeck))state.batchSize=Number(option.dataset.deckBatch);renderContextDecks();return;}});
document.addEventListener('click',e=>{if(!e.target.closest('.deck-options')){$$('.deck-options-menu').forEach(menu=>menu.classList.add('hidden'));$$('.deck-options-trigger').forEach(button=>button.setAttribute('aria-expanded','false'));}});
$('#flashcard').addEventListener('pointerdown',startSwipe);$('#flashcard').addEventListener('pointermove',moveSwipe);$('#flashcard').addEventListener('pointerup',endSwipe);$('#flashcard').addEventListener('pointercancel',endSwipe);$('#forgotBtn').addEventListener('click',()=>rateCard(false));$('#rememberedBtn').addEventListener('click',()=>rateCard(true));
$('#shuffleBtn').addEventListener('click',()=>{state.study.sort(()=>Math.random()-.5);state.index=0;state.revealed=false;drawCard();});
$('#addContextBtn').addEventListener('click',()=>openCollection('context'));$('#emptyContextBtn').addEventListener('click',()=>openCollection('context'));$('#addDeckBtn').addEventListener('click',()=>state.context?openCollection('deck',state.context):openCollection('context'));
$('#addTopBtn').addEventListener('click',()=>showCardModal());$('#addLibraryBtn').addEventListener('click',()=>showCardModal());$('#emptyAddBtn').addEventListener('click',()=>showCardModal());$('#emptyImportBtn').addEventListener('click',()=>setView('import'));
$('#closeModal').addEventListener('click',hideCardModal);$('#cancelModal').addEventListener('click',hideCardModal);$('#modalBackdrop').addEventListener('click',e=>{if(e.target===$('#modalBackdrop'))hideCardModal();});
$('#cardContext').addEventListener('change',()=>populateCardDecks());
$('#addLanguageField').addEventListener('click',()=>{$('#termFields').insertAdjacentHTML('beforeend',termField());$('#termFields .term-field:last-child .lang-name').focus();});
$('#termFields').addEventListener('click',e=>{if(e.target.matches('.remove-lang')){if($$('.term-field').length>2)e.target.closest('.term-field').remove();else toast('Mantenha ao menos dois idiomas.');}});
$('#cardForm').addEventListener('submit',async e=>{e.preventDefault();const terms={},examples={};$$('.term-field').forEach(f=>{const lang=f.querySelector('.lang-name').value.trim(),value=f.querySelector('.term-value').value.trim(),sentences=f.querySelector('.example-value').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);if(lang&&value)terms[lang]=value;if(lang&&sentences.length)examples[lang]=sentences;});const context=findContext($('#cardContext').value),wasEditing=!!state.editing;if(!examplesFor({examples},context.learning_language).length){toast(`Inclua um exemplo em ${context.learning_language}.`);return;}const body={context_name:context.name,deck_name:$('#cardDeck').value,learning_language:context.learning_language,terms,examples,part_of_speech:$('#cardPos').value.trim(),notes:$('#cardForm [name="notes"]').value.trim(),source:state.editing?.source||'manual'};try{if(state.editing)await api(`/api/cards/${state.editing.id}`,{method:'PUT',body:JSON.stringify(body)});else await api('/api/cards',{method:'POST',body:JSON.stringify(body)});state.context=context.name;state.deck=$('#cardDeck').value;hideCardModal();await refresh();toast(wasEditing?'Cartão atualizado':'Cartão salvo');}catch(err){toast(err.message);}});
$('#closeCollection').addEventListener('click',hideCollection);$('#cancelCollection').addEventListener('click',hideCollection);$('#collectionBackdrop').addEventListener('click',e=>{if(e.target===$('#collectionBackdrop'))hideCollection();});
$('#collectionForm').addEventListener('submit',async e=>{e.preventDefault();const name=$('#collectionName').value.trim();try{if(state.collectionMode==='context'){const language=$('#collectionLanguage').value.trim();await api('/api/contexts',{method:'POST',body:JSON.stringify({name,learning_language:language})});state.context=name;state.deck='Geral';}else{await api('/api/decks',{method:'POST',body:JSON.stringify({context_name:state.collectionParent,name})});state.context=state.collectionParent;state.deck=name;}state.screen='decks';state.studyStarted=false;state.roundReviewed.clear();hideCollection();await refresh();setView('study');toast(state.collectionMode==='context'?`Contexto ${name} criado`:`Deck ${name} criado`);}catch(err){toast(err.message);}});
$('#collectionName').addEventListener('input',()=>{if(state.collectionMode==='context'&&!$('#collectionLanguage').value)$('#collectionLanguage').value=$('#collectionName').value;});
$('#cardList').addEventListener('click',async e=>{const edit=e.target.closest('[data-edit]'),del=e.target.closest('[data-delete]');if(edit)showCardModal(state.cards.find(c=>c.id===Number(edit.dataset.edit)));if(del&&confirm('Excluir este cartão?')){await api(`/api/cards/${del.dataset.delete}`,{method:'DELETE'});await refresh();toast('Cartão excluído');}});
$('#searchInput').addEventListener('input',renderLibrary);$('#importContext').addEventListener('change',()=>updateImportDecks());
$('#chooseFileBtn').addEventListener('click',()=>$('#fileInput').click());$('#fileInput').addEventListener('change',async e=>{const file=e.target.files[0];if(file){$('#pasteInput').value=await file.text();$('#importSource').value=$('#importSource').value||file.name.replace(/\.[^.]+$/,'');$('#pasteInput').focus();}});
$('#dropZone').addEventListener('dragover',e=>{e.preventDefault();$('#dropZone').classList.add('dragging');});$('#dropZone').addEventListener('dragleave',()=>$('#dropZone').classList.remove('dragging'));$('#dropZone').addEventListener('drop',async e=>{e.preventDefault();$('#dropZone').classList.remove('dragging');const file=e.dataTransfer.files[0];if(file){$('#pasteInput').value=await file.text();$('#importSource').value=$('#importSource').value||file.name.replace(/\.[^.]+$/,'');}});
$('#importBtn').addEventListener('click',async()=>{try{await importText($('#pasteInput').value);}catch(err){$('#importResult').textContent=err.message;$('#importResult').classList.remove('hidden');}});
const importAiPrompt=`Gere um arquivo CSV UTF-8 para importar cartões no app Mnema. Vou selecionar o contexto e o deck manualmente no app antes de importar. Use uma linha por cartão e inclua somente os idiomas e metadados pedidos. Cabeçalhos aceitos: English, Portuguese (ou outros idiomas como nomes de colunas), part_of_speech, meaning, notes, example English 1, example English 2, example English 3, example Portuguese 1, example Portuguese 2, example Portuguese 3. Troque English e Portuguese pelos idiomas solicitados. Para cada cartão, inclua a palavra/expressão no idioma estudado, a tradução no outro idioma, a classe gramatical quando aplicável e três exemplos naturais em cada idioma. Os exemplos devem demonstrar o mesmo sentido específico da palavra naquele cartão; traduza as frases de forma natural e correspondente. Se a mesma palavra tiver sentidos diferentes, explique o sentido em meaning e use exemplos coerentes com ele. Não invente fatos; se não souber, deixe o campo vazio. Escape campos CSV corretamente, coloque o cabeçalho uma vez e devolva somente o conteúdo CSV, sem cercas de código nem explicações.\n\nLista ou instruções para os cartões:\n[COLE AQUI]`;
function downloadText(name,content,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
$('#downloadCsvTemplate').addEventListener('click',()=>downloadText('mnema-modelo-importacao.csv','English,Portuguese,part_of_speech,meaning,notes,example English 1,example English 2,example English 3,example Portuguese 1,example Portuguese 2,example Portuguese 3\n"save","poupar; economizar","verb","To keep money, time, or resources for later use.","","I save money every month.","We saved enough for a trip.","This shortcut will save you time.","Eu poupo dinheiro todo mês.","Juntamos o suficiente para uma viagem.","Este atalho vai te poupar tempo."\n','text/csv;charset=utf-8'));
$('#copyImportPrompt').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(importAiPrompt);toast('Prompt copiado. Cole na IA e substitua [COLE AQUI].');}catch{downloadText('prompt-para-gerar-flashcards.txt',importAiPrompt,'text/plain;charset=utf-8');toast('Não foi possível copiar; baixei o prompt em arquivo.');}});
$('#backupBtn').addEventListener('click',async()=>{const backup=await api('/api/backup');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}));a.download=`mnema-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href);toast('Backup exportado');});
$('#preplyInfoBtn').addEventListener('click',()=>toast('A captura automática do Preply depende de observar sua página logada; CSV/TSV funciona agora.'));
document.addEventListener('keydown',e=>{if(!$('#modalBackdrop').classList.contains('hidden')){if(e.key==='Escape')hideCardModal();return;}if(!$('#collectionBackdrop').classList.contains('hidden')){if(e.key==='Escape')hideCollection();return;}if(state.view==='study'&&['ArrowLeft','ArrowRight',' '].includes(e.key)){e.preventDefault();if(e.key==='ArrowLeft')rateCard(false);else if(e.key==='ArrowRight')rateCard(true);else flip();}});
refresh().catch(e=>toast(e.message));
