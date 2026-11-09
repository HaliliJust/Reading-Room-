let borrowerBooks=[];
let borrowerLoans=[];
let shelfFilter='all';
let shelfSearch='';
let requestBook=null;
let editingRequest=null;
let currentBorrowerView='titles';

function setBanner(id,message,type){const node=document.getElementById(id);if(!node)return;node.textContent=message||'';node.classList.toggle('show',Boolean(message));node.classList.toggle('error',type==='error');node.classList.toggle('success',type==='success');}
function fieldError(id,message){const node=document.getElementById(id);if(node){node.textContent=message||'';node.classList.toggle('show',Boolean(message));}}
function clearErrors(ids){ids.forEach(id=>fieldError(id,''));}
function strongPassword(value){return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(value);}
function validEmail(value){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);}

function initAuth(){
  const loginForm=document.getElementById('loginForm');
  if(loginForm)loginForm.addEventListener('submit',async event=>{
    event.preventDefault();clearErrors(['loginUsernameError','loginPasswordError']);setBanner('loginBanner','');
    const username=document.getElementById('loginUsername').value.trim(),password=document.getElementById('loginPassword').value;
    let invalid=false;if(!username){fieldError('loginUsernameError','Enter your username.');invalid=true;}if(!password){fieldError('loginPasswordError','Enter your password.');invalid=true;}if(invalid)return;
    try{const result=await apiRequest('/login',{method:'POST',body:JSON.stringify({username,password})});localStorage.setItem('readingRoomToken',result.token);localStorage.removeItem('readingRoomAdminToken');setBanner('loginBanner','Welcome back, '+result.user.name+'. Opening your library…','success');setTimeout(()=>location.href='library.html',350);}
    catch(error){if(error.code==='USERNAME_NOT_FOUND')fieldError('loginUsernameError','No account was found with that username.');else if(error.code==='PASSWORD_INCORRECT')fieldError('loginPasswordError','That password is incorrect.');else setBanner('loginBanner',error.message,'error');}
  });
  const createForm=document.getElementById('createForm');
  if(createForm){
    const pw=document.getElementById('newPassword');if(pw)pw.addEventListener('input',()=>{const value=pw.value,rules={len:value.length>=8,upper:/[A-Z]/.test(value),lower:/[a-z]/.test(value),num:/\d/.test(value),special:/[^A-Za-z0-9]/.test(value)};document.querySelectorAll('#pwRules li').forEach(li=>li.classList.toggle('met',rules[li.dataset.rule]));});
    createForm.addEventListener('submit',async event=>{
      event.preventDefault();const fields=['newUsernameError','newPasswordError','confirmPasswordError','newEmailError'];clearErrors(fields);setBanner('createBanner','');
      const username=document.getElementById('newUsername').value.trim(),password=document.getElementById('newPassword').value,confirm=document.getElementById('confirmPassword').value,email=document.getElementById('newEmail').value.trim();let invalid=false;
      if(username.length<4||username.length>32||!/^[A-Za-z0-9_.-]+$/.test(username)){fieldError('newUsernameError','Use 4–32 letters, numbers, dots, underscores, or hyphens.');invalid=true;}
      if(!strongPassword(password)){fieldError('newPasswordError','Use 8+ characters with uppercase, lowercase, a number, and a special character.');invalid=true;}
      if(confirm!==password||!confirm){fieldError('confirmPasswordError','Passwords must match.');invalid=true;}
      if(!validEmail(email)){fieldError('newEmailError','Enter a valid email address.');invalid=true;}if(invalid)return;
      try{await apiRequest('/register',{method:'POST',body:JSON.stringify({username,password,email})});createForm.reset();document.querySelectorAll('#pwRules li').forEach(li=>li.classList.remove('met'));setBanner('createBanner','Account created. You can now log in.','success');setTimeout(()=>switchTab('login'),650);}
      catch(error){if(error.code==='USERNAME_EXISTS'||error.code==='USERNAME_RESERVED')fieldError('newUsernameError',error.message);else if(error.code==='EMAIL_INVALID')fieldError('newEmailError',error.message);else setBanner('createBanner',error.message,'error');}
    });
  }
  const openAdmin=document.getElementById('openAdminLogin');if(openAdmin)openAdmin.addEventListener('click',()=>openModal('adminLoginModal'));
  const closeAdmin=document.getElementById('closeAdminLogin');if(closeAdmin)closeAdmin.addEventListener('click',()=>closeModal('adminLoginModal'));
  const adminForm=document.getElementById('adminLoginForm');
  if(adminForm)adminForm.addEventListener('submit',async event=>{
    event.preventDefault();clearErrors(['adminUsernameError','adminPasswordError']);
    const username=document.getElementById('adminUsername').value.trim(),password=document.getElementById('adminPassword').value;let invalid=false;
    if(!username){fieldError('adminUsernameError','Enter the admin username.');invalid=true;}if(!password){fieldError('adminPasswordError','Enter the admin password.');invalid=true;}if(invalid)return;
    try{const result=await apiRequest('/admin/login',{method:'POST',body:JSON.stringify({username,password})});localStorage.setItem('readingRoomAdminToken',result.token);localStorage.removeItem('readingRoomToken');closeModal('adminLoginModal');showToast('Admin login successful.','success');setTimeout(()=>location.href='admin.html',250);}
    catch(error){if(error.code==='USERNAME_NOT_FOUND')fieldError('adminUsernameError','Admin username not found.');else if(error.code==='PASSWORD_INCORRECT')fieldError('adminPasswordError','Admin password is incorrect.');else showToast(error.message,'error');}
  });
  document.querySelectorAll('.pw-toggle').forEach(button=>button.addEventListener('click',()=>{const input=document.getElementById(button.dataset.target);if(input){input.type=input.type==='password'?'text':'password';button.classList.toggle('showing');}}));
  document.querySelectorAll('.modal-overlay').forEach(modal=>modal.addEventListener('click',event=>{if(event.target===modal)modal.classList.remove('show');}));
}
window.switchTab=function(which){const login=which==='login';document.getElementById('loginPane')?.classList.toggle('active',login);document.getElementById('createPane')?.classList.toggle('active',!login);document.getElementById('tabLoginBtn')?.classList.toggle('active',login);document.getElementById('tabCreateBtn')?.classList.toggle('active',!login);setBanner('loginBanner','');setBanner('createBanner','');};

async function initShelf(){
  if(!localStorage.getItem('readingRoomToken')){location.replace('index.html');return;}
  try{const [user,books,loans]=await Promise.all([apiRequest('/me'),apiRequest('/books'),apiRequest('/me/borrowings')]);
    document.getElementById('whoName').textContent=user.name||user.username;document.getElementById('avatarLetter').textContent=(user.name||user.username).charAt(0).toUpperCase();
    borrowerBooks=books;borrowerLoans=loans;renderShelf();renderBorrowerActivity();
  }catch(error){
    if(error.status===401){
      localStorage.removeItem('readingRoomToken');
      showToast(error.message,'error');
      setTimeout(()=>location.replace('index.html'),900);
      return;
    }
    showToast(error.message||'Hindi ma-load ang library. Pakisubukang i-refresh.','error');
  }
}
function renderShelf(){
  const grid=document.getElementById('bookGrid');if(!grid)return;
  const mine=borrowerLoans.filter(loan=>['pending','borrowed'].includes(loan.status)).length;
  document.getElementById('statAvailable').textContent=borrowerBooks.reduce((sum,book)=>sum+(book.available?book.availableCount:0),0);
  document.getElementById('statBorrowed').textContent=borrowerBooks.reduce((sum,book)=>sum+book.borrowedCount,0);
  document.getElementById('statMine').textContent=mine;
  const query=shelfSearch.toLowerCase().trim();
  const filtered=borrowerBooks.filter(book=>{
    const matches=[book.title,book.author,book.id,book.category].some(value=>String(value||'').toLowerCase().includes(query));
    const available=book.available!==false&&book.availableCount>0;
    return matches&&(shelfFilter==='available'?available:shelfFilter==='unavailable'?!available:true);
  });
  grid.replaceChildren();if(!filtered.length){grid.innerHTML='<p class="empty-state">No books match this search.</p>';return;}
  filtered.forEach(book=>{
    const existing=borrowerLoans.some(loan=>loan.bookId===book.id&&['pending','borrowed'].includes(loan.status));
    const card=document.createElement('article');card.className='book-card';
    const state=book.available===false?'Unavailable':book.availableCount>0?'Available':'On loan';
    card.innerHTML=`<div class="book-code">${escapeHtml(book.id)} · ${escapeHtml(book.category)}</div><div class="book-title">${escapeHtml(book.title)}</div><p class="book-meta">by ${escapeHtml(book.author)}</p><div class="copies-row"><span class="copies-count">${book.available?book.availableCount:0} of ${book.quantity} copies available</span><span class="status-pill ${book.available&&book.availableCount>0?'available':'borrowed'}">${state}</span></div><button class="book-action ${book.available&&book.availableCount>0&&!existing?'borrow':'disabled'}" data-request-id="${escapeHtml(book.id)}" ${!book.available||book.availableCount<1||existing?'disabled':''}>${existing?'Request already open':'Request to borrow this book'}</button>`;
    grid.appendChild(card);
  });
}
function bindShelf(){
  document.getElementById('borrowerProfileLink')?.addEventListener('click',event=>{event.preventDefault();document.querySelector('[data-view="status"]')?.click();});
  document.getElementById('searchInput')?.addEventListener('input',event=>{shelfSearch=event.target.value;renderShelf();});
  document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-view]').forEach(item=>item.classList.remove('active'));button.classList.add('active');currentBorrowerView=button.dataset.view;const shelf=currentBorrowerView==='titles'||currentBorrowerView==='available'||currentBorrowerView==='unavailable';document.getElementById('shelfSearchRow').hidden=!shelf;document.querySelectorAll('.borrower-view').forEach(view=>view.classList.remove('active'));document.getElementById(shelf?'viewTitles':'view'+(currentBorrowerView==='bookBorrowed'?'BookBorrowed':currentBorrowerView[0].toUpperCase()+currentBorrowerView.slice(1))).classList.add('active');shelfFilter=['available','unavailable'].includes(currentBorrowerView)?currentBorrowerView:'all';if(shelf)renderShelf();}));
  document.getElementById('bookGrid')?.addEventListener('click',event=>{const button=event.target.closest('[data-request-id]');if(!button)return;requestBook=borrowerBooks.find(book=>book.id===button.dataset.requestId);if(!requestBook)return;document.getElementById('requestBookInfo').textContent='Send a request for “'+requestBook.title+'” by '+requestBook.author+'. The admin will review it.';const quantity=document.getElementById('requestQuantity');quantity.max=Math.min(5,requestBook.availableCount);quantity.value=1;fieldError('requestQuantityError','');openModal('requestModal');});
  document.getElementById('submitRequest')?.addEventListener('click',async()=>{const quantity=Number(document.getElementById('requestQuantity').value);if(!Number.isInteger(quantity)||quantity<1||quantity>Number(document.getElementById('requestQuantity').max)){fieldError('requestQuantityError','Enter a valid number of copies.');return;}const button=document.getElementById('submitRequest');button.disabled=true;try{await apiRequest('/me/borrowings',{method:'POST',body:JSON.stringify({bookId:requestBook.id,quantity})});closeModal('requestModal');showToast('Borrow request sent to the admin.','success');await refreshBorrowerData();}catch(error){showToast(error.message,'error');}finally{button.disabled=false;}});
  document.getElementById('myStatusList')?.addEventListener('click',async event=>{const edit=event.target.closest('[data-request-edit]');if(edit){editingRequest=borrowerLoans.find(loan=>loan.id===edit.dataset.requestEdit);if(!editingRequest)return;document.getElementById('editRequestBook').textContent=editingRequest.bookTitle;document.getElementById('editRequestQuantity').value=editingRequest.quantity;fieldError('editRequestQuantityError','');openModal('editRequestModal');return;}const cancel=event.target.closest('[data-request-cancel]');if(cancel){const loan=borrowerLoans.find(item=>item.id===cancel.dataset.requestCancel);if(!loan||!await confirmAction('Cancel borrowing request?','Your pending request for “'+loan.bookTitle+'” will be marked cancelled.','Cancel request'))return;try{await apiRequest('/me/borrowings/'+encodeURIComponent(loan.id),{method:'DELETE'});showToast('Borrow request cancelled.','success');await refreshBorrowerData();}catch(error){showToast(error.message,'error');}}});
  document.getElementById('saveRequestEdit')?.addEventListener('click',async()=>{if(!editingRequest)return;const quantity=Number(document.getElementById('editRequestQuantity').value);if(!Number.isInteger(quantity)||quantity<1||quantity>5){fieldError('editRequestQuantityError','Enter a whole number from 1 to 5.');return;}try{await apiRequest('/me/borrowings/'+encodeURIComponent(editingRequest.id),{method:'PATCH',body:JSON.stringify({quantity})});closeModal('editRequestModal');showToast('Borrow request updated.','success');await refreshBorrowerData();}catch(error){fieldError('editRequestQuantityError',error.message);}});
  document.getElementById('refreshMyHistory')?.addEventListener('click',async()=>{try{await refreshBorrowerData();showToast('History refreshed.','success');}catch(error){showToast(error.message,'error');}});
  document.getElementById('myBorrowedTable')?.addEventListener('click',async event=>{const button=event.target.closest('[data-return-loan]');if(!button)return;const loan=borrowerLoans.find(item=>item.id===button.dataset.returnLoan);if(!loan||!await confirmAction('Return borrowed books?','Confirm that you have returned “'+loan.bookTitle+'” to the library.','Confirm return'))return;try{await apiRequest('/me/borrowings/'+encodeURIComponent(loan.id)+'/return',{method:'POST'});await refreshBorrowerData();showToast('Book return recorded in History.','success');}catch(error){showToast(error.message,'error');}});
  document.getElementById('borrowerLogout')?.addEventListener('click',async()=>{if(!await confirmAction('Log out of your account?','You can log in again at any time.','Log out'))return;try{await apiRequest('/logout',{method:'POST',token:localStorage.getItem('readingRoomToken')});}catch(_){}localStorage.removeItem('readingRoomToken');location.replace('index.html');});
  document.querySelectorAll('.modal-overlay').forEach(modal=>modal.addEventListener('click',event=>{if(event.target===modal)modal.classList.remove('show');}));
}
async function refreshBorrowerData(){const [books,loans]=await Promise.all([apiRequest('/books'),apiRequest('/me/borrowings')]);borrowerBooks=books;borrowerLoans=loans;renderShelf();renderBorrowerActivity();}
function renderBorrowerActivity(){
  const pending=borrowerLoans.filter(loan=>loan.status==='pending').length,borrowed=borrowerLoans.filter(loan=>loan.status==='borrowed').length,overdue=borrowerLoans.filter(loan=>loan.displayStatus==='overdue').length;
  document.getElementById('myPendingCount').textContent=pending;document.getElementById('myBorrowedCount').textContent=borrowed;document.getElementById('myOverdueCount').textContent=overdue;
  const open=borrowerLoans.filter(loan=>['pending','borrowed'].includes(loan.status));
  document.getElementById('myStatusList').innerHTML=open.length?`<table><thead><tr><th>Book</th><th>Quantity</th><th>Requested</th><th>Due date</th><th>Status</th><th>Request actions</th></tr></thead><tbody>${open.map(loan=>`<tr><td><strong>${escapeHtml(loan.bookTitle)}</strong><small class="table-sub">${escapeHtml(loan.bookId)} · ${escapeHtml(loan.author||'')}</small></td><td>${loan.quantity}</td><td>${formatDate(loan.requestedAt)}</td><td>${formatDate(loan.dueDate)}</td><td><span class="status-pill ${loan.displayStatus==='pending'?'pending':loan.displayStatus==='overdue'?'overdue':'borrowed'}">${escapeHtml(statusLabel(loan.displayStatus))}</span></td><td class="table-actions">${loan.status==='pending'?`<button class="table-button" data-request-edit="${escapeHtml(loan.id)}">Edit quantity</button><button class="table-button danger-text" data-request-cancel="${escapeHtml(loan.id)}">Cancel request</button>`:'Awaiting return'}</td></tr>`).join('')}</tbody></table>`:'<div class="empty-state">No active requests or loans. Browse the book shelf to get started.</div>';
  document.getElementById('myHistoryTable').innerHTML=borrowerLoans.length?`<table><thead><tr><th>Book</th><th>Qty</th><th>Requested</th><th>Due date</th><th>Returned on</th><th>Status</th></tr></thead><tbody>${borrowerLoans.map(loan=>`<tr><td><strong>${escapeHtml(loan.bookTitle)}</strong><small class="table-sub">${escapeHtml(loan.bookId)}</small></td><td>${loan.quantity}</td><td>${formatDate(loan.requestedAt)}</td><td>${formatDate(loan.dueDate)}</td><td>${loan.returnDate?formatDate(loan.returnDate):'—'}</td><td><span class="status-pill ${loan.displayStatus==='pending'?'pending':loan.displayStatus==='overdue'?'overdue':loan.displayStatus==='borrowed'?'borrowed':loan.displayStatus==='returned'?'returned':'muted'}">${escapeHtml(statusLabel(loan.displayStatus))}</span></td></tr>`).join('')}</tbody></table>`:'<div class="empty-state">Your history will appear here.</div>';
  const borrowedLoans=borrowerLoans.filter(loan=>loan.status==='borrowed');
  document.getElementById('myBorrowedTable').innerHTML=borrowedLoans.length?`<table><thead><tr><th>Book</th><th>Qty</th><th>Borrowed</th><th>Due date</th><th>Status</th><th>Action</th></tr></thead><tbody>${borrowedLoans.map(loan=>`<tr><td><strong>${escapeHtml(loan.bookTitle)}</strong><small class="table-sub">${escapeHtml(loan.bookId)}</small></td><td>${loan.quantity}</td><td>${formatDate(loan.borrowedAt||loan.requestedAt)}</td><td>${formatDate(loan.dueDate)}</td><td><span class="status-pill ${loan.displayStatus==='overdue'?'overdue':'borrowed'}">${escapeHtml(statusLabel(loan.displayStatus))}</span></td><td class="table-actions"><button class="table-button" data-return-loan="${escapeHtml(loan.id)}">Return books</button></td></tr>`).join('')}</tbody></table>`:'<div class="empty-state">You have no books currently on loan.</div>';
}

document.addEventListener('DOMContentLoaded',()=>{
  const path=location.pathname.toLowerCase();
  if(path.endsWith('index.html')||path==='/'||path===''){initAuth();}
  if(path.endsWith('library.html')){bindShelf();initShelf();}
});
