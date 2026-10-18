// Theme switcher: toggles html[data-theme] between "navy" and "black" and remembers the choice.
(function(){
  const THEMES={navy:'Marinho',black:'Preto'};
  const KEY='mnema.theme';
  const root=document.documentElement;
  function label(){const btn=document.getElementById('themeToggle');if(btn)btn.querySelector('.theme-name').textContent=THEMES[root.dataset.theme];}
  function setTheme(name){
    root.dataset.theme=name;
    try{localStorage.setItem(KEY,name)}catch(e){}
    label();
  }
  document.addEventListener('DOMContentLoaded',()=>{
    label();
    document.getElementById('themeToggle').addEventListener('click',()=>setTheme(root.dataset.theme==='navy'?'black':'navy'));
  });
})();
