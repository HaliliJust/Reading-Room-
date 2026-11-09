(function(){
  const API='/api';
  window.apiRequest=function(path,options){
    options=options||{};
    const headers=Object.assign({'Content-Type':'application/json'},options.headers||{});
    const adminPath=path.indexOf('/admin/')===0;
    const token=options.token||(adminPath?localStorage.getItem('readingRoomAdminToken'):localStorage.getItem('readingRoomToken'));
    if(token)headers.Authorization='Bearer '+token;
    return fetch(API+path,Object.assign({},options,{headers})).then(async function(response){
      const data=await response.json().catch(function(){return {};});
      if(!response.ok){const error=new Error(data.message||'The request could not be completed.');error.code=data.code;error.status=response.status;throw error;}
      return data;
    });
  };
  window.escapeHtml=function(value){return String(value==null?'':value).replace(/[&<>"']/g,function(char){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char];});};
  let toastTimer;
  window.showToast=function(message,type){
    const toast=document.getElementById('toast');if(!toast)return;
    const text=document.getElementById('toastText');if(text)text.textContent=message;
    toast.dataset.type=type||'success';toast.classList.add('show');
    clearTimeout(toastTimer);toastTimer=setTimeout(function(){toast.classList.remove('show');},4200);
  };
  window.confirmAction=function(title,message,confirmLabel){
    let modal=document.getElementById('confirmActionModal');
    if(!modal){
      modal=document.createElement('div');modal.className='modal-overlay';modal.id='confirmActionModal';modal.innerHTML='<div class="modal-box"><button class="modal-close" data-confirm-cancel aria-label="Close">×</button><div class="modal-icon">!</div><p class="eyebrow">Please confirm</p><h3 data-confirm-title></h3><p data-confirm-message></p><div class="modal-actions"><button class="modal-btn-cancel" data-confirm-cancel>Cancel</button><button class="modal-btn-confirm" data-confirm-yes></button></div></div>';document.body.appendChild(modal);
    }
    modal.querySelector('[data-confirm-title]').textContent=title;
    modal.querySelector('[data-confirm-message]').textContent=message;
    modal.querySelector('[data-confirm-yes]').textContent=confirmLabel||'Confirm';
    modal.classList.add('show');
    return new Promise(resolve=>{
      const finish=value=>{modal.classList.remove('show');modal.querySelector('[data-confirm-yes]').removeEventListener('click',yes);modal.querySelectorAll('[data-confirm-cancel]').forEach(el=>el.removeEventListener('click',no));modal.removeEventListener('click',outside);document.removeEventListener('keydown',escape);resolve(value);};
      const yes=()=>finish(true),no=()=>finish(false),outside=e=>{if(e.target===modal)no();},escape=e=>{if(e.key==='Escape')no();};
      modal.querySelector('[data-confirm-yes]').addEventListener('click',yes);modal.querySelectorAll('[data-confirm-cancel]').forEach(el=>el.addEventListener('click',no));modal.addEventListener('click',outside);document.addEventListener('keydown',escape);
    });
  };
  window.openModal=function(id){const modal=document.getElementById(id);if(modal)modal.classList.add('show');};
  window.closeModal=function(id){const modal=document.getElementById(id);if(modal)modal.classList.remove('show');};
  document.addEventListener('click',function(event){const close=event.target.closest('[data-close-modal]');if(close)closeModal(close.dataset.closeModal);});
  window.formatDate=function(value){if(!value)return '—';const date=new Date(value.length===10?value+'T00:00:00':value);return Number.isNaN(date.getTime())?'—':date.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});};
  window.statusLabel=function(value){return String(value||'').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());};
})();
