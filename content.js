
let stopFlag=false;
async function attachImagesMulti(imageArray){
  try{
    // find file input
    const fileInput = document.querySelector('input[type="file"]') || document.querySelector('input[accept*="image"]');
    if(!fileInput || !imageArray || !imageArray.length) return false;
    const dt = new DataTransfer();
    for(let i=0;i<imageArray.length;i++){
      const res = await fetch(imageArray[i].dataUrl);
      const blob = await res.blob();
      const file = new File([blob], imageArray[i].name || `ref-${i}.png`, {type: blob.type});
      dt.items.add(file);
    }
    fileInput.files = dt.files;
    fileInput.dispatchEvent(new Event('change',{bubbles:true}));
    fileInput.dispatchEvent(new Event('input',{bubbles:true}));
    await new Promise(r=>setTimeout(r, 2000));
    return true;
  }catch(e){ console.log('attach failed', e); return false; }
}

function findInput(){
  // Meta AI selectors
  if(location.hostname.includes('meta.ai')){
    return document.querySelector('div[contenteditable="true"]') || document.querySelector('textarea') || document.querySelector('[role="textbox"]');
  }
  if(location.hostname.includes('grok.com')){
    return document.querySelector('textarea') || document.querySelector('div[contenteditable="true"]');
  }
  return document.querySelector('textarea') || document.querySelector('div[contenteditable="true"]');
}
function findSendBtn(){
  if(location.hostname.includes('meta.ai')) return document.querySelector('button[type="submit"]') || document.querySelector('button[aria-label*="Send"]');
  if(location.hostname.includes('grok.com')) return document.querySelector('button[type="submit"]') || document.querySelector('button[aria-label*="Send"]');
  return document.querySelector('button[data-testid="send-button"]') || document.querySelector('button[type="submit"]');
}
function isGenerating(){
  // check stop button exists
  return !!document.querySelector('button[aria-label*="Stop"]') || !!document.querySelector('button[data-testid="stop-button"]');
}
async function submitPrompt(text){
  const inp=findInput();
  if(!inp) throw 'Input not found on this page. Make sure you are on meta.ai or grok.com';
  inp.focus();
  if(inp.tagName==='TEXTAREA' || inp.tagName==='INPUT'){
    inp.value=text; inp.dispatchEvent(new Event('input',{bubbles:true}));
  }else{
    // contenteditable
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, text);
    inp.dispatchEvent(new Event('input',{bubbles:true}));
  }
  await new Promise(r=>setTimeout(r,400));
  const btn=findSendBtn();
  if(btn) btn.click();
  else{
    inp.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter', code:'Enter', bubbles:true}));
  }
}
async function waitForDone(){
  for(let i=0;i<180;i++){
    if(stopFlag) return;
    if(!isGenerating()){ await new Promise(r=>setTimeout(r,1200)); if(!isGenerating()) return; }
    await new Promise(r=>setTimeout(r,1000));
  }
}
async function runQueue(queue, settings){
  stopFlag=false;
  for(let i=0;i<queue.length;i++){
    if(stopFlag) break;
    const item=queue[i];
    try{
      chrome.runtime.sendMessage({type:'PROGRESS', index:i+1, total:queue.length, current:item.text, cardId:item.id, status:`Generating...`});
      if(item.images && item.images.length){
        await attachImagesMulti(item.images);
      }
      await submitPrompt(item.text);
      await waitForDone();
      await new Promise(r=>setTimeout(r, (settings.delay||3)*1000));
      chrome.runtime.sendMessage({type:'PROGRESS', index:i+1, total:queue.length, current:item.text, cardId:item.id, status:`✓ Done`});
    }catch(e){
      chrome.runtime.sendMessage({type:'PROGRESS', index:i+1, total:queue.length, current:item.text, cardId:item.id, status:`✗ ${e}`});
    }
  }
}
chrome.runtime.onMessage.addListener((msg)=>{
  if(msg.type==='START_QUEUE') runQueue(msg.queue, msg.settings||{});
  if(msg.type==='STOP_QUEUE') stopFlag=true;
});
