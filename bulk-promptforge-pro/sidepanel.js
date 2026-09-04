
let promptIdCounter = 1;
let isRunning = false;

const el = id => document.getElementById(id);

function fileToDataUrl(file){
  return new Promise((res,rej)=>{
    const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file);
  });
}

function createPromptCard(text=''){
  const id = promptIdCounter++;
  const card = document.createElement('div');
  card.className='prompt-card';
  card.dataset.id=id;
  card.innerHTML=`
    <div class="card-top">
      <label><input type="checkbox" class="enableToggle" checked> <span>#${id} Enabled</span></label>
      <button class="deleteBtn" style="background:#2a1a1a;border:1px solid #3a2a2a;color:#ff8888;border-radius:6px;padding:2px 8px;cursor:pointer">✕</button>
    </div>
    <textarea class="promptText" placeholder="Enter prompt...">${text}</textarea>
    <div class="image-section">
      <label><input type="checkbox" class="imageEnableToggle"> 📎 Attach ref images (one or more)</label>
      <div class="imageArea" style="display:none">
        <input type="file" class="imageInput" multiple accept="image/*" style="margin-top:6px">
        <div class="thumbs"></div>
        <div style="font-size:10px;color:#777;margin-top:4px">You can attach 1-5 images per prompt</div>
      </div>
    </div>
    <div class="card-status" style="font-size:10px;color:#777;margin-top:6px">pending</div>
  `;
  // events
  const enableToggle = card.querySelector('.enableToggle');
  enableToggle.addEventListener('change', ()=>{ card.classList.toggle('disabled', !enableToggle.checked); saveAll(); updateCount(); });
  card.querySelector('.deleteBtn').addEventListener('click', ()=>{ card.remove(); saveAll(); updateCount(); });
  card.querySelector('.promptText').addEventListener('input', saveAll);

  const imgToggle = card.querySelector('.imageEnableToggle');
  const imgArea = card.querySelector('.imageArea');
  const imgInput = card.querySelector('.imageInput');
  const thumbs = card.querySelector('.thumbs');
  let images = []; // {name, dataUrl}
  card._getData = ()=>({ id, text: card.querySelector('.promptText').value, enabled: enableToggle.checked, images: imgToggle.checked? images: [], status: 'pending' });
  card._setImages = (arr)=>{ images=arr; };

  imgToggle.addEventListener('change', ()=>{ imgArea.style.display = imgToggle.checked? 'block':'none'; saveAll(); });
  imgInput.addEventListener('change', async (e)=>{
    for(let file of e.target.files){
      const dataUrl = await fileToDataUrl(file);
      images.push({name: file.name, dataUrl});
      const thumb = document.createElement('div'); thumb.className='thumb';
      thumb.innerHTML=`<img src="${dataUrl}"><button>×</button>`;
      thumb.querySelector('button').onclick=()=>{ images=images.filter(im=>im.dataUrl!==dataUrl); thumb.remove(); saveAll(); };
      thumbs.appendChild(thumb);
    }
    saveAll();
  });

  document.getElementById('promptList').appendChild(card);
  saveAll(); updateCount();
  return card;
}

function saveAll(){
  const cards=[...document.querySelectorAll('.prompt-card')].map(c=>c._getData());
  chrome.storage.local.set({promptForge_cards: cards});
}
function updateCount(){
  const cards=[...document.querySelectorAll('.prompt-card')];
  const enabled=cards.filter(c=>c.querySelector('.enableToggle').checked).length;
  el('totalCount').innerText=`${cards.length} prompts (${enabled} enabled)`;
  el('startBtn').innerText=`▶ Start Queue (${enabled})`;
}

function bulkPasteToCards(){
  const text = el('bulkPaste').value.trim();
  if(!text) return;
  const mode = el('splitMode').value;
  let prompts;
  if(mode==='line') prompts=text.split('\n').map(s=>s.trim()).filter(s=>s);
  else prompts=text.split(/\n\s*\n/).map(s=>s.trim()).filter(s=>s);

  if(prompts.length===0) return;
  // if single block pasted with commas? still handle
  prompts.forEach(p=>createPromptCard(p));
  el('bulkPaste').value='';
  el('bulkInfo').innerText=`✓ Added ${prompts.length} prompts`;
  setTimeout(()=>el('bulkInfo').innerText=`Paste detected: 0`,2000);
}

// bulk paste auto-detect
el('bulkPaste').addEventListener('paste', ()=>{ setTimeout(()=>{
  const txt=el('bulkPaste').value.trim(); if(!txt) return;
  const lines=txt.split('\n').filter(s=>s.trim());
  el('bulkInfo').innerText=`Paste detected: ${lines.length} prompts - auto-adding in 1 sec...`;
  setTimeout(bulkPasteToCards, 800);
},100); });
el('bulkPaste').addEventListener('input', ()=>{
  const c=el('bulkPaste').value.split('\n').filter(s=>s.trim()).length;
  el('bulkInfo').innerText=`Paste detected: ${c}`;
});

el('bulkAddBtn').addEventListener('click', bulkPasteToCards);
el('bulkClearBtn').addEventListener('click', ()=>{ el('bulkPaste').value=''; el('bulkInfo').innerText='Paste detected: 0'; });
el('addOneBtn').addEventListener('click', ()=>createPromptCard(''));
el('settingsCog').addEventListener('click', ()=>{ const p=el('settingsPanel'); p.style.display=p.style.display==='none'?'block':'none'; });

// start/stop
el('startBtn').addEventListener('click', async()=>{
  const cards=[...document.querySelectorAll('.prompt-card')].map(c=>c._getData()).filter(c=>c.enabled && c.text.trim());
  if(!cards.length) return alert('No enabled prompts');
  isRunning=true; el('startBtn').disabled=true; el('stopBtn').disabled=false;
  const settings={delay: parseInt(el('delay').value)||3, autoWait: el('autoWait').checked};
  chrome.storage.local.set({promptForge_settings: settings, promptForge_running: true});
  let [tab]=await chrome.tabs.query({active:true, currentWindow:true});
  if(!tab) tab=(await chrome.tabs.query({url:["https://*.meta.ai/*","https://*.grok.com/*","https://*.chatgpt.com/*"]}))[0];
  if(!tab) return alert('Open meta.ai or grok.com first');
  chrome.tabs.sendMessage(tab.id, {type:'START_QUEUE', queue: cards, settings});
});
el('stopBtn').addEventListener('click', async()=>{
  isRunning=false; let [tab]=await chrome.tabs.query({active:true, currentWindow:true}); if(tab) chrome.tabs.sendMessage(tab.id,{type:'STOP_QUEUE'});
  el('startBtn').disabled=false; el('stopBtn').disabled=true; el('status').innerText='Stopped'; chrome.storage.local.set({promptForge_running:false});
});

// progress listener
chrome.runtime.onMessage.addListener(m=>{
  if(m.type==='PROGRESS'){
    el('progressFill').style.width=`${(m.index/m.total)*100}%`;
    el('status').innerText=`Running ${m.index}/${m.total}: ${m.current.slice(0,60)}...`;
    const card=document.querySelector(`.prompt-card[data-id="${m.cardId}"] .card-status`);
    if(card) card.innerText=m.status;
    if(m.index>=m.total){ el('startBtn').disabled=false; el('stopBtn').disabled=true; }
  }
});

// restore
chrome.storage.local.get(['promptForge_cards'], r=>{
  if(r.promptForge_cards && r.promptForge_cards.length){
    r.promptForge_cards.forEach(c=>{
      const card=createPromptCard(c.text);
      card.querySelector('.enableToggle').checked=c.enabled;
      card.classList.toggle('disabled', !c.enabled);
      if(c.images && c.images.length){
        card.querySelector('.imageEnableToggle').checked=true;
        card.querySelector('.imageArea').style.display='block';
        const thumbs=card.querySelector('.thumbs');
        let imgs=[];
        c.images.forEach(im=>{
          imgs.push(im);
          const thumb=document.createElement('div'); thumb.className='thumb';
          thumb.innerHTML=`<img src="${im.dataUrl}"><button>×</button>`;
          thumb.querySelector('button').onclick=()=>{ imgs=imgs.filter(x=>x.dataUrl!==im.dataUrl); thumb.remove(); };
          thumbs.appendChild(thumb);
        });
        card._setImages(imgs);
      }
    });
  } else {
    // demo 2 cards
    createPromptCard('Write a hook about black holes for Instagram');
    createPromptCard('Explain why we dream in 1 line');
  }
});
