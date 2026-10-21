const $ = (q) => document.querySelector(q);
const $$ = (q) => [...document.querySelectorAll(q)];
let savedDeckDirections={};try{savedDeckDirections=JSON.parse(localStorage.getItem('mnema.deckDirections')||'{}')||{};}catch{}
let savedDeckBatchSizes={};try{savedDeckBatchSizes=JSON.parse(localStorage.getItem('palavra.deckBatchSizes')||'{}')||{};}catch{}
const state = { cards: [], contexts: [], context: '', deck: '', view: 'study', screen: 'decks', study: [], batchIds: null, batchKey: '', studyMode: 'all', deckFilter: 'learned', deckPage: 0, roundReviewed: new Set(), batchSize: 10, deckBatchSizes:savedDeckBatchSizes, deckDirections:savedDeckDirections, studyStarted: false, index: 0, revealed: false, editing: null, collectionMode: 'context', collectionParent: '', swipeStart: null, suppressCardClick: false, ratingBusy: false };

const norm = s => String(s || '').trim().toLocaleLowerCase();
const languageAliases = {en:'english',eng:'english',ingles:'english',english:'english',pt:'portuguese',por:'portuguese',portugues:'portuguese',portuguese:'portuguese',es:'spanish',spa:'spanish',espanhol:'spanish',spanish:'spanish',fr:'french',fra:'french',frances:'french',french:'french',de:'german',deu:'german',alemao:'german',german:'german',it:'italian',ita:'italian',italiano:'italian',italian:'italian'};
const langKey = s => {const plain=String(s||'').trim().toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');return languageAliases[plain]||plain;};
function termFor(card,language){if(!card?.terms)return '';if(card.terms[language])return card.terms[language];const match=Object.entries(card.terms).find(([label])=>langKey(label)===langKey(language));return match?.[1]||'';}
function examplesFor(card,language){return [...new Set(Object.entries(card.examples||{}).filter(([label])=>langKey(label)===langKey(language)).flatMap(([,values])=>Array.isArray(values)?values:[values]))];}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtLang = s => (s || '').toLocaleUpperCase('pt-BR');
const speechLangs={english:'en-US',portuguese:'pt-BR',spanish:'es-ES',french:'fr-FR',german:'de-DE',italian:'it-IT'};
const SPEAK_ICON='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
// Speech: wait for the voice list, prefer high-quality voices for the language, and skip macOS novelty voices.
let speechVoices=[];const loadVoices=()=>{speechVoices=speechSynthesis.getVoices();};
if('speechSynthesis' in window){loadVoices();speechSynthesis.addEventListener('voiceschanged',loadVoices);}
const noveltyVoices=/^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Junior|Ralph|Fred|Kathy|Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley)\b/i;
function pickVoice(lang){const norm=v=>v.lang.replace('_','-').toLowerCase(),want=lang.toLowerCase(),base=want.split('-')[0];const list=speechVoices.filter(v=>norm(v).startsWith(base)&&!noveltyVoices.test(v.name));const exact=list.filter(v=>norm(v)===want);for(const re of [/premium/i,/enhanced/i,/natural/i,/^Google/i,/Samantha|Ava|Allison|Evan|Nathan|Joelle|Luciana|Felipe/i]){const v=exact.find(x=>re.test(x.name))||list.find(x=>re.test(x.name));if(v)return v;}return exact.find(v=>v.localService)||exact[0]||list[0]||null;}
let currentUtterance=null,currentAudio=null,nativeTts=false;
function speakWithBrowser(text,language){if(!('speechSynthesis' in window)||!text)return;if(!speechVoices.length)loadVoices();const lang=speechLangs[langKey(language)]||'en-US';const u=new SpeechSynthesisUtterance(text);u.lang=lang;const voice=pickVoice(lang);if(voice)u.voice=voice;u.rate=.9;currentUtterance=u;u.onend=()=>{if(currentUtterance===u)currentUtterance=null;};const start=()=>{speechSynthesis.resume();speechSynthesis.speak(u);};if(speechSynthesis.speaking||speechSynthesis.pending){speechSynthesis.cancel();setTimeout(start,80);}else start();}
// Audio is rendered by the local server (macOS voices) and played as a file; the browser's speech engine is only a fallback.
const ttsUrl=(text,language)=>`/api/tts?lang=${encodeURIComponent(language||'')}&text=${encodeURIComponent(text)}`;
function speak(text,language){if(!text)return;if(currentAudio){currentAudio.pause();currentAudio=null;}if('speechSynthesis' in window)speechSynthesis.cancel();if(!nativeTts){speakWithBrowser(text,language);return;}const audio=new Audio(ttsUrl(text,language));currentAudio=audio;let fellBack=false;const fallback=()=>{if(fellBack||currentAudio!==audio)return;fellBack=true;currentAudio=null;speakWithBrowser(text,language);};audio.addEventListener('error',fallback);audio.play().catch(err=>{if(err?.name!=='AbortError')fallback();});}
const prefetched=new Set();
function prefetchAudio(items){if(!nativeTts)return;items.forEach(([text,language])=>{if(!text)return;const url=ttsUrl(text,language);if(prefetched.has(url))return;prefetched.add(url);fetch(url).catch(()=>prefetched.delete(url));});}
function highlightTerm(text,term){let html=esc(text);String(term||'').split(/[;,]/).map(t=>t.trim()).filter(t=>t.length>1).sort((a,b)=>b.length-a.length).some(t=>{const re=new RegExp(`(${esc(t).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`,'i');if(!re.test(html))return false;html=html.replace(re,'<mark>$1</mark>');return true;});return html;}
function exampleList(examples,translations,term,translatedTerm,language){if(!examples.length)return '<div class="examples-empty">Exemplo ainda não adicionado</div>';return examples.map((example,i)=>`<article class="example-card"><div class="example-text"><p class="example-main">${highlightTerm(example,term)}</p>${translations[i]?`<p class="example-translation">${highlightTerm(translations[i],translatedTerm)}</p>`:''}</div><button type="button" class="speak-btn small" data-speak="${esc(example)}" data-speak-lang="${esc(language)}" aria-label="Ouvir a frase" title="Ouvir a frase">${SPEAK_ICON}</button></article>`).join('');}
const REVEAL_ICON='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
// Back of the card: sentences stay in the front language; tapping one reveals its translation, so the learner can try translating first.
function revealExampleList(examples,translations,term,translatedTerm,language,translationLanguage,learningLanguage){if(!examples.length)return '<div class="examples-empty">Exemplo ainda não adicionado</div>';const speakHidden=langKey(translationLanguage)===langKey(learningLanguage);return examples.map((example,i)=>{const hidden=translations[i]||'',spoken=speakHidden?hidden:example,spokenLang=speakHidden?translationLanguage:language,speakBtn=spoken?`<button type="button" class="speak-btn small${speakHidden?' after-reveal':''}" data-speak="${esc(spoken)}" data-speak-lang="${esc(spokenLang)}" aria-label="Ouvir a frase" title="Ouvir a frase">${SPEAK_ICON}</button>`:'';return `<article class="example-card${hidden?' can-reveal':''}"${hidden?' data-reveal-example':''}><div class="example-text"><p class="example-main">${highlightTerm(example,term)}</p>${hidden?`<p class="example-translation">${highlightTerm(hidden,translatedTerm)}</p>`:''}</div>${hidden?`<button type="button" class="reveal-btn" aria-label="Mostrar tradução da frase" title="Mostrar tradução">${REVEAL_ICON}<span>${esc((speechLangs[langKey(translationLanguage)]||translationLanguage).slice(0,2).toUpperCase())}</span></button>`:''}${speakBtn}</article>`;}).join('');}
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
// The "today" session mixes every deck of a language; it uses this pseudo deck name.
const ALL_DECKS='*';
const deckName=deck=>deck===ALL_DECKS?'Hoje':deck;
function getDeckBatchSize(context,deck){if(deck===ALL_DECKS)return state.todaySize||10;const value=Number(state.deckBatchSizes[deckBatchKey(context,deck)]);return [10,20,30,50].includes(value)?value:10;}

async function refresh(preserve=true) {
  const [cardsData, structureData] = await Promise.all([api('/api/cards'),api('/api/structure')]);
  state.cards=cardsData.cards; state.contexts=structureData.contexts;
  if (!preserve || !findContext()) state.context=state.contexts[0]?.name || '';
  const context=findContext();
  if ((state.screen==='study'||state.screen==='deck')&&state.deck!==ALL_DECKS&&!context?.decks.some(d=>norm(d.name)===norm(state.deck))) {state.screen='decks';state.studyStarted=false;state.deck='';}
  if(state.screen==='study'||state.screen==='deck')state.batchSize=getDeckBatchSize(state.context,state.deck);
  $('#navCount').textContent=state.cards.length;
  renderContextTree(); renderContextDecks(); populateImportTarget(); renderLibrary(); prepareStudy();
}
function renderContextTree() {
  $('#contextTree').innerHTML=state.contexts.map(context=>`<section class="context-group"><div class="context-heading"><button class="context-name ${norm(context.name)===norm(state.context)?'active':''}" data-open-context-decks="${esc(context.name)}" title="Abrir decks de ${esc(context.name)}">▸ &nbsp;${esc(context.name)}</button><button class="add-deck-small" data-add-deck="${esc(context.name)}" title="Criar deck em ${esc(context.name)}">＋</button></div></section>`).join('');
  $('#contextTree').classList.toggle('empty-tree',state.contexts.length===0);
}
// Words for today: reviewed words that are due, then new words, up to the deck's session size.
function todayFor(cards,size){const now=Date.now();const due=cards.filter(c=>Number(c.review_total)>0&&Date.parse(c.due_at)<=now).length;const fresh=cards.filter(c=>!(Number(c.review_total)>0)&&Number(c.review_streak)<LEARNED_STREAK).length;const review=Math.min(due,size),fresh_=Math.min(fresh,size-review);return {review,fresh:fresh_,total:review+fresh_};}
const deckColors=['#2E6BFF','#7B5CFF','#12A150','#E5484D','#F5A524','#0EA5B7'];
function renderContextDecks(){
  const context=findContext();
  const decks=(context?.decks||[]).map((deck,i)=>{const cards=state.cards.filter(card=>norm(card.context_name)===norm(context.name)&&norm(card.deck_name)===norm(deck.name));const counts={learned:0,learning:0,new:0};cards.forEach(c=>counts[cardStatus(c)]++);return {deck,cards,counts,today:todayFor(cards,getDeckBatchSize(context.name,deck.name)),color:deckColors[i%deckColors.length]};});
  const today=decks.reduce((t,d)=>({review:t.review+d.today.review,fresh:t.fresh+d.today.fresh,total:t.total+d.today.total}),{review:0,fresh:0,total:0});
  state.todaySize=Math.max(1,Math.min(50,today.total));
  const minutes=Math.max(1,Math.round(today.total*20/60));
  const hero=!decks.length?'':`<section class="today-hero"><div><div class="today-label">${esc(context.name)} · sessão de hoje</div><div class="today-count"><b>${today.total}</b><span>${today.total===1?'palavra':'palavras'}</span></div><div class="today-sub">${today.review} para revisar · ${today.fresh} novas · cerca de ${minutes} min</div></div>${today.total?`<button type="button" class="today-start" data-start-today>Começar sessão de hoje →</button>`:'<span class="today-done">Tudo em dia por hoje ✓</span>'}</section>`;
  const rows=decks.map(({deck,cards,counts,today,color})=>{const pct=n=>cards.length?Math.max(n?1:0,Math.round(n/cards.length*1000)/10):0;
    return `<article class="deck-line" data-open-deck="${esc(deck.name)}" data-open-context="${esc(context.name)}" title="Abrir ${esc(deck.name)}"><div class="deck-icon" style="background:${color}">${esc(deck.name.trim().charAt(0).toUpperCase())}</div><div class="deck-line-name"><b>${esc(deck.name)}</b><span>${deck.count} cartões</span></div><div class="deck-line-bar" title="${counts.learned} aprendidas · ${counts.learning} aprendendo · ${counts.new} novas"><i class="learned" style="width:${pct(counts.learned)}%"></i><i class="learning" style="width:${pct(counts.learning)}%"></i></div><div class="deck-line-today"><b>${today.total}</b> para hoje</div><button type="button" class="deck-line-study" data-start-deck="${esc(deck.name)}" data-start-context="${esc(context.name)}">Estudar</button></article>`;}).join('');
  $('#contextDeckList').innerHTML=hero+(decks.length?`<div class="deck-list-head"><span>Seus decks</span><button type="button" class="text-button" data-new-deck>＋ Novo deck</button></div>${rows}`:'');
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
// Weighted random batch: missed words weigh most, new words next, and words with a long
// correct streak (especially ones not yet due) rarely come up. Sampling without replacement
// uses the Efraimidis-Spirakis key random^(1/weight).
function cardWeight(card,now=Date.now()){const total=Number(card.review_total)||0;if(!total)return 3;const correct=Number(card.review_correct)||0,streak=Number(card.review_streak)||0;let weight=(1+4*(1-correct/total))*(streak?1/streak:2);const due=Date.parse(card.due_at);if(due&&due>now)weight*=.25;return Math.max(weight,.05);}
function pickBatch(cards,size){const now=Date.now();return cards.map(card=>({id:card.id,key:Math.random()**(1/cardWeight(card,now))})).sort((a,b)=>b.key-a.key).slice(0,size).map(item=>item.id);}
// A word counts as learned after this many correct answers in a row (the 7-day review step).
const LEARNED_STREAK=3;
function cardStatus(card){if(Number(card.review_streak)>=LEARNED_STREAK)return 'learned';return Number(card.review_total)>0?'learning':'new';}
const statusLabels={all:'Todas',learned:'Aprendidas',learning:'Aprendendo',new:'Novas'};
const langLabels={english:'Inglês',portuguese:'Português',spanish:'Espanhol',french:'Francês',german:'Alemão',italian:'Italiano'};
const langLabel=language=>langLabels[langKey(language)]||language;
function deckLanguages(cards){const seen=new Map();cards.flatMap(c=>Object.keys(c.terms)).forEach(language=>{if(!seen.has(langKey(language)))seen.set(langKey(language),language);});return [...seen.values()].sort((a,b)=>a.localeCompare(b));}
// Each deck remembers which language goes on the front; by default the learned language goes on the back.
function deckDirection(languages,learningLanguage){const find=l=>languages.find(x=>langKey(x)===langKey(l));const saved=state.deckDirections[deckBatchKey(state.context,state.deck)];if(saved&&find(saved.front)&&find(saved.back)&&langKey(saved.front)!==langKey(saved.back))return {front:find(saved.front),back:find(saved.back)};const learned=find(learningLanguage)||languages[0];return {front:languages.find(x=>langKey(x)!==langKey(learned))||learned,back:learned};}
function saveDeckDirection(front,back){state.deckDirections[deckBatchKey(state.context,state.deck)]={front,back};try{localStorage.setItem('mnema.deckDirections',JSON.stringify(state.deckDirections));}catch{}}
async function moveCard(id,status){try{await api(`/api/cards/${id}/status`,{method:'POST',body:JSON.stringify({status})});if(state.screen==='study'){state.roundReviewed.add(id);}await refresh();toast(status==='learned'?'Movida para Aprendidas.':'Movida para Aprendendo — ela volta nas próximas sessões.');}catch(err){toast(err.message);}}
function cardsInDeck() { return state.cards.filter(c=>norm(c.context_name)===norm(state.context)&&(state.deck===ALL_DECKS||norm(c.deck_name)===norm(state.deck))); }
function prepareStudy(keepIndex=false) {
  const deckCards=cardsInDeck(), context=findContext();
  const langMap=new Map();for(const language of deckCards.flatMap(c=>Object.keys(c.terms))){const key=langKey(language);if(!langMap.has(key))langMap.set(key,language);}const langs=[...langMap.values()].sort((a,b)=>a.localeCompare(b));
  const front=$('#frontLang').value, back=$('#backLang').value;
  const fallback=langs.length ? langs : [context?.learning_language || 'inglês','português'];
  $('#frontLang').innerHTML=fallback.map(x=>`<option value="${esc(x)}">${esc(langLabel(x))}</option>`).join('');
  $('#backLang').innerHTML=fallback.map(x=>`<option value="${esc(x)}">${esc(langLabel(x))}</option>`).join('');
  if(state.deck&&state.screen!=='decks'&&langs.length>1){const direction=deckDirection(langs,context?.learning_language);$('#frontLang').value=direction.front;$('#backLang').value=direction.back;}
  else if (fallback.includes(front)) $('#frontLang').value=front;
  if (!(state.deck&&state.screen!=='decks'&&langs.length>1) && fallback.includes(back) && norm(back)!==norm($('#frontLang').value)) $('#backLang').value=back;
  if (norm($('#backLang').value)===norm($('#frontLang').value)) $('#backLang').value=fallback.find(x=>norm(x)!==norm($('#frontLang').value)) || fallback[0];
  const frontLanguage=$('#frontLang').value, learningLanguage=context?.learning_language||frontLanguage;
  const candidates=deckCards.filter(c=>(termFor(c,frontLanguage)||termFor(c,learningLanguage))&&(state.studyMode==='all'||cardStatus(c)===state.studyMode));
  const batchKey=`${norm(state.context)}|${norm(state.deck)}|${state.studyMode}`;
  if(!state.batchIds||state.batchKey!==batchKey){state.batchIds=pickBatch(candidates.filter(c=>!state.roundReviewed.has(c.id)),Math.max(0,state.batchSize-state.roundReviewed.size));state.batchKey=batchKey;}
  const byId=new Map(candidates.map(c=>[c.id,c]));
  state.study=state.batchIds.map(id=>byId.get(id)).filter(c=>c&&!state.roundReviewed.has(c.id));
  if (!keepIndex) state.index=0;
  state.index=Math.min(state.index,Math.max(0,state.study.length-1)); state.revealed=false;
  $('#deckCount').textContent=state.study.length;
  $('#studyArea').classList.toggle('hidden',deckCards.length===0||state.study.length===0);
  $('#studyEmpty').classList.toggle('hidden',!!context&&(state.screen!=='study'||deckCards.length>0));
  $('#reviewComplete').classList.toggle('hidden',deckCards.length===0||state.study.length>0);
  $('#contextDeckList').classList.toggle('hidden',state.screen!=='decks'||!context);
  $('#deckDetail').classList.toggle('hidden',state.screen!=='deck'||!context);
  $('#backBtn').classList.toggle('hidden',!context||state.screen==='decks');$('#backBtn').textContent=state.screen==='study'&&state.deck!==ALL_DECKS?`‹ ${state.deck}`:'‹ Decks';
  $('#studyControls').classList.toggle('hidden',state.screen!=='study'||!context);
  $('#studyArea').classList.toggle('hidden',state.screen!=='study'||deckCards.length===0||state.study.length===0);
  $('#reviewComplete').classList.toggle('hidden',state.screen!=='study'||deckCards.length===0||state.study.length>0);
  if(state.screen==='study'&&deckCards.length&&!state.study.length){
    $('#reviewCompleteTitle').textContent=candidates.length?'Pacote concluído.':state.studyMode!=='all'?`Nenhuma palavra em ${statusLabels[state.studyMode]}.`:'Escolha um idioma com cartões.';
    $('#reviewCompleteText').textContent=candidates.length?`Você revisou ${state.roundReviewed.size} palavra(s). Pode começar mais ${state.batchSize} quando quiser.`:'Este deck não tem cartões no idioma selecionado.';
    $('#nextBatchBtn').classList.toggle('hidden',!candidates.length);
    $('#nextBatchBtn').innerHTML=`Revisar mais ${state.batchSize} palavras <span>↗</span>`;
  }
  $('#addDeckBtn').classList.toggle('hidden',!context||state.screen!=='decks');
  $('#shuffleBtn').classList.toggle('hidden',state.screen!=='study'||!deckCards.length);
  $('#studyHeading').innerHTML=context?(state.screen==='study'||state.screen==='deck'?`${esc(context.name)} <span class="heading-slash">/</span> ${esc(deckName(state.deck))}<span class="period">.</span>`:`${esc(context.name)}<span class="period">.</span>`):'Escolha um idioma<span class="period">.</span>';
  if(state.screen==='deck'&&context)renderDeckDetail();
  $('#studyContextEyebrow').textContent=context?`ESTUDANDO ${fmtLang(context.learning_language)}`:'SEU MOMENTO DE APRENDER';
  document.querySelector('#studyView .page-heading').classList.toggle('decks-heading-hidden',state.screen==='decks'&&!!context?.decks.length);
  $('#studyDescription').textContent=state.screen==='decks'?'Seus decks de estudo.':state.deck===ALL_DECKS&&state.screen==='study'?`Sessão de hoje · palavras de todos os decks de ${context.name}.`:state.screen==='deck'?`${deckCards.length} cartões neste deck.`:deckCards.length?(state.studyMode!=='all'?`Estudando: ${statusLabels[state.studyMode]} · pacote de até ${state.batchSize}.`:`Pacote de até ${state.batchSize} palavras · ${deckCards.length} no deck.`):context?`Este deck está vazio. Adicione ou importe cartões para ${context.name}.`:'Crie um contexto de idioma e organize as palavras em decks.';
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
  $('#cardFrontLang').textContent=fmtLang(langLabel(displayFront));
  $('#cardBackLang').textContent=fmtLang(langLabel($('#backLang').value));
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
  const frontTerm=termFor(card,displayFront);
  $('#speakWord').dataset.speak=frontTerm;$('#speakWord').dataset.speakLang=displayFront;$('#speakWord').classList.toggle('hidden',langKey(displayFront)!==langKey(learningLanguage));
  $('#frontExample').innerHTML=exampleList(frontExamples,[],frontTerm,'',displayFront);
  const image=card.image||'';$('#flashcard').classList.toggle('has-image',!!image);if($('#cardImage').dataset.src!==image){$('#cardImage').dataset.src=image;$('#cardImage').innerHTML=image?`<img src="${esc(image)}" alt="">`:'';}
  const learningTerm=termFor(card,learningLanguage),pron=card.pronunciation||'',frontIsLearning=langKey(displayFront)===langKey(learningLanguage);
  $('#cardPronunciation').textContent=frontIsLearning?pron:'';$('#cardPronunciation').classList.toggle('hidden',!frontIsLearning||!pron);
  $('#backPronunciation').innerHTML=pron?(frontIsLearning?`${esc(learningTerm)} <span>${esc(pron)}</span>`:`<span>${esc(pron)}</span>`):'';$('#backPronunciation').classList.toggle('hidden',!pron);
  $('#speakBackWord').dataset.speak=learningTerm;$('#speakBackWord').dataset.speakLang=learningLanguage;$('#speakBackWord').classList.toggle('hidden',!learningTerm);
  $('#cardHint').textContent=state.revealed?'Tradução revelada':'Clique para revelar a tradução';
  $('#backWord').textContent=backTerm||'Tradução ainda não adicionada';$('#backPartOfSpeech').textContent=card.part_of_speech||'';$('#backPartOfSpeech').classList.toggle('hidden',!card.part_of_speech);const otherLanguage=frontIsLearning?$('#backLang').value:displayFront;const hiddenLanguage=frontIsLearning?$('#backLang').value:learningLanguage;$('#backExample').innerHTML=revealExampleList(frontExamples,examplesFor(card,hiddenLanguage),frontTerm,termFor(card,hiddenLanguage),displayFront,hiddenLanguage,learningLanguage);prefetchAudio([[learningTerm,learningLanguage],...examplesFor(card,learningLanguage).map(x=>[x,learningLanguage]),...(frontIsLearning?[]:frontExamples.map(x=>[x,displayFront]))]);fitCard();$('#backNote').textContent=card.notes||'';
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
function openDeck(context,deck){state.roundReviewed.clear();state.batchIds=null;state.context=context;state.deck=deck;state.deckPage=0;state.batchSize=getDeckBatchSize(context,deck);state.screen='deck';state.studyStarted=false;renderContextTree();setView('study');}
function deckWordItem(card,learningLanguage){const term=termFor(card,learningLanguage),translation=Object.entries(card.terms).find(([lang])=>langKey(lang)!==langKey(learningLanguage))?.[1]||'',streak=Math.min(Number(card.review_streak)||0,LEARNED_STREAK),status=cardStatus(card);
  const dots=status==='new'?'':`<span class="streak-dots" title="${Number(card.review_streak)||0} acerto(s) seguido(s)">${Array.from({length:LEARNED_STREAK},(_,i)=>`<i class="${i<streak?'on':''}"></i>`).join('')}</span>`;
  const move=status==='learned'?`<button type="button" class="word-move" data-move-card="${card.id}" data-move-status="relearn" title="Voltar para Aprendendo">↺ Reaprender</button>`:`<button type="button" class="word-move" data-move-card="${card.id}" data-move-status="learned" title="Mover para Aprendidas">✓ Aprendida</button>`;
  return `<div class="deck-word">${move}<div class="deck-word-main"><b>${esc(term)}</b>${card.pronunciation?`<span class="deck-word-ipa">${esc(card.pronunciation.split(' (')[0])}</span>`:''}</div><div class="deck-word-sub"><span>${esc(translation)}</span>${dots}</div></div>`;}
function renderDeckDetail(){
  const context=findContext(),cards=cardsInDeck(),learningLanguage=context?.learning_language||'English',direction=deckDirection(deckLanguages(cards),learningLanguage);
  const groups={learned:[],learning:[],new:[]};cards.forEach(card=>groups[cardStatus(card)].push(card));
  const total=cards.length,reviews=cards.reduce((s,c)=>s+(Number(c.review_total)||0),0),correct=cards.reduce((s,c)=>s+(Number(c.review_correct)||0),0);
  const pct=n=>total?Math.round(n/total*1000)/10:0;
  const labels={learned:'Aprendidas',learning:'Aprendendo',new:'Novas'};
  const sorters={learned:(a,b)=>(Number(b.review_streak)||0)-(Number(a.review_streak)||0),learning:(a,b)=>(Number(a.review_correct)/Number(a.review_total))-(Number(b.review_correct)/Number(b.review_total)),new:()=>0};
  const filter=state.deckFilter,list=[...groups[filter]].sort((a,b)=>sorters[filter](a,b)||termFor(a,learningLanguage).localeCompare(termFor(b,learningLanguage)));
  const emptyText={learned:`Nenhuma palavra aprendida ainda. Uma palavra entra aqui depois de ${LEARNED_STREAK} acertos seguidos.`,learning:'Nenhuma palavra em andamento. Erre ou acerte uma palavra nova para ela aparecer aqui.',new:'Você já começou a estudar todas as palavras deste deck.'};
  $('#deckDetail').innerHTML=`<section class="deck-summary">
    <div class="deck-stats">${['learned','learning','new'].map(key=>`<div class="deck-stat ${key}"><span>${labels[key]}</span><b>${groups[key].length}</b></div>`).join('')}<div class="deck-stat"><span>Acerto</span><b>${reviews?Math.round(correct/reviews*100)+'%':'—'}</b></div></div>
    <div class="deck-progress" title="${groups.learned.length} aprendidas de ${total}"><i class="learned" style="width:${pct(groups.learned.length)}%"></i><i class="learning" style="width:${pct(groups.learning.length)}%"></i></div>
    <div class="deck-actions"><button class="button primary-button" data-deck-start="all">Iniciar sessão</button><div class="deck-direction" title="O que aparece na frente e no verso do cartão"><span>Frente</span><b>${esc(langLabel(direction.front))}</b><button type="button" class="dir-swap" data-deck-swap aria-label="Inverter frente e verso" title="Inverter frente e verso">⇄</button><span>Verso</span><b>${esc(langLabel(direction.back))}</b></div><label class="deck-batch">Palavras por sessão<select id="deckBatchSelect">${[10,20,30,50].map(n=>`<option value="${n}" ${n===state.batchSize?'selected':''}>${n}</option>`).join('')}</select></label></div>
  </section>
  <section class="deck-words">
    <div class="deck-tabs" role="tablist">${['learned','learning','new'].map(key=>`<button type="button" role="tab" aria-selected="${key===filter}" class="${key===filter?'active':''}" data-deck-filter="${key}">${labels[key]} <span>${groups[key].length}</span></button>`).join('')}${groups[filter].length?`<button type="button" class="deck-study-group" data-deck-start="${filter}">Estudar estas ${groups[filter].length} ›</button>`:''}<div class="deck-pager" id="deckPager"></div></div>
    <div class="deck-word-grid" id="deckWordGrid"></div>
  </section>`;
  const grid=$('#deckWordGrid');
  if(!list.length){grid.innerHTML=`<div class="deck-words-empty">${emptyText[filter]}</div>`;return;}
  grid.innerHTML=deckWordItem(list[0],learningLanguage);
  const itemH=grid.firstElementChild.offsetHeight||56,gap=parseFloat(getComputedStyle(grid).rowGap)||8,cols=getComputedStyle(grid).gridTemplateColumns.split(' ').length||1;
  const rows=Math.max(1,Math.floor((grid.clientHeight+gap)/(itemH+gap))),pageSize=rows*cols,pages=Math.max(1,Math.ceil(list.length/pageSize));
  state.deckPage=Math.min(state.deckPage,pages-1);
  grid.innerHTML=list.slice(state.deckPage*pageSize,(state.deckPage+1)*pageSize).map(card=>deckWordItem(card,learningLanguage)).join('');
  $('#deckPager').innerHTML=pages>1?`<button type="button" data-deck-page="-1" aria-label="Página anterior" ${state.deckPage===0?'disabled':''}>‹</button><span>${state.deckPage+1} / ${pages}</span><button type="button" data-deck-page="1" aria-label="Próxima página" ${state.deckPage>=pages-1?'disabled':''}>›</button>`:'';
}
function selectDeck(context,deck,mode='all') { state.roundReviewed.clear();state.batchIds=null;state.studyMode=mode;state.context=context;state.deck=deck;state.batchSize=getDeckBatchSize(context,deck);state.screen='study';state.studyStarted=true;renderContextTree();setView('study'); }
function fitCard(){const card=$('#flashcard'),sides=[$('#flashcard .card-content'),$('#cardBackContent')];let fit=1;card.style.setProperty('--fit','1');const overflows=()=>sides.some(el=>el&&el.scrollHeight>el.clientHeight+1);while(overflows()&&fit>.6){fit-=.05;card.style.setProperty('--fit',fit.toFixed(2));}}
function flip(){if(!state.study.length||state.suppressCardClick)return;state.revealed=!state.revealed;drawCard();}
function move(step){if(!state.study.length)return;state.index=(state.index+step+state.study.length)%state.study.length;state.revealed=false;drawCard();}
async function rateCard(remembered){if(state.ratingBusy)return;const card=state.study[state.index];if(!card)return;state.ratingBusy=true;drawCard();const stage=$('#flashcard');stage.classList.add(remembered?'swipe-right':'swipe-left');try{await new Promise(resolve=>setTimeout(resolve,280));await api(`/api/cards/${card.id}/review`,{method:'POST',body:JSON.stringify({remembered})});state.roundReviewed.add(card.id);state.ratingBusy=false;stage.classList.remove('swipe-right','swipe-left');await refresh();toast(remembered?'Resposta registrada.':'Anotado — você pode tentar de novo em outro pacote.');}catch(err){stage.classList.remove('swipe-right','swipe-left');state.ratingBusy=false;drawCard();toast(err.message);}}
function startSwipe(e){if(!state.study.length||state.ratingBusy||e.target.closest('button')||e.target.closest('#flashcard.revealed [data-reveal-example]'))return;state.swipeStart={x:e.clientX,y:e.clientY};$('#flashcard').setPointerCapture?.(e.pointerId);}
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
function changeDirection(changed){let front=$('#frontLang').value,back=$('#backLang').value;if(langKey(front)===langKey(back)){const options=[...$('#frontLang').options].map(o=>o.value);const other=options.find(x=>langKey(x)!==langKey(changed==='front'?front:back));if(changed==='front')back=other||back;else front=other||front;}if(state.deck)saveDeckDirection(front,back);$('#frontLang').value=front;$('#backLang').value=back;prepareStudy(true);}
$('#frontLang').addEventListener('change',()=>changeDirection('front'));$('#backLang').addEventListener('change',()=>changeDirection('back'));
document.addEventListener('click',e=>{const moveBtn=e.target.closest('#flashcard [data-card-move]');if(moveBtn){e.stopPropagation();const card=state.study[state.index];if(card)moveCard(card.id,moveBtn.dataset.cardMove);return;}const speakBtn=e.target.closest('#flashcard [data-speak]');if(speakBtn){e.stopPropagation();speak(speakBtn.dataset.speak,speakBtn.dataset.speakLang);return;}const reveal=e.target.closest('#flashcard.revealed [data-reveal-example]');if(reveal){e.stopPropagation();reveal.classList.toggle('shown');reveal.querySelector('.reveal-btn')?.setAttribute('aria-label',reveal.classList.contains('shown')?'Esconder tradução da frase':'Mostrar tradução da frase');fitCard();}},true);
window.addEventListener('resize',()=>{fitCard();if(state.screen==='deck'&&state.view==='study')renderDeckDetail();});
$('#deckDetail').addEventListener('click',e=>{const start=e.target.closest('[data-deck-start]'),tab=e.target.closest('[data-deck-filter]'),page=e.target.closest('[data-deck-page]'),swap=e.target.closest('[data-deck-swap]'),moveBtn=e.target.closest('[data-move-card]');if(moveBtn){moveCard(Number(moveBtn.dataset.moveCard),moveBtn.dataset.moveStatus);return;}if(swap){const cards=cardsInDeck(),d=deckDirection(deckLanguages(cards),findContext()?.learning_language);saveDeckDirection(d.back,d.front);prepareStudy(true);return;}if(start){selectDeck(state.context,state.deck,start.dataset.deckStart);return;}if(tab){state.deckFilter=tab.dataset.deckFilter;state.deckPage=0;renderDeckDetail();return;}if(page){state.deckPage+=Number(page.dataset.deckPage);renderDeckDetail();}});
$('#deckDetail').addEventListener('change',e=>{if(e.target.id!=='deckBatchSelect')return;state.batchSize=Number(e.target.value);state.deckBatchSizes[deckBatchKey(state.context,state.deck)]=state.batchSize;try{localStorage.setItem('palavra.deckBatchSizes',JSON.stringify(state.deckBatchSizes));}catch{}});
$('#backBtn').addEventListener('click',()=>{if(state.screen==='study'&&state.deck!==ALL_DECKS)openDeck(state.context,state.deck);else showContextDecks(state.context);});
$('#flashcard').addEventListener('click',flip);$('#flashcard').addEventListener('keydown',e=>{if(e.key==='Enter')flip();});$('#prevBtn').addEventListener('click',()=>move(-1));$('#nextBtn').addEventListener('click',()=>move(1));
$('#nextBatchBtn').addEventListener('click',()=>{state.roundReviewed.clear();state.batchIds=null;prepareStudy();});
$('#contextDeckList').addEventListener('click',e=>{if(e.target.closest('[data-start-today]')){selectDeck(state.context,ALL_DECKS);return;}if(e.target.closest('[data-new-deck]')){openCollection('deck',state.context);return;}const start=e.target.closest('[data-start-deck]'),trigger=e.target.closest('.deck-options-trigger'),option=e.target.closest('[data-deck-batch]'),row=e.target.closest('[data-open-deck]');if(start){selectDeck(start.dataset.startContext,start.dataset.startDeck);return;}if(row&&!e.target.closest('button')){openDeck(row.dataset.openContext,row.dataset.openDeck);return;}if(trigger){const menu=trigger.nextElementSibling,open=menu.classList.contains('hidden');$$('.deck-options-menu').forEach(item=>item.classList.add('hidden'));$$('.deck-options-trigger').forEach(item=>item.setAttribute('aria-expanded','false'));menu.classList.toggle('hidden',!open);trigger.setAttribute('aria-expanded',String(open));return;}if(option){const key=deckBatchKey(option.dataset.batchContext,option.dataset.batchDeck);state.deckBatchSizes[key]=Number(option.dataset.deckBatch);localStorage.setItem('palavra.deckBatchSizes',JSON.stringify(state.deckBatchSizes));if(norm(state.context)===norm(option.dataset.batchContext)&&norm(state.deck)===norm(option.dataset.batchDeck))state.batchSize=Number(option.dataset.deckBatch);renderContextDecks();return;}});
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
api('/api/health').then(info=>{nativeTts=info.native_tts===true;}).catch(()=>{}).then(()=>refresh()).catch(e=>toast(e.message));
